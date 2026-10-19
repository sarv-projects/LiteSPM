package main

// auth.go — `litespm auth`: the production path for the OAuth broker.
//
// Before this command existed, internal/auth was a library with no caller:
// the broker could start a PKCE flow, exchange a code and store a credential,
// and nothing in the tree ever asked it to. A remote (URL) MCP provider that
// expects a bearer token therefore had no way to be given one, and the
// credential vault held nothing that a provider could use.
//
// The three verbs are deliberately small:
//
//	auth login <provider>   run the PKCE loopback flow and store the credential
//	auth status [provider]  report what is stored (never the credential)
//	auth logout <profile>   revoke the credential and drop the profile
//
// Three rules hold across all of them:
//
//  1. A token never reaches the terminal, a log, a row or a receipt. The rows
//     carry a POINTER to a vault entry, and the pointer is what is printed.
//  2. The flow fails closed. A callback that never arrives, a token endpoint
//     that answers with an error, a vault that cannot be written — each is a
//     typed failure with a non-zero exit, never a half-finished login that
//     looks successful.
//  3. The authorization CODE is never printed. It is exchanged once and
//     dropped; it is a bearer secret for exactly as long as the exchange
//     takes.

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"runtime"
	"strconv"
	"strings"
	"time"

	"github.com/sarv-projects/litespm/internal/auth"
	"github.com/sarv-projects/litespm/internal/config"
	"github.com/sarv-projects/litespm/internal/domain"
	"github.com/sarv-projects/litespm/internal/secrets"
	"github.com/sarv-projects/litespm/internal/state"
)

const authUsage = `Usage: litespm auth <login|status|logout> [arguments]

  litespm auth login <provider> --client-id <id> --auth-url <url> --token-url <url>
                         [--client-secret-env <VAR>] [--scope <scope>]... [--timeout <seconds>]
  litespm auth status [provider]
  litespm auth logout <profile-id>

  login   runs an OAuth 2.0 PKCE flow through a loopback listener, exchanges
          the authorization code for a token, and stores the credential in the
          platform vault. The code is never printed.
  status  reports the recorded profiles: the provider, the profile id, the
          status and where the credential lives. The credential itself is
          never printed.
  logout  revokes the credential (purging it from the vault) and drops the
          profile row, unless a provider still names it — in which case the
          row is kept as revoked, so that provider is refused rather than
          dialled anonymously.`

// authEnv is everything the auth verbs need. Production builds it from the
// platform paths and the platform vault; the tests build it from a temporary
// database and an in-memory vault, and inject the HTTP client and the browser
// opener so no network and no desktop are needed.
type authEnv struct {
	db    *state.DB
	store secrets.SecretStore
	// httpClient is the client the token exchange uses. A nil client means
	// the broker's own hardened one (bounded timeout, no downgrade redirects).
	httpClient *http.Client
	// openBrowser opens the authorization URL. A nil opener means "print the
	// URL and let the user open it".
	openBrowser func(string) error
	// timeout is how long the loopback callback waits. Zero means the
	// broker's own default.
	timeout time.Duration
}

// runAuth is the production entry point for `litespm auth`.
func runAuth(args []string) int {
	paths, err := config.ResolvePlatformPaths()
	if err != nil {
		fmt.Fprintf(os.Stderr, "Fatal: failed to resolve platform paths: %v\n", err)
		return 1
	}
	if err := paths.EnsureDirectories(); err != nil {
		fmt.Fprintf(os.Stderr, "Fatal: failed to initialize storage directories: %v\n", err)
		return 1
	}
	db, err := state.Open(paths.StateDBPath())
	if err != nil {
		fmt.Fprintf(os.Stderr, "Fatal: failed to open state database: %v\n", err)
		return 1
	}
	defer db.Close()
	// ARCH/19: without a functional credential vault LiteSPM halts rather
	// than storing credentials anywhere unprotected.
	store, err := secrets.OpenSecretStore()
	if err != nil {
		fmt.Fprintf(os.Stderr, "Fatal: [%s] %v\n", domain.CodeAuthVaultUnavailable, err)
		return 1
	}
	defer store.Close()
	return runAuthTo(os.Stdout, os.Stderr, &authEnv{
		db:          db,
		store:       store,
		openBrowser: openURLInBrowser,
	}, args)
}

// runAuthTo runs the verbs against explicit streams, so a test can read what
// was printed and assert what was not.
func runAuthTo(out, errOut io.Writer, env *authEnv, args []string) int {
	if env == nil || env.db == nil {
		fmt.Fprintln(errOut, "Auth error: no state database")
		return 1
	}
	if len(args) == 0 {
		fmt.Fprint(errOut, authUsage)
		return 2
	}
	ctx := context.Background()
	switch args[0] {
	case "login":
		return runAuthLogin(ctx, out, errOut, env, args[1:])
	case "status":
		if len(args) > 2 {
			fmt.Fprintf(errOut, "Auth error: `auth status` takes at most one provider\n\n")
			fmt.Fprint(errOut, authUsage)
			return 2
		}
		provider := ""
		if len(args) == 2 {
			provider = args[1]
		}
		return runAuthStatus(ctx, out, errOut, env, provider)
	case "logout":
		return runAuthLogout(ctx, out, errOut, env, args[1:])
	case "--help", "-h", "help":
		fmt.Fprint(out, authUsage)
		return 0
	default:
		fmt.Fprintf(errOut, "Unknown auth subcommand: %s\n\n", args[0])
		fmt.Fprint(errOut, authUsage)
		return 2
	}
}

// authLoginOptions is the parsed command line for `litespm auth login`.
type authLoginOptions struct {
	provider     string
	clientID     string
	clientSecret string
	authURL      string
	tokenURL     string
	scopes       []string
	timeout      time.Duration
}

// parseAuthLoginArgs parses `auth login` strictly: an unknown flag, a missing
// flag value, a missing required value or a second positional argument is a
// usage error (exit 2), never a half-configured login.
//
// The client secret is read from an environment VARIABLE by name
// (--client-secret-env), not from the command line, so it does not land in a
// shell history or a process listing. The literal form is accepted too, and
// the help says plainly that it does.
func parseAuthLoginArgs(args []string) (authLoginOptions, error) {
	opts := authLoginOptions{timeout: auth.DefaultLoopbackTimeout}
	positional := 0
	secretFromEnv := ""
	for i := 0; i < len(args); i++ {
		arg := args[i]
		next := func() (string, error) {
			if i+1 >= len(args) {
				return "", fmt.Errorf("flag %s requires a value", arg)
			}
			i++
			return args[i], nil
		}
		switch arg {
		case "--client-id":
			v, err := next()
			if err != nil {
				return opts, err
			}
			opts.clientID = v
		case "--client-secret":
			v, err := next()
			if err != nil {
				return opts, err
			}
			opts.clientSecret = v
		case "--client-secret-env":
			v, err := next()
			if err != nil {
				return opts, err
			}
			secretFromEnv = v
		case "--auth-url":
			v, err := next()
			if err != nil {
				return opts, err
			}
			opts.authURL = v
		case "--token-url":
			v, err := next()
			if err != nil {
				return opts, err
			}
			opts.tokenURL = v
		case "--scope":
			v, err := next()
			if err != nil {
				return opts, err
			}
			opts.scopes = append(opts.scopes, v)
		case "--timeout":
			v, err := next()
			if err != nil {
				return opts, err
			}
			n, cerr := strconv.Atoi(v)
			if cerr != nil || n < 1 || n > 3600 {
				return opts, fmt.Errorf("--timeout must be a number of seconds between 1 and 3600 (got %q)", v)
			}
			opts.timeout = time.Duration(n) * time.Second
		default:
			if strings.HasPrefix(arg, "-") {
				return opts, fmt.Errorf("unknown flag %q", arg)
			}
			positional++
			if positional > 1 {
				return opts, fmt.Errorf("unexpected argument %q", arg)
			}
			opts.provider = arg
		}
	}
	if secretFromEnv != "" {
		value, ok := os.LookupEnv(secretFromEnv)
		if !ok {
			return opts, fmt.Errorf("the environment variable %s is not set, so there is no client secret to use", secretFromEnv)
		}
		opts.clientSecret = value
	}
	switch {
	case opts.provider == "":
		return opts, fmt.Errorf("missing <provider>")
	case opts.clientID == "":
		return opts, fmt.Errorf("missing --client-id")
	case opts.authURL == "":
		return opts, fmt.Errorf("missing --auth-url")
	case opts.tokenURL == "":
		return opts, fmt.Errorf("missing --token-url")
	}
	return opts, nil
}

// runAuthLogin runs the PKCE loopback flow end to end.
//
// The sequence is the broker's: start a loopback listener, start the session
// (which mints the PKCE verifier and the state token), let the user authorize
// in a browser, wait for the callback, exchange the code once, and store the
// credential. Every step that can fail fails the command.
func runAuthLogin(ctx context.Context, out, errOut io.Writer, env *authEnv, args []string) int {
	opts, err := parseAuthLoginArgs(args)
	if err != nil {
		fmt.Fprintf(errOut, "Auth error: %v\n\n", err)
		fmt.Fprint(errOut, authUsage)
		return 2
	}
	if env.store == nil {
		fmt.Fprintf(errOut, "Auth error: [%s] no credential vault is available, so a credential cannot be stored\n",
			domain.CodeAuthVaultUnavailable)
		return 1
	}
	broker := auth.NewAuthBroker(env.db, env.store, env.httpClient)
	listener, err := auth.StartLoopbackListener()
	if err != nil {
		fmt.Fprintf(errOut, "Auth error: %v\n", err)
		return 1
	}
	session, err := broker.StartAuth(ctx, auth.AuthStartRequest{
		ProviderID:   opts.provider,
		ClientID:     opts.clientID,
		ClientSecret: opts.clientSecret,
		AuthURL:      opts.authURL,
		TokenURL:     opts.tokenURL,
		Scopes:       opts.scopes,
	}, listener)
	if err != nil {
		fmt.Fprintf(errOut, "Auth error: %v\n", err)
		return 1
	}
	fmt.Fprintf(out, "Authorize %s in your browser:\n  %s\n", opts.provider, session.AuthURL)
	if env.openBrowser != nil {
		if err := env.openBrowser(session.AuthURL); err != nil {
			fmt.Fprintf(out, "  (no browser could be opened: %v — open the URL above yourself)\n", err)
		}
	}
	timeout := opts.timeout
	if env.timeout > 0 {
		timeout = env.timeout
	}
	code, err := listener.WaitForCallback(ctx, timeout)
	if err != nil {
		fmt.Fprintf(errOut, "Auth error: %v\n", err)
		return 1
	}
	tokenRes, err := broker.ExchangeToken(ctx, opts.tokenURL, opts.clientID, opts.clientSecret,
		code, session.RedirectURI, session.PKCEVerifier)
	if err != nil {
		fmt.Fprintf(errOut, "Auth error: the token exchange failed: %v\n", err)
		return 1
	}
	profile, err := broker.CompleteAuth(ctx, session.SessionID, tokenRes)
	if err != nil {
		fmt.Fprintf(errOut, "Auth error: %v\n", err)
		return 1
	}
	fmt.Fprintf(out, "✓ Authenticated %s\n", profile.ProviderID)
	fmt.Fprintf(out, "  Profile:    %s\n", profile.ProfileID)
	fmt.Fprintf(out, "  Credential: %s (in the vault — the token itself is never written to a file)\n", profile.SecretRef)
	return 0
}

// runAuthStatus reports the recorded profiles.
//
// The report names the provider, the profile id, the type, the status and
// where the credential lives. It NEVER prints the credential: the row holds a
// pointer to a vault entry, and that pointer is the whole of what is known
// outside the vault.
func runAuthStatus(ctx context.Context, out, errOut io.Writer, env *authEnv, provider string) int {
	if provider != "" {
		prof, err := auth.ProfileForProvider(ctx, env.db, provider)
		if err != nil {
			if domain.ErrorCode(err) == "LPSM-STATE-NOT-FOUND" {
				fmt.Fprintf(out, "No credential is recorded for %s.\n", provider)
				return 1
			}
			fmt.Fprintf(errOut, "Auth error: %v\n", err)
			return 1
		}
		printAuthProfile(out, prof)
		return 0
	}
	profiles, err := auth.ListProfiles(ctx, env.db)
	if err != nil {
		fmt.Fprintf(errOut, "Auth error: %v\n", err)
		return 1
	}
	if len(profiles) == 0 {
		fmt.Fprintln(out, "No authentication profiles are recorded.")
		fmt.Fprintln(out, "Run 'litespm auth login <provider>' to store a credential.")
		return 0
	}
	for _, prof := range profiles {
		printAuthProfile(out, prof)
	}
	return 0
}

// printAuthProfile writes one profile report.
func printAuthProfile(out io.Writer, prof *domain.AuthProfile) {
	if prof == nil {
		return
	}
	fmt.Fprintf(out, "%s\n", prof.ProviderID)
	fmt.Fprintf(out, "  Profile:    %s\n", prof.ProfileID)
	fmt.Fprintf(out, "  Type:       %s\n", prof.ProfileType)
	fmt.Fprintf(out, "  Status:     %s\n", prof.Status)
	fmt.Fprintf(out, "  Credential: %s (in the vault — the token itself is never written to a file)\n", prof.SecretRef)
	if !prof.UpdatedAt.IsZero() {
		fmt.Fprintf(out, "  Updated:    %s\n", prof.UpdatedAt.UTC().Format(time.RFC3339))
	}
}

// runAuthLogout revokes a credential and drops the profile.
//
// The revocation is the important half: the credential is purged from the
// vault, so the token stops working even if a copy of the row survives
// somewhere. The row is then deleted — unless a provider still names it, in
// which case the row is KEPT as revoked: a provider pointing at a revoked
// profile is refused, and a provider pointing at nothing would be dialled
// anonymously, which is the one outcome this whole path exists to prevent.
func runAuthLogout(ctx context.Context, out, errOut io.Writer, env *authEnv, args []string) int {
	if len(args) != 1 || strings.TrimSpace(args[0]) == "" {
		fmt.Fprintf(errOut, "Auth error: `auth logout` takes exactly one profile id\n\n")
		fmt.Fprint(errOut, authUsage)
		return 2
	}
	profileID := strings.TrimSpace(args[0])
	if env.store == nil {
		fmt.Fprintf(errOut, "Auth error: [%s] no credential vault is available, so a credential cannot be revoked\n",
			domain.CodeAuthVaultUnavailable)
		return 1
	}
	broker := auth.NewAuthBroker(env.db, env.store, env.httpClient)
	if err := broker.RevokeAuth(ctx, profileID); err != nil {
		if domain.ErrorCode(err) == "LPSM-STATE-NOT-FOUND" {
			fmt.Fprintf(errOut, "Auth error: no profile %q is recorded\n", profileID)
			return 1
		}
		fmt.Fprintf(errOut, "Auth error: %v\n", err)
		return 1
	}
	refs, err := auth.ProvidersUsingProfile(ctx, env.db, profileID)
	if err != nil {
		fmt.Fprintf(errOut, "Auth error: %v\n", err)
		return 1
	}
	if refs > 0 {
		fmt.Fprintf(out, "✓ Revoked %s.\n", profileID)
		fmt.Fprintf(out, "  The credential is purged from the vault and the profile is marked revoked.\n")
		fmt.Fprintf(out, "  %d provider(s) still name this profile, so its row is kept: a provider that points\n", refs)
		fmt.Fprintf(out, "  at a revoked profile is refused, never dialled anonymously.\n")
		return 0
	}
	if err := auth.DeleteProfile(ctx, env.db, profileID); err != nil {
		fmt.Fprintf(errOut, "Auth error: %v\n", err)
		return 1
	}
	fmt.Fprintf(out, "✓ Revoked and removed %s.\n", profileID)
	return 0
}

// openURLInBrowser opens a URL with the platform's opener. It is best-effort
// by design: the authorization URL is printed either way, so a machine with
// no browser (a server, a container) still gets a usable instruction.
func openURLInBrowser(rawURL string) error {
	var cmd string
	var args []string
	switch runtime.GOOS {
	case "darwin":
		cmd, args = "open", []string{rawURL}
	case "windows":
		cmd, args = "rundll32", []string{"url.dll,FileProtocolHandler", rawURL}
	default:
		cmd, args = "xdg-open", []string{rawURL}
	}
	path, err := exec.LookPath(cmd)
	if err != nil {
		return fmt.Errorf("no browser opener (%s) is available on this machine", cmd)
	}
	return exec.Command(path, args...).Start()
}

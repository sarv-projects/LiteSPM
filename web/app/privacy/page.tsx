import type { Metadata } from "next";
import { Fact, Facts, InfoPage, InfoSection } from "../../components/layout/InfoPage";

/**
 * `/privacy`.
 *
 * Written against the code, not against a template. Every claim here is one
 * that can be checked in this repository, and the page says so at the bottom:
 *
 *   * No cookies — there is no `document.cookie` or `Set-Cookie` anywhere in
 *     `web/` or `worker/`.
 *   * Four local-storage keys, named exactly as `ThemeToggle` (`litespm-theme`),
 *     `lib/landing.ts` (`litespm-agent`), `lib/palette.ts`
 *     (`litespm-palette-recent`) and `ManageInstall.installMarkKey`
 *     (`litespm-install-mark:<id>`) write them.
 *   * Fonts are self-hosted (`next/font/local` over `web/fonts`), so no font
 *     host is contacted.
 *   * The only outside hosts a page requests are the two image sources
 *     `lib/catalog.ts` `publisherMark` builds: `github.com/<account>.png` and
 *     `www.google.com/s2/favicons`. No referrer policy is set, so the browser's
 *     own cross-origin default applies and the page path is not sent.
 *   * The Worker holds one binding (`ASSETS`, `wrangler.toml`) and never calls
 *     `console.*`, so there is no visitor record kept by this application.
 *   * The CLI's outbound calls are the four the "litespm command" section lists,
 *     and `update.CheckForUpdate` is reached only from the `self-update` case in
 *     `cmd/litespm/main.go` — there is no check on startup.
 *
 * The local paths come from `internal/config/paths.go` and
 * `internal/secrets/vault_file.go`.
 */
export const metadata: Metadata = {
  title: "Privacy",
  description:
    "What LiteSPM Market stores in your browser, which two image hosts a page contacts, and what the litespm command writes and sends.",
  alternates: { canonical: "/privacy/" },
  openGraph: { title: "Privacy · LiteSPM Market", url: "/privacy/" },
};

export default function PrivacyPage() {
  return (
    <InfoPage
      title="Privacy"
      lede="No account, no cookie, no analytics, no font host. This page lists everything this site keeps in your browser, the only two outside hosts a page contacts, and what the litespm command stores on your machine and sends over the network."
      sourcePath="web/app/privacy/page.tsx"
    >
      <InfoSection title="On this site">
        <Facts>
          <Fact label="Cookies">
            None. There is no sign-in and no session that needs holding. The theme you pick is kept
            in your browser&rsquo;s local storage, not in a cookie.
          </Fact>
          <Fact label="Local storage">
            Four keys, all on your device, none sent anywhere: <code>litespm-theme</code> (light,
            dark or system), <code>litespm-agent</code> (the agent host you selected, so rows can be
            ordered for it), <code>litespm-palette-recent</code> (the last five destinations you
            opened from the search palette — the label and path, never your query text), and one{" "}
            <code>litespm-install-mark:&lt;entry&gt;</code> for each entry you marked as installed.
          </Fact>
          <Fact label="Fonts">
            Served from this site. No request goes to Google Fonts or any other font host.
          </Fact>
          <Fact label="Publisher icons">
            Two outside hosts, and only these two: a GitHub account&rsquo;s avatar from{" "}
            <code>github.com/&lt;account&gt;.png</code>, or a site&rsquo;s icon from Google&rsquo;s
            favicon service at <code>google.com/s2/favicons</code>. Your browser requests them
            directly, so GitHub or Google sees your IP address and which icon was asked for. The
            referrer is this site&rsquo;s address, not the page you were reading. Block them at your
            end and every tile falls back to a letter.
          </Fact>
          <Fact label="Hosting">
            Static files on Cloudflare Workers with a single asset binding: no database, no session
            store, and no log written by this site. There is no visitor record to hand over, because
            none is made.
          </Fact>
        </Facts>
      </InfoSection>

      <InfoSection title="The litespm command">
        <p>
          It reports nothing about you or your machine. No telemetry, no usage counters, and no
          update check when you run a command — <code>litespm self-update</code> is the only thing
          that asks GitHub for a newer release, and you have to ask it to.
        </p>
        <p>It contacts the network only when the command needs something:</p>
        <ul className="ml-4 list-disc space-y-1.5">
          <li>
            <code>litespm catalog sync</code> fetches the release pointer and the dataset from the
            catalog origin, which is this site by default.
          </li>
          <li>
            <code>litespm install</code> and <code>litespm skills add</code> fetch the source named
            on the entry, or the source you typed — a git URL, a GitHub repository, a zip, or a
            bare <code>SKILL.md</code>.
          </li>
          <li>
            <code>litespm self-update</code> asks GitHub&rsquo;s release API, then verifies the
            release&rsquo;s Sigstore bundle before it replaces the binary.
          </li>
          <li>
            Signing in to a server that requires it goes to that service&rsquo;s own OAuth endpoint,
            in your browser.
          </li>
        </ul>
      </InfoSection>

      <InfoSection title="What it writes on your machine">
        <Facts>
          <Fact label="Data root">
            macOS <code>~/Library/Application Support/LiteSPM</code> · Linux{" "}
            <code>~/.local/share/litespm</code> · Windows <code>%LOCALAPPDATA%\LiteSPM</code>.{" "}
            <code>LITESPM_DATA_ROOT</code> overrides it. On Linux the configuration root is
            separate, at <code>~/.config/litespm</code>.
          </Fact>
          <Fact label="Stored there">
            The catalog snapshot, content-addressed copies of the files it installed, its state
            database, a backup of every config file it edited (<code>backups/</code>), and the
            skills ledger.
          </Fact>
          <Fact label="Credentials">
            Sign-ins for servers that need them go to the OS vault — Keychain on macOS, DPAPI on
            Windows, Secret Service on Linux. They are never written into an agent&rsquo;s config
            file, and never sent to us.
          </Fact>
          <Fact label="Config edits">
            Registering the bridge backs the host&rsquo;s config file up first and changes only the{" "}
            <code>litespm</code> member. Comments, key order and every other entry in the file
            survive.
          </Fact>
          <Fact label="Removing it">
            <code>litespm uninstall</code> strips the bridge entries and then prints, with the
            command that does each one, what it deliberately left behind: servers you installed,
            skills it copied, and the backups.
          </Fact>
        </Facts>
      </InfoSection>

      <InfoSection title="Clearing what is kept">
        <p>
          Clearing this site&rsquo;s data in your browser removes the four keys above; the{" "}
          <em>Remove</em> control on an entry page clears that one entry&rsquo;s mark by itself. For
          the command, <code>litespm uninstall</code> reverses the config edits, and deleting the
          data root removes everything else it wrote.
        </p>
        <p>
          There is no account, so there is no personal data held on our side to export or erase.
        </p>
      </InfoSection>
    </InfoPage>
  );
}

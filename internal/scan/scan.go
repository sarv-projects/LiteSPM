// Package scan checks a catalog dataset for content that must never ship.
//
// The rules here are the site's own promises, made checkable. The catalogue
// publishes 69,376 rows, and every rule below is a statement the producer
// has already been told to keep:
//
//   - a row that cannot be installed must not carry a launch line, because a
//     launch line on a discovery-only row is a claim the binary cannot honour
//     (`internal/install` refuses it with LPSM-ARTIFACT-UNAVAILABLE);
//   - a plugin that publishes no fetchable source, or an unpinned one, cannot
//     be installed, and a row that says otherwise is misleading;
//   - a skill published from an INTERNAL repository must not be in the public
//     catalogue at all;
//   - a URL carrying a credential is a secret in a public file.
//
// Every rule is a pure function of a row, so the scan is deterministic and
// testable without a network or a database.
package scan

import (
	"fmt"
	"net/url"
	"sort"
	"strings"
)

// Severity is how much a finding matters.
type Severity string

const (
	// SeverityError is a finding that must fail a release: the dataset
	// contradicts a promise the product makes.
	SeverityError Severity = "error"
	// SeverityWarning is a finding worth knowing about: the dataset is
	// consistent, but a reader could still be misled.
	SeverityWarning Severity = "warning"
	// SeverityNote is an observation, not a defect.
	SeverityNote Severity = "note"
)

// Finding is one rule firing on one row.
type Finding struct {
	// Rule is the stable identifier of the rule that fired. It is the thing
	// a CI gate suppresses or a document cites.
	Rule string `json:"rule"`
	// Severity is how much it matters.
	Severity Severity `json:"severity"`
	// ListingID names the row.
	ListingID string `json:"listingId,omitempty"`
	// Message says what is wrong, in one sentence.
	Message string `json:"message"`
}

// Rule identifiers. They are stable: a SARIF consumer matches on them.
const (
	RuleLaunchLineWithoutProvenance = "launch-line-without-provenance"
	RulePluginWithoutSource         = "plugin-without-source"
	RuleUnpinnedSource              = "unpinned-source"
	RuleInternalSkillPublished      = "internal-skill-published"
	RuleCredentialInURL             = "credential-in-url"
	RuleVersionWithoutSource        = "version-without-source"
)

// Row is the part of a catalog row the scanner reads. It is a structural
// subset of the published row, so the scanner can run over a JSON file
// without the website's types.
type Row struct {
	ID             string `json:"id"`
	Kind           string `json:"kind"`
	Name           string `json:"name"`
	Version        string `json:"version"`
	Installability string `json:"installability"`
	Source         string `json:"source"`
	URL            string `json:"url"`
	Command        string `json:"command"`
	Transport      string `json:"transport"`
	SkillSource    string `json:"skillSource"`
	// Artifact is the published source descriptor of a plugin.
	Artifact *Artifact `json:"artifact"`
	// Metadata carries the row's own metadata block (the producer's
	// `metadata.internal` marker lives here).
	Metadata map[string]any `json:"metadata"`
}

// Artifact is a published source locator.
type Artifact struct {
	Type   string `json:"type"`
	Repo   string `json:"repo"`
	Path   string `json:"path"`
	Ref    string `json:"ref"`
	SHA    string `json:"sha"`
	Pinned bool   `json:"pinned"`
}

// Rules is the ordered list of the rules, for a report that says what was
// checked and not only what was found.
var Rules = []string{
	RuleLaunchLineWithoutProvenance,
	RulePluginWithoutSource,
	RuleUnpinnedSource,
	RuleInternalSkillPublished,
	RuleCredentialInURL,
	RuleVersionWithoutSource,
}

// Scan checks one row and returns the findings that fire on it. The order is
// the order of Rules, so a report is stable.
func Scan(row Row) []Finding {
	if row.ID == "" {
		return nil
	}
	var findings []Finding
	add := func(rule string, sev Severity, msg string) {
		findings = append(findings, Finding{Rule: rule, Severity: sev, ListingID: row.ID, Message: msg})
	}

	// 1. A row the binary cannot install must not carry a launch line.
	if isDiscoveryOnly(row.Installability) && (row.Command != "" || row.URL != "") {
		add(RuleLaunchLineWithoutProvenance, SeverityError,
			fmt.Sprintf("the row is discovery_only but carries a launch line (command %q, url %q); a launch line on an unproven row is a claim the installer cannot honour",
				row.Command, row.URL))
	}

	// 2. A plugin must publish a source LiteSPM can fetch.
	if row.Kind == "plugin" {
		switch {
		case row.Artifact == nil:
			add(RulePluginWithoutSource, SeverityWarning,
				"the plugin publishes no source at all, so it cannot be installed")
		case row.Artifact.Type != "git-tree":
			add(RulePluginWithoutSource, SeverityWarning,
				fmt.Sprintf("the plugin publishes a %q source, which LiteSPM cannot fetch", row.Artifact.Type))
		case !row.Artifact.Pinned || row.Artifact.SHA == "":
			add(RuleUnpinnedSource, SeverityWarning,
				"the plugin's source is not pinned to a commit, so LiteSPM will not fetch a mutable one")
		}
	}

	// 3. An internal skill must not be published.
	if row.Kind == "skill" && isInternal(row.Metadata) {
		add(RuleInternalSkillPublished, SeverityError,
			"the row is published from an INTERNAL source; internal skills are hidden by INSTALL_INTERNAL_SKILLS and must not be in the public catalogue")
	}

	// 4. A credential in a public URL.
	if looksLikeCredential(row.URL) {
		add(RuleCredentialInURL, SeverityError,
			"the row's URL carries what looks like a credential; a published catalogue is a public file")
	}

	// 5. A version with no source.
	if strings.TrimSpace(row.Version) != "" && strings.TrimSpace(row.Source) == "" {
		add(RuleVersionWithoutSource, SeverityNote,
			"the row carries a version but no source id, so its provenance cannot be traced")
	}

	return findings
}

// ScanRows checks every row and returns the findings, sorted by rule and
// then by listing id, so two runs over the same dataset produce the same
// report.
func ScanRows(rows []Row) []Finding {
	var findings []Finding
	for _, row := range rows {
		findings = append(findings, Scan(row)...)
	}
	sort.SliceStable(findings, func(i, j int) bool {
		if findings[i].Rule != findings[j].Rule {
			return findings[i].Rule < findings[j].Rule
		}
		return findings[i].ListingID < findings[j].ListingID
	})
	return findings
}

// Counts summarises a scan by severity.
func Counts(findings []Finding) map[Severity]int {
	counts := map[Severity]int{SeverityError: 0, SeverityWarning: 0, SeverityNote: 0}
	for _, f := range findings {
		counts[f.Severity]++
	}
	return counts
}

func isDiscoveryOnly(installability string) bool {
	return installability == "discovery_only" || installability == ""
}

func isInternal(metadata map[string]any) bool {
	if metadata == nil {
		return false
	}
	v, ok := metadata["internal"]
	if !ok {
		return false
	}
	b, ok := v.(bool)
	return ok && b
}

// looksLikeCredential reports whether a URL carries something that must not
// be published: a password in the authority, or a query parameter that names
// a key and carries a value.
//
// The authority is read from the PARSED url, not from the text: a path
// segment may begin with an @ (a Smithery owner handle, for one), and that
// is not a credential. Only a userinfo component in the authority is.
func looksLikeCredential(raw string) bool {
	if raw == "" {
		return false
	}
	parsed, err := url.Parse(raw)
	if err == nil && parsed.User != nil {
		// user:password@host, or even user@host: a published catalogue is
		// a public file.
		return true
	}
	lower := strings.ToLower(raw)
	for _, marker := range []string{"apikey=", "api_key=", "api-key=", "access_token=", "token=", "password=", "secret="} {
		if strings.Contains(lower, marker) {
			// A placeholder is not a credential: ?key={api_key} names a
			// variable for the publisher to substitute.
			value := lower[strings.Index(lower, marker)+len(marker):]
			if cut := strings.IndexAny(value, "&\"' "); cut >= 0 {
				value = value[:cut]
			}
			if value != "" && !strings.ContainsAny(value, "{}<>") {
				return true
			}
		}
	}
	return false
}

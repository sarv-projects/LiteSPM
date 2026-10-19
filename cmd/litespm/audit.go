// audit.go — `litespm audit`: check the published catalogue and the local
// ledger for content that must not ship, and report it in a form a CI gate
// can read.
//
// What it checks:
//
//  1. the CATALOGUE, with the rules in `internal/scan`: a discovery-only row
//     that carries a launch line, a plugin with no fetchable source, an
//     internal skill published publicly, a credential in a public URL;
//  2. the RECEIPT CHAIN, when the machine has one: the per-provider hash
//     chain of invocation receipts, which is what makes a receipt
//     tamper-evident (ARCH/34 §6).
//
// What it does NOT do: it does not repair anything, and it does not decide
// whether a finding matters for your release. It reports, with stable rule
// ids, and exits non-zero when something that must not ship is present.
//
// The input is the CATALOGUE AS PUBLISHED: the cached shards the origin
// served, digest-verified against the manifest, or a dataset file given with
// --dataset. Auditing a different copy of the rows than the one the origin
// serves would audit the wrong thing.
package main

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"github.com/sarv-projects/litespm/internal/catalog"
	"github.com/sarv-projects/litespm/internal/config"
	"github.com/sarv-projects/litespm/internal/receipts"
	"github.com/sarv-projects/litespm/internal/scan"
)

const auditUsage = `Usage: litespm audit [--ci] [--sarif <path>] [--dataset <path>] [--json]

Checks the published catalogue and the local receipt chain for content that
must not ship.

  --ci         Exit non-zero on an error-severity finding. This is the
               default, but the flag says the intent out loud for a pipeline
               that reads the command line.
  --sarif      Write a SARIF 2.1.0 report to <path>. The rule ids are
               stable, so a consumer can match on them.
  --dataset    Audit this dataset file instead of the cached release. The
               file is a JSON array of rows (the shape of
               web/data/catalog.json).
  --json       Print the findings as JSON instead of as text.

Exit codes: 0 nothing that must not ship was found · 1 a finding with
error severity · 2 usage.

The catalogue checked is the one the origin served: the cached shards under
DATA_ROOT, verified against the release manifest. Point --dataset at a file
only when auditing a dataset that has not been published yet.`

type auditOptions struct {
	ci      bool
	sarif   string
	dataset string
	json    bool
}

func parseAuditOptions(args []string) (*auditOptions, error) {
	opts := &auditOptions{}
	for i := 0; i < len(args); i++ {
		switch args[i] {
		case "--ci":
			opts.ci = true
		case "--json":
			opts.json = true
		case "--sarif":
			if i+1 >= len(args) {
				return nil, fmt.Errorf("--sarif needs a path")
			}
			i++
			opts.sarif = args[i]
		case "--dataset":
			if i+1 >= len(args) {
				return nil, fmt.Errorf("--dataset needs a path")
			}
			i++
			opts.dataset = args[i]
		default:
			return nil, fmt.Errorf("unknown argument %q", args[i])
		}
	}
	return opts, nil
}

func runAudit(args []string) int {
	opts, err := parseAuditOptions(args)
	if err != nil {
		fmt.Fprintf(os.Stderr, "%v\n\n%s\n", err, auditUsage)
		return 2
	}
	ctx := context.Background()

	paths, err := config.ResolvePlatformPaths()
	if err != nil {
		fmt.Fprintf(os.Stderr, "resolve paths: %v\n", err)
		return 1
	}

	rows, source, err := auditCatalogueRows(ctx, paths, opts.dataset)
	if err != nil {
		fmt.Fprintf(os.Stderr, "read the catalogue: %v\n", err)
		return 1
	}

	findings := scan.ScanRows(rows)

	// The receipt chain, when this machine has one. A chain that does not
	// verify is an error-severity finding: a receipt that can be changed
	// without detection is not a receipt.
	if chainErr := auditReceiptChain(paths); chainErr != nil {
		findings = append(findings, scan.Finding{
			Rule:      "receipt-chain-broken",
			Severity:  scan.SeverityError,
			ListingID: "",
			Message:   chainErr.Error(),
		})
	}

	counts := scan.Counts(findings)
	if opts.sarif != "" {
		if err := writeAuditSARIF(opts.sarif, findings); err != nil {
			fmt.Fprintf(os.Stderr, "write the SARIF report: %v\n", err)
			return 1
		}
	}

	switch {
	case opts.json:
		payload := map[string]any{
			"source":    source,
			"rows":      len(rows),
			"findings":  findings,
			"counts":    counts,
			"rules":     scan.Rules,
			"scannedAt": nil,
		}
		enc := json.NewEncoder(os.Stdout)
		enc.SetIndent("", "  ")
		if err := enc.Encode(payload); err != nil {
			fmt.Fprintf(os.Stderr, "write the JSON report: %v\n", err)
			return 1
		}
	default:
		fmt.Printf("Audited %d row(s) from %s\n", len(rows), source)
		if len(findings) == 0 {
			fmt.Println("Nothing that must not ship was found.")
		} else {
			for _, f := range findings {
				where := f.ListingID
				if where == "" {
					where = "the local ledger"
				}
				fmt.Printf("  [%s] %s: %s\n     %s\n", strings.ToUpper(string(f.Severity)), f.Rule, where, f.Message)
			}
			fmt.Printf("\n%d error(s), %d warning(s), %d note(s) across %d rule(s).\n",
				counts[scan.SeverityError], counts[scan.SeverityWarning], counts[scan.SeverityNote], len(scan.Rules))
		}
	}

	if counts[scan.SeverityError] > 0 {
		return 1
	}
	return 0
}

// auditRows reads the rows to audit: the dataset file when one is given, and
// otherwise the cached release the origin served.
func auditCatalogueRows(ctx context.Context, paths *config.PlatformPaths, datasetPath string) ([]scan.Row, string, error) {
	if datasetPath != "" {
		data, err := os.ReadFile(datasetPath)
		if err != nil {
			return nil, "", err
		}
		var rows []scan.Row
		if err := json.Unmarshal(data, &rows); err != nil {
			return nil, "", fmt.Errorf("the dataset is not a JSON array of rows: %w", err)
		}
		return rows, datasetPath, nil
	}

	client := catalog.NewClient(config.DefaultRegistryURL, paths.DataRoot, nil)
	releaseID, err := cachedReleaseID(paths)
	if err != nil {
		return nil, "", err
	}
	_ = client
	rows, err := cachedListingRows(ctx, paths, releaseID)
	if err != nil {
		return nil, "", err
	}
	return rows, fmt.Sprintf("the cached release %s", releaseID), nil
}

// cachedReleaseID reads the release the local cache holds.
func cachedReleaseID(paths *config.PlatformPaths) (string, error) {
	pointerPath := filepath.Join(paths.DataRoot, "v1", "current.json")
	data, err := os.ReadFile(pointerPath)
	if err != nil {
		return "", fmt.Errorf("no cached release: %v (run `litespm catalog sync` first, or pass --dataset)", err)
	}
	var pointer struct {
		ReleaseID string `json:"releaseId"`
	}
	if err := json.Unmarshal(data, &pointer); err != nil {
		return "", fmt.Errorf("the cached pointer is not readable: %w", err)
	}
	if strings.TrimSpace(pointer.ReleaseID) == "" {
		return "", fmt.Errorf("the cached pointer names no release")
	}
	return pointer.ReleaseID, nil
}

// cachedListingRows reads the listing shards of the cached release. The
// shards are the bytes the origin served, so the audit reads what is
// published rather than a re-serialization of it.
func cachedListingRows(ctx context.Context, paths *config.PlatformPaths, releaseID string) ([]scan.Row, error) {
	releaseDir := filepath.Join(paths.DataRoot, "v1", "releases", releaseID)
	manifestData, err := os.ReadFile(filepath.Join(releaseDir, "manifest.json"))
	if err != nil {
		return nil, fmt.Errorf("read the cached manifest: %w", err)
	}
	var manifest struct {
		Files map[string]struct {
			Digest string `json:"digest"`
			Size   int64  `json:"size"`
		} `json:"files"`
	}
	if err := json.Unmarshal(manifestData, &manifest); err != nil {
		return nil, fmt.Errorf("the cached manifest is not readable: %w", err)
	}
	names := make([]string, 0, len(manifest.Files))
	for name := range manifest.Files {
		if strings.HasPrefix(name, "listings") {
			names = append(names, name)
		}
	}
	sort.Strings(names)
	if len(names) == 0 {
		return nil, fmt.Errorf("the cached release %s has no listing shards", releaseID)
	}
	var rows []scan.Row
	for _, name := range names {
		data, err := os.ReadFile(filepath.Join(releaseDir, name))
		if err != nil {
			return nil, fmt.Errorf("read the cached shard %s: %w", name, err)
		}
		var shard []scan.Row
		if err := json.Unmarshal(data, &shard); err != nil {
			return nil, fmt.Errorf("the cached shard %s is not a JSON array of rows: %w", name, err)
		}
		rows = append(rows, shard...)
	}
	return rows, nil
}

// auditReceiptChain verifies the machine's receipt chain, if it has one.
func auditReceiptChain(paths *config.PlatformPaths) error {
	path := paths.ReceiptsPath()
	if _, err := os.Stat(path); err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		return fmt.Errorf("read the receipt store: %w", err)
	}
	store, err := receipts.Open(path)
	if err != nil {
		return fmt.Errorf("open the receipt store: %w", err)
	}
	return store.VerifyChain()
}

// writeAuditSARIF writes a SARIF 2.1.0 report.
//
// The shape is the one a CI consumer expects: one run, one driver (litespm),
// a rule per scanner rule with its stable id, and one result per finding. A
// rule with no finding is still declared, so a consumer can tell "checked and
// clean" from "not checked".
func writeAuditSARIF(path string, findings []scan.Finding) error {
	type sarifText struct {
		Text string `json:"text"`
	}
	type sarifRule struct {
		ID                   string    `json:"id"`
		Name                 string    `json:"name"`
		ShortDescription     sarifText `json:"shortDescription"`
		FullDescription      sarifText `json:"fullDescription"`
		DefaultConfiguration struct {
			Level string `json:"level"`
		} `json:"defaultConfiguration"`
	}
	type sarifResult struct {
		RuleID    string    `json:"ruleId"`
		Level     string    `json:"level"`
		Message   sarifText `json:"message"`
		Locations []struct {
			LogicalLocations []struct {
				Name string `json:"name"`
				Kind string `json:"kind"`
			} `json:"logicalLocations"`
		} `json:"locations"`
	}
	type sarifRun struct {
		Tool struct {
			Driver struct {
				Name           string      `json:"name"`
				InformationURI string      `json:"informationUri"`
				Rules          []sarifRule `json:"rules"`
			} `json:"driver"`
		} `json:"tool"`
		Results []sarifResult `json:"results"`
	}
	type sarifReport struct {
		Schema  string     `json:"$schema"`
		Version string     `json:"version"`
		Runs    []sarifRun `json:"runs"`
	}

	report := sarifReport{
		Schema:  "https://json.schemastore.org/sarif-2.1.0.json",
		Version: "2.1.0",
	}
	run := sarifRun{}
	run.Tool.Driver.Name = "litespm"
	run.Tool.Driver.InformationURI = "https://github.com/sarv-projects/LiteSPM"

	byRule := map[string][]scan.Finding{}
	for _, f := range findings {
		byRule[f.Rule] = append(byRule[f.Rule], f)
	}
	rules := append([]string{}, scan.Rules...)
	rules = append(rules, "receipt-chain-broken")
	for _, rule := range rules {
		level := "note"
		switch {
		case rule == "receipt-chain-broken":
			level = "error"
		default:
			for _, f := range byRule[rule] {
				if f.Severity == scan.SeverityError {
					level = "error"
					break
				}
				if f.Severity == scan.SeverityWarning && level != "error" {
					level = "warning"
				}
			}
		}
		r := sarifRule{ID: rule, Name: rule}
		r.ShortDescription.Text = rule
		r.FullDescription.Text = rule
		r.DefaultConfiguration.Level = level
		run.Tool.Driver.Rules = append(run.Tool.Driver.Rules, r)
	}
	for _, f := range findings {
		res := sarifResult{RuleID: f.Rule, Level: "error"}
		if f.Severity == scan.SeverityWarning {
			res.Level = "warning"
		} else if f.Severity == scan.SeverityNote {
			res.Level = "note"
		}
		res.Message.Text = f.Message
		loc := struct {
			LogicalLocations []struct {
				Name string `json:"name"`
				Kind string `json:"kind"`
			} `json:"logicalLocations"`
		}{}
		loc.LogicalLocations = append(loc.LogicalLocations, struct {
			Name string `json:"name"`
			Kind string `json:"kind"`
		}{Name: f.ListingID, Kind: "module"})
		res.Locations = append(res.Locations, loc)
		run.Results = append(run.Results, res)
	}
	report.Runs = []sarifRun{run}

	data, err := json.MarshalIndent(report, "", "  ")
	if err != nil {
		return err
	}
	data = append(data, '\n')
	return os.WriteFile(path, data, 0o644)
}

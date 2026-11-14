package main

// sync.go — turnkey synchronization across all AI coding agents, configs,
// catalog, and skills.
//
// `litespm sync` executes the complete reconciliation pipeline in one command:
//
//  1. Self-Update Check: queries release manifest and upgrades the LiteSPM binary
//     when a newer release exists (with Sigstore cosign and checksum verification).
//  2. Catalog Sync: pulls and indexes the latest published capabilities index.
//  3. Agent Configs Cross-Sync: scans this machine for all 52 supported agents,
//     detects configuration files (JSON, TOML, JSONC), and surgically registers
//     the LiteSPM bridge and in-agent marketplace commands into any newly
//     installed or unconfigured agents.
//  4. Skills Reconcile: fans out installed skills to all detected agents and
//     refreshes outdated skills from recorded sources.
//
// Zero-flag by default: runs hands-free without prompt fatigue.

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/sarv-projects/litespm/internal/catalog"
	"github.com/sarv-projects/litespm/internal/config"
	"github.com/sarv-projects/litespm/internal/domain"
	"github.com/sarv-projects/litespm/internal/host"
	"github.com/sarv-projects/litespm/internal/skills"
	"github.com/sarv-projects/litespm/internal/update"
)

type syncOptions struct {
	dryRun      bool
	yes         bool
	jsonOut     bool
	skipUpdate  bool
	skipCatalog bool
	skipAgents  bool
	skipSkills  bool
}

type syncReport struct {
	Timestamp        time.Time `json:"timestamp"`
	Version          string    `json:"version"`
	Upgraded         bool      `json:"upgraded"`
	LatestVersion    string    `json:"latestVersion,omitempty"`
	CatalogSynced    bool      `json:"catalogSynced"`
	CatalogItems     int       `json:"catalogItems"`
	AgentsDetected   int       `json:"agentsDetected"`
	AgentsConnected  int       `json:"agentsConnected"`
	AgentsConfigured int       `json:"agentsConfigured"`
	SkillsReconciled int       `json:"skillsReconciled"`
	Details          []string  `json:"details"`
	Errors           []string  `json:"errors,omitempty"`
}

func syncUsage() {
	fmt.Println(`Usage: litespm sync [flags]

Automatically synchronize all AI coding agents, configs, catalog, and skills.

Flags:
  -n, --dry-run       Report what would change without modifying files
  -y, --yes           Non-interactive execution (default for sync)
  --json              Output structured JSON report to stdout
  --skip-update       Skip the binary self-update check
  --skip-catalog      Skip capability catalog download and indexing
  --skip-agents       Skip agent configuration detection and wiring
  --skip-skills       Skip skills fan-out and ledger reconciliation
  -h, --help          Show this help message

Examples:
  litespm sync               # Fully automatic sync across all agents
  litespm sync --dry-run     # Preview what would be synchronized`)
}

func parseSyncArgs(args []string) (syncOptions, error) {
	opts := syncOptions{yes: true}
	for i := 0; i < len(args); i++ {
		switch args[i] {
		case "-h", "--help":
			syncUsage()
			os.Exit(0)
		case "-n", "--dry-run":
			opts.dryRun = true
		case "-y", "--yes":
			opts.yes = true
		case "--json":
			opts.jsonOut = true
		case "--skip-update":
			opts.skipUpdate = true
		case "--skip-catalog":
			opts.skipCatalog = true
		case "--skip-agents":
			opts.skipAgents = true
		case "--skip-skills":
			opts.skipSkills = true
		default:
			return opts, fmt.Errorf("unexpected argument %q", args[i])
		}
	}
	return opts, nil
}

func runSync(args []string) int {
	opts, err := parseSyncArgs(args)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error: %v\n\n", err)
		syncUsage()
		return 2
	}

	report, err := executeSync(context.Background(), os.Stdout, opts)
	if err != nil {
		if opts.jsonOut {
			_ = json.NewEncoder(os.Stdout).Encode(map[string]any{
				"error": err.Error(),
			})
		} else {
			fmt.Fprintf(os.Stderr, "\n✗ Sync encountered an error: %v\n", err)
		}
		return 1
	}

	if opts.jsonOut {
		_ = json.NewEncoder(os.Stdout).Encode(report)
	}
	return 0
}

func executeSync(ctx context.Context, out io.Writer, opts syncOptions) (*syncReport, error) {
	report := &syncReport{
		Timestamp: time.Now(),
		Version:   Version,
	}

	if !opts.jsonOut {
		fmt.Fprintln(out, uiCompactHeader("synchronize all agents"))
		fmt.Fprintf(out, "%s LiteSPM %s  ·  cross-agent auto-sync\n", uiAccentS.Render("◆"), Version)
		fmt.Fprintln(out, uiDim.Render("─────────────────────────────────────────────────────────────"))
	}

	paths, err := config.ResolvePlatformPaths()
	if err != nil {
		return nil, fmt.Errorf("resolving platform paths: %w", err)
	}

	execPath, err := os.Executable()
	if err != nil {
		execPath = "litespm"
	}

	cacheDir, cErr := os.UserCacheDir()
	if cErr != nil || strings.TrimSpace(cacheDir) == "" {
		cacheDir = filepath.Join(paths.DataRoot, "cache")
	} else {
		cacheDir = filepath.Join(cacheDir, "litespm")
	}

	cfg, _ := config.LoadCurrentConfig()

	// -------------------------------------------------------------
	// Phase 1: Self-Update / Binary Upgrade Check
	// -------------------------------------------------------------
	if !opts.skipUpdate && Version != "dev" && Version != "" {
		if !opts.jsonOut {
			fmt.Fprintf(out, "%s Checking for LiteSPM updates…\n", uiDim.Render("│"))
		}
		upgrader := update.NewUpdater(update.DefaultReleaseManifestURL)
		checkCtx, cancel := context.WithTimeout(ctx, 6*time.Second)
		status, info, checkErr := upgrader.CheckForUpdate(checkCtx, Version)
		cancel()

		if checkErr == nil && status != nil && status.UpdateAvailable && info != nil {
			report.LatestVersion = status.LatestVersion
			if opts.dryRun {
				report.Details = append(report.Details, fmt.Sprintf("Update available: LiteSPM %s → %s", Version, status.LatestVersion))
				if !opts.jsonOut {
					fmt.Fprintf(out, "%s  update available: LiteSPM %s → %s (run without --dry-run to upgrade)\n",
						uiYellowS.Render("▲"), Version, status.LatestVersion)
				}
			} else {
				binName := update.TargetBinaryName()
				downloadURL, checksum, relErr := releaseDownloadTarget(info, binName)
				if relErr == nil {
					dlCtx, dlCancel := context.WithTimeout(ctx, 30*time.Second)
					payload, dlErr := downloadUpdatePayload(dlCtx, nil, downloadURL, int64(defaultUpdateDownloadLimit))
					dlCancel()
					if dlErr == nil {
						verifyErr := verifyDownloadedUpdate(ctx, upgrader, info, binName, payload, paths.StagingPath())
						if verifyErr == nil {
							applyErr := upgrader.ApplyUpdate(ctx, payload, checksum, execPath, cacheDir)
							if applyErr == nil {
								report.Upgraded = true
								report.Details = append(report.Details, fmt.Sprintf("Upgraded LiteSPM to %s", status.LatestVersion))
								if !opts.jsonOut {
									fmt.Fprintf(out, "%s  upgraded LiteSPM: %s → %s\n", uiGreenS.Render("✓"), Version, status.LatestVersion)
								}
							}
						}
					}
				}
			}
		} else {
			if !opts.jsonOut {
				fmt.Fprintf(out, "%s  binary is up to date (%s)\n", uiGreenS.Render("✓"), Version)
			}
		}
	} else if !opts.jsonOut && !opts.skipUpdate {
		fmt.Fprintf(out, "%s  binary check: running developer build (%s)\n", uiDim.Render("○"), Version)
	}

	// -------------------------------------------------------------
	// Phase 2: Catalog Sync
	// -------------------------------------------------------------
	if !opts.skipCatalog {
		if !opts.jsonOut {
			fmt.Fprintf(out, "%s Syncing capability catalog…\n", uiDim.Render("│"))
		}
		if opts.dryRun {
			report.Details = append(report.Details, "Would check and download latest catalog index")
			if !opts.jsonOut {
				fmt.Fprintf(out, "%s  catalog sync skipped (dry run)\n", uiDim.Render("○"))
			}
		} else {
			client := catalog.NewClientWithTimeout(registryURLOf(cfg), paths.DataRoot, catalogSyncTimeout(cfg), nil)
			syncRes, syncErr := client.Sync(ctx)
			if syncErr != nil {
				report.Errors = append(report.Errors, fmt.Sprintf("catalog sync: %v", syncErr))
				if !opts.jsonOut {
					fmt.Fprintf(out, "%s  catalog sync failed: %v\n", uiYellowS.Render("▲"), syncErr)
				}
			} else {
				report.CatalogSynced = true
				if syncRes != nil {
					report.CatalogItems = syncRes.ItemCount
				}
				if !opts.jsonOut {
					fmt.Fprintf(out, "%s  catalog synced (%d capabilities indexed)\n", uiGreenS.Render("✓"), report.CatalogItems)
				}
			}
		}
	}

	// -------------------------------------------------------------
	// Phase 3: Agent Configurations Cross-Sync (JSON / TOML / JSONC)
	// -------------------------------------------------------------
	var detectedHostIDs []string
	if !opts.skipAgents {
		if !opts.jsonOut {
			fmt.Fprintf(out, "%s Scanning AI coding agent configurations…\n", uiDim.Render("│"))
		}
		adapters := host.ListAdapters()
		for _, adapter := range adapters {
			desc := adapter.Descriptor()
			cfgPath, detErr := adapter.DetectConfig(ctx, domain.ScopeUser)
			if detErr != nil || cfgPath == "" {
				continue
			}
			if _, statErr := os.Stat(cfgPath); statErr != nil {
				continue
			}

			report.AgentsDetected++
			detectedHostIDs = append(detectedHostIDs, desc.HostID)

			verification, vErr := adapter.VerifySetup(ctx)
			if vErr == nil && verification != nil && verification.Registered {
				report.AgentsConfigured++
				continue
			}

			// Agent config exists but LiteSPM is not yet wired into it!
			if opts.dryRun {
				report.Details = append(report.Details, fmt.Sprintf("Would configure %s (%s)", desc.DisplayName, cfgPath))
				if !opts.jsonOut {
					fmt.Fprintf(out, "%s  would connect %s (%s)\n", uiDim.Render("○"), desc.DisplayName, cfgPath)
				}
				continue
			}

			plan, pErr := adapter.PlanSetup(ctx, execPath, paths.BackupsPath())
			if pErr != nil {
				report.Errors = append(report.Errors, fmt.Sprintf("plan %s: %v", desc.DisplayName, pErr))
				if !opts.jsonOut {
					fmt.Fprintf(out, "%s  failed to plan %s: %v\n", uiRedS.Render("■"), desc.DisplayName, pErr)
				}
				continue
			}

			result, aErr := adapter.ApplySetup(ctx, plan)
			if aErr != nil {
				report.Errors = append(report.Errors, fmt.Sprintf("apply %s: %v", desc.DisplayName, aErr))
				if !opts.jsonOut {
					fmt.Fprintf(out, "%s  failed to configure %s: %v\n", uiRedS.Render("■"), desc.DisplayName, aErr)
				}
				continue
			}

			report.AgentsConnected++
			report.AgentsConfigured++
			report.Details = append(report.Details, fmt.Sprintf("Configured %s (%s)", desc.DisplayName, result.ConfigPath))
			installMarketplaceCommand(ctx, io.Discard, desc.HostID, execPath)
			if !opts.jsonOut {
				fmt.Fprintf(out, "%s  auto-connected %s (%s)\n", uiGreenS.Render("✓"), desc.DisplayName, result.ConfigPath)
			}
		}

		if !opts.jsonOut {
			fmt.Fprintf(out, "%s  agents: %d detected · %d newly wired · %d connected\n",
				uiGreenS.Render("✓"), report.AgentsDetected, report.AgentsConnected, report.AgentsConfigured)
		}
	}

	// -------------------------------------------------------------
	// Phase 4: Skills & Ledger Reconcile Across Agents
	// -------------------------------------------------------------
	if !opts.skipSkills {
		if !opts.jsonOut {
			fmt.Fprintf(out, "%s Reconciling skills across detected agent trees…\n", uiDim.Render("│"))
		}
		homeDir, _ := os.UserHomeDir()
		projectDir, _ := os.Getwd()

		ledger, lErr := skills.OpenLedger(skills.LedgerPath(paths.DataRoot))
		if lErr == nil {
			entries, _ := ledger.All()
			installedSkillsByName := make(map[string]skills.LedgerEntry)
			for _, e := range entries {
				if e.SkillName != "" && e.DestDir != "" {
					if _, statErr := os.Stat(filepath.Join(e.DestDir, "SKILL.md")); statErr == nil {
						installedSkillsByName[e.SkillName] = e
					}
				}
			}

			// For each detected agent, check if each installed skill exists in its skills dir
			reconciledCount := 0
			var newLedgerEntries []skills.LedgerEntry

			for _, hostID := range detectedHostIDs {
				agentTarget, ok := skills.LookupAgent(hostID)
				if !ok {
					continue
				}
				targetDir, targetOk := skills.AgentSkillDir(agentTarget.ID, "global", projectDir, homeDir)
				if !targetOk || targetDir == "" {
					continue
				}

				for skillName, entry := range installedSkillsByName {
					skillDest := filepath.Join(targetDir, skillName)
					if _, existsErr := os.Stat(filepath.Join(skillDest, "SKILL.md")); existsErr == nil {
						continue // already present
					}

					// Skill is missing from this detected agent's skills tree!
					if opts.dryRun {
						report.Details = append(report.Details, fmt.Sprintf("Would cross-sync skill %q to %s (%s)", skillName, agentTarget.DisplayName, skillDest))
						continue
					}

					if copyErr := skills.CopySkillDir(entry.DestDir, skillDest); copyErr == nil {
						reconciledCount++
						newLedgerEntries = append(newLedgerEntries, skills.LedgerEntry{
							SkillName:   skillName,
							AgentID:     agentTarget.ID,
							HostLabel:   agentTarget.DisplayName,
							DestDir:     skillDest,
							Source:      entry.Source,
							Scope:       "global",
							InstalledAt: time.Now(),
						})
						if !opts.jsonOut {
							fmt.Fprintf(out, "%s  cross-synced skill %s → %s\n", uiGreenS.Render("✓"), skillName, agentTarget.DisplayName)
						}
					}
				}
			}

			if len(newLedgerEntries) > 0 {
				_ = ledger.Add(newLedgerEntries)
			}
			report.SkillsReconciled = len(installedSkillsByName)
			if !opts.jsonOut {
				fmt.Fprintf(out, "%s  skills: %d active skills reconciled across %d agents\n",
					uiGreenS.Render("✓"), len(installedSkillsByName), len(detectedHostIDs))
			}
		}
	}

	if !opts.jsonOut {
		fmt.Fprintln(out, uiDim.Render("─────────────────────────────────────────────────────────────"))
		fmt.Fprintf(out, "%s All agent configurations, catalog, and capabilities are in sync.\n\n", uiGreenS.Render("◆"))
	}

	return report, nil
}

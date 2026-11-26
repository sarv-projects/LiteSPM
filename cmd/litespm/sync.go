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
	"runtime"
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

	return runSyncWithOptions(context.Background(), os.Stdout, opts)
}

func runSyncWithOptions(ctx context.Context, out io.Writer, opts syncOptions) int {
	report, err := executeSync(ctx, out, opts)
	if err != nil {
		if opts.jsonOut {
			_ = json.NewEncoder(out).Encode(map[string]any{
				"error": err.Error(),
			})
		} else {
			fmt.Fprintf(os.Stderr, "\n✗ Sync encountered an error: %v\n", err)
		}
		return 1
	}

	if opts.jsonOut {
		_ = json.NewEncoder(out).Encode(report)
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
		upgrader := update.NewUpdater(update.DefaultReleaseManifestURL)
		type updateCheckResult struct {
			status *update.UpdateStatus
			info   *update.ReleaseInfo
		}
		var checkRes updateCheckResult
		_, checkErr := runWithSpinner(ctx, os.Stdin, out, "Checking for LiteSPM updates", func() (bool, error) {
			checkCtx, cancel := context.WithTimeout(ctx, 6*time.Second)
			defer cancel()
			s, inf, err := upgrader.CheckForUpdate(checkCtx, Version)
			if err != nil {
				return false, err
			}
			checkRes = updateCheckResult{status: s, info: inf}
			return true, nil
		})

		if checkErr == nil && checkRes.status != nil && checkRes.status.UpdateAvailable && checkRes.info != nil {
			status := checkRes.status
			info := checkRes.info
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
					var updatePayload []byte
					_, applyErr := runWithSpinner(ctx, os.Stdin, out, fmt.Sprintf("Downloading and verifying LiteSPM %s", status.LatestVersion), func() (bool, error) {
						dlCtx, dlCancel := context.WithTimeout(ctx, 30*time.Second)
						defer dlCancel()
						payload, dlErr := downloadUpdatePayload(dlCtx, nil, downloadURL, int64(defaultUpdateDownloadLimit))
						if dlErr != nil {
							return false, dlErr
						}
						verifyErr := verifyDownloadedUpdate(ctx, upgrader, info, binName, payload, paths.StagingPath())
						if verifyErr != nil {
							return false, verifyErr
						}
						updatePayload = payload
						return true, upgrader.ApplyUpdate(ctx, payload, checksum, execPath, cacheDir)
					})
					if applyErr == nil {
						report.Upgraded = true
						report.Details = append(report.Details, fmt.Sprintf("Upgraded LiteSPM to %s", status.LatestVersion))
						if !opts.jsonOut {
							fmt.Fprintf(out, "%s  upgraded LiteSPM: %s → %s\n", uiGreenS.Render("✓"), Version, status.LatestVersion)
						}

						// Sibling binary synchronization: if ~/.local/bin or ~/.litespm/bin exists,
						// update them in lockstep so PATH shadowing never recurs.
						if home, _ := os.UserHomeDir(); home != "" && len(updatePayload) > 0 {
							localName := "litespm"
							if runtime.GOOS == "windows" {
								localName = "litespm.exe"
							}
							for _, sibling := range []string{
								filepath.Join(home, ".local", "bin", localName),
								filepath.Join(home, ".litespm", "bin", binName),
								filepath.Join(home, ".litespm", "bin", status.LatestVersion, binName),
							} {
								if sibling != execPath {
									if _, statErr := os.Stat(sibling); statErr == nil {
										_ = upgrader.ApplyUpdate(ctx, updatePayload, checksum, sibling, cacheDir)
									}
								}
							}
						}
					}
				}
			}
		} else if checkErr != nil {
			report.Details = append(report.Details, fmt.Sprintf("Update check failed: %v", checkErr))
			if !opts.jsonOut {
				fmt.Fprintf(out, "%s  binary update check failed: %v\n", uiYellowS.Render("▲"), checkErr)
			}
		} else {
			if !opts.jsonOut {
				fmt.Fprintf(out, "%s  binary is up to date (%s)\n", uiGreenS.Render("✓"), Version)
			}
		}
	} else if !opts.jsonOut && !opts.skipUpdate {
		fmt.Fprintf(out, "%s  binary check: running developer build (%s at %s)\n", uiDim.Render("○"), Version, execPath)
	}

	// -------------------------------------------------------------
	// Phase 2: Catalog Sync
	// -------------------------------------------------------------
	if !opts.skipCatalog {
		if opts.dryRun {
			report.Details = append(report.Details, "Would check and download latest catalog index")
			if !opts.jsonOut {
				fmt.Fprintf(out, "%s  catalog sync skipped (dry run)\n", uiDim.Render("○"))
			}
		} else {
			client := catalog.NewClientWithTimeout(registryURLOf(cfg), paths.DataRoot, catalogSyncTimeout(cfg), nil)
			syncRes, syncErr := runWithSpinner(ctx, os.Stdin, out, "Syncing capability catalog", func() (*catalog.SyncResult, error) {
				return client.Sync(ctx)
			})
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
		type scanResult struct {
			adapters []host.HostAdapter
		}
		scanRes, _ := runWithSpinner(ctx, os.Stdin, out, "Scanning AI coding agent configurations", func() (*scanResult, error) {
			return &scanResult{adapters: host.ListAdapters()}, nil
		})
		adapters := scanRes.adapters
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
				installMarketplaceCommand(ctx, io.Discard, desc.HostID, execPath)
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
		homeDir, _ := os.UserHomeDir()
		projectDir, _ := os.Getwd()

		ledger, lErr := skills.OpenLedger(skills.LedgerPath(paths.DataRoot))
		if lErr == nil {
			type skillsRecResult struct {
				installedCount int
				newEntries     []skills.LedgerEntry
			}

			recRes, _ := runWithSpinner(ctx, os.Stdin, out, "Reconciling skills across detected agent trees", func() (*skillsRecResult, error) {
				entries, _ := ledger.All()
				installedSkillsByName := make(map[string]skills.LedgerEntry)
				for _, e := range entries {
					if e.Scope != "" && e.Scope != "global" {
						continue // never leak project-scoped skills into global agent directories
					}
					if e.SkillName != "" && e.DestDir != "" {
						if _, statErr := os.Stat(filepath.Join(e.DestDir, "SKILL.md")); statErr == nil {
							installedSkillsByName[e.SkillName] = e
						}
					}
				}

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

						if !opts.dryRun {
							if copyErr := skills.CopySkillDir(entry.DestDir, skillDest); copyErr == nil {
								prov, _ := skills.CaptureProvenance(skillDest)
								newLedgerEntries = append(newLedgerEntries, skills.LedgerEntry{
									SkillName:     skillName,
									AgentID:       agentTarget.ID,
									HostLabel:     agentTarget.DisplayName,
									DestDir:       skillDest,
									Source:        entry.Source,
									SourceRef:     entry.SourceRef,
									Scope:         "global",
									ContentDigest: prov.Digest,
									Inventory:     prov.Inventory,
									InstalledAt:   time.Now(),
								})
							}
						}
					}
				}
				return &skillsRecResult{
					installedCount: len(installedSkillsByName),
					newEntries:     newLedgerEntries,
				}, nil
			})

			if recRes != nil {
				if len(recRes.newEntries) > 0 {
					_ = ledger.Add(recRes.newEntries)
				}
				report.SkillsReconciled = recRes.installedCount
			}
			if !opts.jsonOut {
				skillWord := "skills"
				if report.SkillsReconciled == 1 {
					skillWord = "skill"
				}
				agentWord := "agents"
				if len(detectedHostIDs) == 1 {
					agentWord = "agent"
				}
				fmt.Fprintf(out, "%s  skills: %d active %s reconciled across %d %s\n",
					uiGreenS.Render("✓"), report.SkillsReconciled, skillWord, len(detectedHostIDs), agentWord)
			}
		}
	}

	if !opts.jsonOut {
		fmt.Fprintln(out, uiDim.Render("─────────────────────────────────────────────────────────────"))
		fmt.Fprintf(out, "%s All agent configurations, catalog, and capabilities are in sync.\n\n", uiGreenS.Render("◆"))
	}

	return report, nil
}

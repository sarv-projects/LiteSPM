package catalogbuild

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/url"
	"os"
	"regexp"
	"strings"
	"time"

	"github.com/sarv-projects/litespm/internal/domain"
)

// DatasetPublisher is the publisher object carried by every dataset row.
type DatasetPublisher struct {
	Name string `json:"name"`
	URL  string `json:"url"`
}

// ProducerSourceIDs is the closed vocabulary of source ids the Python
// producer (scripts/build_full_catalog.py) can stamp on a row.
//
// It mirrors that producer's own source table: the `source_id` of every
// upstream it reads (the official registry, the awesome-lists, the directory
// feeds and the vendor marketplaces). The list is a CONTRACT, not a
// convenience: a row whose `source` is grammar-valid but not in this list
// names an upstream the producer cannot have ingested, so it is a typo (or a
// row that was never really ingested) and the release must not be built from
// it. Adding an upstream to the producer means adding it here too -- the two
// lists are the D4 parity contract that scripts/test_builder_parity.py
// measures.
//
// The ids follow the domain.SourceID grammar
// (`^[a-z0-9_-]{3,32}:[a-z0-9_-]{3,64}$`).
var ProducerSourceIDs = []string{
	// The official MCP Registry API (paginated /v0/servers).
	"builtin:mcp-registry",
	// The awesome-lists: one README each, one row per listed entry.
	"feed:punkpeye-awesome-mcp-servers",
	"feed:voltagent-awesome-agent-skills",
	"feed:modelcontextprotocol-servers",
	// The directory feeds: a sitemap in, one row per listing page.
	"feed:skills-sh",
	"feed:mcpservers-org",
	"feed:mcpmarket-com",
	// The vendor marketplaces: one manifest each, one row per plugin.
	"git:claude-plugins-official",
	"git:knowledge-work-plugins",
	"git:anthropics-skills",
	"git:openai-plugins",
	"git:cursor-plugins",
	"git:xai-plugin-marketplace",
}

// IsProducerSourceID reports whether id is one of the source ids the
// producer can emit.
func IsProducerSourceID(id string) bool {
	for _, known := range ProducerSourceIDs {
		if known == id {
			return true
		}
	}
	return false
}

// sha40 is the pinning bar the producer adopts for git commits (xAI's
// marketplace README states it, and scripts/build_full_catalog.py's
// manifest_artifact_descriptor enforces it): a descriptor is pinned only when
// its sha is a full 40-character lowercase commit id. A branch or tag NAME in
// `ref` is mutable and does not clear it.
var sha40 = regexp.MustCompile(`^[0-9a-f]{40}$`)

// DatasetArtifact mirrors one row's `artifact` object: the source descriptor
// the vendor manifest itself published, transcribed by the producer
// (scripts/build_full_catalog.py, manifest_artifact_descriptor). The producer
// used to read only the URL out of it, discarding whichever locator the
// manifest actually declared.
//
// The fields mean exactly what they say and nothing more:
//
//   - Type is the domain's ArtifactType vocabulary: "git-tree" (a revision of
//     a repository) or "local-dir" (a directory inside the repository that
//     publishes the manifest). Neither is an archive.
//
//     A git-tree artifact IS fetchable: internal/artifact's GitTreeFetcher
//     clones the pinned commit over https and extracts it through the shared
//     safe extractor, and cmd/litespm/install_plugin.go installs from it. A
//     local-dir artifact is not fetchable — there is nothing to fetch — so
//     those installs still fail closed with LPSM-ARTIFACT-UNAVAILABLE.
//
//   - DeclaredAs records the spelling the manifest used ("url",
//     "git-subdir", "relative-path", "path", "local"): a relative path and a
//     git URL are not the same claim.
//
//   - Path keeps the manifest's verbatim spelling. Resolution against Repo is
//     a fetcher's job and nothing here has performed it.
//
//   - Ref is a branch or tag NAME and is therefore mutable. Pinned is true
//     only for a full 40-hex lowercase commit Sha; Ref alone never pins.
//
//   - Sha is copied, never resolved or verified.
type DatasetArtifact struct {
	Type       string `json:"type"`
	DeclaredAs string `json:"declaredAs"`
	Repo       string `json:"repo,omitempty"`
	Path       string `json:"path,omitempty"`
	Ref        string `json:"ref,omitempty"`
	SHA        string `json:"sha,omitempty"`
	Pinned     bool   `json:"pinned"`
}

// artifactProblem reports the first internal inconsistency of a transcribed
// descriptor, or "" when it is well formed. Fail-closed: a descriptor whose
// claims cannot all be true is producer/domain drift, and a release must not
// be built from it.
func (a *DatasetArtifact) artifactProblem() string {
	switch domain.ArtifactType(a.Type) {
	case domain.ArtifactGitTree, domain.ArtifactLocalDir:
		// Both kinds name a location inside a repository: a git tree is a
		// revision of one, a local dir is a directory in one. The producer
		// always fills Repo from its source table, so an empty Repo means the
		// descriptor has no locator at all.
		if strings.TrimSpace(a.Repo) == "" {
			return fmt.Sprintf("a %s descriptor must name the repository it lives in (repo is empty)", a.Type)
		}
		if domain.ArtifactType(a.Type) == domain.ArtifactLocalDir && strings.TrimSpace(a.Path) == "" {
			return "a local-dir descriptor must name the directory it points at (path is empty)"
		}
	default:
		return fmt.Sprintf("unknown artifact type %q (the producer writes %q or %q)",
			a.Type, domain.ArtifactGitTree, domain.ArtifactLocalDir)
	}
	if a.Pinned {
		if !sha40.MatchString(a.SHA) {
			return fmt.Sprintf("pinned is true but sha %q is not a full 40-hex lowercase commit id", a.SHA)
		}
		if domain.ArtifactType(a.Type) != domain.ArtifactGitTree {
			return fmt.Sprintf("only a git tree can be pinned to a commit, not %q", a.Type)
		}
	}
	return ""
}

// DatasetRow mirrors one flat row of the catalog dataset written by
// scripts/build_full_catalog.py (web/data/catalog.json).
//
// The dataset is richer than the domain model in ways the domain deliberately
// refuses to model: web display hints (compatibleHosts, installHint), an
// upstream `verified` flag, and stars (null everywhere by policy -- see the
// note at the top of the generator). Fields that have no domain counterpart
// are not decoded here and are never copied into a listing, so a dataset row
// cannot smuggle an unrepresentable claim past conversion.
type DatasetRow struct {
	ID               string           `json:"id"`
	Kind             string           `json:"kind"`
	Name             string           `json:"name"`
	Slug             string           `json:"slug"`
	Summary          string           `json:"summary"`
	Category         string           `json:"category"`
	Publisher        DatasetPublisher `json:"publisher"`
	Source           string           `json:"source"`           // producer source id when supplied
	SourceSnapshotID string           `json:"sourceSnapshotId"` // only present when the producer has a real source snapshot id
	Transport        string           `json:"transport"`        // mcp only: stdio | sse | streamable-http
	Version          string           `json:"version"`          // every row
	Command          string           `json:"command"`          // mcp only: stdio launch command
	Args             []string         `json:"args"`             // mcp only
	URL              string           `json:"url"`              // mcp only: remote endpoint the publisher declared
	SkillSource      string           `json:"skillSource"`      // skill only
	// Artifact is the source descriptor the vendor manifest published for this
	// row (plugin rows today; absent means the manifest published none this
	// producer could transcribe). It is carried into the version record's
	// artifacts; it is not an install claim, and nothing fetches it yet.
	Artifact *DatasetArtifact `json:"artifact,omitempty"`
	// Installability is the provenance class of the row (domain.Installability
	// values). Empty means discovery_only: heuristic ingestion never proved a
	// version or launch line.
	Installability string `json:"installability"`
}

// ParseDataset decodes and validates dataset bytes fail-closed. Every row must
// carry a domain-valid listing id whose kind segment agrees with the row, a
// non-empty name, a `source` the producer can emit (the provenance contract,
// K002) and -- for MCP rows that claim more than discovery_only -- the
// version, transport and a launch line a future install would use (command+args
// for stdio, or the publisher's remote endpoint); ids must be
// unique. The generator normalizes
// ids to the same grammar (canonical_id in scripts/build_full_catalog.py), so
// a violation means the producer and the domain have drifted and the release
// must not be built.
func ParseDataset(raw []byte) ([]DatasetRow, error) {
	var rows []DatasetRow
	if err := json.Unmarshal(raw, &rows); err != nil {
		return nil, fmt.Errorf("decode dataset: %w", err)
	}
	if len(rows) == 0 {
		return nil, fmt.Errorf("dataset contains no rows")
	}

	var problems []string
	seen := make(map[string]int, len(rows))
	withSource := 0
	for i, r := range rows {
		fail := func(format string, args ...any) {
			problems = append(problems, fmt.Sprintf("row %d (%q): %s", i, r.ID, fmt.Sprintf(format, args...)))
		}

		if _, err := domain.ParseListingID(r.ID); err != nil {
			fail("id does not match the domain grammar %s", domain.RegexListingID.String())
		} else if parts := strings.SplitN(r.ID, ":", 3); parts[0] != r.Kind {
			fail("id kind %q disagrees with row kind %q", parts[0], r.Kind)
		}
		if prev, dup := seen[r.ID]; dup {
			fail("duplicate id (first seen at row %d)", prev)
		} else {
			seen[r.ID] = i
		}
		if r.Name == "" {
			fail("missing name")
		}
		// The provenance contract (K002): a row names the source it was
		// ingested from, and that source is one the producer can actually
		// emit. A grammar-valid but unknown id is a typo, and a typo that
		// ships is a provenance claim nobody can trace back to an upstream.
		if r.Source != "" {
			withSource++
			if _, err := domain.ParseSourceID(r.Source); err != nil {
				fail("source is not a valid domain SourceID: %v", err)
			} else if !IsProducerSourceID(r.Source) {
				fail("source %q is not a source the producer can emit", r.Source)
			}
		}
		if !domain.Installability(r.Installability).Valid() {
			fail("unknown installability %q", r.Installability)
		}
		// A transcribed descriptor must be internally consistent: the release
		// must not carry a locator whose claims cannot all be true (see
		// DatasetArtifact.artifactProblem). Absent is fine -- the honest
		// absence -- and is not an error.
		if r.Artifact != nil {
			if problem := r.Artifact.artifactProblem(); problem != "" {
				fail("artifact descriptor: %s", problem)
			}
		}
		// Version and launch line are required only of rows that claim more
		// than discovery_only: a heuristic row has none to give, and the
		// generator no longer invents them. The launch line is EITHER a
		// stdio command OR the publisher's remote endpoint -- an MCP row
		// above discovery_only with neither fails, and a discovery_only row
		// carrying either one fails the same way (both must be proven from
		// a manifest, never asserted by heuristic ingestion).
		if domain.Installability(r.Installability).Effective() != domain.InstallabilityDiscoveryOnly {
			if r.Kind == "mcp" {
				if r.Version == "" {
					fail("mcp row claims %s but has no version", r.Installability)
				}
				if r.Transport == "" {
					fail("mcp row claims %s but has no transport", r.Installability)
				}
				if r.Command == "" && r.URL == "" {
					fail("mcp row claims %s but has no launch line (neither a command nor an endpoint)", r.Installability)
				}
			}
		} else if r.Command != "" {
			fail("discovery_only row carries a launch command; commands must be proven from a manifest")
		} else if r.URL != "" {
			fail("discovery_only row carries a remote endpoint; endpoints must be proven from a manifest")
		}
	}
	// Provenance is stamped per source, so a dataset where SOME rows carry
	// their source and others do not is a producer defect, not a legacy
	// shape: the rows that lost their `source` are rows whose provenance
	// cannot be traced, and a release must not be built from a dataset that
	// mixes traced and untraced rows. A dataset where NO row carries a
	// source is the honest legacy shape (an older dataset published before
	// provenance was stamped); it is refused by the dataset contract test,
	// which holds the whole committed corpus to the rule.
	if withSource > 0 && withSource != len(rows) {
		problems = append(problems, fmt.Sprintf(
			"dataset mixes provenance: %d of %d rows carry a source, %d do not",
			withSource, len(rows), len(rows)-withSource))
	}
	if len(problems) > 0 {
		shown := problems
		ellipsis := ""
		if len(shown) > 10 {
			shown = shown[:10]
			ellipsis = fmt.Sprintf("; ... and %d more", len(problems)-10)
		}
		return nil, fmt.Errorf("dataset validation failed (%d problem(s)): %s%s",
			len(problems), strings.Join(shown, "; "), ellipsis)
	}
	return rows, nil
}

// LoadDataset reads a dataset file and validates it via ParseDataset.
func LoadDataset(path string) ([]DatasetRow, error) {
	raw, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("read dataset %s: %w", path, err)
	}
	return ParseDataset(raw)
}

// DatasetSnapshotID derives a deterministic identity for a dataset input's
// bytes. It is a build-input fingerprint, not an upstream SourceSnapshot ID;
// row provenance must use DatasetRow.SourceSnapshotID when supplied.
func DatasetSnapshotID(dataset []byte) string {
	sum := sha256.Sum256(dataset)
	return "snap-" + hex.EncodeToString(sum[:8])
}

// ConvertDataset converts validated dataset rows into the listings and version
// records CompileRelease consumes.
//
// Every claim written here is one the dataset can support:
//   - sourceId comes from the producer's explicit source field when present;
//   - sourceSnapshotId is copied only from a per-row upstream snapshot id. The
//     dataset-wide input fingerprint is not an upstream snapshot and is not
//     attached to individual rows;
//   - verification level is "unverified" -- the dataset carries no audit
//     evidence, so no stronger level may be asserted;
//   - MCP components are SupportUnknown because installing a catalog-sourced
//     MCP server is not wired yet (STATUS.md; ARCH/13/17), while skill
//     components are SupportYes because the shipped skills lifecycle installs
//     and loads them today;
//   - popularity, host-compatibility, and star figures are not invented;
//   - a row's transcribed source descriptor becomes one ArtifactRef, or none
//     when the manifest published no transcribable descriptor: see
//     artifactRefsFor for what each field means and what is deliberately left
//     empty. Carrying the descriptor is not an install claim: a local-dir
//     artifact has nothing to fetch, so those installs still fail closed with
//     LPSM-ARTIFACT-UNAVAILABLE.
func ConvertDataset(rows []DatasetRow, releaseID, _datasetInputID string, ingestedAt time.Time) ([]*domain.Listing, []*domain.VersionRecord, error) {
	listings := make([]*domain.Listing, 0, len(rows))
	versions := make([]*domain.VersionRecord, 0, len(rows))

	for _, row := range rows {
		listing, version, err := convertRow(row, releaseID, ingestedAt)
		if err != nil {
			return nil, nil, err
		}
		listings = append(listings, listing)
		versions = append(versions, version)
	}
	return listings, versions, nil
}

func convertRow(row DatasetRow, releaseID string, ingestedAt time.Time) (*domain.Listing, *domain.VersionRecord, error) {
	lid, err := domain.ParseListingID(row.ID)
	if err != nil {
		return nil, nil, fmt.Errorf("convert %q: %w", row.ID, err)
	}

	idParts := strings.Split(row.ID, ":")
	rawUpstream := idParts[2]
	encodedSource := ""
	if len(idParts) >= 4 {
		encodedSource = idParts[1] + ":" + idParts[2]
		rawUpstream = strings.Join(idParts[3:], ":")
	}
	upstream, err := url.PathUnescape(rawUpstream)
	if err != nil {
		return nil, nil, fmt.Errorf("convert %q: upstream id is not decodable: %w", row.ID, err)
	}
	sourceID := row.Source
	if sourceID == "" {
		// Older data may not carry the producer's source field. Preserve an
		// ID-encoded SourceID only when the listing ID actually contains the
		// full domain SourceID form; otherwise leave it unknown rather than
		// treating a publisher namespace as a fetch source.
		if encodedSource != "" {
			if _, parseErr := domain.ParseSourceID(encodedSource); parseErr == nil {
				sourceID = encodedSource
			}
		}
	}

	sourceURL := row.Publisher.URL
	if sourceURL == "" {
		sourceURL = row.SkillSource
	}

	categories := []string{}
	if row.Category != "" {
		categories = append(categories, row.Category)
	}

	summaries, components, err := datasetComponents(row, lid)
	if err != nil {
		return nil, nil, err
	}

	installability := domain.Installability(row.Installability)
	if installability == "" {
		// Dataset rows without an explicit provenance class are heuristic
		// ingestion (awesome-lists): discovery-only by default. Only vendor
		// manifests opt into metadata_verified by setting the field.
		installability = domain.InstallabilityDiscoveryOnly
	}

	versionForRecord := row.Version
	versionSummaries := []domain.VersionSummary{}
	if versionForRecord != "" {
		versionSummaries = []domain.VersionSummary{{Version: versionForRecord}}
	}

	listing := &domain.Listing{
		SchemaVersion: 1,
		ID:            row.ID,
		Kind:          domain.ListingKind(row.Kind),
		Name:          row.Name,
		Summary:       row.Summary,
		Categories:    categories,
		Keywords:      []string{},
		PublisherClaim: domain.PublisherClaim{
			Name: row.Publisher.Name,
			URL:  sourceURL,
		},
		Source: domain.SourceReference{
			SourceID:   sourceID,
			UpstreamID: upstream,
			URL:        sourceURL,
		},
		Versions:             versionSummaries,
		ComponentsSummary:    summaries,
		RequirementsSummary:  []string{},
		CompatibilitySummary: []domain.CompatibilityFact{},
		VerificationSummary: domain.VerificationSummary{
			Level: "unverified",
		},
		Provenance: domain.ProvenanceRecord{
			SourceSnapshotID: row.SourceSnapshotID,
			IngestedAt:       ingestedAt,
			CatalogReleaseID: releaseID,
		},
		Status:         domain.ListingStatusActive,
		Installability: installability,
	}

	version := &domain.VersionRecord{
		ListingID:        row.ID,
		Version:          versionForRecord,
		SourceSnapshotID: row.SourceSnapshotID,
		Artifacts:        artifactRefsFor(row),
		Components:       components,
		Dependencies:     []domain.DependencyConstraint{},
		Requirements:     []domain.Requirement{},
		// The dataset declares no permissions, and inventing a declaration
		// would fabricate the exact signal the policy engine acts on.
		PermissionsDeclared: []domain.PermissionDeclaration{},
		CompatibilityClaims: []domain.CompatibilityFact{},
		TestEvidence:        []domain.TestEvidenceRecord{},
		FetchedAt:           ingestedAt,
	}

	return listing, version, nil
}

// artifactRefsFor maps the row's transcribed manifest descriptor onto the
// domain's artifact vocabulary, inventing nothing.
//
//   - git-tree: Locator is the repository the manifest named; Subpath is the
//     manifest's verbatim path with a leading "./" removed (the domain's
//     Subpath is repository-relative). ImmutableRef is the published sha ONLY
//     when the descriptor is pinned -- a 40-hex commit is immutable, while a
//     `ref` alone is a mutable branch or tag name and is therefore NOT copied
//     into an immutable slot; an unpinned git tree fetches FetchHeadRef. The
//     dataset still carries `ref` for a reader that wants the name.
//   - local-dir: a directory inside the repository publishing the manifest.
//     FetchLocalOnly: it is never fetched over the network, and it is not
//     pinned because there is no remote revision to pin.
//
// Digest, Size and MediaType stay empty: the manifests publish none, and a
// fabricated digest would be indistinguishable from a verified one.
//
// The plan builder writes no plan artifacts, so these refs do not change an
// install outcome by themselves — but they are not inert: the plugin install
// path reads the artifact descriptor from the listing and fetches a git-tree
// artifact from its pinned commit. A local-dir artifact has nothing to
// fetch, so those installs still fail closed with LPSM-ARTIFACT-UNAVAILABLE.
func artifactRefsFor(row DatasetRow) []domain.ArtifactRef {
	if row.Artifact == nil {
		return []domain.ArtifactRef{}
	}
	a := row.Artifact
	ref := domain.ArtifactRef{
		// Artifacts carry no upstream id of their own, so the id is derived
		// from the listing it belongs to (deterministic, and collision-free
		// because a row produces at most one artifact).
		ArtifactID: "art_" + strings.ReplaceAll(row.ID, ":", "_"),
		Type:       domain.ArtifactType(a.Type),
		Locator:    a.Repo,
		Subpath:    strings.TrimPrefix(strings.TrimSpace(a.Path), "./"),
	}
	if ref.Type == domain.ArtifactGitTree {
		ref.FetchPolicy = domain.FetchHeadRef
		if a.Pinned {
			ref.ImmutableRef = a.SHA
			ref.FetchPolicy = domain.FetchImmutable
		}
	} else {
		ref.FetchPolicy = domain.FetchLocalOnly
	}
	return []domain.ArtifactRef{ref}
}

// datasetComponents derives the per-kind component lists. MCP rows carry their
// launch line into a RuntimeDescriptor ONLY when the dataset proves one: a
// stdio command+args, or -- for a remote row -- the publisher's endpoint and
// its transport. Discovery-only rows (no proven launch line) produce a
// component with no runtime so no installer can invent a launch line. When a
// row carries both, stdio wins: a real command is a local install and the
// endpoint is unused (no published row carries both today -- the producer
// writes an endpoint only when command/args are null).
func datasetComponents(row DatasetRow, lid domain.ListingID) ([]domain.ComponentSummary, []domain.Component, error) {
	// Component IDs embed a version; discovery-only rows carry no proven
	// version, so the ID uses the literal "discovery" rather than inventing
	// one. The VersionRecord itself keeps the honest empty value.
	versionForID := row.Version
	if versionForID == "" {
		versionForID = "discovery"
	}
	switch domain.ListingKind(row.Kind) {
	case domain.KindMCP:
		if row.Command == "" {
			if row.URL == "" {
				// No proven launch line: honest absence, not an empty command.
				return []domain.ComponentSummary{{Kind: domain.ComponentMCPProvider, Name: "server"}},
					[]domain.Component{{
						ID:   string(domain.NewComponentID(lid, versionForID, domain.ComponentMCPProvider, "server")),
						Kind: domain.ComponentMCPProvider,
						Name: "server",
						// Runtime is nil: RuntimeForListing fails closed.
						Runtime:         nil,
						DeclaredEffects: []domain.EffectDeclaration{},
						// Not "yes": resolving and installing this launch line from
						// the catalog is not wired yet (STATUS.md install row).
						SupportedByLiteSPM: domain.SupportUnknown,
					}}, nil
			}
			// Remote (URL) row: the launch line is the endpoint itself -- no
			// process is spawned, the client connects. ParseDataset required
			// a transport alongside the URL, so the descriptor carries the
			// published transport verbatim ("streamable-http", "sse") and
			// the endpoint the egress guard re-checks at connect time.
			return []domain.ComponentSummary{{Kind: domain.ComponentMCPProvider, Name: "server"}},
				[]domain.Component{{
					ID:   string(domain.NewComponentID(lid, versionForID, domain.ComponentMCPProvider, "server")),
					Kind: domain.ComponentMCPProvider,
					Name: "server",
					Runtime: &domain.RuntimeDescriptor{
						Type:     row.Transport,
						Endpoint: row.URL,
					},
					DeclaredEffects: []domain.EffectDeclaration{},
					// Not "yes": registering a remote entry in a host config
					// is not wired yet (STATUS.md install row).
					SupportedByLiteSPM: domain.SupportUnknown,
				}}, nil
		}
		transport := row.Transport
		if transport == "" {
			transport = "stdio"
		}
		return []domain.ComponentSummary{{Kind: domain.ComponentMCPProvider, Name: "server"}},
			[]domain.Component{{
				ID:   string(domain.NewComponentID(lid, versionForID, domain.ComponentMCPProvider, "server")),
				Kind: domain.ComponentMCPProvider,
				Name: "server",
				Runtime: &domain.RuntimeDescriptor{
					Type:    transport,
					Command: row.Command,
					Args:    append([]string(nil), row.Args...),
				},
				DeclaredEffects: []domain.EffectDeclaration{},
				// Not "yes": resolving and installing this launch line from
				// the catalog is not wired yet (STATUS.md install row).
				SupportedByLiteSPM: domain.SupportUnknown,
			}}, nil

	case domain.KindSkill:
		componentName := row.Slug
		if componentName == "" {
			componentName = row.ID
		}
		return []domain.ComponentSummary{{Kind: domain.ComponentSkill, Name: row.Name}},
			[]domain.Component{{
				ID:   string(domain.NewComponentID(lid, versionForID, domain.ComponentSkill, componentName)),
				Kind: domain.ComponentSkill,
				Name: row.Name,
				// The shipped skills lifecycle installs, stores, and loads
				// SKILL.md packages today (STATUS.md skills row).
				DeclaredEffects:    []domain.EffectDeclaration{},
				SupportedByLiteSPM: domain.SupportYes,
			}}, nil

	case domain.KindPlugin:
		// The dataset does not enumerate a plugin's components; an empty list
		// records what is known instead of inventing members.
		return []domain.ComponentSummary{}, []domain.Component{}, nil

	default:
		return nil, nil, fmt.Errorf("convert %q: unsupported kind %q", row.ID, row.Kind)
	}
}

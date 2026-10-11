package catalogbuild

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"github.com/sarv-projects/litespm/internal/domain"
)

// ContentDigestOf returns the release contentDigest: SHA-256 over the canonical
// listings.json bytes followed immediately by the canonical versions.json
// bytes — no separator, listings first — hex-encoded and prefixed "sha256:".
//
// CompileRelease emits exactly this digest. The deploy verifier and the catalog
// client recompute it from the served/on-disk bytes so that a rewrite which
// fixed every per-file size and digest in the manifest is still refused.
func ContentDigestOf(listings, versions []byte) string {
	contentHasher := sha256.New()
	contentHasher.Write(listings)
	contentHasher.Write(versions)
	return fmt.Sprintf("sha256:%s", hex.EncodeToString(contentHasher.Sum(nil)))
}

// ReleaseManifestFile describes an immutable file entry within a release manifest.
type ReleaseManifestFile struct {
	Size   int64  `json:"size"`
	Digest string `json:"digest"` // sha256:<hex>
}

// ReleaseManifest represents the immutable root manifest of a release.
// It strictly adheres to schemas/catalog-release.schema.json.
type ReleaseManifest struct {
	SchemaVersion   int                            `json:"schemaVersion"`
	ReleaseID       string                         `json:"releaseId"`
	CreatedAt       string                         `json:"createdAt"`
	ItemCount       int                            `json:"itemCount"`
	ContentDigest   string                         `json:"contentDigest"`
	Status          string                         `json:"status"`
	SourceSnapshots []string                       `json:"sourceSnapshots,omitempty"`
	Files           map[string]ReleaseManifestFile `json:"files"`
}

// CurrentPointerSchemaVersion is the /v1/current.json schema version this tree
// produces and the client accepts; a pointer at any other version is rejected
// before its fields are used (internal/catalog.validateCurrent).
const CurrentPointerSchemaVersion = 1

// CurrentPointer represents /v1/current.json pointing to the latest verified release.
type CurrentPointer struct {
	SchemaVersion  int    `json:"schemaVersion"`
	ReleaseID      string `json:"releaseId"`
	Sequence       int    `json:"sequence"`
	ManifestDigest string `json:"manifestDigest"` // sha256:<hex> of manifest.json
	ItemCount      int    `json:"itemCount"`
	CreatedAt      string `json:"createdAt"`
}

// BuildOutput contains all generated release files keyed by their relative path.
type BuildOutput struct {
	ReleaseID      string
	ManifestDigest string
	Manifest       *ReleaseManifest
	Current        *CurrentPointer
	Files          map[string][]byte // relative path -> canonical byte content
}

// CompileRelease compiles normalized domain listings and version records into a deterministic static release.
func CompileRelease(
	releaseID string,
	sequence int,
	sourceSnapshots []string,
	listings []*domain.Listing,
	versions []*domain.VersionRecord,
	createdAt time.Time,
) (*BuildOutput, error) {
	if err := domain.ValidateReleaseID(releaseID); err != nil {
		return nil, fmt.Errorf("invalid releaseID: %w", err)
	}

	createdAtISO := createdAt.UTC().Format(time.RFC3339)
	outputFiles := make(map[string][]byte)
	manifestFiles := make(map[string]ReleaseManifestFile)

	// 1. Sort listings lexicographically by ID for determinism
	sortedListings := make([]*domain.Listing, len(listings))
	copy(sortedListings, listings)
	sort.Slice(sortedListings, func(i, j int) bool {
		return sortedListings[i].ID < sortedListings[j].ID
	})

	// 2. Sort versions by ListingID + Version
	sortedVersions := make([]*domain.VersionRecord, len(versions))
	copy(sortedVersions, versions)
	sort.Slice(sortedVersions, func(i, j int) bool {
		if sortedVersions[i].ListingID == sortedVersions[j].ListingID {
			return sortedVersions[i].Version < sortedVersions[j].Version
		}
		return sortedVersions[i].ListingID < sortedVersions[j].ListingID
	})

	// 3. Serialize listings, sharded so no single file exceeds the 25 MiB
	// per-asset limit Cloudflare Workers enforces (verified live:
	// `wrangler deploy --dry-run` rejects a larger file outright). A release
	// whose listings fit in one shard keeps the historical single-file name and
	// bytes, so nothing about a small release changes.
	if err := emitSharded(outputFiles, manifestFiles, releaseID, "listings", sortedListings); err != nil {
		return nil, fmt.Errorf("failed to serialize listings: %w", err)
	}

	// 4. Serialize versions, sharded by the same rule.
	if err := emitSharded(outputFiles, manifestFiles, releaseID, "versions", sortedVersions); err != nil {
		return nil, fmt.Errorf("failed to serialize versions: %w", err)
	}

	// 5. Compute contentDigest over the combined content. With shards that is
	// the ordered concatenation of the shard files, which is still a digest
	// over every byte this release serves — every one of those bytes is itself
	// pinned by a per-file digest in the manifest, so a rewritten shard breaks
	// both its own entry and this one.
	contentDigest := ContentDigestOf(concatShards(outputFiles, releaseID, "listings"), concatShards(outputFiles, releaseID, "versions"))

	// 6. Build Manifest
	manifest := &ReleaseManifest{
		SchemaVersion:   1,
		ReleaseID:       releaseID,
		CreatedAt:       createdAtISO,
		ItemCount:       len(sortedListings),
		ContentDigest:   contentDigest,
		Status:          "active",
		SourceSnapshots: sourceSnapshots,
		Files:           manifestFiles,
	}

	rawManifestJSON, err := json.Marshal(manifest)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal manifest: %w", err)
	}
	canonicalManifest, err := domain.CanonicalizeJSON(rawManifestJSON)
	if err != nil {
		return nil, fmt.Errorf("failed to canonicalize manifest: %w", err)
	}
	manifestPath := fmt.Sprintf("v1/releases/%s/manifest.json", releaseID)
	outputFiles[manifestPath] = canonicalManifest
	manifestDigest := domain.ComputeBytesDigest(canonicalManifest)

	// 7. Build current.json
	current := &CurrentPointer{
		SchemaVersion:  1,
		ReleaseID:      releaseID,
		Sequence:       sequence,
		ManifestDigest: manifestDigest,
		ItemCount:      len(sortedListings),
		CreatedAt:      createdAtISO,
	}

	rawCurrentJSON, err := json.Marshal(current)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal current: %w", err)
	}
	canonicalCurrent, err := domain.CanonicalizeJSON(rawCurrentJSON)
	if err != nil {
		return nil, fmt.Errorf("failed to canonicalize current: %w", err)
	}
	outputFiles["v1/current.json"] = canonicalCurrent

	return &BuildOutput{
		ReleaseID:      releaseID,
		ManifestDigest: manifestDigest,
		Manifest:       manifest,
		Current:        current,
		Files:          outputFiles,
	}, nil
}

// WriteToDirectory writes all build output files to the target directory.
func (b *BuildOutput) WriteToDirectory(baseDir string) error {
	for relPath, content := range b.Files {
		fullPath := filepath.Join(baseDir, relPath)
		dir := filepath.Dir(fullPath)
		if err := os.MkdirAll(dir, 0755); err != nil {
			return fmt.Errorf("failed to create directory %s: %w", dir, err)
		}
		if err := os.WriteFile(fullPath, content, 0644); err != nil {
			return fmt.Errorf("failed to write release file %s: %w", fullPath, err)
		}
	}
	return nil
}

// ReleaseShardMaxBytes is the largest file this builder aims to emit.
//
// The ceiling it respects is Cloudflare Workers' 25 MiB per-asset limit, which
// `wrangler deploy` enforces at upload time — a larger file fails the whole
// deploy with "Asset too large". The 5 MiB of headroom is deliberate: the limit
// counts the file as uploaded, and a release that grows a little should not be
// the reason a deploy stops working.
const ReleaseShardMaxBytes = 20 << 20

// shardName is the name of one shard. The index is zero-padded to four digits
// so that sorting shard names lexicographically orders them numerically —
// clients derive the row order from the name, and no client should have to know
// how many shards a release has.
func shardName(base string, index int) string {
	return fmt.Sprintf("%s-%04d.json", base, index)
}

// emitSharded serializes one row set into the release tree, splitting it across
// as many files as it needs to stay under ReleaseShardMaxBytes.
//
// A set that fits in ONE shard is written under the historical single-file name
// (`<base>.json`) with its historical bytes, so a small release is byte-for-byte
// what it was before sharding existed and its digest does not move. Larger sets
// become `<base>-0000.json`, `<base>-0001.json`, … each an independently
// parseable canonical array, and every shard is recorded in the manifest with
// its own digest and size — the manifest is already a map of file → digest, so
// a shard is indistinguishable from a file to anything verifying it.
func emitSharded(files map[string][]byte, manifest map[string]ReleaseManifestFile, releaseID, base string, rows any) error {
	raw, err := json.Marshal(rows)
	if err != nil {
		return err
	}
	canonical, err := domain.CanonicalizeJSON(raw)
	if err != nil {
		return err
	}

	if len(canonical) <= ReleaseShardMaxBytes {
		name := base + ".json"
		files[fmt.Sprintf("v1/releases/%s/%s", releaseID, name)] = canonical
		manifest[name] = ReleaseManifestFile{
			Size:   int64(len(canonical)),
			Digest: domain.ComputeBytesDigest(canonical),
		}
		return nil
	}

	var elements []json.RawMessage
	if err := json.Unmarshal(canonical, &elements); err != nil {
		return fmt.Errorf("split %s into shards: %w", base, err)
	}

	writeShard := func(chunk []json.RawMessage) error {
		encoded, err := json.Marshal(chunk)
		if err != nil {
			return err
		}
		shard, err := domain.CanonicalizeJSON(encoded)
		if err != nil {
			return err
		}
		name := shardName(base, manifestShards(manifest, base))
		files[fmt.Sprintf("v1/releases/%s/%s", releaseID, name)] = shard
		manifest[name] = ReleaseManifestFile{
			Size:   int64(len(shard)),
			Digest: domain.ComputeBytesDigest(shard),
		}
		return nil
	}

	chunk := []json.RawMessage{}
	// "[", "]", and a comma per element but the first.
	size := 2
	for _, element := range elements {
		cost := len(element)
		if len(chunk) > 0 {
			cost++
		}
		if len(chunk) > 0 && size+cost > ReleaseShardMaxBytes {
			if err := writeShard(chunk); err != nil {
				return err
			}
			chunk = []json.RawMessage{}
			size = 2
		}
		chunk = append(chunk, element)
		size += cost
	}
	if len(chunk) > 0 {
		if err := writeShard(chunk); err != nil {
			return err
		}
	}
	return nil
}

// manifestShards counts the shards already recorded for a base name, which is
// also the next shard index.
func manifestShards(manifest map[string]ReleaseManifestFile, base string) int {
	count := 0
	for name := range manifest {
		if name == base+".json" || strings.HasPrefix(name, base+"-") {
			count++
		}
	}
	return count
}

// concatShards returns the bytes a release serves for one base name, in shard
// order. It is the digest domain of ContentDigestOf: hashing the ordered
// concatenation means contentDigest still covers every byte of the release's
// content, spread across as many files as that content needed.
func concatShards(files map[string][]byte, releaseID, base string) []byte {
	prefix := fmt.Sprintf("v1/releases/%s/", releaseID)
	names := []string{}
	for path := range files {
		if !strings.HasPrefix(path, prefix) {
			continue
		}
		name := strings.TrimPrefix(path, prefix)
		if name == base+".json" || strings.HasPrefix(name, base+"-") {
			names = append(names, name)
		}
	}
	sort.Strings(names)
	var out []byte
	for _, name := range names {
		out = append(out, files[prefix+name]...)
	}
	return out
}

package catalogbuild

import (
	"strings"
	"testing"
	"time"

	"github.com/sarv-projects/litespm/internal/domain"
)

func TestDatasetConversionPreservesExplicitSourceWithoutInventingSnapshot(t *testing.T) {
	raw := []byte(`[{"id":"skill:publisher:demo","kind":"skill","name":"demo","summary":"A demo skill","publisher":{"name":"publisher"},"source":"feed:skills-sh"}]`)
	rows, err := ParseDataset(raw)
	if err != nil {
		t.Fatalf("ParseDataset: %v", err)
	}

	listings, versions, err := ConvertDataset(rows, "rel-provenance", DatasetSnapshotID(raw), time.Unix(1, 0).UTC())
	if err != nil {
		t.Fatalf("ConvertDataset: %v", err)
	}
	if got := listings[0].Source.SourceID; got != "feed:skills-sh" {
		t.Errorf("source.sourceId = %q, want producer's explicit source ID", got)
	}
	if got := listings[0].Provenance.SourceSnapshotID; got != "" {
		t.Errorf("listing sourceSnapshotId = %q, want absent when producer supplied no source snapshot", got)
	}
	if got := versions[0].SourceSnapshotID; got != "" {
		t.Errorf("version sourceSnapshotId = %q, want absent when producer supplied no source snapshot", got)
	}
}

func TestDatasetConversionPreservesExplicitPerRowSnapshot(t *testing.T) {
	const sourceSnapshotID = "snap_01J9X8K2M4N5P6Q7R8S9T0U1V2"
	raw := []byte(`[{"id":"skill:publisher:demo","kind":"skill","name":"demo","summary":"A demo skill","publisher":{"name":"publisher"},"source":"feed:skills-sh","sourceSnapshotId":"` + sourceSnapshotID + `"}]`)
	rows, err := ParseDataset(raw)
	if err != nil {
		t.Fatalf("ParseDataset: %v", err)
	}
	listings, versions, err := ConvertDataset(rows, "rel-provenance", "dataset-fingerprint-not-source-snapshot", time.Unix(1, 0).UTC())
	if err != nil {
		t.Fatalf("ConvertDataset: %v", err)
	}
	if got := listings[0].Provenance.SourceSnapshotID; got != sourceSnapshotID {
		t.Errorf("listing sourceSnapshotId = %q, want row value %q", got, sourceSnapshotID)
	}
	if got := versions[0].SourceSnapshotID; got != sourceSnapshotID {
		t.Errorf("version sourceSnapshotId = %q, want row value %q", got, sourceSnapshotID)
	}
}

func TestParseDatasetRejectsInvalidExplicitSource(t *testing.T) {
	raw := []byte(`[{"id":"skill:publisher:demo","kind":"skill","name":"demo","summary":"A demo skill","publisher":{"name":"publisher"},"source":"not-a-source-id"}]`)
	if _, err := ParseDataset(raw); err == nil {
		t.Fatal("expected invalid producer source to be rejected")
	}
}

// TestParseDatasetRejectsSourceTheProducerCannotEmit pins the second half of
// the K002 contract: a source id that satisfies the domain grammar but names
// no upstream the producer can ingest is a typo, and a typo that ships is a
// provenance claim nobody can trace back to a fetch. `feed:skill-sh` is a
// one-character slip of `feed:skills-sh`; the grammar accepts both, so only
// the producer's own vocabulary can tell them apart.
func TestParseDatasetRejectsSourceTheProducerCannotEmit(t *testing.T) {
	raw := []byte(`[{"id":"skill:publisher:demo","kind":"skill","name":"demo","summary":"A demo skill","publisher":{"name":"publisher"},"source":"feed:skill-sh"}]`)
	_, err := ParseDataset(raw)
	if err == nil {
		t.Fatal("expected a source the producer cannot emit to be rejected")
	}
	if !strings.Contains(err.Error(), "not a source the producer can emit") {
		t.Fatalf("rejection does not name the reason: %v", err)
	}
}

// TestParseDatasetRejectsRowThatLostItsSource pins the build-time half of the
// contract: a row whose `source` disappeared while its neighbours kept theirs
// must fail the build, not ship. Provenance is stamped per source, so a
// dataset that mixes traced and untraced rows is a producer defect.
//
// A dataset where NO row carries a source is the honest legacy shape (an
// older dataset published before provenance was stamped) and stays
// acceptable here; the whole-corpus rule lives in the dataset contract test
// (TestDatasetPipelineAgainstRealCatalog), which holds every row of the
// committed dataset to it.
func TestParseDatasetRejectsRowThatLostItsSource(t *testing.T) {
	raw := []byte(`[
		{"id":"skill:publisher:kept","kind":"skill","name":"kept","summary":"A traced skill","publisher":{"name":"publisher"},"source":"feed:skills-sh"},
		{"id":"skill:publisher:untraced","kind":"skill","name":"untraced","summary":"A skill that lost its source","publisher":{"name":"publisher"}}
	]`)
	_, err := ParseDataset(raw)
	if err == nil {
		t.Fatal("expected a dataset that mixes traced and untraced rows to be rejected")
	}
	if !strings.Contains(err.Error(), "mixes provenance") {
		t.Fatalf("rejection does not name the reason: %v", err)
	}

	// The same dataset with every row traced is accepted: the rule is about
	// the mix, not about the presence of a source in a hand-made fixture.
	traced := []byte(`[
		{"id":"skill:publisher:kept","kind":"skill","name":"kept","summary":"A traced skill","publisher":{"name":"publisher"},"source":"feed:skills-sh"},
		{"id":"skill:publisher:also-traced","kind":"skill","name":"also traced","summary":"Another traced skill","publisher":{"name":"publisher"},"source":"feed:skills-sh"}
	]`)
	if _, err := ParseDataset(traced); err != nil {
		t.Fatalf("a fully traced dataset was rejected: %v", err)
	}
}

// TestProducerSourceIDsAreGrammaticallyValidAndAccepted keeps the declared
// producer vocabulary honest: every id in it satisfies the domain grammar and
// is accepted by ParseDataset, so the list cannot rot into a set of ids that
// would refuse a row the producer legitimately wrote.
func TestProducerSourceIDsAreGrammaticallyValidAndAccepted(t *testing.T) {
	if len(ProducerSourceIDs) == 0 {
		t.Fatal("the producer source vocabulary is empty")
	}
	seen := map[string]bool{}
	for _, id := range ProducerSourceIDs {
		if seen[id] {
			t.Errorf("producer source vocabulary lists %q twice", id)
		}
		seen[id] = true
		if _, err := domain.ParseSourceID(id); err != nil {
			t.Errorf("producer source %q does not satisfy the domain grammar: %v", id, err)
		}
		raw := []byte(`[{"id":"skill:publisher:demo","kind":"skill","name":"demo","summary":"A demo skill","publisher":{"name":"publisher"},"source":"` + id + `"}]`)
		if _, err := ParseDataset(raw); err != nil {
			t.Errorf("producer source %q is refused by ParseDataset: %v", id, err)
		}
	}
}

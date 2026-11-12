package catalog

// disk_index.go — the on-disk search index (SQLite FTS5).
//
// A verified release is about 100 MB of JSON. Parsing it on every `search`,
// popup or `marketplace rows` call cost ~1.6 s and ~500 MB, and made the
// daemon hold the whole catalog in memory. Instead, right after a release is
// verified (Sync, or the first full cache load), its listings and versions are
// written once into a SQLite file with an FTS5 trigram index. Every later
// query opens that file read-only and reads only what it needs.
//
// Trust. The file is built only from bytes that already passed the digest
// chain (pointer → manifest → shards → content digest). Its name and its meta
// table carry the release id and manifest digest it was built from, and a
// client only opens the file whose meta matches the cached pointer it just
// validated; anything else is rebuilt from the verified shards. The file is
// written to a temporary name and renamed into place, so a reader never sees
// a half-built index.
//
// Semantics. Ranking is the same function the in-memory index uses
// (scoreListing): the trigram index only narrows the candidates (substring
// match, so "ithu" still finds "GitHub"), SQL computes the identical score to
// order them, and the returned rows are re-scored in Go so MatchedFields and
// Score are byte-for-byte what the in-memory path returns.

import (
	"bytes"
	"compress/gzip"
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"
	"unicode/utf8"

	"github.com/sarv-projects/litespm/internal/catalogbuild"
	"github.com/sarv-projects/litespm/internal/domain"

	_ "modernc.org/sqlite"
)

// diskIndexSchema is bumped whenever the table layout or the scoring changes;
// an index with another value is rebuilt.
const diskIndexSchema = 4 // 2: gzip documents; 3: summary column; 4: hay column

const fieldSep = "\x1f"

type diskIndex struct {
	db             *sql.DB
	path           string
	releaseID      string
	manifestDigest string
	count          int
}

func diskIndexDir(cacheDir string) string {
	return filepath.Join(cacheDir, "v1", "index")
}

func diskIndexPath(cacheDir string, current *catalogbuild.CurrentPointer) string {
	digest := strings.TrimPrefix(current.ManifestDigest, "sha256:")
	if len(digest) > 16 {
		digest = digest[:16]
	}
	return filepath.Join(diskIndexDir(cacheDir), fmt.Sprintf("catalog-%s-%s-s%d.sqlite", current.ReleaseID, digest, diskIndexSchema))
}

func sqliteURI(path string, readOnly bool) string {
	p := filepath.ToSlash(path)
	if !strings.HasPrefix(p, "/") {
		p = "/" + p // file:///C:/... on Windows
	}
	q := "?_pragma=busy_timeout(5000)"
	if readOnly {
		// immutable: the file never changes after the rename, so SQLite
		// takes no locks and needs no journal — fast, and safe on Windows
		// while another process builds the next release's file.
		q = "?mode=ro&immutable=1"
	}
	return "file://" + p + q
}

// openDiskIndex opens the index built for exactly this release, or fails.
func openDiskIndex(cacheDir string, current *catalogbuild.CurrentPointer) (*diskIndex, error) {
	path := diskIndexPath(cacheDir, current)
	if _, err := os.Stat(path); err != nil {
		return nil, err
	}
	db, err := sql.Open("sqlite", sqliteURI(path, true))
	if err != nil {
		return nil, err
	}
	db.SetMaxOpenConns(4)
	// No idle connections: the file is released between queries, so a
	// long-lived process (the daemon) never pins it, Windows can delete or
	// replace old index files, and opening one costs about a millisecond.
	db.SetMaxIdleConns(0)
	meta := map[string]string{}
	rows, err := db.Query(`SELECT key, value FROM meta`)
	if err != nil {
		_ = db.Close()
		return nil, err
	}
	for rows.Next() {
		var k, v string
		if err := rows.Scan(&k, &v); err != nil {
			rows.Close()
			_ = db.Close()
			return nil, err
		}
		meta[k] = v
	}
	rows.Close()
	if meta["schema"] != strconv.Itoa(diskIndexSchema) ||
		meta["release_id"] != current.ReleaseID ||
		meta["manifest_digest"] != current.ManifestDigest ||
		meta["complete"] != "1" {
		_ = db.Close()
		return nil, errors.New("catalog index does not match the cached release")
	}
	if err := checkCacheUnchanged(cacheDir, current, meta); err != nil {
		_ = db.Close()
		return nil, err
	}
	count, _ := strconv.Atoi(meta["count"])
	return &diskIndex{db: db, path: path, releaseID: current.ReleaseID, manifestDigest: current.ManifestDigest, count: count}, nil
}

func (d *diskIndex) close() {
	if d != nil && d.db != nil {
		_ = d.db.Close()
	}
}

// buildDiskIndex writes the index for a verified release and returns it open.
func buildDiskIndex(cacheDir string, current *catalogbuild.CurrentPointer, listings []*domain.Listing, versions []*domain.VersionRecord) (*diskIndex, error) {
	dir := diskIndexDir(cacheDir)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return nil, err
	}
	final := diskIndexPath(cacheDir, current)
	if d, err := openDiskIndex(cacheDir, current); err == nil {
		return d, nil // another process built it first
	}
	var suffix [6]byte
	_, _ = rand.Read(suffix[:])
	tmp := final + ".tmp-" + hex.EncodeToString(suffix[:])
	defer func() { _ = os.Remove(tmp) }()

	if err := writeDiskIndex(cacheDir, tmp, current, listings, versions); err != nil {
		return nil, fmt.Errorf("build catalog search index: %w", err)
	}
	if err := os.Rename(tmp, final); err != nil {
		// A concurrent builder won the rename: use its file.
		if d, oerr := openDiskIndex(cacheDir, current); oerr == nil {
			return d, nil
		}
		return nil, err
	}
	pruneDiskIndexes(dir, final)
	return openDiskIndex(cacheDir, current)
}

func writeDiskIndex(cacheDir, path string, current *catalogbuild.CurrentPointer, listings []*domain.Listing, versions []*domain.VersionRecord) error {
	t0 := time.Now()
	mark := func(what string) {
		if os.Getenv("LITESPM_INDEX_DEBUG") != "" {
			fmt.Fprintf(os.Stderr, "index build: %-14s %v\n", what, time.Since(t0).Round(time.Millisecond))
		}
	}
	defer mark("done")
	db, err := sql.Open("sqlite", sqliteURI(path, false))
	if err != nil {
		return err
	}
	defer db.Close()
	db.SetMaxOpenConns(1)
	for _, stmt := range []string{
		`PRAGMA journal_mode=OFF`,
		`PRAGMA synchronous=OFF`,
		`PRAGMA page_size=8192`,
		`CREATE TABLE meta(key TEXT PRIMARY KEY, value TEXT NOT NULL)`,
		`CREATE TABLE listings(
			rid INTEGER PRIMARY KEY,
			id TEXT NOT NULL UNIQUE,
			kind TEXT NOT NULL,
			status TEXT NOT NULL,
			name TEXT NOT NULL,
			lid TEXT NOT NULL, lname TEXT NOT NULL, ltitle TEXT NOT NULL,
			lsummary TEXT NOT NULL, lcats TEXT NOT NULL, lkws TEXT NOT NULL,
			cats_exact TEXT NOT NULL,
			verify TEXT NOT NULL,
			summary BLOB NOT NULL,
			hay TEXT NOT NULL,
			doc BLOB NOT NULL)`,
		`CREATE TABLE versions(listing_id TEXT NOT NULL, version TEXT NOT NULL, doc BLOB NOT NULL, PRIMARY KEY(listing_id, version)) WITHOUT ROWID`,
	} {
		if _, err := db.Exec(stmt); err != nil {
			return fmt.Errorf("%s: %w", strings.SplitN(stmt, "(", 2)[0], err)
		}
	}
	tx, err := db.Begin()
	if err != nil {
		return err
	}
	insL, err := tx.Prepare(`INSERT OR REPLACE INTO listings(id, kind, status, name, lid, lname, ltitle, lsummary, lcats, lkws, cats_exact, verify, summary, hay, doc) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
	if err != nil {
		_ = tx.Rollback()
		return err
	}
	for _, l := range listings {
		if l == nil || l.ID == "" {
			continue
		}
		doc, err := packDoc(l)
		if err != nil {
			_ = tx.Rollback()
			return err
		}
		sum, err := json.Marshal(summaryOf(l))
		if err != nil {
			_ = tx.Rollback()
			return err
		}
		cats := lowerAll(l.Categories)
		if _, err := insL.Exec(l.ID, string(l.Kind), string(l.Status), l.Name,
			strings.ToLower(l.ID), strings.ToLower(l.Name), strings.ToLower(l.Title), strings.ToLower(l.Summary),
			strings.Join(cats, fieldSep), strings.Join(lowerAll(l.Keywords), fieldSep),
			fieldSep+strings.Join(cats, fieldSep)+fieldSep,
			l.VerificationSummary.Level, sum,
			strings.Join([]string{strings.ToLower(l.Name), strings.ToLower(l.Title), strings.ToLower(l.Summary),
				strings.Join(cats, fieldSep), strings.Join(lowerAll(l.Keywords), fieldSep)}, fieldSep), doc); err != nil {
			_ = tx.Rollback()
			return err
		}
	}
	mark("listings")
	insV, err := tx.Prepare(`INSERT OR REPLACE INTO versions(listing_id, version, doc) VALUES (?,?,?)`)
	if err != nil {
		_ = tx.Rollback()
		return err
	}
	for _, v := range versions {
		if v == nil || v.ListingID == "" {
			continue
		}
		doc, err := packDoc(v)
		if err != nil {
			_ = tx.Rollback()
			return err
		}
		if _, err := insV.Exec(v.ListingID, v.Version, doc); err != nil {
			_ = tx.Rollback()
			return err
		}
	}
	mark("versions")
	if err := tx.Commit(); err != nil {
		return err
	}
	mark("commit")
	for _, stmt := range []string{
		`CREATE INDEX listings_order ON listings(name, id)`,
		`CREATE VIRTUAL TABLE fts USING fts5(lid, lname, ltitle, lsummary, lcats, lkws, content='listings', content_rowid='rid', tokenize='trigram')`,
		`INSERT INTO fts(fts) VALUES('rebuild')`,
		`INSERT INTO fts(fts) VALUES('optimize')`,
	} {
		if _, err := db.Exec(stmt); err != nil {
			return err
		}
		mark(strings.Fields(stmt)[0] + " " + strings.Fields(stmt)[1])
	}
	var count int
	if err := db.QueryRow(`SELECT count(*) FROM listings`).Scan(&count); err != nil {
		return err
	}
	// "complete" is written last: an interrupted build is never opened.
	for _, kv := range [][2]string{
		{"schema", strconv.Itoa(diskIndexSchema)},
		{"release_id", current.ReleaseID},
		{"manifest_digest", current.ManifestDigest},
		{"sequence", strconv.Itoa(current.Sequence)},
		{"count", strconv.Itoa(count)},
	} {
		if _, err := db.Exec(`INSERT INTO meta(key, value) VALUES (?, ?)`, kv[0], kv[1]); err != nil {
			return err
		}
	}
	// The cached files this index was built from, by size and mtime. An open
	// re-checks them (six stats) and the manifest digest (about 1 KB), so a
	// cache rewritten after the build sends the client back to the full,
	// digest-verified load instead of serving the old index.
	stamps, err := cacheFileStamps(cacheDir, current)
	if err != nil {
		return err
	}
	for name, stamp := range stamps {
		if _, err := db.Exec(`INSERT INTO meta(key, value) VALUES (?, ?)`, "file:"+name, stamp); err != nil {
			return err
		}
	}
	for _, kv := range [][2]string{
		{"complete", "1"},
	} {
		if _, err := db.Exec(`INSERT INTO meta(key, value) VALUES (?, ?)`, kv[0], kv[1]); err != nil {
			return err
		}
	}
	return db.Close()
}

// pruneDiskIndexes removes the index files of other releases. Best effort: a
// file another process still has open (Windows) is left for the next prune.
func pruneDiskIndexes(dir, keep string) {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return
	}
	for _, e := range entries {
		p := filepath.Join(dir, e.Name())
		if p == keep || !strings.HasPrefix(e.Name(), "catalog-") {
			continue
		}
		_ = os.Remove(p)
	}
}

func lowerAll(values []string) []string {
	out := make([]string, 0, len(values))
	for _, v := range values {
		out = append(out, strings.ToLower(v))
	}
	return out
}

// search is SearchIndex.Search over the disk index.
//
// SQL only finds candidates (the trigram index when every token can use it)
// and returns the short lowercased columns; the score is computed in Go with
// exactly the in-memory rules, and only the rows that make the cut have their
// document decoded. Decoding and SQL-side scoring were the cost: "github"
// matches 26,864 rows, and scoring them in SQL then decoding 4,000 documents
// took 1.7 s, where this takes a fraction of that.
func (d *diskIndex) search(query string, opts SearchOptions) ([]*SearchResult, error) {
	queryNorm := strings.ToLower(strings.TrimSpace(query))
	tokens := tokenize(queryNorm)

	status := opts.Status
	if status == "" {
		status = domain.ListingStatusActive
	}
	limit := opts.Limit
	if limit <= 0 {
		limit = 20
	}
	where := []string{"status = ?"}
	args := []any{string(status)}
	if opts.Kind != "" {
		where = append(where, "kind = ?")
		args = append(args, string(opts.Kind))
	}
	if opts.Category != "" {
		where = append(where, "instr(cats_exact, ?) > 0")
		args = append(args, fieldSep+strings.ToLower(opts.Category)+fieldSep)
	}

	if len(tokens) == 0 {
		if opts.Summary {
			q := `SELECT id, summary FROM listings WHERE ` + strings.Join(where, " AND ") + ` ORDER BY name, id LIMIT ?`
			listings, err := d.querySummaries(q, append(args, limit))
			if err != nil {
				return nil, err
			}
			out := make([]*SearchResult, 0, len(listings))
			for _, l := range listings {
				out = append(out, &SearchResult{Listing: l, Score: 1.0})
			}
			return out, nil
		}
		q := `SELECT id, doc FROM listings WHERE ` + strings.Join(where, " AND ") + ` ORDER BY name, id LIMIT ?`
		listings, err := d.queryListings(q, append(args, limit))
		if err != nil {
			return nil, err
		}
		out := make([]*SearchResult, 0, len(listings))
		for _, l := range listings {
			out = append(out, &SearchResult{Listing: l, Score: 1.0})
		}
		return out, nil
	}

	// A listing scores when ANY token is a substring of a scored field, so
	// the candidate set is an OR over the tokens. The trigram index answers
	// that for 3+ character tokens; a shorter token cannot use it, so the
	// candidates are then every row with the filters (still one pass over
	// short columns, never a document decode).
	useFTS := true
	var terms []string
	for _, tok := range tokens {
		if utf8.RuneCountInString(tok) < 3 {
			useFTS = false
			break
		}
		terms = append(terms, `"`+strings.ReplaceAll(tok, `"`, `""`)+`"`)
	}
	if useFTS {
		where = append(where, "rid IN (SELECT rowid FROM fts WHERE fts MATCH ?)")
		args = append(args, strings.Join(terms, " OR "))
	} else {
		// No trigram for a token under 3 characters. A row can only score
		// through an exact id/name match or a token inside name, title,
		// summary, categories or keywords, and `hay` is exactly those
		// fields joined, so this prefilter keeps every scoring row while
		// letting SQLite discard the rest without returning them.
		var ors []string
		for _, tok := range tokens {
			ors = append(ors, "instr(hay, ?) > 0")
			args = append(args, tok)
		}
		ors = append(ors, "lid = ?", "lname = ?")
		args = append(args, queryNorm, queryNorm)
		where = append(where, "("+strings.Join(ors, " OR ")+")")
	}
	q := `SELECT rid, id, name, lid, lname, ltitle, lsummary, lcats, lkws, verify FROM listings WHERE ` + strings.Join(where, " AND ")
	rows, err := d.db.Query(q, args...)
	if err != nil {
		return nil, err
	}
	type cand struct {
		rid      int64
		id, name string
		score    float64
	}
	var cands []cand
	for rows.Next() {
		var rid int64
		var id, name, lid, lname, ltitle, lsummary, lcats, lkws, verify string
		if err := rows.Scan(&rid, &id, &name, &lid, &lname, &ltitle, &lsummary, &lcats, &lkws, &verify); err != nil {
			rows.Close()
			return nil, err
		}
		score := scoreColumns(queryNorm, tokens, lid, lname, ltitle, lsummary, lcats, lkws, verify)
		if score > 0 {
			cands = append(cands, cand{rid: rid, id: id, name: name, score: score})
		}
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return nil, err
	}
	sort.Slice(cands, func(i, j int) bool {
		if cands[i].score == cands[j].score {
			if cands[i].name == cands[j].name {
				return cands[i].id < cands[j].id
			}
			return cands[i].name < cands[j].name
		}
		return cands[i].score > cands[j].score
	})
	if len(cands) > limit {
		cands = cands[:limit]
	}
	rids := make([]int64, len(cands))
	for i, c := range cands {
		rids[i] = c.rid
	}
	byRID, err := d.getManyByRID(rids, opts.Summary)
	if err != nil {
		return nil, err
	}
	out := make([]*SearchResult, 0, len(cands))
	for _, c := range cands {
		l := byRID[c.rid]
		if l == nil {
			continue
		}
		// Re-score from the document so MatchedFields is exactly what the
		// in-memory path reports.
		score, matched := scoreListing(l, queryNorm, tokens)
		out = append(out, &SearchResult{Listing: l, Score: score, MatchedFields: matched})
	}
	return out, nil
}

// getManyByRID fetches many rows in a few queries (one per 500 ids) instead
// of one query each: fetching 4,000 rows one by one was most of a large
// search's cost.
func (d *diskIndex) getManyByRID(rids []int64, summary bool) (map[int64]*domain.Listing, error) {
	col := "doc"
	if summary {
		col = "summary"
	}
	out := make(map[int64]*domain.Listing, len(rids))
	const chunk = 500
	for start := 0; start < len(rids); start += chunk {
		end := start + chunk
		if end > len(rids) {
			end = len(rids)
		}
		part := rids[start:end]
		args := make([]any, len(part))
		for i, r := range part {
			args[i] = r
		}
		q := `SELECT rid, ` + col + ` FROM listings WHERE rid IN (?` + strings.Repeat(",?", len(part)-1) + `)`
		rows, err := d.db.Query(q, args...)
		if err != nil {
			return nil, err
		}
		for rows.Next() {
			var rid int64
			var doc []byte
			if err := rows.Scan(&rid, &doc); err != nil {
				rows.Close()
				return nil, err
			}
			var l domain.Listing
			if summary {
				err = json.Unmarshal(doc, &l)
			} else {
				err = unpackDoc(doc, &l)
			}
			if err != nil {
				rows.Close()
				return nil, err
			}
			out[rid] = &l
		}
		rows.Close()
		if err := rows.Err(); err != nil {
			return nil, err
		}
	}
	return out, nil
}

// scoreColumns is scoreListing over the index's lowercased columns. It must
// stay rule-for-rule identical (TestDiskIndexMatchesInMemorySearch pins it).
func scoreColumns(queryNorm string, tokens []string, lid, lname, ltitle, lsummary, lcats, lkws, verify string) float64 {
	var score float64
	if lid == queryNorm {
		score += 100
	}
	if lname == queryNorm {
		score += 50
	} else if strings.HasPrefix(lname, queryNorm) {
		score += 25
	}
	for _, tok := range tokens {
		if strings.Contains(lname, tok) {
			score += 10
		}
		if ltitle != "" && strings.Contains(ltitle, tok) {
			score += 8
		}
		if lsummary != "" && strings.Contains(lsummary, tok) {
			score += 4
		}
		if anyFieldContains(lcats, tok) {
			score += 6
		}
		if anyFieldContains(lkws, tok) {
			score += 5
		}
	}
	if score > 0 {
		switch verify {
		case "security_audited":
			score += 10
		case "signature_verified":
			score += 5
		}
	}
	return score
}

// anyFieldContains reports whether one of the fieldSep-joined values contains
// tok. A plain Contains over the joined string would let a match span two
// values, which the in-memory per-value loop never does.
func anyFieldContains(joined, tok string) bool {
	if joined == "" {
		return false
	}
	for _, v := range strings.Split(joined, fieldSep) {
		if strings.Contains(v, tok) {
			return true
		}
	}
	return false
}

func (d *diskIndex) getByRID(rid int64, summary bool) (*domain.Listing, bool, error) {
	col := "doc"
	if summary {
		col = "summary"
	}
	var doc []byte
	err := d.db.QueryRow(`SELECT `+col+` FROM listings WHERE rid = ?`, rid).Scan(&doc)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, false, nil
	}
	if err != nil {
		return nil, false, err
	}
	var l domain.Listing
	if summary {
		err = json.Unmarshal(doc, &l)
	} else {
		err = unpackDoc(doc, &l)
	}
	if err != nil {
		return nil, false, err
	}
	return &l, true, nil
}

// summaryOf is the part of a listing a list row needs. scoreListing reads
// only fields kept here (name, title, summary, id, categories, keywords,
// verification level), so a summary scores exactly like the full listing.
func summaryOf(l *domain.Listing) *domain.Listing {
	s := &domain.Listing{
		ID:             l.ID,
		Kind:           l.Kind,
		Name:           l.Name,
		Title:          l.Title,
		Summary:        l.Summary,
		Categories:     l.Categories,
		Keywords:       l.Keywords,
		PublisherClaim: l.PublisherClaim,
		Status:         l.Status,
		Installability: l.Installability,
	}
	s.VerificationSummary.Level = l.VerificationSummary.Level
	if len(l.Versions) > 0 {
		s.Versions = l.Versions[:1]
	}
	return s
}

func (d *diskIndex) queryListings(q string, args []any) ([]*domain.Listing, error) {
	rows, err := d.db.Query(q, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []*domain.Listing
	for rows.Next() {
		var id string
		var doc []byte
		if err := rows.Scan(&id, &doc); err != nil {
			return nil, err
		}
		var l domain.Listing
		if err := unpackDoc(doc, &l); err != nil {
			return nil, fmt.Errorf("catalog index row %s: %w", id, err)
		}
		out = append(out, &l)
	}
	return out, rows.Err()
}

func (d *diskIndex) get(id string) (*domain.Listing, bool, error) {
	var doc []byte
	err := d.db.QueryRow(`SELECT doc FROM listings WHERE id = ?`, id).Scan(&doc)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, false, nil
	}
	if err != nil {
		return nil, false, err
	}
	var l domain.Listing
	if err := unpackDoc(doc, &l); err != nil {
		return nil, false, err
	}
	return &l, true, nil
}

// versionRecords returns a listing's records newest first, like
// SearchIndex.VersionRecords.
func (d *diskIndex) versionRecords(listingID string) ([]*domain.VersionRecord, error) {
	rows, err := d.db.Query(`SELECT doc FROM versions WHERE listing_id = ?`, listingID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []*domain.VersionRecord
	for rows.Next() {
		var doc []byte
		if err := rows.Scan(&doc); err != nil {
			return nil, err
		}
		var rec domain.VersionRecord
		if err := unpackDoc(doc, &rec); err != nil {
			return nil, err
		}
		out = append(out, &rec)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	sort.SliceStable(out, func(i, j int) bool { return versionNewer(out[i].Version, out[j].Version) })
	return out, nil
}

// syncProgress counts release bytes for the SetProgress callback.
type syncProgress struct {
	mu    sync.Mutex
	done  int64
	total int64
	fn    func(done, total int64)
}

func (p *syncProgress) add(n int) {
	if p == nil || p.fn == nil || n <= 0 {
		return
	}
	p.mu.Lock()
	p.done += int64(n)
	done, total := p.done, p.total
	p.mu.Unlock()
	p.fn(done, total)
}

type progressReadCloser struct {
	io.Reader
	p *syncProgress
}

func (r progressReadCloser) Read(b []byte) (int, error) {
	n, err := r.Reader.Read(b)
	r.p.add(n)
	return n, err
}

// progressReader wraps a shard body so its bytes reach the progress callback.
func (c *Client) progressReader(body io.Reader) io.Reader {
	c.mu.RLock()
	p := c.syncProg
	c.mu.RUnlock()
	if p == nil || p.fn == nil {
		return body
	}
	return progressReadCloser{Reader: body, p: p}
}

// startProgress sets the byte total for a release about to be downloaded.
func (c *Client) startProgress(manifest *catalogbuild.ReleaseManifest) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.progress == nil {
		c.syncProg = nil
		return
	}
	var total int64
	for name, f := range manifest.Files {
		if strings.HasPrefix(name, "listings") || strings.HasPrefix(name, "versions") {
			total += f.Size
		}
	}
	c.syncProg = &syncProgress{total: total, fn: c.progress}
	c.progress(0, total)
}

func releaseDirOf(cacheDir string, current *catalogbuild.CurrentPointer) string {
	return filepath.Join(cacheDir, "v1", "releases", current.ReleaseID)
}

// cacheFileStamps records size and modification time of the cached manifest
// and every shard it names.
func cacheFileStamps(cacheDir string, current *catalogbuild.CurrentPointer) (map[string]string, error) {
	dir := releaseDirOf(cacheDir, current)
	data, err := os.ReadFile(filepath.Join(dir, "manifest.json"))
	if err != nil {
		return nil, err
	}
	var manifest catalogbuild.ReleaseManifest
	if err := json.Unmarshal(data, &manifest); err != nil {
		return nil, err
	}
	names := []string{"manifest.json"}
	for name := range manifest.Files {
		names = append(names, name)
	}
	out := map[string]string{}
	for _, name := range names {
		if filepath.Base(name) != name {
			return nil, fmt.Errorf("unsafe cache file name %q", name)
		}
		info, err := os.Stat(filepath.Join(dir, name))
		if err != nil {
			if name == "manifest.json" {
				return nil, err
			}
			continue // a manifest entry this release does not cache
		}
		out[name] = fmt.Sprintf("%d:%d", info.Size(), info.ModTime().UnixNano())
	}
	return out, nil
}

// checkCacheUnchanged verifies the cached manifest still matches the pointer
// and that no cached file changed since the index was built.
func checkCacheUnchanged(cacheDir string, current *catalogbuild.CurrentPointer, meta map[string]string) error {
	data, err := os.ReadFile(filepath.Join(releaseDirOf(cacheDir, current), "manifest.json"))
	if err != nil {
		return err
	}
	if actual := domain.ComputeBytesDigest(data); actual != current.ManifestDigest {
		return domain.ErrChecksumMismatch(current.ManifestDigest, actual)
	}
	stamps, err := cacheFileStamps(cacheDir, current)
	if err != nil {
		return err
	}
	recorded := 0
	for k, v := range meta {
		if !strings.HasPrefix(k, "file:") {
			continue
		}
		recorded++
		if stamps[strings.TrimPrefix(k, "file:")] != v {
			return fmt.Errorf("cached catalog file %s changed since the index was built", strings.TrimPrefix(k, "file:"))
		}
	}
	if recorded == 0 || recorded != len(stamps) {
		return errors.New("catalog index does not describe the cached files")
	}
	return nil
}

// packDoc stores a row's JSON gzip-compressed: a query decodes at most a few
// hundred rows, and the documents are most of the file (95 MB of 214 MB
// uncompressed for the 69,376-row release).
func packDoc(v any) ([]byte, error) {
	return defaultPacker.pack(v)
}

// docPacker reuses one compressor: gzip.NewWriter allocates several hundred
// KB of state, and allocating it per row made the 140k-row build take over a
// minute. The build is single-threaded, so one packer is enough; the mutex
// only guards against a future concurrent caller.
type docPacker struct {
	mu  sync.Mutex
	buf bytes.Buffer
	zw  *gzip.Writer
}

var defaultPacker = &docPacker{}

func (p *docPacker) pack(v any) ([]byte, error) {
	raw, err := json.Marshal(v)
	if err != nil {
		return nil, err
	}
	p.mu.Lock()
	defer p.mu.Unlock()
	p.buf.Reset()
	if p.zw == nil {
		p.zw, _ = gzip.NewWriterLevel(&p.buf, gzip.BestSpeed)
	} else {
		p.zw.Reset(&p.buf)
	}
	if _, err := p.zw.Write(raw); err != nil {
		return nil, err
	}
	if err := p.zw.Close(); err != nil {
		return nil, err
	}
	return append([]byte(nil), p.buf.Bytes()...), nil
}

func unpackDoc(doc []byte, v any) error {
	zr, err := gzip.NewReader(bytes.NewReader(doc))
	if err != nil {
		return err
	}
	defer zr.Close()
	return json.NewDecoder(io.LimitReader(zr, 16<<20)).Decode(v)
}

func (d *diskIndex) querySummaries(q string, args []any) ([]*domain.Listing, error) {
	rows, err := d.db.Query(q, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []*domain.Listing
	for rows.Next() {
		var id string
		var doc []byte
		if err := rows.Scan(&id, &doc); err != nil {
			return nil, err
		}
		var l domain.Listing
		if err := json.Unmarshal(doc, &l); err != nil {
			return nil, fmt.Errorf("catalog index row %s: %w", id, err)
		}
		out = append(out, &l)
	}
	return out, rows.Err()
}

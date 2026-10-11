package domain

import (
	"crypto/sha256"
	"encoding/hex"
	"path/filepath"
)

// WorkspaceIDForProjectRoot derives the canonical workspace id of a project
// directory.
//
// The id is a pure function of the absolute project path: the same directory is
// the same workspace across every install and every read, on every run, with no
// registry to consult and nothing to keep in sync. The path itself is stored
// beside the id (InstallRecord.ProjectRoot), which is why the hash is a fixed
// derivation rather than a secret: the root is not sensitive, and hashing it is
// what makes the id stable and path-shape independent (a trailing separator, a
// "." or ".." segment all name one workspace). It is NOT hashed to hide the
// path.
//
// An empty or non-absolute root has no workspace: it returns "". Callers treat
// "" as "no project context" rather than inventing one, so a relative path is
// never silently resolved against whatever the process happens to be.
func WorkspaceIDForProjectRoot(root string) string {
	if root == "" || !filepath.IsAbs(root) {
		return ""
	}
	sum := sha256.Sum256([]byte(filepath.Clean(root)))
	return "ws_" + hex.EncodeToString(sum[:])[:16]
}

package main

import (
	"strings"
	"testing"
	"time"
)

// `skills update` clones a repository the user named, through the caller's own
// git. An unhardened clone honours the user's global gitconfig — so a
// `[protocol "x"] allow = always` re-enables a transport we never intended, an
// askpass pops UI mid-install, and a hung TCP peer hangs the CLI forever
// because exec.Command has no deadline of its own. Each of these is a real
// documented failure somewhere; together they are why the child environment
// and the deadline are named constants rather than inline literals.
func TestGitCloneEnvIsHardened(t *testing.T) {
	got := map[string]string{}
	for _, kv := range gitCloneEnv {
		k, v, ok := strings.Cut(kv, "=")
		if !ok {
			t.Fatalf("gitCloneEnv entry %q is not KEY=VALUE", kv)
		}
		got[k] = v
	}

	// A clone must never be able to reach for credentials interactively.
	if got["GIT_TERMINAL_PROMPT"] != "0" {
		t.Errorf("GIT_TERMINAL_PROMPT = %q, want \"0\" — git must never prompt", got["GIT_TERMINAL_PROMPT"])
	}
	// Narrower than the reference installer's https:http:ssh:git:file, because
	// plain http and file: are transports we never legitimately need.
	// ssh is listed because ParseSkillSource admits `git@host:owner/repo.git`
	// and `ssh://host/path`, and git routes both to its ssh transport: without
	// it here the clone fails with "transport 'ssh' not allowed".
	if got["GIT_ALLOW_PROTOCOL"] != "https:ssh:git" {
		t.Errorf("GIT_ALLOW_PROTOCOL = %q, want %q", got["GIT_ALLOW_PROTOCOL"], "https:ssh:git")
	}
	// The transport list is an allow-list, so a protocol we never admitted
	// cannot sneak in by being appended here. Pin the ones that must stay out:
	// they are the exfiltration shapes (a file: clone reads the local disk).
	for _, proto := range []string{"http", "file", "ftp"} {
		for _, listed := range strings.Split(got["GIT_ALLOW_PROTOCOL"], ":") {
			if listed == proto {
				t.Errorf("GIT_ALLOW_PROTOCOL lists %q, which ParseSkillSource refuses; the git child must not be wider than the parser", proto)
			}
		}
	}
	// Two independent LFS kills: the skip flag for an installed git-lfs, and
	// the filter overrides for the case where the filter is configured but
	// git-lfs is absent — where checkout fails on any LFS-backed repo.
	if got["GIT_LFS_SKIP_SMUDGE"] != "1" {
		t.Errorf("GIT_LFS_SKIP_SMUDGE = %q, want \"1\"", got["GIT_LFS_SKIP_SMUDGE"])
	}
	for _, k := range []string{"filter.lfs.required", "filter.lfs.smudge", "filter.lfs.clean", "filter.lfs.process"} {
		if _, ok := got[k]; !ok {
			t.Errorf("gitCloneEnv is missing the %s override, so a broken global LFS filter still fails checkout", k)
		}
	}
}

func TestGitCloneTimeoutIsBounded(t *testing.T) {
	if gitCloneTimeout <= 0 {
		t.Fatalf("gitCloneTimeout = %v, want a positive deadline", gitCloneTimeout)
	}
	// A clone of a skill repository is a small fetch; an hour would be an
	// indistinguishable hang as far as the user is concerned.
	if gitCloneTimeout > 30*time.Minute {
		t.Errorf("gitCloneTimeout = %v, which is long enough to read as a hang", gitCloneTimeout)
	}
}

// The hand-written bridge adapters and the source file each lives in.
//
// `hosts.json` carries the `generic` flag — true for the data-driven rows that
// `internal/host/targets_data.go` emits, false for adapters written by
// hand — but not the file each hand-written adapter lives in. This mapping is
// taken from `internal/host/registry.go`, which names the type behind each id,
// and from `AGENTS.md` §1, which lists the file per host. It is the only thing
// on the surfaces that use it that is not read from a generated file, so it is
// kept in one place — `/compare`'s evidence column and `/insights`'s docs
// column both read it — and `/compare` asserts the ids against the registry at
// build time (`assertAdapterSourcesMatchRegistry`), so a registry move fails
// the build instead of shipping a wrong link.
export const ADAPTER_SOURCE: Record<string, string> = {
  "claude-code": "internal/host/claudecode.go",
  cline: "internal/host/cline.go",
  codex: "internal/host/codex.go",
  grok: "internal/host/grok.go",
  "grok-build": "internal/host/grokbuild.go",
  opencode: "internal/host/opencode.go",
  "pi-agent": "internal/host/piagent.go",
};

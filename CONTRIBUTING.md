# Contributing to LiteSPM

Read [STATUS.md](STATUS.md) and [AGENTS.md](AGENTS.md) to distinguish shipped, tested and planned capabilities.

## Issues and proposals

Report the CLI version, OS, agent version, exact command, expected and actual behavior, and sanitized logs. For catalog/adapter changes include upstream documentation, license and compatibility evidence. Report vulnerabilities privately using [SECURITY.md](SECURITY.md).

## Development and testing

Fork, branch from main, use the Go version in go.mod and Bun for the web lockfile. Run `go test ./...`, `go build ./cmd/litespm`, then in `web` run `bun install --frozen-lockfile`, `npm run type-check`, `npm run lint`, `npm run test:hardening`, `npm run test:counts`, `npm run test:assistant` and `npm run build`. Regenerate catalog artifacts through documented scripts when their inputs change.

## Safety and review

Use temporary HOME, config and data roots for mutation tests, never real agent settings. Preserve unrelated entries, comments, backups, ownership and explicit approval. Test refusals, collisions, rollback and platform-specific paths. Treat upstream manifests and skills as untrusted. Never commit secrets or personal configurations.

Keep PRs focused; explain the change, tests and limitations. Add regressions and update relevant docs and Unreleased changelog. Do not claim support or speed without evidence. Contributions use the project’s [Apache-2.0 license](LICENSE); preserve third-party attribution.

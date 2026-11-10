package host

import "errors"

// No test in this package may run a real `claude` CLI: it would read and
// rewrite the developer's own Claude Code state. The marketplace registrar
// takes the settings.json fallback instead.
func init() {
	claudeCLIPath = func() (string, error) { return "", errors.New("no claude CLI in tests") }
}

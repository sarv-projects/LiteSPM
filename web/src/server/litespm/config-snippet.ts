/**
 * Format-specific escaping and shape validation for the copy-paste host
 * config snippet (F8).
 *
 * The snippet is built from catalog `command`/`args` values, which are
 * publisher data (the MCP registry's own `packages[]` descriptors, via
 * `_package_arguments` in the producer). Interpolating them raw into a TOML
 * document lets a value carry its own `"` and newline and inject a whole
 * extra `[mcp_servers.*]` table — a block the visitor then pastes into their
 * agent config. JSON was already safe because the entry went through
 * `JSON.stringify`; TOML was not.
 *
 * Dependency-free on purpose: `web/scripts/check-web-hardening.mjs`
 * transpiles this module with the repo's own typescript devDependency and
 * executes the real functions, without a bundler or a test runner.
 */

/**
 * The per-token allowlist for `command` and every `args` entry. It is the
 * listing-id tail grammar the producer enforces in
 * `scripts/build_full_catalog.py` (`[A-Za-z0-9_.~%+-]`, see `_UPSTREAM_INVALID`)
 * widened by the characters a real launch line needs: `/` and `@` for scoped
 * npm/PyPI specs, `:` for OCI image tags, `=` for `--flag=value` and
 * `name=value` registry arguments. It deliberately excludes quotes,
 * backslashes, whitespace, `[`/`]` and `{`/`}`: none of them is needed to
 * name a program or an argument, and each is either an escape or a
 * structure character in one of the two snippet formats.
 */
export const COMMAND_TOKEN_RE = /^[A-Za-z0-9._/@:=+~-]+$/;

/** C0 controls, DEL and C1 controls. Refused, never escaped. */
const CONTROL_RE = /[\u0000-\u001f\u007f-\u009f]/;

/** True when `value` carries a control character of any width. */
export function hasControlCharacters(value: string): boolean {
  return CONTROL_RE.test(value);
}

/** True when `token` is a non-empty token inside the launch-line allowlist. */
export function isSafeCommandToken(token: unknown): token is string {
  return typeof token === "string" && COMMAND_TOKEN_RE.test(token);
}

export interface CommandLine {
  command: string;
  args: string[];
}

/**
 * The launch line as the snippet may emit it, or null when it must not.
 *
 * Fail-closed: a missing command, a non-string command/argument, an empty
 * token, a token outside the allowlist, or any control character anywhere
 * refuses the whole line. Callers withhold the snippet; the row itself stays
 * fully visible in browse and search.
 */
export function validateCommandLine(command: unknown, args: unknown): CommandLine | null {
  if (!isSafeCommandToken(command)) return null;
  if (args == null) return { command, args: [] };
  if (!Array.isArray(args)) return null;
  const out: string[] = [];
  for (const arg of args) {
    if (!isSafeCommandToken(arg)) return null;
    out.push(arg);
  }
  return { command, args: out };
}

/** The short TOML escapes. Everything else in the C0/C1 range is \uXXXX. */
const TOML_SHORT_ESCAPES: Record<number, string> = {
  0x08: "\\b",
  0x09: "\\t",
  0x0a: "\\n",
  0x0c: "\\f",
  0x0d: "\\r",
};

/**
 * `value` as a quoted TOML basic string. A real TOML string escaper: `\` and
 * `"` are escaped, the C0 controls `\b \t \n \f \r` use their short TOML
 * spellings, and every other control character becomes `\uXXXX` (which is
 * how TOML spells them inside a basic string). Inputs that carry control
 * characters never reach an emitted snippet — `validateCommandLine` refuses
 * them first — but the escaper is still correct on its own, so no caller can
 * produce a document where a value escapes its own quoting.
 */
export function tomlString(value: string): string {
  let out = '"';
  for (const ch of value) {
    const code = ch.codePointAt(0) ?? 0;
    if (ch === "\\") out += "\\\\";
    else if (ch === '"') out += '\\"';
    else if (TOML_SHORT_ESCAPES[code]) out += TOML_SHORT_ESCAPES[code];
    else if (code < 0x20 || code === 0x7f || (code >= 0x80 && code <= 0x9f)) {
      out += `\\u${code.toString(16).toUpperCase().padStart(4, "0")}`;
    } else out += ch;
  }
  return `${out}"`;
}

/**
 * A pretty-printed JSON snippet. `JSON.stringify` is the escaper: the entry is
 * passed as a value, so every quote, backslash and control character is
 * escaped by the JSON grammar rather than by string concatenation.
 */
export function jsonSnippet(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

export interface TomlLocalEntryOptions {
  /** The `[table]` header, e.g. `[mcp_servers.demo]`. Trusted structure. */
  section: string;
  command: string;
  args?: string[] | null;
  /** Emit `type = "stdio"` after the launch line. */
  typedStdio?: boolean;
  /** Names for the `# required env:` comment; unsafe names are dropped. */
  envVarNames?: string[];
}

/**
 * The TOML block a local stdio entry is written as, or null when the row's
 * launch line cannot be emitted. Re-validates its own inputs so a caller that
 * forgets the gate still cannot emit an injectable block.
 */
export function tomlLocalEntry(options: TomlLocalEntryOptions): string | null {
  const launch = validateCommandLine(options.command, options.args ?? []);
  if (!launch) return null;
  if (hasControlCharacters(options.section)) return null;

  const lines = [
    options.section,
    `command = ${tomlString(launch.command)}`,
    `args = [${launch.args.map((arg) => tomlString(arg)).join(", ")}]`,
  ];
  if (options.typedStdio) lines.push('type = "stdio"');
  const env = (options.envVarNames ?? []).filter(isSafeCommandToken);
  if (env.length > 0) {
    // TOML hosts spell environment values differently (inline table, child
    // table, or a string reference), so only the names are published here;
    // the Environment Variables section names what is required.
    lines.push(`# required env: ${env.join(", ")} (use this host's documented syntax)`);
  }
  return lines.join("\n");
}

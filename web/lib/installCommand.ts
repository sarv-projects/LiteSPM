// The install command a reader can actually type.
//
// The entry page's job is to hand the reader one command that works. The
// catalog id is unambiguous — `litespm install mcp:builtin:mcp-registry:…` —
// and it is also 66 characters of colon-namespaced identifier that nobody
// types from memory. A page that prints only that is a page that prints a
// command no human will run.
//
// This module is the one place that decides which form the page shows, so the
// band above the fold, the guided three steps and the gate that checks them
// cannot disagree.
//
// ## The CLI's own rule
//
// `litespm install` accepts **the listing id and nothing else**: the lookup is
// an exact map match against the local catalog index
// (`internal/catalog/search.go` — `SearchIndex.Get`), with no prefix, alias or
// fuzzy fallback, and a miss is "listing X is not in the local catalog index".
// A slug is not accepted either: the index is keyed by canonical id.
//
// ## The short form
//
// `litespm install --search <term>` is the CLI's short form: it takes a term
// instead of an id and prints the candidates it finds. It is the form a human
// can type, and it is the form the page publishes **only when the CLI accepts
// it**.
//
// `CLI_INSTALL_ACCEPTS_SEARCH` is that switch, and it is not a matter of
// taste: `scripts/check-install-command.mjs` reads the CLI's own flag parser
// out of `cmd/litespm/main.go` and fails the build if the two disagree. A
// page that printed a command the binary refuses would be exactly the
// overstatement this site is built to avoid, so the two are checked rather
// than trusted.

/** The prefix every install command carries. */
export const INSTALL_COMMAND_PREFIX = "litespm install ";

/**
 * True when `litespm install` accepts `--search <term>` in place of an id.
 *
 * Read the CLI's flag parser before flipping this: `cmd/litespm/main.go`
 * (`parseInstallFlags`) must carry a `case "--search":`. The gate
 * `scripts/check-install-command.mjs` asserts the two agree in BOTH
 * directions, so this cannot drift from the binary in either direction.
 */
export const CLI_INSTALL_ACCEPTS_SEARCH = false;

/** How a command names the entry. */
export type InstallCommandForm = "search" | "id";

export interface InstallCommand {
  /** The command the reader types, exactly as it is printed. */
  command: string;
  /** Which form this is. */
  form: InstallCommandForm;
  /** The term a `--search` form looks the entry up by. */
  term: string;
  /** The entry's exact catalog id — the unambiguous form, always available. */
  id: string;
  /** One line saying what the command does. */
  label: string;
  /**
   * True when the command names the entry by a term rather than by its id.
   * The reader can act on it without copying a 66-character identifier, and
   * the exact id stays one disclosure away.
   */
  short: boolean;
}

/**
 * Quote a term for a shell when it needs it.
 *
 * A name with a space is a name a reader will type, so it is quoted rather
 * than pasted in raw and split by the shell into two arguments.
 */
function shellQuote(term: string): string {
  return /^[A-Za-z0-9._:@/-]+$/.test(term) ? term : `"${term.replace(/"/g, '\\"')}"`;
}

/**
 * The command for one entry.
 *
 * Two forms, and the choice between them is the CLI's, not the page's:
 *
 *   `search`  `litespm install --search "Figma"` — what a human can type.
 *              The CLI prints the candidates it finds; the exact id is the
 *              disclosure below it.
 *   `id`      `litespm install mcp:builtin:mcp-registry:…` — the form every
 *              LiteSPM build accepts, and the only one the CLI accepts today.
 *
 * @param item the entry: its id and its name.
 */
export function installCommandFor(item: { id: string; name?: string | null }): InstallCommand {
  const id = String(item.id ?? "");
  const name = String(item.name ?? "").trim();
  if (CLI_INSTALL_ACCEPTS_SEARCH && name) {
    const term = shellQuote(name);
    return {
      command: `${INSTALL_COMMAND_PREFIX}--search ${term}`,
      form: "search",
      term: name,
      id,
      label: "Finds this entry by name and prints the candidates it matches.",
      short: true,
    };
  }
  return {
    command: `${INSTALL_COMMAND_PREFIX}${id}`,
    form: "id",
    term: name,
    id,
    label: "The exact catalog id — the one form LiteSPM's installer accepts.",
    short: false,
  };
}

/**
 * The exact-id command, always.
 *
 * The "Details" disclosure on the entry page carries this whatever the page's
 * primary command is: the id is the unambiguous form, and a reader who needs
 * it must not have to guess which of the two blocks is it.
 */
export function exactIdCommand(item: { id: string }): string {
  return `${INSTALL_COMMAND_PREFIX}${String(item.id ?? "")}`;
}

/**
 * Website bootstrap commands supported by the published CLI. The CLI does
 * not auto-sync a fresh catalog or configure missing hosts on install.
 * Keeping those steps explicit avoids promising an unreleased wizard.
 */
export const WEBSITE_NPX_PREFIX = "npx --yes litespm@latest";
export const WEBSITE_SETUP_COMMAND = `${WEBSITE_NPX_PREFIX} setup`;
export const WEBSITE_CATALOG_SYNC_COMMAND = `${WEBSITE_NPX_PREFIX} catalog sync`;

export function safeCatalogId(id: string): boolean {
  return /^[a-zA-Z0-9][a-zA-Z0-9:._@/+-]*$/.test(id);
}

/**
 * `--host` names the target for every kind: a host id for an MCP server or a
 * plugin, a skills target id for a skill. The catalog installer seals those
 * destinations into the plan, so naming one agent cannot write another — the
 * reason a skill command used to be published without a target at all.
 *
 * It is spelled `--host` rather than `--agent` because that is the spelling
 * every release takes. `npx --yes litespm@latest` resolves to the PUBLISHED
 * release, and from 2026-10-15 to 2026-10-22 that release was 0.4.1, whose
 * `install` verb has `--host` but neither `--agent` nor `--all-detected` —
 * so a site printing those told a reader on the published CLI to run a
 * command that exited with `unknown flag`, which is the single worst thing
 * this site can do, because it looks like the product is broken rather than
 * newer than its npm tag. 0.6.0 (published 2026-10-22) takes both, and calls
 * `--host` the older spelling of `--agent`; keeping the older spelling means
 * a reader who pinned an older release still succeeds.
 *
 * The gate `scripts/check-install-command.mjs` asserts this from two
 * directions: the flags this module publishes must be accepted by the
 * working tree's parser AND by the published CLI's recorded flag set
 * (`data/published-cli.json`, which names what npm serves), so the site can
 * never again publish a command the binary a reader installs would reject.
 */
export function websiteInstallCommandFor(
  item: { id: string; kind: "mcp" | "skill" | "plugin"; name?: string | null },
  agentId?: string | null
): InstallCommand {
  const id = String(item.id ?? "");
  if (!safeCatalogId(id)) throw new Error("Unsafe catalog id; refusing to generate a shell command");
  const selected = String(agentId ?? "").trim();
  if (selected && !/^[a-z0-9][a-z0-9-]*$/.test(selected)) {
    throw new Error("Invalid agent id; refusing to generate a shell command");
  }
  // With no agent chosen the command stays bare, and that is runnable on every
  // release: the CLI resolves the target itself (an MCP server or plugin takes
  // the hosts set up with `litespm host setup`; a skill takes the agents
  // detected on this machine). A release that would fan a skill out to two or
  // more detected agents stops and names both remedies rather than guessing —
  // which is the honest answer, and the entry page says so next to the command.
  //
  // `--all-detected` states that default explicitly, but only newer releases
  // take it, so it is not what the site publishes while `@latest` can be one
  // that does not.
  const target = selected ? ` --host ${selected}` : "";
  return {
    command: `${WEBSITE_NPX_PREFIX} install ${id}${target}`,
    form: "id",
    term: String(item.name ?? "").trim(),
    id,
    label: selected
      ? "Installs this catalog entry into the chosen agent after local setup and catalog sync."
      : item.kind === "skill"
        ? "Installs into the skills targets detected on your machine after local setup and catalog sync."
        : "Installs this exact catalog entry after local setup and catalog sync.",
    short: false,
  };
}

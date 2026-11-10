// __MARKER__ __LITESPM_VERSION__: written by `litespm host setup`; `litespm host remove` deletes it.
//
// LiteSPM companion extension for Pi Agent.
//
//   /marketplace [query]   browse, install and remove capabilities from inside Pi
//   /litespm               plain-text list of the bridge's MCP tools
//
// The panel renders LiteSPM's one marketplace view model
// (`litespm marketplace rows --json`) and acts through the normal verbs, so
// nothing here re-implements search, ranking or install rules.
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const BRIDGE_TOOL_PREFIX = "mcp__litespm__";
const HOST = "pi-agent";

/** One row of `litespm marketplace rows --json`. */
interface Capability {
  id: string;
  name: string;
  kind: string;
  kindLabel?: string;
  publisher: string;
  summary: string;
  version?: string;
  installable?: boolean;
  reason?: string;
  installed?: boolean;
  installedHere?: boolean;
  installId?: string;
  removable?: boolean;
}

interface RowsDoc {
  schema?: string;
  total?: number;
  truncated?: boolean;
  notice?: string;
  rows?: Capability[];
  installed?: Capability[];
}

/** The parts of pi's Theme this panel uses. Structural, so the panel never
 *  imports the host's package and cannot fail to load over resolution. */
interface PanelTheme {
  fg?: (color: string, text: string) => string;
  bold?: (text: string) => string;
}

function agentDir(): string {
  const override = process.env.PI_CODING_AGENT_DIR;
  return override ? override : join(homedir(), ".pi", "agent");
}

// The bridge entry LiteSPM wrote into mcp.json names the exact binary, so the
// panel does not depend on PATH being right for the agent's shell.
function liteSPMBinary(): string {
  try {
    const raw = readFileSync(join(agentDir(), "mcp.json"), "utf8");
    const parsed = JSON.parse(raw) as {
      mcpServers?: Record<string, { command?: string | string[] }>;
    };
    const entry = parsed.mcpServers ? parsed.mcpServers.litespm : undefined;
    const command = entry ? entry.command : undefined;
    if (typeof command === "string" && command.trim() !== "") return command;
    if (Array.isArray(command) && typeof command[0] === "string" && command[0] !== "") {
      return command[0];
    }
  } catch {
    // No readable config: PATH lookup below is the honest fallback.
  }
  return "litespm";
}

async function readJSON<T>(pi: ExtensionAPI, args: string[]): Promise<T | undefined> {
  const result = await pi.exec(liteSPMBinary(), args, { timeout: 90000 });
  if (result.code !== 0) return undefined;
  try {
    return JSON.parse(result.stdout) as T;
  } catch {
    return undefined;
  }
}

/** The sentence that matters from LiteSPM's output: its ✓/✗ line, without the
 *  machine detail an LPSM error carries. */
function outcomeLine(text: string): string {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l !== "");
  const line = lines.find((l) => /^[✓✗]/.test(l)) ?? lines[lines.length - 1] ?? "";
  return line
    .replace(/^Install failed:\s*/i, "")
    .replace(/\s*\(category: [^)]*\)\s*$/, "")
    .replace(/^\[LPSM-[A-Z-]+\]\s*/, "");
}

// ---------------------------------------------------------------------------
// A panel in plain segments: measure and clip in plain text, paint afterwards.
// That keeps column alignment exact even though colours are variable width.
// ---------------------------------------------------------------------------

const ANSI = /\x1b\[[0-9;]*m/g;

function visible(text: string): number {
  return text.replace(ANSI, "").length;
}

interface Seg {
  t: string;
  c?: string;
  b?: boolean;
  /** Truncate to this many columns and pad the rest, keeping columns aligned. */
  w?: number;
}

function paint(theme: PanelTheme | undefined, seg: Seg): string {
  let out = seg.t;
  if (seg.c && theme && typeof theme.fg === "function") out = theme.fg(seg.c, out);
  if (seg.b && theme && typeof theme.bold === "function") out = theme.bold(out);
  return out;
}

/** Lay out segments left to right, clipping and padding each in plain text and
 *  painting afterwards — so column alignment stays exact despite colour codes
 *  being invisible to the terminal's own width maths. */
function compose(theme: PanelTheme | undefined, segs: Seg[], width: number): string {
  let out = "";
  let used = 0;
  for (const seg of segs) {
    if (used >= width) break;
    let plain = seg.t;
    const limit = seg.w !== undefined ? Math.min(seg.w, width - used) : width - used;
    if (visible(plain) > limit) plain = plain.slice(0, Math.max(0, limit - 1)) + "…";
    const pad = seg.w === undefined ? 0 : Math.max(0, limit - visible(plain));
    out += paint(theme, { t: plain, c: seg.c, b: seg.b });
    out += " ".repeat(pad);
    used += visible(plain) + pad;
  }
  if (used < width) out += " ".repeat(width - used);
  return out;
}

// ---------------------------------------------------------------------------
// Plain language. The audience is developers and people who have never opened a
// config file, so the vocabulary is what the user wants done, not what the
// system stores.
// ---------------------------------------------------------------------------

const KIND_EXPLAINS: Record<string, string> = {
  mcp: "connects your agent to a service or database",
  skill: "a workflow your agent can follow",
  plugin: "a bundle of servers and skills",
};

interface Tab {
  id: string;
  label: string;
  keep: (row: Capability) => boolean;
}

const TABS: Tab[] = [
  { id: "all", label: "All", keep: () => true },
  { id: "mcp", label: "MCP servers", keep: (r) => r.kind === "mcp" },
  { id: "skill", label: "Skills", keep: (r) => r.kind === "skill" },
  { id: "plugin", label: "Plugins", keep: (r) => r.kind === "plugin" },
  { id: "installed", label: "Installed", keep: (r) => Boolean(r.installed) },
];

/** Row state, in the vocabulary "claude mcp list" already teaches people. */
function rowState(row: Capability): { label: string; tone: string } {
  if (row.installedHere) return { label: "✔ added", tone: "success" };
  if (row.installed) return { label: "elsewhere", tone: "muted" };
  if (row.installable) return { label: "add", tone: "accent" };
  return { label: "manual", tone: "warning" };
}

/** What Enter does on a row, or undefined when it does nothing. */
function actionFor(row: Capability): string | undefined {
  if (row.installedHere && row.removable && row.installId) return "remove:" + row.installId;
  if (row.installable && !row.installedHere) return "install:" + row.id;
  return undefined;
}

class MarketplacePanel {
  private rows: Capability[];
  private visible: Capability[];
  private tab = 0;
  private query = "";
  private selected = 0;
  private flash = "";
  private theme: PanelTheme | undefined;
  private notice: string;
  private readonly done: (result: string | undefined) => void;

  constructor(
    rows: Capability[],
    notice: string,
    theme: PanelTheme | undefined,
    done: (result: string | undefined) => void,
  ) {
    this.rows = rows;
    this.visible = rows;
    this.notice = notice;
    this.theme = theme;
    this.done = done;
  }

  invalidate(): void {}

  private refilter(): void {
    const needle = this.query.trim().toLowerCase();
    const keep = TABS[this.tab].keep;
    this.visible = this.rows.filter((c) => {
      if (!keep(c)) return false;
      if (needle === "") return true;
      return (c.name + " " + c.id + " " + c.publisher + " " + c.summary).toLowerCase().includes(needle);
    });
    if (this.selected >= this.visible.length) {
      this.selected = Math.max(0, this.visible.length - 1);
    }
  }

  private current(): Capability | undefined {
    return this.visible[this.selected];
  }

  private moveTab(delta: number): void {
    this.tab = (this.tab + delta + TABS.length) % TABS.length;
    this.selected = 0;
    this.flash = "";
    this.refilter();
  }

  handleInput(data: string): void {
    switch (data) {
      case "\x1b[A":
        this.selected = Math.max(0, this.selected - 1);
        this.flash = "";
        return;
      case "\x1b[B":
        this.selected = Math.max(0, Math.min(this.visible.length - 1, this.selected + 1));
        this.flash = "";
        return;
      case "\x1b[5~": // page up
        this.selected = Math.max(0, this.selected - 8);
        return;
      case "\x1b[6~": // page down
        this.selected = Math.max(0, Math.min(this.visible.length - 1, this.selected + 8));
        return;
      case "\t":
      case "\x1b[C":
        this.moveTab(1);
        return;
      case "\x1b[Z":
      case "\x1b[D":
        this.moveTab(-1);
        return;
      case "\r":
      case "\n": {
        const picked = this.current();
        if (!picked) return;
        const action = actionFor(picked);
        if (action) {
          this.done(action);
        } else {
          this.flash = picked.reason || "Nothing to do for this one here.";
        }
        return;
      }
      case "\x1b":
        this.done(undefined);
        return;
      case "\x7f":
      case "\b":
        this.query = this.query.slice(0, -1);
        this.refilter();
        return;
      default:
        break;
    }
    if (data.length === 1 && data >= " ") {
      this.query += data;
      this.refilter();
    }
  }

  /** Wrap segments across several lines, breaking on spaces and keeping each
   *  segment's colour. */
  private wrap(width: number, segs: Seg[]): string[] {
    const tokens: Seg[] = [];
    for (const seg of segs) {
      for (const word of seg.t.split(" ")) {
        if (word.length > 0) tokens.push({ t: word, c: seg.c, b: seg.b });
      }
    }
    const lines: string[] = [];
    let line: Seg[] = [];
    let used = 0;
    for (const token of tokens) {
      const gap = line.length > 0 ? 1 : 0;
      if (gap > 0 && used + gap + token.t.length > width) {
        lines.push(compose(this.theme, line, width));
        line = [];
        used = 0;
      }
      if (token.t.length >= width) {
        lines.push(compose(this.theme, [token], width));
        continue;
      }
      const space = line.length > 0 ? 1 : 0;
      if (space > 0) line.push({ t: " " });
      line.push(token);
      used += space + token.t.length;
    }
    if (line.length > 0) lines.push(compose(this.theme, line, width));
    return lines;
  }

  render(width: number): string[] {
    const inner = Math.max(30, width - 4);
    const nameW = Math.max(14, Math.min(30, (inner * 0.32) | 0));
    const whoW = Math.max(8, Math.min(16, (inner * 0.16) | 0));
    const stateW = 10;
    const blurbW = Math.max(6, inner - 2 - nameW - 2 - whoW - 2 - stateW - 2);

    const rows: string[] = [];

    rows.push(
      compose(this.theme, [
        { t: "LiteSPM", b: true, c: "accent" },
        { t: " marketplace", b: true },
        { t: "   " + this.notice, c: "dim" },
      ], inner),
    );
    rows.push("");

    // Tabs, with live counts.
    const tabSegs: Seg[] = [];
    TABS.forEach((t, i) => {
      const n = this.rows.filter(t.keep).length;
      const on = i === this.tab;
      tabSegs.push({ t: on ? " " + t.label + " " + n + " " : " " + t.label + " " + n + " ", c: on ? "accent" : "dim", b: on });
      tabSegs.push({ t: " " });
    });
    rows.push(compose(this.theme, tabSegs, inner));
    rows.push(compose(this.theme, [{ t: "─".repeat(inner), c: "border" }], inner));

    rows.push(
      compose(this.theme, [
        { t: "Find  ", c: "dim" },
        { t: this.query === "" ? "type to filter" : this.query, c: this.query === "" ? "dim" : "text" },
        { t: this.query === "" ? "" : "▌", c: "accent" },
      ], inner),
    );
    rows.push("");

    const height = Math.max(4, Math.min(12, (inner / 5) | 0));
    if (this.visible.length === 0) {
      rows.push(compose(this.theme, [{ t: TABS[this.tab].id === "installed" ? "Nothing installed here yet." : "Nothing matches.", c: "muted" }], inner));
      rows.push(compose(this.theme, [{ t: "Tab switches tabs · backspace clears the filter · /marketplace <word> searches the whole catalogue", c: "dim" }], inner));
    }
    const start = Math.max(0, Math.min(this.selected - (height >> 1), this.visible.length - height));
    const end = Math.min(this.visible.length, start + height);
    for (let i = start; i < end; i++) {
      const c = this.visible[i];
      const picked = i === this.selected;
      const state = rowState(c);
      rows.push(
        compose(this.theme, [
          { t: picked ? "❯ " : "  ", c: picked ? "accent" : "dim", b: picked },
          { t: c.name, c: picked ? "accent" : c.installable || c.installed ? "text" : "muted", b: picked, w: nameW },
          { t: "  " },
          { t: c.publisher && c.publisher !== "community" ? c.publisher : "", c: "dim", w: whoW },
          { t: "  " },
          { t: c.summary || KIND_EXPLAINS[c.kind] || "", c: "muted", w: blurbW },
          { t: "  " },
          { t: state.label, c: state.tone, w: stateW },
        ], inner),
      );
    }
    if (this.visible.length > height) {
      rows.push(compose(this.theme, [{ t: "  " + (this.selected + 1) + " / " + this.visible.length, c: "dim" }], inner));
    }

    rows.push(compose(this.theme, [{ t: "─".repeat(inner), c: "border" }], inner));
    const cur = this.current();
    if (cur) {
      rows.push(
        compose(this.theme, [
          { t: cur.name, b: true },
          { t: cur.publisher ? "  ·  from " + cur.publisher : "", c: "muted" },
          { t: "  ·  " + (cur.kindLabel ?? cur.kind), c: "muted" },
          { t: cur.version ? "  ·  v" + cur.version : "", c: "dim" },
        ], inner),
      );
      if (cur.summary) rows.push(...this.wrap(inner, [{ t: cur.summary, c: "text" }]).slice(0, 2));
      rows.push(compose(this.theme, [{ t: "It " + (KIND_EXPLAINS[cur.kind] ?? "runs in your agent") + ".", c: "dim" }], inner));
      if (cur.installedHere && cur.removable) {
        rows.push(...this.wrap(inner, [{ t: "Installed. Press Enter to remove it from Pi.", c: "success" }]));
      } else if (cur.installedHere) {
        rows.push(...this.wrap(inner, [{ t: "Found in Pi's own configuration. LiteSPM shows it but does not change it.", c: "muted" }]));
      } else if (cur.installable) {
        rows.push(
          ...this.wrap(inner, [
            { t: "Press Enter to add it to Pi", c: "accent", b: true },
            { t: cur.kind === "skill" ? " (copied into your skills folder)." : " (~/.pi/agent/mcp.json). Nothing else on your computer changes.", c: "muted" },
          ]),
        );
      } else {
        rows.push(...this.wrap(inner, [{ t: "Manual setup: ", c: "warning" }, { t: cur.reason || "LiteSPM cannot install this one.", c: "muted" }]));
      }
    }
    if (this.flash) rows.push(...this.wrap(inner, [{ t: this.flash, c: "warning" }]));
    rows.push("");

    rows.push(
      compose(this.theme, [
        { t: "↑↓ move", c: "dim" },
        { t: "  ·  ", c: "border" },
        { t: "tab switch", c: "dim" },
        { t: "  ·  ", c: "border" },
        { t: cur && cur.installedHere ? "enter remove" : "enter add", c: "dim" },
        { t: "  ·  ", c: "border" },
        { t: "type to filter", c: "dim" },
        { t: "  ·  ", c: "border" },
        { t: "esc close", c: "dim" },
      ], inner),
    );

    const out: string[] = [];
    // The frame is drawn to the SAME width as a content row: "│ " + inner +
    // " │", so the corners land exactly on the content edges.
    out.push(compose(this.theme, [{ t: "╭" + "─".repeat(inner + 2) + "╮", c: "border" }], width));
    for (const row of rows) {
      const pad = Math.max(0, inner - visible(row));
      out.push(
        compose(this.theme, [{ t: "│ ", c: "border" }], 2) +
          row +
          " ".repeat(pad) +
          compose(this.theme, [{ t: " │", c: "border" }], 2),
      );
    }
    out.push(compose(this.theme, [{ t: "╰" + "─".repeat(inner + 2) + "╯", c: "border" }], width));
    return out;
  }
}

export default function (pi: ExtensionAPI) {
  pi.registerCommand("marketplace", {
    description: "Find and install things your agent can do",
    handler: async (args, ctx) => {
      const query = args.trim();
      ctx.ui.notify(query === "" ? "Opening the LiteSPM marketplace…" : "Searching LiteSPM for " + query + "…", "info");
      const searchDoc = await readJSON<RowsDoc>(pi, ["marketplace", "rows", "--json", "--host", HOST, "--query", query, "--limit", "300"]);
      const installedDoc: RowsDoc | undefined = searchDoc ? { rows: searchDoc.installed } : undefined;
      if (!searchDoc) {
        ctx.ui.notify(
          "LiteSPM did not answer. Check that it is installed (litespm --version) and up to date: npm install -g litespm",
          "warning",
        );
        return;
      }

      // One list: installed rows first, then the search, de-duplicated by id.
      const rows: Capability[] = [];
      const seen = new Set<string>();
      for (const doc of [installedDoc, searchDoc]) {
        for (const row of doc && doc.rows ? doc.rows : []) {
          if (!row.id || seen.has(row.id)) continue;
          seen.add(row.id);
          rows.push(row);
        }
      }

      if (rows.length === 0) {
        const hint = searchDoc && searchDoc.notice ? searchDoc.notice : "";
        ctx.ui.notify(
          hint !== ""
            ? hint
            : query === ""
              ? "Nothing installed here yet. Try: /marketplace github"
              : "Nothing matched " + query + ".",
          "info",
        );
        return;
      }

      const total = searchDoc && searchDoc.total ? searchDoc.total : 0;
      const notice =
        query === ""
          ? "installed + installable picks · /marketplace <word> searches"
          : total + " result" + (total === 1 ? "" : "s") + " for " + query;

      const theme = ctx.ui.theme as PanelTheme | undefined;
      const picked = await ctx.ui.custom<string | undefined>(
        (_tui, _theme, _keybindings, done) => new MarketplacePanel(rows, notice, theme, done),
        { overlay: true },
      );
      if (!picked) return;

      const removing = picked.startsWith("remove:");
      const target = picked.slice(picked.indexOf(":") + 1);
      const row = rows.find((r) => (removing ? r.installId === target : r.id === target));
      const label = row ? row.name : target;
      const argv = removing ? ["install", "remove", target] : ["install", target, "--host", HOST];
      ctx.ui.notify((removing ? "Removing " : "Adding ") + label + "…", "info");
      const outcome = await pi.exec(liteSPMBinary(), argv, { timeout: 180000 });
      if (outcome.code === 0) {
        ctx.ui.notify(
          removing ? "Removed " + label + ". Quit and restart Pi to finish." : "Added " + label + ". Quit and restart Pi to use it.",
          "info",
        );
      } else {
        const why = outcomeLine(outcome.stdout + "\n" + outcome.stderr);
        ctx.ui.notify((removing ? "Could not remove " : "Could not add ") + label + (why ? ": " + why : "."), "warning");
      }
    },
  });

  pi.registerCommand("litespm", {
    description: "List the LiteSPM tools available here",
    handler: async (args, ctx) => {
      const bridgeTools = pi
        .getAllTools()
        .filter((tool) => tool.name.startsWith(BRIDGE_TOOL_PREFIX));
      if (bridgeTools.length === 0) {
        ctx.ui.notify(
          "The LiteSPM bridge is not connected yet. Check the 'litespm' entry in mcp.json (see /mcp).",
          "warning",
        );
        return;
      }
      const lines = bridgeTools.map(
        (tool) => tool.name + (tool.description ? " - " + tool.description : ""),
      );
      ctx.ui.notify(
        "LiteSPM can do " + bridgeTools.length + " things here:\n" + lines.join("\n"),
        "info",
      );
    },
  });
}

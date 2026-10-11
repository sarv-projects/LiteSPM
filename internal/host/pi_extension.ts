// LiteSPM companion extension for Pi Agent.
//
//   /marketplace [query]   browse and install capabilities from inside Pi
//   /litespm               plain-text list of the bridge's MCP tools
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const BRIDGE_TOOL_PREFIX = "mcp__litespm__";

interface Capability {
  id: string;
  name: string;
  kind: string;
  publisher: string;
  summary: string;
  installability?: string;
  scope?: string;
  installed?: boolean;
  installId?: string;
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
    const parsed = JSON.parse(raw) as { mcpServers?: Record<string, { command?: string[] }> };
    const entry = parsed.mcpServers ? parsed.mcpServers.litespm : undefined;
    const command = entry ? entry.command : undefined;
    if (command && command.length > 0) return command[0];
  } catch {
    // No readable config: PATH lookup below is the honest fallback.
  }
  return "litespm";
}

async function readJSON<T>(pi: ExtensionAPI, args: string[]): Promise<T | undefined> {
  const result = await pi.exec(liteSPMBinary(), args, { timeout: 30000 });
  if (result.code !== 0) return undefined;
  try {
    return JSON.parse(result.stdout) as T;
  } catch {
    return undefined;
  }
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
    if (visible(plain) > limit) plain = plain.slice(0, Math.max(0, limit - 1)) + "~";
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

const KIND_LABEL: Record<string, string> = {
  mcp: "MCP server",
  skill: "Skill",
  plugin: "Plugin",
};

const KIND_EXPLAINS: Record<string, string> = {
  mcp: "connects your agent to a service or database",
  skill: "a workflow your agent can follow",
  plugin: "a bundle of tools and skills",
};

/** Row state, in the vocabulary "claude mcp list" already teaches people:
 *  ✔ added, and a bare "add" for something installable. "not yet" is a
 *  deliberate softening of discovery_only: the reason is spelled out in the
 *  detail band, where there is room to say it properly. */
function rowState(row: Capability): { label: string; tone: string } {
  if (row.installed) return { label: "✔ added", tone: "success" };
  if (row.installability === "metadata_verified") return { label: "add", tone: "accent" };
  return { label: "not yet", tone: "warning" };
}

interface Row {
  capability: Capability;
  installId?: string;
}

class MarketplacePanel {
  private rows: Row[];
  private visible: Row[];
  private query = "";
  private selected = 0;
  private theme: PanelTheme | undefined;
  private notice: string;
  private readonly done: (result: string | undefined) => void;

  constructor(
    rows: Row[],
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
    this.visible =
      needle === ""
        ? this.rows
        : this.rows.filter((row) => {
            const c = row.capability;
            return (c.name + " " + c.id + " " + c.publisher + " " + c.summary)
              .toLowerCase()
              .includes(needle);
          });
    if (this.selected >= this.visible.length) {
      this.selected = Math.max(0, this.visible.length - 1);
    }
  }

  private current(): Row | undefined {
    return this.visible[this.selected];
  }

  handleInput(data: string): void {
    switch (data) {
      case "\x1b[A":
        this.selected = Math.max(0, this.selected - 1);
        return;
      case "\x1b[B":
        this.selected = Math.max(0, Math.min(this.visible.length - 1, this.selected + 1));
        return;
      case "\r":
      case "\n": {
        const picked = this.current();
        this.done(picked ? picked.capability.id : undefined);
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
   *  segment's colour. The detail band uses it because clipping a sentence
   *  hides exactly the half that explains the decision. */
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
        // One word longer than the whole line: clip it rather than loop on it.
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
    const inner = Math.max(24, width - 4);
    const nameW = Math.max(14, Math.min(28, inner - 34));
    const stateW = 10;
    const blurbW = Math.max(8, inner - 2 - nameW - 2 - stateW - 2);

    const rows: string[] = [];

    // Header: what this is, and how much of it there is.
    rows.push(
      compose(this.theme, [
        { t: "LiteSPM marketplace", b: true },
        { t: "  " },
        { t: this.visible.length + " of " + this.rows.length, c: "dim" },
        { t: "   " + this.notice, c: "dim" },
      ], inner),
    );
    rows.push("");

    // Search line, with a caret so an empty box reads as a prompt.
    rows.push(
      compose(this.theme, [
        { t: "Find  ", c: "dim" },
        { t: this.query === "" ? "type to search" : this.query, c: this.query === "" ? "dim" : "text" },
        { t: this.query === "" ? "" : " ", c: "text" },
        { t: this.query === "" ? "" : "▌", c: "accent" },
      ], inner),
    );
    rows.push("");

    // The list. The cursor is drawn as spaces on every other row, so nothing
    // shifts when the selection moves.
    const height = Math.max(3, Math.min(10, inner / 4 | 0));
    if (this.visible.length === 0) {
      rows.push(compose(this.theme, [{ t: "Nothing matches that yet.", c: "muted" }], inner));
      rows.push(compose(this.theme, [{ t: "Try a shorter word, or clear the search with backspace.", c: "dim" }], inner));
    }
    const start = Math.max(
      0,
      Math.min(this.selected - (height >> 1), this.visible.length - height),
    );
    const end = Math.min(this.visible.length, start + height);
    for (let i = start; i < end; i++) {
      const row = this.visible[i];
      const c = row.capability;
      const picked = i === this.selected;
      const state = rowState(c);
      rows.push(
        compose(this.theme, [
          { t: picked ? "❯ " : "  ", c: picked ? "accent" : "dim", b: picked },
          { t: c.name, c: picked ? "accent" : "text", b: picked, w: nameW },
          { t: "  " },
          { t: c.summary || KIND_EXPLAINS[c.kind] || "", c: "muted", w: blurbW },
          { t: "  " },
          { t: state.label, c: state.tone, w: stateW },
        ], inner),
      );
    }

    // Detail band: who made it, what it is, and — the point of the panel —
    // exactly what Enter will do, in words and with the file it touches.
    rows.push("");
    rows.push(compose(this.theme, [{ t: "─".repeat(inner) }], inner), );
    const cur = this.current();
    if (cur) {
      const c = cur.capability;
      const from = c.publisher && c.publisher !== "community" ? "from " + c.publisher : "";
      rows.push(
        compose(this.theme, [
          { t: c.name, b: true },
          { t: from ? "  ·  " + from : "", c: "muted" },
          { t: "  ·  " + (KIND_LABEL[c.kind] ?? c.kind), c: "muted" },
        ], inner),
      );
      if (c.summary) rows.push(compose(this.theme, [{ t: c.summary, c: "text" }], inner));
      rows.push(compose(this.theme, [{ t: "It " + (KIND_EXPLAINS[c.kind] ?? "runs in your agent") + ".", c: "dim" }], inner));
      rows.push("");
      if (c.installed) {
        rows.push(
          ...this.wrap(inner, [{ t: "Press Enter to remove it from Pi.", c: "success" }]),
        );
      } else if (c.installability === "metadata_verified") {
        rows.push(
          ...this.wrap(inner, [
            { t: "Press Enter to add it to Pi", c: "accent", b: true },
            { t: " (~/.pi/agent/mcp.json). Nothing else on your computer changes.", c: "muted" },
          ]),
        );
      } else {
        rows.push(
          ...this.wrap(inner, [
            { t: "Not installable yet: ", c: "warning" },
            { t: "LiteSPM has not verified a build for this one, so it will not run it for you. Local servers can run code on this computer.", c: "muted" },
          ]),
        );
      }
    }
    rows.push("");

    // One dim line of hints, the host's own idiom.
    rows.push(
      compose(this.theme, [
        { t: "↑↓ move", c: "dim" },
        { t: "  ·  ", c: "border" },
        { t: cur && cur.capability.installed ? "enter remove" : "enter add", c: "dim" },
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
      const installedDoc = await readJSON<{
        records?: Array<{ id?: string; scope?: string; installId?: string }>;
      }>(pi, ["list", "--json"]);
      const searchDoc =
        query === ""
          ? undefined
          : await readJSON<{ results?: Capability[] }>(pi, [
              "search",
              query,
              "--json",
              "--limit",
              "300",
            ]);

      const installed = new Map<string, { scope: string; installId?: string }>();
      const records = installedDoc && installedDoc.records ? installedDoc.records : [];
      for (const record of records) {
        if (record.id) {
          installed.set(record.id, {
            scope: record.scope ? record.scope : "user",
            installId: record.installId,
          });
        }
      }

      const rows: Row[] = [];
      const seen = new Set<string>();
      const results = searchDoc && searchDoc.results ? searchDoc.results : [];
      for (const row of results) {
        if (!row.id || seen.has(row.id)) continue;
        seen.add(row.id);
        const entry = installed.get(row.id);
        row.installed = Boolean(entry);
        row.scope = entry ? entry.scope : undefined;
        rows.push({ capability: row, installId: entry ? entry.installId : undefined });
      }
      for (const entry of installed) {
        if (seen.has(entry[0])) continue;
        seen.add(entry[0]);
        rows.push({
          capability: {
            id: entry[0],
            name: entry[0],
            kind: "installed",
            publisher: "",
            summary: "",
            installed: true,
            scope: entry[1].scope,
          },
          installId: entry[1].installId,
        });
      }

      if (rows.length === 0) {
        ctx.ui.notify(
          query === ""
            ? "Nothing installed here yet, and no search given. Try: /marketplace github"
            : "Nothing matched " + query + ". If the catalogue is empty, run litespm catalog sync.",
          "info",
        );
        return;
      }

      const notice =
        query === ""
          ? "installed here · /marketplace <word> searches the catalogue"
          : "searching for " + query;

      const theme = ctx.ui.theme as PanelTheme | undefined;
      const picked = await ctx.ui.custom<string | undefined>(
        (_tui, _theme, _keybindings, done) =>
          new MarketplacePanel(rows, notice, theme, done),
        { overlay: true },
      );

      if (!picked) return;

      const row = rows.find((r) => r.capability.id === picked);
      const removing = Boolean(row && row.capability.installed && row.installId);
      const argv = removing && row && row.installId
        ? ["install", "remove", row.installId]
        : ["install", picked, "--host", "pi-agent"];
      const outcome = await pi.exec(liteSPMBinary(), argv, { timeout: 120000 });
      const output = (outcome.stdout + outcome.stderr).trim();
      if (outcome.code === 0) {
        ctx.ui.notify(
          removing
            ? "Removed. Quit and restart Pi to finish."
            : "Added. Quit and restart Pi to use it.",
          "info",
        );
      } else {
        ctx.ui.notify(
          (removing ? "Could not remove " : "Could not add ") +
            picked +
            ":\n" +
            (output === "" ? "no output" : output),
          "warning",
        );
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

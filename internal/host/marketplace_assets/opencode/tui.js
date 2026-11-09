// __MARKER__ __LITESPM_VERSION__: written by `litespm host setup`; `litespm host remove` deletes it.
//
// LiteSPM marketplace — OpenCode TUI plugin (V2 plugin API, plain ESM, no build).
//
//   /litespm-marketplace [search]   also in the command palette (ctrl+p)
//
// Opens OpenCode's own dialogs, no model turn: a search box, then a grouped,
// filterable list (Installed · MCP servers · Skills · Plugins), then the action
// for the picked row. Every row comes from one LiteSPM view model:
//
//   litespm marketplace rows --json --query <q> --host opencode
//
// and every action goes through the normal LiteSPM verbs, so the install is
// planned, policy-checked and recorded exactly as on the command line.
import { spawn } from "node:child_process"

const LITESPM_BIN = process.env.LITESPM_BIN || "__LITESPM_BIN__"
const HOST = "opencode"
const ROWS_TIMEOUT_MS = 90_000
const ACTION_TIMEOUT_MS = 180_000

function run(args, timeoutMs) {
  return new Promise((resolve) => {
    let child
    try {
      // The binary is an absolute path to a native executable, so no shell is
      // involved on any platform and no argument is ever interpreted.
      child = spawn(LITESPM_BIN, args, { stdio: ["ignore", "pipe", "pipe"], windowsHide: true })
    } catch (e) {
      return resolve({ code: -1, stdout: "", stderr: String(e && e.message ? e.message : e) })
    }
    let stdout = ""
    let stderr = ""
    let settled = false
    const finish = (r) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve(r)
    }
    const timer = setTimeout(() => {
      try { child.kill() } catch {}
      finish({ code: -1, stdout, stderr: stderr + "\ntimed out" })
    }, timeoutMs)
    child.stdout.on("data", (d) => (stdout += d))
    child.stderr.on("data", (d) => (stderr += d))
    child.on("error", (e) => finish({ code: -1, stdout, stderr: String(e && e.message ? e.message : e) }))
    child.on("close", (code) => finish({ code: code ?? -1, stdout, stderr }))
  })
}

const lines = (s) => String(s).split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
// The line that says what happened: LiteSPM prints a ✓ / ✗ status line.
const resultLine = (s) => lines(s).find((l) => /^[✓✗]/.test(l)) || lines(s).pop() || ""
// Strip the machine detail an LPSM error carries; keep the sentence.
const humanError = (s) =>
  resultLine(s)
    .replace(/^Install failed:\s*/i, "")
    .replace(/\s*\(category: [^)]*\)\s*$/, "")
    .replace(/^\[LPSM-[A-Z-]+\]\s*/, "")
const clip = (s, n) => (s.length > n ? s.slice(0, n - 1) + "…" : s)

function statusOf(r) {
  if (r.installedHere) return "installed"
  if (r.installed) return "installed elsewhere"
  if (r.installable) return "available"
  return "manual setup"
}

async function loadRows(query) {
  const r = await run(["marketplace", "rows", "--json", "--query", query, "--host", HOST, "--limit", "300"], ROWS_TIMEOUT_MS)
  if (r.code !== 0) throw new Error(humanError(r.stderr || r.stdout) || "litespm exited " + r.code)
  let doc
  try {
    doc = JSON.parse(r.stdout)
  } catch {
    throw new Error("This litespm is too old for the marketplace (no `marketplace rows`). Update it: npm install -g litespm")
  }
  if (!doc || !Array.isArray(doc.rows)) throw new Error("Unexpected marketplace document from litespm")
  return doc
}

export default {
  id: "litespm.marketplace",
  async setup(ctx) {
    const { dialog, toast } = ctx.ui
    const say = (variant, title, message) =>
      toast.show({ variant, title, message: clip(message || title, 400), duration: variant === "error" ? 9000 : 3500 })

    async function open(initialQuery) {
      let query = (initialQuery || "").trim()
      for (;;) {
        if (!query) {
          const q = await dialog.prompt({
            title: "LiteSPM Marketplace",
            description: "Search MCP servers, skills and plugins. Leave empty to see what is installed and a few installable picks.",
            placeholder: "github, postgres, pdf …",
          })
          if (q === undefined) return
          query = q.trim()
        }
        let doc
        try {
          say("info", "LiteSPM", query ? "Searching for " + query + "…" : "Loading…")
          doc = await loadRows(query)
        } catch (e) {
          return say("error", "LiteSPM marketplace", e.message)
        }
        if (doc.notice) say("warning", "LiteSPM", doc.notice)

        const SEARCH = { search: true }
        const options = doc.rows.map((r) => ({
          title: r.name,
          value: r,
          description: [r.publisher && r.publisher !== "community" ? r.publisher : "", r.summary].filter(Boolean).join(" · ") || r.id,
          category: r.installed ? "Installed" : r.kindLabel + "s",
          footer: statusOf(r),
        }))
        options.push({ title: "Search again…", value: SEARCH, category: "LiteSPM", footer: "" })

        const picked = await dialog.select({
          title: query
            ? "LiteSPM · " + doc.total + " result" + (doc.total === 1 ? "" : "s") + " for " + query + (doc.truncated ? " (top " + doc.rows.length + ")" : "")
            : "LiteSPM · installed and available",
          placeholder: "Filter…",
          options,
        })
        if (!picked) return
        if (picked === SEARCH) {
          query = ""
          continue
        }
        await new Promise((r) => setTimeout(r, 0))
        if (await act(picked)) return
      }
    }

    // Returns true when something ran; false sends the user back to the list.
    async function act(row) {
      const canInstall = row.installable && !row.installedHere
      const canRemove = Boolean(row.removable && row.installId)
      if (!canInstall && !canRemove) {
        say("warning", row.name, row.reason || "Nothing LiteSPM can do with this one here.")
        return false
      }
      const choices = []
      if (canInstall) choices.push({ title: "Install for OpenCode", value: "install", description: row.kindLabel + (row.version ? " · v" + row.version : "") })
      if (canRemove) choices.push({ title: "Remove", value: "remove", description: "Removes what LiteSPM installed; your own edits are kept" })
      choices.push({ title: "Back", value: "back" })
      const action = await dialog.select({ title: row.name + " · " + statusOf(row), options: choices })
      if (!action || action === "back") return false

      say("info", row.name, action === "install" ? "Installing…" : "Removing…")
      const argv = action === "install" ? ["install", row.id, "--host", HOST] : ["install", "remove", row.installId]
      const r = await run(argv, ACTION_TIMEOUT_MS)
      if (r.code === 0) {
        say("success", (action === "install" ? "Installed " : "Removed ") + row.name, "Restart OpenCode to load the change.")
      } else {
        say("error", (action === "install" ? "Could not install " : "Could not remove ") + row.name, humanError(r.stderr || r.stdout) || "exit " + r.code)
      }
      return true
    }

    ctx.keymap.layer(() => ({
      mode: "global",
      commands: [
        {
          id: "litespm.marketplace",
          title: "LiteSPM Marketplace",
          description: "Search, install and remove MCP servers, skills and plugins",
          group: "LiteSPM",
          palette: true,
          slash: { name: "litespm-marketplace", aliases: ["litespm"], arguments: true },
          run: (input) =>
            open(typeof input === "string" ? input : "").catch((e) =>
              say("error", "LiteSPM marketplace", String(e && e.message ? e.message : e)),
            ),
        },
      ],
    }))
  },
}

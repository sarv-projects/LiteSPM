// __MARKER__ __LITESPM_VERSION__: written by `litespm host setup`; `litespm host remove` deletes it.
// Extension: litespm-marketplace
// Adds /litespm-marketplace [--kind mcp|skill|plugin|installed] [query]
// Reads `litespm marketplace rows --json` and acts via `litespm install ...`.
//
// Install location: ~/.copilot/extensions/litespm-marketplace/extension.mjs
// (or $COPILOT_HOME/extensions/...). Requires Copilot CLI experimental mode.

import { execFile } from "node:child_process";
import { joinSession } from "@github/copilot-sdk/extension";

// Replaced by the LiteSPM installer with the absolute path of the binary.
// If it is still the placeholder, fall back to PATH lookup of "litespm".
const LITESPM_BIN_RAW = "__LITESPM_BIN__";
const LITESPM_BIN =
    process.env.LITESPM_BIN ||
    (LITESPM_BIN_RAW.startsWith("__LITESPM") ? "litespm" : LITESPM_BIN_RAW);

const HOST_ID = "github-copilot";
const KINDS = ["mcp", "skill", "plugin", "installed"];
const ROWS_LIMIT = 30;
const ROWS_TIMEOUT_MS = 60_000;
const ACTION_TIMEOUT_MS = 180_000;
const UI_TIMEOUT_MS = 10 * 60_000; // an unanswered dialog is abandoned, never a hang
const MAX_SEARCH_ROUNDS = 10;

/** Run litespm without a shell. Always resolves; never rejects, never hangs. */
function runLitespm(args, timeoutMs) {
    return new Promise((resolve) => {
        try {
            const child = execFile(
                LITESPM_BIN,
                args,
                {
                    timeout: timeoutMs,
                    killSignal: "SIGKILL",
                    windowsHide: true,
                    maxBuffer: 16 * 1024 * 1024,
                    encoding: "utf8",
                    stdio: ["ignore", "pipe", "pipe"],
                },
                (err, stdout, stderr) => {
                    resolve({
                        ok: !err,
                        code: err ? (typeof err.code === "number" ? err.code : null) : 0,
                        timedOut: Boolean(err && err.killed),
                        spawnError: err && typeof err.code === "string" ? err.code : null,
                        stdout: String(stdout ?? ""),
                        stderr: String(stderr ?? ""),
                    });
                },
            );
            child.stdin?.end(); // never wait on input
        } catch (e) {
            resolve({ ok: false, code: null, timedOut: false, spawnError: String(e), stdout: "", stderr: "" });
        }
    });
}

/** Race a UI promise against a timeout; null means cancelled/abandoned. */
function withTimeout(p, ms) {
    let t;
    return Promise.race([
        p,
        new Promise((resolve) => {
            t = setTimeout(() => resolve(null), ms);
        }),
    ]).finally(() => clearTimeout(t));
}

function lastLine(text) {
    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    return lines.length ? lines[lines.length - 1] : "";
}

/** The most informative single line: a ✓/✗ status line if present, else the last line. */
function resultLine(text) {
    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    return lines.find((l) => /^[✓✗✔✘]/.test(l)) ?? (lines.length ? lines[lines.length - 1] : "");
}

function describeFailure(r) {
    if (r.timedOut) return "timed out";
    if (r.spawnError === "ENOENT") return `cannot run "${LITESPM_BIN}" (not found)`;
    if (r.spawnError) return `cannot run "${LITESPM_BIN}" (${r.spawnError})`;
    return lastLine(r.stderr) || lastLine(r.stdout) || `exit code ${r.code}`;
}

function parseArgs(raw) {
    const tokens = (raw ?? "").trim().split(/\s+/).filter(Boolean);
    let kind = "";
    const rest = [];
    for (let i = 0; i < tokens.length; i++) {
        if (tokens[i] === "--kind" && i + 1 < tokens.length) {
            const k = tokens[++i].toLowerCase();
            if (KINDS.includes(k)) kind = k;
        } else {
            rest.push(tokens[i]);
        }
    }
    return { kind, query: rest.join(" ") };
}

function statusOf(row) {
    if (row.installed) return row.installedHere === false ? "installed elsewhere" : "installed";
    return row.installable ? "available" : "not installable";
}

function labelOf(row, n) {
    const name = String(row.name ?? row.id ?? "?").replace(/\s+/g, " ").slice(0, 60);
    return `${n}. ${name} — ${row.kindLabel ?? row.kind ?? "?"} — ${statusOf(row)}`;
}

/** An id/installId is passed as a bare argv element: refuse anything option-like. */
function safeArg(v) {
    return typeof v === "string" && v.length > 0 && !v.startsWith("-") && !/[\0\r\n]/.test(v);
}

const session = await joinSession({
    commands: [
        {
            name: "litespm-marketplace",
            description: "Search the LiteSPM catalog; install or remove MCP servers, skills and plugins",
            handler: async (ctx) => {
                try {
                    await run(ctx);
                } catch (e) {
                    await session.log(`LiteSPM marketplace failed: ${e?.message ?? e}`, { level: "error" });
                }
            },
        },
    ],
});

async function run(ctx) {
    if (!session.capabilities?.ui?.elicitation) {
        await session.log("LiteSPM marketplace needs an interactive terminal (UI dialogs are unavailable here).", {
            level: "warning",
        });
        return;
    }
    let { kind, query } = parseArgs(ctx.args);
    let askFirst = !ctx.args || !ctx.args.trim();

    for (let round = 0; round < MAX_SEARCH_ROUNDS; round++) {
        if (askFirst) {
            const q = await withTimeout(
                session.ui.input("Search the LiteSPM marketplace (leave empty to browse)", {
                    title: "LiteSPM marketplace",
                    description: "Name, publisher or keyword. Prefix the command with --kind mcp|skill|plugin|installed to filter.",
                }),
                UI_TIMEOUT_MS,
            );
            if (q === null) return; // cancelled
            query = q.trim();
        }
        askFirst = true; // later rounds always re-ask (the first query came from args)

        const args = ["marketplace", "rows", "--json", "--query", query, "--host", HOST_ID, "--limit", String(ROWS_LIMIT)];
        if (kind) args.push("--kind", kind);
        await session.log("Searching the LiteSPM catalog…", { level: "info", ephemeral: true });
        const res = await runLitespm(args, ROWS_TIMEOUT_MS);
        if (!res.ok) {
            await session.log(`litespm marketplace rows failed: ${describeFailure(res)}`, { level: "error" });
            return;
        }
        let doc;
        try {
            doc = JSON.parse(res.stdout);
        } catch {
            await session.log("litespm returned output that is not JSON (is the installed litespm too old?).", {
                level: "error",
            });
            return;
        }
        if (typeof doc?.schema !== "string" || !doc.schema.startsWith("litespm.marketplace.rows/") || !Array.isArray(doc.rows)) {
            await session.log(`Unsupported marketplace document (schema: ${doc?.schema ?? "none"}). Update litespm.`, {
                level: "error",
            });
            return;
        }
        if (doc.notice) await session.log(String(doc.notice), { level: "info" });
        if (doc.rows.length === 0) {
            await session.log(`No results for "${query}"${kind ? ` (${kind})` : ""}.`, { level: "info" });
            continue; // let the user search again
        }

        const SEARCH_AGAIN = "↻ Search again";
        const byLabel = new Map();
        const options = [];
        doc.rows.forEach((row, i) => {
            const label = labelOf(row, i + 1);
            byLabel.set(label, row);
            options.push(label);
        });
        options.push(SEARCH_AGAIN);

        const title = `LiteSPM: ${doc.total ?? doc.rows.length} result(s)${doc.truncated ? " (truncated)" : ""} — pick one`;
        let searchAgain = false;
        for (let pick = 0; pick < MAX_SEARCH_ROUNDS; pick++) {
            const picked = await withTimeout(session.ui.select(title, options), UI_TIMEOUT_MS);
            if (picked === null) return;
            if (picked === SEARCH_AGAIN) {
                searchAgain = true;
                break;
            }
            const row = byLabel.get(picked);
            if (!row) return;
            if (await act(row, doc.commands ?? {})) return;
            // nothing happened (declined / not actionable): show the same results again
        }
        if (!searchAgain) return;
    }
}

/** Returns true when an action ran (success or failure), false when nothing happened. */
async function act(row, commands) {
    const canInstall = row.installable === true && row.installedHere !== true && safeArg(row.id);
    const canRemove = row.removable === true && safeArg(row.installId);

    if (!canInstall && !canRemove) {
        const why =
            row.reason ||
            (row.installedHere ? "It is installed but cannot be removed from here (not managed by LiteSPM)." : "It cannot be installed on this host.");
        await session.log(`${row.name ?? row.id}: ${row.installable ? "nothing to do" : "not installable"} — ${why}`, {
            level: "warning",
        });
        return false;
    }

    let action;
    if (canInstall && canRemove) {
        const choice = await withTimeout(
            session.ui.select(`${row.name} (${statusOf(row)})`, ["Install", "Remove", "Cancel"]),
            UI_TIMEOUT_MS,
        );
        if (choice === null || choice === "Cancel") return false;
        action = choice === "Install" ? "install" : "remove";
    } else {
        action = canInstall ? "install" : "remove";
        const verb = action === "install" ? "Install" : "Remove";
        const detail = [row.kindLabel, row.publisher, row.version && `v${row.version}`].filter(Boolean).join(" · ");
        const ok = await withTimeout(
            session.ui.confirm(`${verb} "${row.name}"${detail ? ` (${detail})` : ""} for GitHub Copilot?`),
            UI_TIMEOUT_MS,
        );
        if (ok !== true) return false;
    }

    let argv;
    if (action === "install") {
        const base = Array.isArray(commands.install) && commands.install.length ? commands.install : ["install", "--host", HOST_ID];
        argv = [base[0], row.id, ...base.slice(1)]; // litespm install <id> --host <hostId>
    } else {
        const base = Array.isArray(commands.remove) && commands.remove.length ? commands.remove : ["install", "remove"];
        argv = [...base, row.installId]; // litespm install remove <installId>
    }

    await session.log(`Running: litespm ${argv.join(" ")}`, { level: "info", ephemeral: true });
    const r = await runLitespm(argv, ACTION_TIMEOUT_MS);
    const line = resultLine(r.stdout) || resultLine(r.stderr);
    if (r.ok) {
        await session.log(`${action === "install" ? "Installed" : "Removed"} ${row.name}: ${line || "done"}`, { level: "info" });
    } else {
        await session.log(`${action} ${row.name} failed: ${describeFailure(r)}`, { level: "error" });
    }
    return true;
}

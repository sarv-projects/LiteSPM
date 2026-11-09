// __MARKER__ __LITESPM_VERSION__: written by `litespm host setup`; `litespm host remove` deletes it.
// Amp plugin: litespm  (UNTESTED - written against https://ampcode.com/docs/plugin-api)
//
// Adds the command-palette entry "LiteSPM: Marketplace" (Ctrl+O, then type "litespm").
// Reads `litespm marketplace rows --json` and acts via `litespm install ...`.
//
// Install location (system plugin, single file):
//   macOS/Linux : ${XDG_CONFIG_HOME:-~/.config}/amp/plugins/litespm.ts
//   Windows     : %USERPROFILE%\.config\amp\plugins\litespm.ts   (or %XDG_CONFIG_HOME%\amp\plugins\)
//   Project     : <project>/.amp/plugins/litespm.ts
// Then run "plugins: reload" from the command palette.

import { execFile } from 'node:child_process'
import type { PluginAPI } from '@ampcode/plugin'

export const description = 'Search the LiteSPM catalog and install or remove MCP servers, skills and plugins'

// Replaced by the LiteSPM installer with the absolute path of the binary.
// While it is still the placeholder, fall back to PATH lookup of "litespm".
const LITESPM_BIN_RAW = '__LITESPM_BIN__'
const LITESPM_BIN: string =
	process.env.LITESPM_BIN || (LITESPM_BIN_RAW.startsWith('__LITESPM') ? 'litespm' : LITESPM_BIN_RAW)

const HOST_ID = 'amp'
const KINDS = ['mcp', 'skill', 'plugin', 'installed'] as const
type Kind = (typeof KINDS)[number]
const ROWS_LIMIT = 30
const ROWS_TIMEOUT_MS = 60_000
const ACTION_TIMEOUT_MS = 180_000
const MAX_SEARCH_ROUNDS = 10

interface Row {
	id: string
	name?: string
	kind?: string
	kindLabel?: string
	publisher?: string
	version?: string
	installable?: boolean
	reason?: string
	installed?: boolean
	installedHere?: boolean
	installId?: string
	removable?: boolean
}
interface RowsDoc {
	schema: string
	total?: number
	truncated?: boolean
	notice?: string
	rows: Row[]
	commands?: { install?: string[]; remove?: string[]; sync?: string[] }
}
interface RunResult {
	ok: boolean
	code: number | null
	timedOut: boolean
	spawnError: string | null
	stdout: string
	stderr: string
}

/** Run litespm without a shell. Always resolves; never rejects, never hangs. */
function runLitespm(args: string[], timeoutMs: number): Promise<RunResult> {
	return new Promise((resolve) => {
		try {
			const child = execFile(
				LITESPM_BIN,
				args,
				{ timeout: timeoutMs, killSignal: 'SIGKILL', windowsHide: true, maxBuffer: 16 * 1024 * 1024, encoding: 'utf8' },
				(err, stdout, stderr) => {
					const e = err as (NodeJS.ErrnoException & { killed?: boolean; code?: string | number }) | null
					resolve({
						ok: !e,
						code: e ? (typeof e.code === 'number' ? e.code : null) : 0,
						timedOut: Boolean(e && e.killed),
						spawnError: e && typeof e.code === 'string' ? e.code : null,
						stdout: String(stdout ?? ''),
						stderr: String(stderr ?? ''),
					})
				},
			)
			child.stdin?.end() // never wait for input
		} catch (e) {
			resolve({ ok: false, code: null, timedOut: false, spawnError: String(e), stdout: '', stderr: '' })
		}
	})
}

const lines = (t: string) => t.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
const lastLine = (t: string) => lines(t).at(-1) ?? ''
const resultLine = (t: string) => lines(t).find((l) => /^[✓✗✔✘]/.test(l)) ?? lastLine(t)

function describeFailure(r: RunResult): string {
	if (r.timedOut) return 'timed out'
	if (r.spawnError === 'ENOENT') return `cannot run "${LITESPM_BIN}" (not found)`
	if (r.spawnError) return `cannot run "${LITESPM_BIN}" (${r.spawnError})`
	return lastLine(r.stderr) || lastLine(r.stdout) || `exit code ${r.code}`
}

function statusOf(row: Row): string {
	if (row.installed) return row.installedHere === false ? 'installed elsewhere' : 'installed'
	return row.installable ? 'available' : 'not installable'
}

function labelOf(row: Row, n: number): string {
	const name = String(row.name ?? row.id ?? '?').replace(/\s+/g, ' ').slice(0, 60)
	return `${n}. ${name} — ${row.kindLabel ?? row.kind ?? '?'} — ${statusOf(row)}`
}

/** ids are passed as bare argv elements: refuse anything option-like. */
const safeArg = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && !v.startsWith('-') && !/[\0\r\n]/.test(v)

export default function (amp: PluginAPI) {
	amp.registerCommand(
		'litespm.marketplace',
		{
			title: 'Marketplace',
			category: 'LiteSPM',
			description: 'Search the LiteSPM catalog; install or remove MCP servers, skills and plugins',
		},
		async (ctx) => {
			const ui = ctx.ui
			try {
				// 1) kind (tab) filter, then 2) query
				const tab = await ui.select({
					title: 'LiteSPM marketplace',
					message: 'Which tab?',
					options: ['All', 'MCP servers', 'Skills', 'Plugins', 'Installed'],
				})
				if (tab === undefined) return
				const kind: Kind | '' = ({ 'MCP servers': 'mcp', Skills: 'skill', Plugins: 'plugin', Installed: 'installed' } as Record<string, Kind>)[tab] ?? ''

				for (let round = 0; round < MAX_SEARCH_ROUNDS; round++) {
					const q = await ui.input({
						title: 'LiteSPM marketplace',
						helpText: 'Name, publisher or keyword (leave empty to browse).',
						submitButtonText: 'Search',
					})
					if (q === undefined) return // cancelled

					const args = ['marketplace', 'rows', '--json', '--query', q.trim(), '--host', HOST_ID, '--limit', String(ROWS_LIMIT)]
					if (kind) args.push('--kind', kind)
					await ui.notify('Searching the LiteSPM catalog…')
					const res = await runLitespm(args, ROWS_TIMEOUT_MS)
					if (!res.ok) {
						await ui.notify(`litespm marketplace rows failed: ${describeFailure(res)}`)
						return
					}
					let doc: RowsDoc
					try {
						doc = JSON.parse(res.stdout) as RowsDoc
					} catch {
						await ui.notify('litespm returned output that is not JSON (is the installed litespm too old?).')
						return
					}
					if (typeof doc?.schema !== 'string' || !doc.schema.startsWith('litespm.marketplace.rows/') || !Array.isArray(doc.rows)) {
						await ui.notify(`Unsupported marketplace document (schema: ${doc?.schema ?? 'none'}). Update litespm.`)
						return
					}
					if (doc.notice) await ui.notify(String(doc.notice))
					if (doc.rows.length === 0) {
						await ui.notify(`No results for "${q.trim()}"${kind ? ` (${kind})` : ''}.`)
						continue
					}

					const SEARCH_AGAIN = '↻ Search again'
					const byLabel = new Map<string, Row>()
					const options: string[] = []
					doc.rows.forEach((row, i) => {
						const label = labelOf(row, i + 1)
						byLabel.set(label, row)
						options.push(label)
					})
					options.push(SEARCH_AGAIN)

					let searchAgain = false
					for (let pick = 0; pick < MAX_SEARCH_ROUNDS; pick++) {
						const picked = await ui.select({
							title: `LiteSPM: ${doc.total ?? doc.rows.length} result(s)${doc.truncated ? ' (truncated)' : ''}`,
							message: 'Pick an item.',
							options,
							// allowOther deliberately left off: only listed rows are valid
						})
						if (picked === undefined) return
						if (picked === SEARCH_AGAIN) {
							searchAgain = true
							break
						}
						const row = byLabel.get(picked)
						if (!row) return
						if (await act(ui, row, doc.commands ?? {})) return
					}
					if (!searchAgain) return
				}
			} catch (e) {
				await ui.notify(`LiteSPM marketplace failed: ${(e as Error)?.message ?? e}`)
			}
		},
	)
}

/** Returns true when an action ran (success or failure), false when nothing happened. */
async function act(ui: { select: Function; confirm: Function; notify: (m: string) => Promise<void> }, row: Row, commands: NonNullable<RowsDoc['commands']>): Promise<boolean> {
	const canInstall = row.installable === true && row.installedHere !== true && safeArg(row.id)
	const canRemove = row.removable === true && safeArg(row.installId)

	if (!canInstall && !canRemove) {
		const why =
			row.reason ||
			(row.installedHere ? 'It is installed but cannot be removed from here (not managed by LiteSPM).' : 'It cannot be installed on this host.')
		await ui.notify(`${row.name ?? row.id}: ${row.installable ? 'nothing to do' : 'not installable'} — ${why}`)
		return false
	}

	let action: 'install' | 'remove'
	if (canInstall && canRemove) {
		const choice = (await ui.select({ title: `${row.name} (${statusOf(row)})`, options: ['Install', 'Remove', 'Cancel'] })) as string | undefined
		if (choice === undefined || choice === 'Cancel') return false
		action = choice === 'Install' ? 'install' : 'remove'
	} else {
		action = canInstall ? 'install' : 'remove'
		const verb = action === 'install' ? 'Install' : 'Remove'
		const detail = [row.kindLabel, row.publisher, row.version && `v${row.version}`].filter(Boolean).join(' · ')
		const ok = (await ui.confirm({
			title: `${verb} "${row.name}"?`,
			message: `${verb} ${detail ? `**${row.name}** (${detail})` : `**${row.name}**`} for Amp.`,
			confirmButtonText: verb,
		})) as boolean
		if (ok !== true) return false
	}

	let argv: string[]
	if (action === 'install') {
		const base = commands.install?.length ? commands.install : ['install', '--host', HOST_ID]
		argv = [base[0], row.id, ...base.slice(1)] // litespm install <id> --host <hostId>
	} else {
		const base = commands.remove?.length ? commands.remove : ['install', 'remove']
		argv = [...base, row.installId as string] // litespm install remove <installId>
	}

	await ui.notify(`Running: litespm ${argv.join(' ')}`)
	const r = await runLitespm(argv, ACTION_TIMEOUT_MS)
	const line = resultLine(r.stdout) || resultLine(r.stderr)
	await ui.notify(
		r.ok
			? `${action === 'install' ? 'Installed' : 'Removed'} ${row.name}: ${line || 'done'}`
			: `${action} ${row.name} failed: ${describeFailure(r)}`,
	)
	return true
}

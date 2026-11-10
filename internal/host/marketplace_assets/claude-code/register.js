// __MARKER__ __LITESPM_VERSION__: written by `litespm host setup`; `litespm host remove` deletes it.
//
// LiteSPM marketplace — Claude Code mod.
//
//   /litespm-marketplace [search]
//
// Opens a pane (no model turn): tabs for MCP servers, Skills, Plugins and
// Installed, a search field, a paged list, a details box and Install / Remove /
// Refresh / Close. Every row comes from one LiteSPM view model
// (`litespm marketplace rows --json`), and every action runs the normal
// LiteSPM verbs, so the install is planned, policy-checked and recorded exactly
// as on the command line. All I/O uses the documented mods API.

const BIN = "__LITESPM_BIN__"
const PANE = 'litespm-marketplace'
const HOST = 'claude-code'
const PAGE_SIZE = 9
const TABS = [
  { id: 'mcp', label: 'MCP servers', hotkey: '1' },
  { id: 'skill', label: 'Skills', hotkey: '2' },
  { id: 'plugin', label: 'Plugins', hotkey: '3' },
  { id: 'installed', label: 'Installed', hotkey: '4' },
]

let tab = 'mcp'
let query = ''
let found = []
let installed = []
let selectedId = null
let page = 0
let busy = false
let loaded = false
let message = ''
let tone = 'dim'
let program = BIN

// ---- helpers (top level, so they may receive $) ---------------------------

function rowsForTab() {
  if (tab === 'installed') return installed
  return found.filter((r) => r.kind === tab && !r.installedHere).concat(found.filter((r) => r.kind === tab && r.installedHere))
}

function selected() {
  return rowsForTab().find((r) => r.id === selectedId) || null
}

function say(text, kind) {
  message = text
  tone = kind || 'dim'
}

function lines(s) {
  return String(s || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
}

// The sentence that matters from LiteSPM's output: its ✓/✗ line, without the
// machine detail an LPSM error carries.
function outcome(res) {
  const all = lines(res.stdout).concat(lines(res.stderr))
  const line = all.find((l) => /^[✓✗]/.test(l)) || all.pop() || ''
  return line
    .replace(/^Install failed:\s*/i, '')
    .replace(/\s*\(category: [^)]*\)\s*$/, '')
    .replace(/^\[LPSM-[A-Z-]+\]\s*/, '')
}

function status(r) {
  if (r.installedHere) return 'installed'
  if (r.installed) return 'installed elsewhere'
  return r.installable ? 'available' : 'manual setup'
}

function redraw($) {
  $.ui.invalidate('ui.render')
}

// $.process.run refuses some program paths; fall back to PATH once.
async function exec($, args, timeoutMs) {
  try {
    return await $.process.run([program].concat(args), { timeoutMs })
  } catch (err) {
    if (program !== 'litespm') {
      program = 'litespm'
      return await $.process.run([program].concat(args), { timeoutMs })
    }
    throw err
  }
}

async function fetchDoc($, args) {
  const res = await exec($, ['marketplace', 'rows', '--json', '--host', HOST].concat(args), 90000)
  if (res.exitCode !== 0) throw new Error(outcome(res) || 'litespm exited ' + res.exitCode)
  const doc = JSON.parse(res.stdout)
  if (!doc || !Array.isArray(doc.rows)) throw new Error('This litespm is too old for the marketplace. Update it: npm install -g litespm')
  return doc
}

async function refresh($) {
  if (busy) return
  busy = true
  say(query ? 'Searching for ' + query + '…' : 'Loading…', 'dim')
  redraw($)
  try {
    const hits = await fetchDoc($, ['--query', query, '--limit', '300'])
    found = hits.rows
    installed = Array.isArray(hits.installed) ? hits.installed : hits.rows.filter((r) => r.installed)
    loaded = true
    page = 0
    if (!rowsForTab().some((r) => r.id === selectedId)) selectedId = null
    say(hits.notice || (query ? hits.total + ' result(s) for ' + query : 'Type a search and press Enter.'), hits.notice ? 'yellow' : 'dim')
  } catch (err) {
    say('Could not load the marketplace: ' + String((err && err.message) || err), 'red')
  }
  busy = false
  redraw($)
}

async function runAction($, row, action) {
  if (busy) return
  busy = true
  say((action === 'install' ? 'Installing ' : 'Removing ') + row.name + '…', 'dim')
  redraw($)
  let ok = false
  let detail = ''
  try {
    const argv = action === 'install' ? ['install', row.id, '--host', HOST] : ['install', 'remove', row.installId]
    const res = await exec($, argv, 180000)
    ok = res.exitCode === 0
    detail = outcome(res)
  } catch (err) {
    detail = String((err && err.message) || err)
  }
  busy = false
  await refresh($)
  if (ok) {
    say((action === 'install' ? 'Installed ' : 'Removed ') + row.name + '. Restart Claude Code to load the change.', 'green')
    await $.ui.toast((action === 'install' ? 'Installed ' : 'Removed ') + row.name)
  } else {
    say((action === 'install' ? 'Could not install ' : 'Could not remove ') + row.name + ': ' + detail, 'red')
  }
  redraw($)
}

// ---- the mod --------------------------------------------------------------

export function register(on) {
  on('session.start', async ($, e, next) => {
    const saved = await $.store.get('ui')
    if (saved && typeof saved === 'object') {
      if (typeof saved.tab === 'string') tab = saved.tab
      if (typeof saved.query === 'string') query = saved.query
    }
    await $.command.register({
      name: 'litespm-marketplace',
      description: 'Search, install and remove MCP servers, skills and plugins (LiteSPM)',
      argumentHint: '[search]',
    })
    return next(e)
  })

  on('command.run', { command: 'litespm-marketplace' }, async ($, e) => {
    const arg = String(e.args || '').trim()
    if (arg) query = arg
    await $.ui.open({ id: PANE, title: 'LiteSPM Marketplace', focus: true, closeOnEscape: true, rows: 32, columns: 96 })
    if (!loaded || arg) refresh($)
    return {}
  })

  on('ui.render', { component: 'Pane' }, async ($, e, next) => {
    if (e.requestId !== PANE) return next(e)
    const { Box, Text, Button, Input } = $.ui.resolve(e)

    const rows = rowsForTab()
    const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE))
    if (page >= pages) page = pages - 1
    const shown = rows.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE)
    const sel = selected()
    const count = (id) => (id === 'installed' ? installed.length : found.filter((r) => r.kind === id).length)

    const tabStrip = Box({
      flexDirection: 'row',
      columnGap: 2,
      children: TABS.map((t) =>
        Button({
          key: 'tab-' + t.id,
          label: (tab === t.id ? '▸ ' : '  ') + t.label + ' ' + count(t.id),
          hotkey: t.hotkey,
          plain: true,
          dimColor: tab !== t.id,
          onPress: async () => {
            tab = t.id
            page = 0
            selectedId = null
            redraw($)
            await $.store.set('ui', { tab, query })
          },
        }),
      ),
    })

    const search = Input({
      key: 'search',
      label: 'Search',
      placeholder: 'github, postgres, pdf … then Enter',
      value: query,
      submitLabel: 'search',
      autoFocus: true,
      onInput: (value) => {
        query = value
      },
      onSubmit: async (value) => {
        query = value
        if (tab === 'installed') tab = 'mcp'
        await $.store.set('ui', { tab, query })
        await refresh($)
      },
    })

    const list =
      shown.length === 0
        ? [Text({ dimColor: true, children: [busy ? 'Loading…' : tab === 'installed' ? 'Nothing installed yet.' : query ? 'No ' + TABS.find((t) => t.id === tab).label.toLowerCase() + ' match.' : 'Type a search and press Enter.'] })]
        : shown.map((r) => {
            const picked = r.id === selectedId
            const mark = r.installedHere ? '●' : r.installable ? '○' : '·'
            const who = r.publisher && r.publisher !== 'community' ? '  ' + r.publisher : ''
            return Button({
              key: 'row-' + r.kind + '-' + r.id,
              label: (picked ? '❯ ' : '  ') + mark + ' ' + String(r.name).slice(0, 34) + who.slice(0, 20) + '   ' + status(r),
              plain: true,
              dimColor: !picked && !r.installable && !r.installed,
              onPress: () => {
                selectedId = r.id
                redraw($)
              },
            })
          })

    const pager = Box({
      flexDirection: 'row',
      columnGap: 2,
      children: [
        Button({ key: 'prev', label: '‹ Prev', plain: true, dimColor: page === 0, onPress: () => { if (page > 0) page -= 1; redraw($) } }),
        Text({ dimColor: true, children: ['page ' + (page + 1) + ' of ' + pages + ' · ' + rows.length + ' rows'] }),
        Button({ key: 'next', label: 'Next ›', plain: true, dimColor: page >= pages - 1, onPress: () => { if (page < pages - 1) page += 1; redraw($) } }),
      ],
    })

    const details = Box({
      flexDirection: 'column',
      borderStyle: 'round',
      paddingX: 1,
      children: sel
        ? [
            Text({ bold: true, children: [sel.name + '  ·  ' + sel.kindLabel + (sel.version ? '  ·  v' + sel.version : '')] }),
            Text({ dimColor: true, children: [(sel.publisher ? 'from ' + sel.publisher + '  ·  ' : '') + sel.id] }),
            Text({ wrap: 'wrap', children: [sel.summary || 'No description.'] }),
            Text({
              color: sel.installedHere ? 'green' : sel.installable ? undefined : 'yellow',
              wrap: 'wrap',
              children: [sel.installedHere ? 'Installed for Claude Code.' : sel.installable ? 'Available: press Install (i).' : sel.reason || 'Manual setup only.'],
            }),
          ]
        : [Text({ dimColor: true, children: ['Select a row to see its details.'] })],
    })

    const buttons = Box({
      flexDirection: 'row',
      columnGap: 1,
      children: [
        Button({
          key: 'install', label: 'Install (i)', hotkey: 'i', variant: 'primary',
          dimColor: !(sel && sel.installable && !sel.installedHere),
          onPress: async () => {
            const row = selected()
            if (!row) { say('Select a row first.', 'yellow'); return redraw($) }
            if (!row.installable) { say(row.reason || 'LiteSPM cannot install this one.', 'yellow'); return redraw($) }
            if (row.installedHere) { say(row.name + ' is already installed.', 'dim'); return redraw($) }
            await runAction($, row, 'install')
          },
        }),
        Button({
          key: 'remove', label: 'Remove (d)', hotkey: 'd',
          dimColor: !(sel && sel.removable),
          onPress: async () => {
            const row = selected()
            if (!row || !row.removable || !row.installId) { say('Select something LiteSPM installed first.', 'yellow'); return redraw($) }
            await runAction($, row, 'remove')
          },
        }),
        Button({ key: 'refresh', label: 'Refresh (r)', hotkey: 'r', onPress: () => refresh($) }),
        Button({ key: 'close', label: 'Close (q)', hotkey: 'q', role: 'dismiss', onPress: () => $.ui.close({ id: PANE }) }),
      ],
    })

    return Box({
      flexDirection: 'column',
      children: [
        tabStrip,
        search,
        Text({ children: [' '] }),
        ...list,
        pager,
        details,
        Text({ color: tone === 'dim' ? undefined : tone, dimColor: tone === 'dim', wrap: 'truncate-end', children: [message || ' '] }),
        buttons,
      ],
    })
  })
}

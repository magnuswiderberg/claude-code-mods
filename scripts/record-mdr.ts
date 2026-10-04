// Records docs/severance-mdr.gif: plays the real severance-mdr Refiner on a
// stand-in Client surface, writes each frame as HTML, screenshots the frames
// with a headless Chromium browser (Edge or Chrome) and joins them with
// ImageMagick.
//
//   bun scripts/record-mdr.ts
//
// Needs Bun, ImageMagick (`magick`) and Edge or Chrome; set BROWSER to the
// browser's executable if it is not found.
import { existsSync, mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join, resolve } from 'node:path'

type El = { type: string; props: Record<string, any>; children?: any[] }
;(globalThis as any).h = (type: string, props: any, ...children: any[]): El => ({ type, props: props ?? {}, children })
;(globalThis as any).Fragment = 'Fragment'

const ROOT = resolve(import.meta.dir, '..')
const MOD = join(ROOT, 'plugins/severance-mdr/hooks')
const { default: Refiner } = await import(join(MOD, 'refiner.tsx'))
const { boardOf, W } = await import(join(MOD, 'mdr.tsx'))

const COLUMNS = 120
const ROWS = 29
/** Opens "Cold Harbor" with the first quote. */
const SEED = 36
/** The Refiner's own frame clock, in ms; the GIF plays at the same pace. */
const TICK = 140
const OUT = join(ROOT, 'docs/severance-mdr.gif')
const WORK = mkdtempSync(join(tmpdir(), 'record-mdr-'))

// --- a stand-in Client surface ---------------------------------------------
let tickFn: () => void = () => {}
let keyFn: (k: { key: string; shift: boolean }) => void = () => {}
const surface: any = {
  state: null,
  setState(s: any) { this.state = s },
  every(_ms: number, fn: () => void) { tickFn = fn },
  onKey(fn: any) { keyFn = fn },
  onPointer() {},
  post() {},
  elements: { Box: 'Box', Text: 'Text' },
  columns: COLUMNS,
  rows: ROWS,
}
const props = { game: null, seed: SEED, busy: true, files: 0 }

// --- tree to HTML -----------------------------------------------------------
// Bun may compile the mod's JSX classically (children as arguments) or
// automatically (children in props); both shapes are read.
type Span = { text: string; style: Record<string, any> }
function spans(node: any, inherited: Record<string, any>, out: Span[]) {
  if (node == null || node === false) return
  if (Array.isArray(node)) return node.forEach(n => spans(n, inherited, out))
  if (typeof node === 'string' || typeof node === 'number') return void out.push({ text: String(node), style: inherited })
  const { wrap, children: kids, ...style } = node.props ?? {}
  spans(node.children ?? kids, { ...inherited, ...style }, out)
}
function lines(tree: El): Span[][] {
  return [tree.children ?? tree.props.children].flat(Infinity).map((line: El) => {
    const out: Span[] = []
    spans(line, {}, out)
    return out
  })
}

const FG = '#c9d6dc'
const BG = '#08141a'
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/ /g, '&nbsp;')
function css(s: Record<string, any>): string {
  let fg = s.color ?? FG
  let bg = s.backgroundColor ?? 'transparent'
  if (s.inverse) [fg, bg] = [s.backgroundColor ?? BG, s.color ?? FG]
  return `color:${fg};background:${bg};${s.bold ? 'font-weight:700;' : ''}${s.dimColor ? 'opacity:.55;' : ''}`
}
function html(tree: El): string {
  const body = lines(tree).map(line => {
    let left = COLUMNS
    const parts = line.map(sp => {
      const t = sp.text.slice(0, Math.max(0, left))
      left -= t.length
      return t ? `<span style="${css(sp.style)}">${esc(t)}</span>` : ''
    })
    return `<div class="l">${parts.join('')}</div>`
  }).join('')
  return `<!doctype html><meta charset="utf-8"><style>
html,body{margin:0;background:#0d1117}
.win{font:15px 'Cascadia Mono',monospace;margin:16px;border:1px solid #24414d;border-radius:10px;background:${BG};overflow:hidden;width:calc(${COLUMNS}ch + 32px)}
.bar{height:30px;display:flex;align-items:center;gap:8px;padding:0 14px;background:#0f222b;border-bottom:1px solid #1b3540;font:600 13px 'Segoe UI',sans-serif;color:#8fb7c7}
.dot{width:11px;height:11px;border-radius:50%;background:#24414d}
.t{margin-left:8px}
.body{padding:12px 16px}
.l{height:19px;line-height:19px;white-space:pre;font:15px 'Cascadia Mono','Consolas','Segoe UI Symbol',monospace;color:${FG}}
</style><div class="win"><div class="bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="t">Macrodata Refinement</span></div><div class="body">${body}</div></div>`
}

// --- the playthrough --------------------------------------------------------
const frames: string[] = []
function frame() {
  frames.push(html(Refiner(props, surface)))
  tickFn()
}
function key(k: string) {
  keyFn({ key: k, shift: false })
  frame()
}
const idle = (n: number) => { for (let i = 0; i < n; i++) frame() }
const game = () => surface.state.game

function walkTo(x: number, y: number) {
  while (game().cx !== x || game().cy !== y) {
    const g = game()
    if (g.cx !== x) key(x > g.cx ? 'right' : 'left')
    else key(y > g.cy ? 'down' : 'up')
  }
}

/** The cells of the scary cluster nearest the cursor: same temper, touching. */
function nearestCluster(): number[] {
  const board = boardOf(SEED)
  const g = game()
  const done = new Set<number>(g.done)
  const open = board.bad.map((k: number, i: number) => (k >= 0 && !done.has(i) ? i : -1)).filter((i: number) => i >= 0)
  if (open.length === 0) return []
  const dist = (i: number) => Math.abs((i % W) - g.cx) + Math.abs(Math.floor(i / W) - g.cy)
  const start = open.reduce((a: number, b: number) => (dist(b) < dist(a) ? b : a))
  const k = board.bad[start]
  const seen = new Set([start])
  const stack = [start]
  while (stack.length) {
    const i = stack.pop()!
    for (const j of open) {
      if (seen.has(j) || board.bad[j] !== k) continue
      if (Math.abs((j % W) - (i % W)) <= 1 && Math.abs(Math.floor(j / W) - Math.floor(i / W)) <= 1) {
        seen.add(j)
        stack.push(j)
      }
    }
  }
  return [...seen]
}

function refineCluster() {
  let cells = nearestCluster()
  while (cells.length) {
    const g = game()
    const d = (i: number) => Math.abs((i % W) - g.cx) + Math.abs(Math.floor(i / W) - g.cy)
    const next = cells.reduce((a, b) => (d(b) < d(a) ? b : a))
    cells = cells.filter(i => i !== next)
    walkTo(next % W, Math.floor(next / W))
    key(' ')
  }
  idle(2)
  // Bin into whichever bin has the most room for this temper, until none is left.
  const board = boardOf(SEED)
  for (let guard = 0; game().sel.length && guard < 5; guard++) {
    const k = board.bad[game().sel[0]]
    const room = board.quota.map((q: number[], b: number) => q[k]! - game().bins[b][k])
    key(String(room.indexOf(Math.max(...room)) + 1))
    idle(6)
  }
}

idle(8)
for (let round = 0; round < 3; round++) refineCluster()
idle(10)

const names = frames.map((_, i) => `f${String(i).padStart(3, '0')}`)
frames.forEach((f, i) => writeFileSync(join(WORK, `${names[i]}.html`), f))
console.log(`${frames.length} frames`)

// --- screenshots ------------------------------------------------------------
const BROWSERS = [
  process.env.BROWSER,
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
]
const browser = BROWSERS.find(b => b && existsSync(b))
if (!browser) throw new Error('No Edge or Chrome found; set BROWSER to its executable.')

const slash = (p: string) => p.replace(/\\/g, '/')
/**
 * Edge on Windows can hand the work to another process and exit before the
 * screenshot is written, so each one is waited for as a file, not a process.
 */
async function shoot(name: string) {
  const png = join(WORK, `${name}.png`)
  for (let attempt = 0; attempt < 3; attempt++) {
    await Bun.spawn([browser!, '--headless=new', '--disable-gpu', '--hide-scrollbars',
      `--user-data-dir=${slash(join(WORK, 'profile', `${name}-${attempt}`))}`, '--window-size=1120,700',
      `--screenshot=${slash(png)}`, `file:///${slash(join(WORK, `${name}.html`))}`],
      { stdout: 'ignore', stderr: 'ignore' }).exited
    for (let waited = 0; waited < 30_000; waited += 250) {
      if (existsSync(png) && statSync(png).size > 0) {
        await Bun.sleep(250)
        return
      }
      await Bun.sleep(250)
    }
  }
  throw new Error(`No screenshot for ${name}`)
}
/**
 * Some headless instances stay running after their screenshot. Each was
 * started with a profile inside WORK, whose name is unique to this run, so
 * whatever still names it is ours to stop.
 */
function stopBrowsers() {
  const tag = basename(WORK)
  if (process.platform === 'win32') {
    Bun.spawnSync(['powershell', '-NoProfile', '-Command',
      `Get-CimInstance Win32_Process | Where-Object { $_.ProcessId -ne $PID -and $_.CommandLine -like '*${tag}*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`])
  } else {
    Bun.spawnSync(['pkill', '-f', tag])
  }
}

try {
  for (let i = 0; i < names.length; i += 6) await Promise.all(names.slice(i, i + 6).map(shoot))
} finally {
  stopBrowsers()
}
console.log('screenshots done')

// --- the GIF ----------------------------------------------------------------
// The crop keeps the window and a little of the page around it.
const magick = Bun.spawnSync(['magick', '-delay', String(TICK / 10), '-loop', '0',
  ...names.map(n => join(WORK, `${n}.png`)), '-crop', '1094x614+13+13', '+repage',
  '+dither', '-colors', '128', '-fuzz', '2%', '-layers', 'Optimize', OUT], { stderr: 'inherit' })
if (magick.exitCode !== 0) throw new Error('magick failed')
try {
  rmSync(WORK, { recursive: true, force: true, maxRetries: 4, retryDelay: 500 })
} catch {
  console.log(`left ${WORK} behind`)
}
console.log(`wrote ${OUT}`)

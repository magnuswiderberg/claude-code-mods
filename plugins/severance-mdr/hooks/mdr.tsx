// Macrodata Refinement: the game itself, shared by the `Client` refiner
// (terminal, desktop) and the button board (every other surface). Pure
// functions over a `Game`, which is plain data; the board is derived from
// its seed, so a saved file is only a few hundred numbers.
import type { ClientElements, RenderElement } from 'claude-code'

import type { Game, Tally } from '../types'

export const W = 40
export const H = 20
export const TEMPERS = ['WO', 'FC', 'DR', 'MA'] as const
const TEMPER_NAMES = ['Woe', 'Frolic', 'Dread', 'Malice']
const TEMPER_COLORS = ['#8fd694', '#f4d35e', '#7aa2f7', '#f7768e']
const BINS = 5
/** How near the cursor a scary number must be before it stirs. */
const STIR = 3

const FILES = [
  'Cold Harbor', 'Siena', 'Tumwater', 'Dranesville', 'Allentown', 'Moonbeam',
  'Labrador', 'Jesup', 'Kingsport', 'Narva', 'Ocula', 'Wellington', 'Le Mars',
  'Culpepper', 'Yakima', 'Eagan', 'Coxsackie', 'Loveland',
]

const QUOTES = [
  'Please enjoy each number equally.',
  'The work is mysterious and important.',
  'Kier sees all refinement as an act of love.',
  'A handshake is available upon request.',
  'Remember: the scary numbers fear you more than you fear them.',
  'Waffle party eligibility is reviewed quarterly.',
]

export type Board = {
  digits: number[]
  /** Temper index of each scary cell, -1 for a calm one. */
  bad: number[]
  quota: Tally[]
  total: number
}

export type Action =
  | { t: 'move'; dx: number; dy: number; extend?: boolean }
  | { t: 'goto'; x: number; y: number }
  | { t: 'toggle' }
  | { t: 'lasso' }
  | { t: 'clear' }
  | { t: 'rect'; x0: number; y0: number; x1: number; y1: number }
  | { t: 'bin'; b: number }
  | { t: 'new' }

function rng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

let cached: { seed: number; board: Board } | null = null

export function boardOf(seed: number): Board {
  if (cached?.seed === seed) return cached.board
  const r = rng(seed)
  const digits = Array.from({ length: W * H }, () => Math.floor(r() * 10))
  const bad = new Array<number>(W * H).fill(-1)
  const clusters = 12 + Math.floor(r() * 5)
  for (let c = 0; c < clusters; c++) {
    const temper = Math.floor(r() * 4)
    const size = 4 + Math.floor(r() * 6)
    let x = 1 + Math.floor(r() * (W - 2))
    let y = 1 + Math.floor(r() * (H - 2))
    for (let n = 0, tries = 0; n < size && tries < 40; tries++) {
      const i = y * W + x
      if (bad[i] === -1) {
        bad[i] = temper
        n++
      }
      x = Math.min(W - 1, Math.max(0, x + Math.floor(r() * 3) - 1))
      y = Math.min(H - 1, Math.max(0, y + Math.floor(r() * 3) - 1))
    }
  }
  const per: Tally = [0, 0, 0, 0]
  for (const k of bad) if (k >= 0) per[k]!++
  const quota = Array.from({ length: BINS }, (_, b) =>
    per.map(t => Math.floor(t / BINS) + (b < t % BINS ? 1 : 0)) as Tally,
  )
  const board = { digits, bad, quota, total: per.reduce((s, n) => s + n, 0) }
  cached = { seed, board }
  return board
}

export function newGame(seed: number): Game {
  const s = (seed >>> 0) || 1
  return {
    v: 1,
    seed: s,
    name: FILES[s % FILES.length]!,
    cx: Math.floor(W / 2),
    cy: Math.floor(H / 2),
    sel: [],
    done: [],
    bins: Array.from({ length: BINS }, () => [0, 0, 0, 0] as Tally),
    last: -1,
    msg: QUOTES[s % QUOTES.length]!,
  }
}

/** A saved value read back from storage, if it still has the shape of one. */
export function asGame(value: unknown): Game | null {
  const g = value as Game | null
  return g && g.v === 1 && typeof g.seed === 'number' && Array.isArray(g.bins) ? g : null
}

export function percent(g: Game): number {
  const { total } = boardOf(g.seed)
  return total === 0 ? 100 : Math.floor((g.done.length / total) * 100)
}

export function isComplete(g: Game): boolean {
  return g.done.length >= boardOf(g.seed).total
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n))

function withSel(g: Game, cells: number[]): Game {
  const sel = new Set(g.sel)
  for (const i of cells) sel.add(i)
  return { ...g, sel: [...sel] }
}

export function act(g: Game, a: Action): Game {
  switch (a.t) {
    case 'move': {
      const cx = clamp(g.cx + a.dx, 0, W - 1)
      const cy = clamp(g.cy + a.dy, 0, H - 1)
      const moved = { ...g, cx, cy }
      return a.extend ? withSel(moved, [g.cy * W + g.cx, cy * W + cx]) : moved
    }
    case 'goto':
      return { ...g, cx: clamp(a.x, 0, W - 1), cy: clamp(a.y, 0, H - 1) }
    case 'toggle': {
      const i = g.cy * W + g.cx
      return g.sel.includes(i) ? { ...g, sel: g.sel.filter(j => j !== i) } : withSel(g, [i])
    }
    case 'lasso':
      return act(g, { t: 'rect', x0: g.cx - 1, y0: g.cy - 1, x1: g.cx + 1, y1: g.cy + 1 })
    case 'rect': {
      const cells: number[] = []
      for (let y = clamp(Math.min(a.y0, a.y1), 0, H - 1); y <= clamp(Math.max(a.y0, a.y1), 0, H - 1); y++)
        for (let x = clamp(Math.min(a.x0, a.x1), 0, W - 1); x <= clamp(Math.max(a.x0, a.x1), 0, W - 1); x++)
          cells.push(y * W + x)
      return withSel(g, cells)
    }
    case 'clear':
      return { ...g, sel: [] }
    case 'bin':
      return bin(g, a.b)
    case 'new': {
      const next = newGame(rng(g.seed ^ 0x9e3779b9)() * 4294967296)
      return { ...next, msg: `File "${next.name}" opened. ${next.msg}` }
    }
  }
}

function bin(g: Game, b: number): Game {
  if (b < 0 || b >= BINS) return g
  const label = binLabel(b)
  if (g.sel.length === 0) return { ...g, last: b, msg: `Select numbers before opening bin ${label}.` }
  const board = boardOf(g.seed)
  const done = new Set(g.done)
  const scary = g.sel.filter(i => board.bad[i]! >= 0 && !done.has(i)).sort((x, y) => x - y)
  const calm = g.sel.length - scary.length
  if (scary.length === 0) {
    return { ...g, sel: [], last: b, msg: 'Those numbers are not scary. Look closer.' }
  }
  const bins = g.bins.map(t => [...t] as Tally)
  const kept: number[] = []
  const full = new Set<string>()
  for (const i of scary) {
    const k = board.bad[i]!
    if (bins[b]![k]! < board.quota[b]![k]!) {
      bins[b]![k]!++
      done.add(i)
    } else {
      kept.push(i)
      full.add(TEMPER_NAMES[k]!)
    }
  }
  const taken = scary.length - kept.length
  const parts = [taken > 0 ? `Bin ${label} took ${taken}.` : `Bin ${label} refuses.`]
  if (full.size > 0) parts.push(`It has no room for ${[...full].join(', ')}.`)
  if (calm > 0) parts.push(`${calm} calm number${calm === 1 ? ' was' : 's were'} released.`)
  const next = { ...g, sel: kept, done: [...done], bins, last: b, msg: parts.join(' ') }
  return isComplete(next)
    ? { ...next, msg: `${g.name} is 100% complete. Kier is proud of you. Press n for a new file.` }
    : next
}

export const binLabel = (b: number) => String(b + 1).padStart(2, '0')

export type Layout = {
  columns: number
  rows: number
  /** Visible grid columns and rows. */
  vc: number
  vr: number
  /** Board coordinates of the visible window's top-left cell. */
  ox: number
  oy: number
  gridTop: number
  binTop: number
  binW: number
}

const CELL = 3
const HEADER = 2
const FOOTER = 7

/** Moves a window edge only as far as keeps the cursor `margin` cells inside. */
function follow(at: number, cursor: number, size: number, max: number): number {
  const margin = Math.min(2, Math.floor((size - 1) / 2))
  let n = at
  if (cursor < n + margin) n = cursor - margin
  if (cursor > n + size - 1 - margin) n = cursor - size + 1 + margin
  return clamp(n, 0, max - size)
}

/**
 * Where everything sits in a drawing `columns` by `rows`. Given the previous
 * window (`view`), it scrolls only as the cursor nears an edge; without one
 * it centres on the cursor.
 */
export function layout(g: Game, columns: number, rows: number, view?: { ox: number; oy: number } | null): Layout {
  const cols = Math.max(30, columns)
  const vc = Math.min(W, Math.max(5, Math.floor(cols / CELL)))
  const vr = Math.min(H, Math.max(3, rows - HEADER - FOOTER))
  const ox = view ? follow(view.ox, g.cx, vc, W) : clamp(g.cx - Math.floor(vc / 2), 0, W - vc)
  const oy = view ? follow(view.oy, g.cy, vr, H) : clamp(g.cy - Math.floor(vr / 2), 0, H - vr)
  return { columns: cols, rows, vc, vr, ox, oy, gridTop: HEADER, binTop: HEADER + vr + 1, binW: Math.floor(cols / BINS) }
}

/** The bin under a point of the drawing, or -1. */
export function binAt(l: Layout, x: number, y: number): number {
  if (y < l.binTop || y > l.binTop + 1) return -1
  return clamp(Math.floor(x / l.binW), 0, BINS - 1)
}

export type DrawOptions = {
  /** The animation frame, or null where the surface does not animate. */
  tick: number | null
  busy: boolean
  files: number
  /** A drag in progress, in board coordinates. */
  drag?: { x0: number; y0: number; x1: number; y1: number } | null
  help: string
}

type Style = { color?: string; bold?: boolean; inverse?: boolean; backgroundColor?: string; dimColor?: boolean }

const pad = (s: string, n: number) => (s.length >= n ? s.slice(0, n) : s + ' '.repeat(n - s.length))

function bar(fill: number, width: number): string {
  const n = Math.round(clamp(fill, 0, 1) * width)
  return '█'.repeat(n) + '░'.repeat(width - n)
}

export function drawBoard(g: Game, els: Pick<ClientElements, 'Box' | 'Text'>, l: Layout, o: DrawOptions): RenderElement {
  const { Box, Text } = els
  const board = boardOf(g.seed)
  const sel = new Set(g.sel)
  const done = new Set(g.done)
  const pct = percent(g)
  const tick = o.tick ?? 0
  const d = o.drag
  const inDrag = (x: number, y: number) =>
    !!d && x >= Math.min(d.x0, d.x1) && x <= Math.max(d.x0, d.x1) && y >= Math.min(d.y0, d.y1) && y <= Math.max(d.y0, d.y1)

  const right = `${pct}% Complete  ◖LUMON◗`
  const left = ` ▌${g.name}`
  const header = left + ' '.repeat(Math.max(1, l.columns - left.length - right.length)) + right

  const gridRows: RenderElement[] = []
  for (let gy = 0; gy < l.vr; gy++) {
    const y = l.oy + gy
    const spans: RenderElement[] = []
    let run = ''
    let runKey = ''
    let runStyle: Style = {}
    const flush = () => {
      if (run) spans.push(<Text {...runStyle}>{run}</Text>)
      run = ''
    }
    for (let gx = 0; gx < l.vc; gx++) {
      const x = l.ox + gx
      const i = y * W + x
      const scary = board.bad[i]! >= 0 && !done.has(i)
      const near = Math.max(Math.abs(x - g.cx), Math.abs(y - g.cy)) <= STIR
      const stirs = scary && near
      const digit = String(done.has(i) ? (board.digits[i]! + 5) % 10 : board.digits[i]!)
      let at = 1
      if (stirs) at = o.tick === null ? i % 3 : Math.round(1 + Math.sin(tick * 0.9 + i * 1.7))
      const text = ' '.repeat(at) + digit + ' '.repeat(CELL - 1 - at)
      const shimmer = o.tick !== null && Math.sin(tick * 0.12 - x * 0.35 + y * 0.25) > 0.75
      let style: Style
      if (x === g.cx && y === g.cy) style = { inverse: true, bold: true }
      else if (sel.has(i)) style = { color: '#ffffff', backgroundColor: '#1f6f8f', bold: stirs }
      else if (inDrag(x, y)) style = { color: '#e8fbff', backgroundColor: '#163f50' }
      else if (stirs) style = { color: '#f2fdff', bold: true }
      else style = { color: shimmer ? '#b6ecfb' : '#6fb8d6' }
      const key = JSON.stringify(style)
      if (key !== runKey) {
        flush()
        runKey = key
        runStyle = style
      }
      run += text
    }
    flush()
    gridRows.push(<Text wrap="truncate">{spans}</Text>)
  }

  const binCells: RenderElement[] = []
  const barCells: RenderElement[] = []
  for (let b = 0; b < BINS; b++) {
    const filled = g.bins[b]!.reduce((s, n) => s + n, 0)
    const want = board.quota[b]!.reduce((s, n) => s + n, 0)
    const fill = want === 0 ? 1 : filled / want
    const isLast = b === g.last
    const w = Math.max(6, l.binW - 1)
    const title = pad(`  ${binLabel(b)}${fill >= 1 ? ' ✓' : ''}`, w)
    const pctText = `${Math.floor(fill * 100)}%`.padStart(4)
    binCells.push(
      <Text bold={isLast} color={isLast ? '#e8fbff' : '#6fb8d6'} inverse={isLast && o.tick !== null && tick % 6 < 3}>
        {title}
      </Text>,
    )
    barCells.push(<Text color={fill >= 1 ? '#8fd694' : '#6fb8d6'}>{pad(' ' + bar(fill, Math.max(1, w - 6)) + pctText, w + 1)}</Text>)
  }

  const detail: RenderElement[] = []
  if (g.last >= 0) {
    detail.push(<Text dimColor>{` Bin ${binLabel(g.last)} `}</Text>)
    TEMPERS.forEach((t, k) =>
      detail.push(
        <Text color={TEMPER_COLORS[k]}>{` ${t} ${g.bins[g.last]![k]}/${board.quota[g.last]![k]} `}</Text>,
      ),
    )
  } else {
    detail.push(<Text dimColor> Numbers in bins are sorted by temper: </Text>)
    TEMPERS.forEach((t, k) => detail.push(<Text color={TEMPER_COLORS[k]}>{` ${t} ${TEMPER_NAMES[k]} `}</Text>))
  }

  const agents = o.busy
    ? ' ● Your agents are at work. Refine while you wait.'
    : ' ○ Your agents are idle. You may leave the severed floor.'
  const filesText = o.files > 0 ? `  Files refined: ${o.files}` : ''

  return (
    <Box flexDirection="column">
      <Text bold color="#e8fbff" wrap="truncate">{header}</Text>
      <Text color="#2f6f88" wrap="truncate">{'─'.repeat(l.columns)}</Text>
      {gridRows}
      <Text color="#2f6f88" wrap="truncate">{'─'.repeat(l.columns)}</Text>
      <Text wrap="truncate">{binCells}</Text>
      <Text wrap="truncate">{barCells}</Text>
      <Text wrap="truncate">{detail}</Text>
      <Text color="#e8fbff" wrap="truncate">{' ' + g.msg}</Text>
      <Text color={o.busy ? '#f4d35e' : '#8fd694'} wrap="truncate">{agents + filesText}</Text>
      <Text dimColor wrap="truncate">{' ' + o.help}</Text>
    </Box>
  )
}

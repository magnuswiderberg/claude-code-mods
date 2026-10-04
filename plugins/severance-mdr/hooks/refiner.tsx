// The refiner terminal: a `Client` surface module, so the numbers stir on
// the frame clock and the keys and the mouse reach the board directly. It
// keeps the file in its local state and posts each change to the hooks
// module, which saves it.
import type { ClientKeyEvent, ClientModule, ClientPointerEvent, ClientSurface } from 'claude-code'

import type { Game } from '../types'
import { act, asGame, binAt, drawBoard, isComplete, layout, newGame } from './mdr'
import type { Action, Layout } from './mdr'

type Props = { game: Game | null; seed: number; busy: boolean; files: number }
type Drag = { x0: number; y0: number; x1: number; y1: number }
type Local = { game: Game; tick: number; drag: Drag | null; view: { ox: number; oy: number } | null }
type Surface = ClientSurface<Local>

const HELP = '←↑↓→ move · shift+arrows paint · space mark · enter lasso · drag to box · 1-5 bin · c clear · esc leave'

const MOVES: Record<string, [number, number]> = {
  up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0],
  k: [0, -1], j: [0, 1], h: [-1, 0], l: [1, 0],
  w: [0, -1], s: [0, 1], a: [-1, 0], d: [1, 0],
}

function place(surface: Surface, st: Local): Layout {
  return layout(st.game, surface.columns || 80, surface.rows || 24, st.view)
}

function commit(surface: Surface, st: Local, game: Game, rest: Partial<Local> = {}) {
  const next = { ...st, ...rest, game }
  const l = place(surface, next)
  surface.setState({ ...next, view: { ox: l.ox, oy: l.oy } })
  if (game !== st.game) surface.post({ game })
}

function onKey(surface: Surface, k: ClientKeyEvent) {
  const st = surface.state
  if (!st) return
  const g = st.game
  const move = MOVES[k.key]
  let a: Action | null = null
  if (move) a = { t: 'move', dx: move[0], dy: move[1], extend: k.shift && k.key.length > 1 }
  else if (k.key === ' ' || k.key === 'space') a = { t: 'toggle' }
  else if (k.key === 'return' || k.key === 'x') a = { t: 'lasso' }
  else if (k.key === 'c' || k.key === 'backspace' || k.key === 'delete') a = { t: 'clear' }
  else if (/^[1-5]$/.test(k.key)) a = { t: 'bin', b: Number(k.key) - 1 }
  else if (k.key === 'N' || (k.key === 'n' && isComplete(g))) a = { t: 'new' }
  else if (k.key === 'n') {
    commit(surface, st, { ...g, msg: `Finish ${g.name} first, or press N to abandon it.` })
    return
  }
  if (a) commit(surface, st, act(g, a), a.t === 'new' ? { view: null } : {})
}

function onPointer(surface: Surface, p: ClientPointerEvent) {
  const st = surface.state
  if (!st) return
  const l = place(surface, st)
  const cell = { x: l.ox + Math.floor(p.x / 3), y: l.oy + p.y - l.gridTop }
  const onGrid = p.y >= l.gridTop && p.y < l.gridTop + l.vr
  if (p.type === 'down' && p.button === 'left') {
    if (onGrid) {
      surface.setState({ ...st, drag: { x0: cell.x, y0: cell.y, x1: cell.x, y1: cell.y } })
      return
    }
    const b = binAt(l, p.x, p.y)
    if (b >= 0) commit(surface, st, act(st.game, { t: 'bin', b }))
    return
  }
  const d = st.drag
  if (!d) return
  if (p.type === 'move') {
    if (d.x1 !== cell.x || d.y1 !== cell.y) surface.setState({ ...st, drag: { ...d, x1: cell.x, y1: cell.y } })
    return
  }
  if (p.type === 'up') {
    const clicked = d.x0 === d.x1 && d.y0 === d.y1
    const game = clicked
      ? act(act(st.game, { t: 'goto', x: d.x0, y: d.y0 }), { t: 'toggle' })
      : act(act(st.game, { t: 'rect', ...d }), { t: 'goto', x: d.x1, y: d.y1 })
    commit(surface, st, game, { drag: null })
  }
}

const Refiner: ClientModule<Props, Local> = (props, surface) => {
  let st = surface.state
  if (!st) {
    st = { game: asGame(props.game) ?? newGame(props.seed), tick: 0, drag: null, view: null }
    surface.setState(st)
    surface.every(140, () => {
      const now = surface.state
      if (now) surface.setState({ ...now, tick: now.tick + 1 })
    })
    surface.onKey(k => onKey(surface, k))
    surface.onPointer(p => onPointer(surface, p))
  }
  const l = place(surface, st)
  return drawBoard(st.game, surface.elements, l, {
    tick: st.tick,
    busy: props.busy,
    files: props.files,
    drag: st.drag,
    help: HELP,
  })
}

export default Refiner

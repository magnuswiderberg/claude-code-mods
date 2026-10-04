import { expect, mock, test } from 'claude-code/testing'

import { act, boardOf, isComplete, newGame, percent, W } from '../hooks/mdr'

const PANE = {
  plugin: 'severance-mdr',
  component: 'Pane',
  requestId: 'mdr',
  props: {
    title: 'Macrodata Refinement',
    isFocused: true,
    bodyColumns: 90,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 30 },
    view: {},
  },
} as const

/** The first scary cell, and a bin with room for its temper. */
function target(seed: number) {
  const board = boardOf(seed)
  const i = board.bad.findIndex(k => k >= 0)
  const k = board.bad[i]!
  const b = board.quota.findIndex(q => q[k]! > 0)
  return { i, x: i % W, y: Math.floor(i / W), b }
}

test('binning a scary number refines it; calm ones are released', () => {
  const g = newGame(42)
  const { x, y, b } = target(42)
  const marked = act(act(g, { t: 'goto', x, y }), { t: 'toggle' })
  const binned = act(marked, { t: 'bin', b })
  expect(binned.done).toHaveLength(1)
  expect(binned.sel).toHaveLength(0)
  expect(binned.msg).toContain('took 1')

  const calm = boardOf(42).bad.findIndex(k => k < 0)
  const wasted = act(act(act(g, { t: 'goto', x: calm % W, y: Math.floor(calm / W) }), { t: 'toggle' }), { t: 'bin', b: 0 })
  expect(wasted.done).toHaveLength(0)
  expect(wasted.msg).toContain('not scary')
})

test('refining every scary number completes the file', () => {
  let g = newGame(7)
  const board = boardOf(7)
  board.bad.forEach((k, i) => {
    if (k < 0) return
    const b = board.quota.findIndex((q, n) => g.bins[n]![k]! < q[k]!)
    g = act(act(act(g, { t: 'goto', x: i % W, y: Math.floor(i / W) }), { t: 'toggle' }), { t: 'bin', b })
  })
  expect(isComplete(g)).toBe(true)
  expect(percent(g)).toBe(100)
  expect(g.msg).toContain('100% complete')
})

test('the terminal refiner takes keys, bins, and keeps the file across opens', async ($, on) => {
  mock.store(on)
  mock.clock(on, { now: 1 })
  const seed = 42
  const { x, y, b } = target(seed)
  for (const surface of ['terminal', 'desktop'] as const) {
    let ui = await $.ui.mount({ ...PANE, surface })
    await ui.resize({ columns: 90, rows: 30 })
    expect(await ui.find({ text: /% Complete/, in: 'refiner' })).toBeDefined()

    // Start a known file, as a refiner posting its save would.
    await ui.post({ game: newGame(seed) })
    await ui.unmount()
    ui = await $.ui.mount({ ...PANE, surface })
    await ui.resize({ columns: 90, rows: 30 })

    const start = newGame(seed)
    for (let n = start.cx; n !== x; n += Math.sign(x - n)) await ui.key({ key: x > n ? 'right' : 'left' })
    for (let n = start.cy; n !== y; n += Math.sign(y - n)) await ui.key({ key: y > n ? 'down' : 'up' })
    await ui.key({ key: ' ' })
    await ui.key({ key: String(b + 1) })
    await ui.advance(500)
    expect(await ui.find({ text: /took 1/, in: 'refiner' })).toBeDefined()

    await ui.unmount()
    ui = await $.ui.mount({ ...PANE, surface })
    expect(await ui.find({ text: /took 1/, in: 'refiner' })).toBeDefined()
    await ui.unmount()
  }
})

test('surfaces without a Client play with buttons', async ($, on) => {
  mock.store(on)
  mock.clock(on, { now: 1 })
  for (const surface of ['vscode', 'mobile'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect(await ui.find({ type: 'Button', key: 'bin0' })).toBeDefined()
    await ui.press({ key: 'bin0' })
    expect(await ui.find({ text: /Select numbers before opening bin 01/ })).toBeDefined()
    await ui.press({ key: 'right' })
    await ui.unmount()
  }
})

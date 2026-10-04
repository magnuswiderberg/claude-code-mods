// Severance MDR: a Macrodata Refinement pane that opens while your agents
// work. Terminal and desktop draw the animated refiner (./refiner.tsx); the
// other surfaces, which have no `Client`, play the same file with buttons.
import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Game } from '../types'
import { act, asGame, drawBoard, isComplete, layout, newGame } from './mdr'
import type { Action } from './mdr'

const PANE = 'mdr'
const TITLE = 'Macrodata Refinement'
const busy = atom({ plugin: 'severance-mdr', key: 'busy' } as const, false)
const board = atom({ plugin: 'severance-mdr', key: 'game' } as const, null)

/** Saves a file and counts it once, the first time it is seen complete. */
async function record($: EngineInterface, game: Game) {
  await $.store.set('game', game)
  if (!isComplete(game) || (await $.store.get('counted')) === game.seed) return
  const files = Number((await $.store.get('files')) ?? 0) + 1
  await $.store.set('counted', game.seed)
  await $.store.set('files', files)
  $.ui.toast(`${game.name} refined. Kier is proud of you. (${files} file${files === 1 ? '' : 's'})`)
  $.ui.invalidate('ui.render')
}

async function isAuto($: EngineInterface) {
  return (await $.store.get('auto')) !== false
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'mdr',
      description: 'Open Macrodata Refinement (/mdr auto on|off to open it with every prompt)',
    })
    await update($, busy, () => false)

    return next(e)
  })

  on('command.run', { command: 'mdr' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    if (arg === 'auto on' || arg === 'auto off') {
      await $.store.set('auto', arg === 'auto on')
      return { text: `MDR will ${arg === 'auto on' ? 'now' : 'no longer'} open while your agents work.` }
    }
    await $.ui.open({ id: PANE, title: TITLE, focus: true, rows: 30 })

    return { text: 'The numbers are waiting. Click the board, then refine.' }
  })

  on('prompt.submit', async ($, e, next) => {
    await update($, busy, () => true)
    if (await isAuto($)) void $.ui.open({ id: PANE, title: TITLE, rows: 30 })

    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    await update($, busy, () => false)
    const panes = await $.ui.panes()
    if (panes.some(p => p.id === PANE && p.isShown)) $.ui.toast('Your agents have finished. You may leave the severed floor.')

    return next(e)
  })

  on('ui.message', { requestId: PANE }, async ($, e) => {
    const game = asGame((e.data as { game?: unknown } | null)?.game)
    if (game) await record($, game)

    return {}
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const isBusy = await read($, busy)
    const files = Number((await $.store.get('files')) ?? 0)
    const saved = asGame(await $.store.get('game'))
    const seed = Math.floor(await $.clock.now())
    const rows = Math.max(16, e.props.scroll.bodyRows)

    if (e.surface === 'terminal' || e.surface === 'desktop') {
      const { Client } = $.ui.resolve(e)
      return (
        <Client
          key="refiner"
          module="./refiner.tsx"
          props={{ game: saved, seed, busy: isBusy, files }}
          width={e.props.bodyColumns}
          height={rows}
        />
      )
    }

    const { Box, Text, Button } = $.ui.resolve(e)
    const shown = (await read($, board)) ?? saved ?? newGame(seed)
    const press = (a: Action) => async () => {
      const game = await update($, board, g => act(g ?? shown, a))
      if (game) await record($, game)
    }
    const l = layout(shown, e.props.bodyColumns, Math.min(rows, 26))
    const help = 'Use the buttons, or focus the pane for hotkeys: w a s d move, e mark, q lasso, 1-5 bin.'

    return (
      <Box flexDirection="column">
        {drawBoard(shown, { Box, Text }, l, { tick: null, busy: isBusy, files, help })}
        <Box flexDirection="row">
          <Button key="up" label="↑" hotkey="w" onPress={press({ t: 'move', dx: 0, dy: -1 })} />
          <Button key="left" label="←" hotkey="a" onPress={press({ t: 'move', dx: -1, dy: 0 })} />
          <Button key="down" label="↓" hotkey="s" onPress={press({ t: 'move', dx: 0, dy: 1 })} />
          <Button key="right" label="→" hotkey="d" onPress={press({ t: 'move', dx: 1, dy: 0 })} />
          <Button key="mark" label="Mark" hotkey="e" onPress={press({ t: 'toggle' })} />
          <Button key="lasso" label="Lasso" hotkey="q" onPress={press({ t: 'lasso' })} />
          <Button key="clear" label="Clear" hotkey="c" onPress={press({ t: 'clear' })} />
        </Box>
        <Box flexDirection="row">
          {[0, 1, 2, 3, 4].map(b => (
            <Button key={`bin${b}`} label={`Bin 0${b + 1}`} hotkey={String(b + 1)} onPress={press({ t: 'bin', b })} />
          ))}
          <Button
            key="new"
            label="New file"
            hotkey="n"
            variant={isComplete(shown) ? 'primary' : 'secondary'}
            onPress={press({ t: 'new' })}
          />
        </Box>
      </Box>
    )
  })
}

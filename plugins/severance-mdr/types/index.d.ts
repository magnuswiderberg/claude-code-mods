/** One of the four tempers a scary number carries: Woe, Frolic, Dread, Malice. */
export type Temper = 'WO' | 'FC' | 'DR' | 'MA'

/** Counts per temper, in the order WO, FC, DR, MA. */
export type Tally = [number, number, number, number]

/** A refinement file in progress: everything else is derived from `seed`. */
export type Game = {
  v: 1
  seed: number
  name: string
  cx: number
  cy: number
  /** Selected cell indices. */
  sel: number[]
  /** Refined (binned) cell indices. */
  done: number[]
  /** Five bins, each filled per temper. */
  bins: Tally[]
  /** The bin last touched, shown in the detail line; -1 for none. */
  last: number
  msg: string
}

declare module 'claude-code' {
  interface PluginState {
    'severance-mdr': {
      /** True while a turn runs: the agents are working. */
      busy: boolean
      /** The file the button-driven board (no `Client` surface) plays. */
      game: Game | null
    }
  }
}

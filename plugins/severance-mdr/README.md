# Severance MDR

Macrodata Refinement for Claude Code. While your agents work, a pane opens with a grid of numbers. Some of them are scary. Find them, box them, and sort them into bins. The work is mysterious and important.

## Install

```
/plugin marketplace add magnuswiderberg/claude-code-mods
/plugin install severance-mdr@magnus-mods
```

## Play

The pane opens each time you submit a prompt. You can also open it yourself with `/mdr`.

Click the board to give it the keyboard. Esc hands the keyboard back to the prompt.

| Key | Does |
| --- | --- |
| Arrows, `hjkl`, `wasd` | Move the cursor |
| Shift+arrows | Paint a selection |
| Space | Mark one number |
| Enter | Mark the 3x3 square around the cursor |
| Mouse drag | Box a region |
| `1`-`5` or click a bin | Send the selection to that bin |
| `c` | Clear the selection |
| `n` | New file, once this one is complete (`N` abandons it) |

Scary numbers give themselves away only when the cursor is near: they turn bold and jitter. Each bin takes a quota of each temper: WO (Woe), FC (Frolic), DR (Dread) and MA (Malice). A full bin refuses the extras, so try another bin. The file is done at 100%. Your progress is saved between sessions.

`/mdr auto off` stops the pane opening on every prompt. `/mdr auto on` turns it back on.

## Good to know

- The animated board with mouse support runs in a terminal and in the Claude desktop app. The VS Code extension shows a simpler button version of the same game.
- The plugin API this mod uses is early access and may change between Claude Code releases. If the pane stops showing after an update, that's probably why.

## Files

| Path | Holds |
| --- | --- |
| `hooks/register.tsx` | `/mdr`, opening the pane, agent status, saving, the button board |
| `hooks/refiner.tsx` | The animated board with keyboard and mouse input |
| `hooks/mdr.tsx` | Game rules and drawing, shared by both boards |
| `types/index.d.ts` | Game types and the state contract |
| `tests/` | Tests |

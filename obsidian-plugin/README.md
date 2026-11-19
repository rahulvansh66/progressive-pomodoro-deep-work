# Progressive Pomodoro for Obsidian

The Progressive Pomodoro timer, inside Obsidian:
1. Start small.
2. Rate your focus.
3. Skip the break if you're flowing.
4. Adjust the next block.

It's the same method and features as the web app in this repo (`frontend/` and `backend/`), with no server.

## Features

- **Timer** (right sidebar):
  - Preset and custom lengths.
  - A category, and any note as the task.
  - Pause with an "are you sure?" prompt and an optional reason.
  - Overrun ("keep on flowing").
  - Rating, next-block suggestion, and break or keep flowing.
  - The timer survives an Obsidian restart.
- **Status bar countdown**, plus a notice and chime when time is up or a break ends.
- **Dashboard**:
  - Period comparison, with stat cards.
  - Focus-minutes chart, category and rating breakdowns, and top tasks.
  - Block-progression curve, yearly heatmap, and goal streak.
- **History**:
  - Filter by date and category.
  - Re-rate a block, edit its note, or delete it.
  - Jump to a block's line in the log.
- **Settings**: rules, presets, log folder, sound, categories (color, rename, archive), and daily goals with effective-from history.
- **Commands**:
  - Open timer, dashboard, or history.
  - Start block.
  - Pause/resume.
  - Finish block.
  - Discard block.

For a walkthrough of every screen, shortcut and setting, see [USAGE.md](USAGE.md).

## Where data lives

| What | Where |
|---|---|
| Sessions | `Pomodoro Log/YYYY-MM-DD.md` in your vault (folder configurable) |
| Settings, categories, goals, running timer | `.obsidian/plugins/progressive-pomodoro/data.json` |

Each session is one list item made of Dataview inline fields:

```markdown
- 09:10:23 [planned:: 5] [actual:: 4.5] [rating:: distracted] [break:: 5] [category:: Work] [task:: [[Write report]]] [note:: Paused: phone call]
```

- `actual` is focused minutes, with pauses excluded.
- `break: 0` means the break was skipped.
- The task is a real link, so a task note's backlinks list its sessions.

You can edit these lines by hand, and the dashboard updates. A line the plugin can't read is skipped, and the dashboard flags it with a link to the file. See `dev-vault/Pomodoro queries.md` for Dataview examples.

## Development

```bash
npm install
npm test          # vitest: progression, stats, log format, store, timer state machine
npm run build     # typecheck + production bundle, installs into dev-vault/
npm run dev       # watch mode, reinstalls on every change
```

- **Test in Obsidian:** open `dev-vault/` as a vault and enable community plugins. The build enables the plugin automatically.
- **Install into your real vault:** set `OBSIDIAN_VAULT` to its path before building, for example `$env:OBSIDIAN_VAULT='D:\Notes'; npm run build`.
- **Windows note:** run the tests from a path with an uppercase drive letter (`F:\...`, not `f:\...`). Otherwise Vitest loads its runner twice and every suite fails with `Cannot read properties of undefined (reading 'config')`.

### Layout

| Path | Purpose |
|---|---|
| `src/logic/` | Pure logic: `progression.ts` and `stats.ts` port the backend's services; `format.ts` reads and writes log lines |
| `src/store/` | `SessionStore` (vault log files, cached and re-parsed on change) and `PluginData` (`data.json`) |
| `src/timer/TimerController.ts` | The timer state machine, shared by the view, status bar and commands |
| `src/views/` | React views (`Timer`, `Dashboard`, `History`) mounted in Obsidian `ItemView`s |
| `src/modals/`, `src/settings/` | Pause, confirm and note-picker modals, and the settings tab |

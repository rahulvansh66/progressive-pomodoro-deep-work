# Progressive Pomodoro: usage guide

A normal Pomodoro timer always gives you 25 minutes. This one adapts to you:

1. **Start small.** The more resistance you feel, the shorter the block.
2. **Rate your focus** when the block ends.
3. **Skip the break if you were in flow.** Otherwise take one.
4. **Adjust the next block** up, down or the same, based on the rating.

The goal is to build up gradually into flow, not to force 25 minutes on a bad day.

---

## 1. Quick start (2 minutes)

1. Click the **timer icon** in the left ribbon, or press `Ctrl+Alt+T`. The timer opens in the right sidebar.
2. Pick a **category** (optional), and optionally click **Pick task note…** to choose the note this block is for.
3. Tap a length, for example **5**. The countdown starts.
4. Work. When you're done, or the timer rings, click **Finish block**.
5. Choose how focused you were, and follow the suggestion for the next block.

Your block is saved as a line of text in `Pomodoro Log/<today>.md`.

---

## 2. The timer, screen by screen

### Start screen
- **Category**: groups blocks in your stats. Manage categories in Settings.
- **Pick task note…**: choose any note in your vault. The block is logged as a link to it, and the block appears in that note's **Backlinks** panel. Click ✕ to clear it.
- **Length buttons**: tap one to start straight away. Change the set in Settings → *Preset lengths*.
- **Custom**: use − and + to set any length, then **Start**.
- The line at the top shows how many minutes you've focused **today**.

### While a block runs
- A ring counts down. When time is up it shows `+mm:ss` and "still flowing? keep going". You'll also get a notice and a chime, once.
- **Pause** asks "Do you really need to interrupt this block?", with an optional note for what's pulling you away. The clock stops while paused, and the note is saved with the block.
- **Finish block**: stops the clock and takes you to rating. Use it whenever you're done, early or late.
- **Discard**: throws the block away after a confirmation. Nothing is saved.
- The **status bar** (bottom right) shows the countdown while you work in other notes. Click it to jump back to the timer.

### Rating
Pick the one that fits, and be honest. It's fine to be distracted, because the system adapts.

| Rating | Meaning | Next block (default) | Break |
|---|---|---|---|
| 😵 Distracted | Couldn't settle | 60% of this one (never below the minimum) | Yes |
| 🙂 Okay | Steady | Same length | Yes |
| 🎯 Highly focused | Momentum building | +5 minutes | Yes |
| 🔥 Flow | Lost track of time | +10 minutes | **Skipped**: keep going |

You can type an optional note before choosing.

### After rating
- You'll see a message and a suggested next length. Change it with the length buttons, − / +, or **Suggested N**.
- After a non-flow block: **Take a 5-minute break**, or **Skip break, start next block**.
- After a flow block: **Keep flowing → N m block** starts the next block right away. **Take a break anyway** is there if you need one.
- **Save & go home** (top right) saves this block and returns to the start screen, without starting anything.

> **Your block is saved when you make one of these choices.** If you rate it but close Obsidian before choosing, the timer remembers where you were and you can pick up where you left off.

### Break
A countdown runs, and you get a notice and chime when it ends. **End break & set up next block** returns you to the start screen with the next length already selected.

---

## 3. Commands and shortcuts

Open the command palette with `Ctrl+P` and type "Progressive Pomodoro". The commands below also have shortcuts in your vault. You can change them in **Settings → Hotkeys**.

| Command | Shortcut | Available when |
|---|---|---|
| Open timer | `Ctrl+Alt+T` | always |
| Start block (uses the selected length) | `Ctrl+Alt+S` | no block running |
| Pause / resume block | `Ctrl+Alt+P` | a block is running |
| Finish block and rate it | `Ctrl+Alt+F` | a block is running |
| Open dashboard | `Ctrl+Alt+D` | always |
| Open history | `Ctrl+Alt+H` | always |
| Discard block | none | a block is running or being rated |

---

## 4. Dashboard

Open it with `Ctrl+Alt+D`. Everything compares the period you're viewing with the one before it.

- **Day / Week / Month / Year**, with ◀ ▶ to move and **Today** to jump back.
- **Category filter** to look at one area of your life.
- **Stat cards**: focus time, number of blocks, average and longest block, flow rate (% of blocks rated flow), average focus (1 to 4), active days, and goal days met. The ▲ ▼ shows the change against the previous period.
- **Daily goal** and **Goal streak**: how many days you've hit your target, and your current and longest run.
- **Charts**:
  - Focus minutes now versus the previous period.
  - Time by category.
  - Category comparison.
  - How many blocks you rated each way.
  - Your top tasks.
- **Block progression** shows the blocks of one day, as planned length against actual, with dots coloured by rating. It's the "start small, grow into flow" curve for that day.
- **Year heatmap**: darker squares are days with more focus.

If a yellow box says some log lines are unreadable, click the file name in it to fix them. They're skipped in the stats until you do.

---

## 5. History: fixing and reviewing blocks

Open it with `Ctrl+Alt+H`.

- Filter by date range and category.
- Change a block's **rating** from its dropdown, or edit its **note** and click away to save.
- **Delete** removes a block after a confirmation.
- Click a block's date to open the log file at that exact line.

---

## 6. Settings

Open **Settings → Progressive Pomodoro**.

- **Rules**: default start, minimum and maximum block, the "highly focused" and "flow" increases, and break length. These drive the suggestions above.
- **Preset lengths**: the buttons on the start screen, comma separated. Three fit per row.
- **Log folder**: where daily logs are written (default `Pomodoro Log`). Existing logs aren't moved when you change it.
- **Sound**: turn the chime on or off.
- **Categories**: add, recolour, rename, archive or delete. Renaming also updates your past logged blocks. Archiving hides a category from the timer but keeps its history. Deleting keeps past blocks' category names.
- **Daily focus goals**: set an overall goal or one per category, in minutes per day. A new goal applies from today onward, so past days keep the goal they had.

---

## 7. Your data

Each block is one line in `Pomodoro Log/YYYY-MM-DD.md`:

```markdown
- 09:10:23 [planned:: 5] [actual:: 4.5] [rating:: okay] [break:: 5] [category:: Work] [task:: [[Write report]]] [note:: Paused: phone call]
```

| Field | Meaning |
|---|---|
| time at the start | when the block started (also its identity) |
| `planned` | minutes you set |
| `actual` | focused minutes, with paused time excluded |
| `rating` | `distracted`, `okay`, `focused` or `flow` |
| `break` | break minutes taken. `0` means skipped |
| `category`, `task`, `note` | only present if set |

- You can edit these files by hand, and the dashboard updates.
- If you break a line's format, it's skipped and flagged on the dashboard.
- Settings, categories, goals and the running timer are kept separately in the plugin's `data.json`.
- To back up or move your history, copy the `Pomodoro Log` folder.
- Because tasks are links, a task note's **Backlinks** panel (right sidebar) lists every block you spent on it.
- If you later install the **Dataview** community plugin, those fields can be queried and totalled inside any note.

---

## 8. Tips for using the method well

- Start the day small, 2 to 5 minutes, especially when you feel sluggish. The only goal of the first block is to begin.
- Don't chase long blocks. Let the ratings move your length up.
- If the timer rings while you're in flow, **don't stop**. Keep going and finish the block when you're ready.
- Rating "distracted" is useful data, not a failure. The next block gets shorter, so starting stays easy.

---

## 9. Troubleshooting

| Problem | Fix |
|---|---|
| No timer icon | **Settings → Community plugins**: turn off Restricted mode, and make sure *Progressive Pomodoro* is switched on |
| A shortcut does nothing | Check **Settings → Hotkeys** for a conflict. Some keyboard layouts treat `Ctrl+Alt` as a character key |
| Dashboard shows nothing | You haven't saved a block yet in the period or category you're viewing, or the log folder setting was changed |
| "N unreadable lines" | Open the named file and fix the format of that line. The format is in section 7 |
| Timer seems wrong after sleep or restart | It's based on start time, so it stays correct. The block will just show as overrun |
| On mobile | The timer is accurate, but the notice and chime can arrive late while Obsidian is in the background |

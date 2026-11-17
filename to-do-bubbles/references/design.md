# Bubbles design notes

Read before changing the layout or style (mode 2).

## Files

| File | Role |
|---|---|
| `index.html` | Shell only: title, `bubbles.css`, `bubbles.js`. `bubbles.js` injects all markup. |
| `bubbles.css` | All styling. Colours are CSS variables on `:root`. |
| `bubbles.js` | The whole app, no dependencies, no build step. |
| `serve.py` | Localhost backend (see the docstring for its API). |
| `demo.html` | `index.html` plus demo data in `<script id="embedded">`. |

## Code map (`bubbles.js`)

| § | Section | Contents |
|---|---|---|
| 1 | state + model | `doc` (whole document), `data` (sheet on screen), hour helpers, `totals()` |
| 2 | server sync | `load` / `save`, the 3 s poll for outside edits |
| 2b | sheets | tabs, colour families, archiving |
| 3 | physics | bubble sizes, clustering by tag, soft pull back into view |
| 4 | canvas drawing | glow, progress rings, "not planned yet" dashed bubbles |
| 5 | canvas input | hover, click, hold-to-pop |
| 6 | list view | per-tag boxes under the canvas |
| 7 | done drawer + calibration | estimate vs. actual plot and histogram |
| 8 | card + dialogs | to-do card, add/edit dialogs |
| start | mode selection | embedded data → demo; localhost → `serve.py`; otherwise → artifact database |

## Storage modes

Picked at start-up, in this order:
1. **Demo**: the page holds `<script id="embedded">`. Changes stay in that browser's `localStorage`.
2. **Localhost**: the host is `localhost` or `127.0.0.1`. Talks to `serve.py`.
3. **Artifact**: anything else. Reads and writes the document `tracker/main` through `window.claude.use("db")`.

## Design decisions (keep them unless the user asks otherwise)

- **No deadlines, reminders or "overdue" state.** This is non-negotiable (see SKILL.md).
- **Sheets are archived, never deleted**, and the page has no way to restore one.
- **Hold to act:** popping a bubble, finishing a tag and archiving a sheet all need an 800 ms hold (`HOLD_MS`), so nothing happens by accident.
- **Hours** are in 15-minute steps and always shown as decimals (`1.5 h`, never `1:30`).
- **Random layout on every load:** bubble order is reshuffled each time so no to-do always sits in the same corner.
- **"Poofed" to-dos** are hidden for the current visit only and come back on reload.
- **Which sheets are shown** is stored per browser, so two people viewing the same tracker never change each other's view.
- **Colours:** with one sheet open, tags get clearly different hues; with several open, tags use shades of their sheet's colour family.
- **The status line stays quiet** and only shows errors.
- **Dark theme only** (`--bg: #1a1d22`, accent `#3f78e0`).
- **The favicon is drawn by `bubbles.js`**, so every tracker gets it without editing `index.html`.
- **Old documents keep loading:** top-level `tags`/`todos` become one sheet called "Main".

## Checking a change

1. Serve `demo.html` (for example `python3 -m http.server` in `assets/`) and open it. Check:
   - bubbles settle and cluster by tag;
   - holding a bubble pops it and asks for the real time;
   - the list boxes and the done drawer render;
   - switching sheets works, and shift-click shows several at once.
2. Watch the browser console: there must be no errors.
3. For localhost changes, run `serve.py` with a scratch `projects/test.json`. Make an edit and confirm that a backup appears in `projects/.backups/test/`. Then edit the JSON file by hand and confirm the page reloads it within about 3 s.
4. Load an old one-sheet document and confirm it still opens.

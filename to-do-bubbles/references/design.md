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
| 2a | shared trackers | `merge3` / `mergeList` (three-way merge), `saveDb`, `goReadOnly` |
| 2b | sheets | tabs, drag-to-reorder (`startTabDrag`), colour families, archiving |
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

## Shared artifact trackers

- **Who may write** is set by the database rule `{"path": "", "read": "view", "write": "interact"}`.
  At start-up the page asks `user.can("data.write")`. If the answer is `false`, or a save is refused,
  it switches to view only (`goReadOnly`):
  - it adds the `ro` class to `<body>`, which hides the add, archive and delete controls;
  - every editing entry point returns early;
  - `changed()` puts back the last saved document instead of saving.
- **Saving merges, it never overwrites blindly.** `base` is the document as last read from the database.
  A save (`saveDb`):
  1. takes a 2 s lease on `tracker/lock`, so two saves never interleave;
  2. reads the latest `tracker/main`;
  3. three-way merges `base`, this view and the latest version (`merge3`);
  4. writes the result;
  5. folds any edits made during the save back in.
- **How `merge3` decides:**
  - lists of items with an `id` (sheets, tags, to-dos) merge item by item. Adding or deleting items doesn't
    count as reordering. If only one side changed the order of the items, its order wins; if both did, the
    latest saved order wins. Items added on the other side stay next to the item they followed;
  - objects merge key by key;
  - any other value is taken from whichever side changed it, and from this view if both did;
  - an item deleted on one side and changed on the other is kept, so nothing is lost silently.
- The lease only coordinates pages that use it. Claude writing through its own database tools doesn't
  take it, which is why SKILL.md asks for the read and the write right after each other.

## Design decisions (keep them unless the user asks otherwise)

- **No deadlines, reminders or "overdue" state.** This is non-negotiable (see SKILL.md).
- **Sheets are archived, never deleted**, and the page has no way to restore one.
- **Nesting by drag:** dragging a list row (6 px threshold, listens on the window like tab drags) onto another top-level row of the same sheet makes it a sub-to-do; dropping a sub-to-do on a box outside the rows un-nests it. The lists don't re-render during a drag, and the click that ends a drag does nothing.
- **Tag pickers hide finished areas** (`pickable()`), except a tag the to-do already has.
- **Sheet order is the order of `doc.sheets`.** Dragging a tab sideways moves its sheet, and a vertical line
  marks where it will land. The drag listens on the window, because a fast drag leaves the tab at once,
  and the click that ends a drag does nothing. View-only viewers can't drag.
- **Hold to act:** popping a bubble, finishing a tag and archiving a sheet all need an 800 ms hold (`HOLD_MS`), so nothing happens by accident.
- **Hours** are in 15-minute steps and always shown as decimals (`1.5 h`, never `1:30`).
- **Tag estimates are optional** (`estimate_h: null`); to-do estimates are required. The new-tag dialog's stepper goes one step below 1 h to "no estimate" (`stepper(..., none)`).
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
3. For changes to saving or to view only, test `merge3` and `saveDb` against a fake database in Node,
   with two clients saving at the same time, and confirm both edits survive. Call `goReadOnly()` in a page
   and confirm that edits are neither saved nor offered.
4. For localhost changes, run `serve.py` with a scratch `projects/test.json`. Make an edit and confirm that a backup appears in `projects/.backups/test/`. Then edit the JSON file by hand and confirm the page reloads it within about 3 s.
5. Load an old one-sheet document and confirm it still opens.

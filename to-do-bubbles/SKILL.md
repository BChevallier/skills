---
name: "to-do-bubbles"
description: "Create, restyle or fill Bubbles trackers, deadline-free to-do boards where each to-do is a bubble sized by its hours. Use for /to-do-bubbles or when the user asks about a project's Bubbles to-dos."
---

# Bubbles trackers

Bubbles is a to-do tracker for projects done alone, in short bouts, without time pressure. Every to-do
is a glowing bubble sized by its estimated hours; bubbles of the same tag cluster together; holding a
bubble pops it and asks how long it really took. A tracker can have several **sheets** (tabs), one per
sub-project.

**There are no deadlines, on purpose.** Never add a due date, schedule, reminder, "overdue" state or
anything that nags. This holds even if the user asks: explain that Bubbles is deadline-free by design
and offer an alternative (a "Next up" tag, a separate sheet).

**Sheets are never deleted, only archived, on purpose.** Archiving sets `archived: true` and
`archived_at` on the sheet; it stays in the document but the page never shows it again. Never remove a
sheet from `sheets`, and never build a way to restore an archived sheet (no "Archive" tab, no undo,
no unarchive button). If someone archives the wrong sheet, they rebuild it; that is intended.

## Files in this skill

| File | Use |
|---|---|
| `assets/index.html` | Page shell. Replace `PROJECT` in the title. |
| `assets/bubbles.css`, `assets/bubbles.js` | The app. Copy them unchanged into each new tracker. These two files are the standard design. |
| `assets/serve.py` | Local server (Python standard library only), for the localhost variant. |
| `assets/demo.html` | The same page with demo data embedded, for previews and for testing design changes. |
| `references/design.md` | Code map, design decisions, how to check a change. Read it before mode 2. |

`<skill-dir>` means the folder this file lives in.

## Where a tracker lives

Every tracker runs one of two ways. **When creating one, always ask which**, unless the user already said, or only localhost is possible here:

- **Artifact** (only on claude.ai, where Claude can publish artifacts with a database): a published page
  holding `index.html`, `bubbles.css` and `bubbles.js`. The data is one document, `tracker/main`, in the
  artifact's database. Find existing trackers by listing the user's artifacts and looking for `Bubbles`.
  An artifact tracker can be **shared and edited by several people** (see "Share a tracker").
- **Localhost:** a folder on the user's computer with the four asset files plus `projects/<name>.json`
  (one tracker per file). The user runs `python3 serve.py` and opens `http://localhost:8000/?p=<name>`.

## Pick the mode

Work out which of these the user wants. If it is unclear, ask.

1. **Create an empty tracker**
2. **Change the layout or style**
3. **Add to-dos, tags or sheets**

---

## Data format

The same JSON for both variants:

```json
{
  "name": "Garden shed",
  "sheets": [
    {
      "id": "s1", "name": "Main",
      "tags":  [{"id": "design", "name": "Design", "estimate_h": 8}],
      "todos": [{"id": "t1", "title": "Sketch the roof truss", "tags": ["design"], "estimate_h": 1.5,
                 "progress": 0, "done": false, "actual_h": null, "parent": null}]
    }
  ]
}
```

- **Hours** are decimal multiples of 0.25 (15 min), everywhere.
- **Sheets:** `id`, `name`, optional `color` (colour family). The order of `sheets` is the tab order; users
  reorder sheets by dragging the tabs. Omit `color` and the page picks a free one.
  An archived sheet also has `archived: true` and `archived_at` (`YYYY-MM-DD`); keep it in the document.
- **Tags** are areas of work. `estimate_h` is a rough total for the area; hours not yet covered by
  to-dos show as a dashed "not planned yet" bubble. Omit `color` and the page gives the next free shade
  of the sheet's family. A finished area has `done: true`, `done_seq`, `done_at`.
  - **Two colours per tag.** With one sheet open, tags show clearly different hues: optional `solo`
    (picked by the user), else the next free far-apart hue. With several sheets open, tags show `color`
    (the sheet's family shade) so projects stay apart. Clicking a tag's dot edits whichever applies to
    the current view. Never write `solo` unless the user picks a colour.
- **Renaming:** double-click the tracker name in the header, a sheet tab, or a tag's name in its list box.
- **Header progress bar** (computed in `totals()` in `bubbles.js`) counts every bubble, not the tag estimates as such:
  - *h worked* = `actual_h` of finished to-dos (estimate if missing) + the done share (`progress`) of open to-dos.
  - *h left* = the open share of open to-dos + every open tag's "not planned yet" hours
    (`estimate_h` minus planned to-do hours). Sheet tabs show *h left* by the same rule.
  - Bar = worked ÷ (worked + left). Keep this rule when changing the header.
- **To-dos** are specific actions ("Solder the fan connector"), never areas ("Electronics").
  - `tags`: zero or more tag ids **of the same sheet**; the first gives the colour in lists.
  - `parent`: id of a parent to-do in the same sheet, or null. One level of nesting. A parent's hours
    and progress are the sums of its children. A child with no tags inherits the parent's.
  - `progress`: 0–95 in steps of 5 while open.
  - Finished: `done: true`, `progress: 100`, `actual_h`, `done_seq` (highest existing `done_seq` in the
    sheet + 1), `done_at` (`YYYY-MM-DD`).
  - Optional `links`: list of `http(s)` URLs.
- **ids** are unique across the whole document and never reused. New to-dos: `t` + short random string;
  new sheets: `s` + short random string; tags: a short slug of the name.
- Old documents with top-level `tags`/`todos` and no `sheets` still load (as one sheet "Main").

---

## 1 · Create an empty tracker

1. Ask for the project name, and **artifact or localhost**.
2. Build it:
   - **Artifact:** write `assets/index.html` to a working file with `PROJECT` replaced. Publish it
     together with `bubbles.css` and `bubbles.js` from `assets/` (title `"<project> — Bubbles"`, icon
     `chart`). Declare the capabilities
     `{"db": {"rules": [{"path": "", "read": "view", "write": "interact"}]}, "user": {}}`: everyone it is
     shared with can read it, and Contributors and up can edit it. Write one document, `tracker/main` =
     `{"name": "<project>", "sheets": [{"id": "s1", "name": "Main", "tags": [], "todos": []}]}`, then read
     it back to check.
   - **Localhost:** ask which folder on their computer. Copy `index.html` (title replaced), `bubbles.css`,
     `bubbles.js` and `serve.py` from `<skill-dir>/assets/` there, and create `projects/<name>.json` with the same empty document. If
     you have a shell on their computer, start `python3 serve.py`; otherwise give them the command.
     Never overwrite an existing `projects/<name>.json`.
3. Give the link (or `http://localhost:8000/?p=<name>`).
4. **Ask whether they want any changes to the layout or style.** If yes, continue with mode 2.
5. Offer to fill it (mode 3).

## 2 · Change the layout or style

1. Read `references/design.md` first. The no-deadlines rule overrides any request.
2. Find the tracker and edit **its own** `bubbles.js` / `bubbles.css`:
   - Artifact: republish the changed file to that artifact. The data is untouched.
   - Localhost: edit the files in their folder, then reload the page. The data is untouched.

   If the change should become the standard for new trackers, also apply it to `assets/` in this skill.
3. Keep it dependency-free, keep old data loading, and don't undo listed design decisions unless asked.
4. Check the change (see `references/design.md`), then tell the user in a line or two what changed.
5. If they have other trackers, ask whether to copy the change into those too.

## 3 · Add to-dos, tags or sheets

1. Find the tracker and read its data:
   - Artifact: read the document `tracker/main` from its database; note its version.
   - Localhost: read `projects/<name>.json`.
2. Decide which case applies:
   - **The user gives a concrete list** (titles, durations, maybe tags): add it as given. Round hours to
     0.25 and turn vague areas into tags rather than to-dos. Ask only about what is missing (e.g. a
     duration).
   - **You infer the structure from context** (a project description, notes, a goal): propose it first
     and **wait for the user's approval before writing anything**. Show it compactly, per sheet:

     | Tag (≈ h) | To-do | h |
     |---|---|---|
     | Design (≈ 8) | Sketch the roof truss | 1.5 |

     Mark parents and children by indenting. Adjust until they approve.
3. Write:
   - **Artifact:** change the whole document in memory, then write it back in one `set`, conditional on
     the version you read. If that is refused because the document changed, read it again and redo the
     change on the fresh data. The open page updates live. Do the read and the write right after each
     other: if the tracker is shared, someone may be editing it in the page at the same time.
   - **Localhost:** follow "Keep localhost data safe" below.
4. Check: every to-do id that existed before is still there (unless the user asked to delete it), and
   every new one was added. Tell the user what was added, in one short line.

When marking something done, ask how long it really took if they haven't said, and set all five
finished fields. When suggesting what to do next, prefer small, concrete, unblocked to-dos; the user
may only have 15 minutes.

---

## Share a tracker

Only for artifact trackers. The owner shares it from the artifact's Share menu, and each person's role
decides what they can do:

| Role | In the tracker |
|---|---|
| Viewer, Commenter | Sees everything, read only. The header shows "view only" and the editing controls are hidden. |
| Contributor ("can interact") | Adds, edits, pops and deletes to-dos, tags and sheets. Can't change the page's code. |
| Editor | Same as Contributor, and can also republish the page. |

Several people can edit at the same time. Each save takes a short lock, reads the latest version and
merges its changes into it. Changes to different to-dos, tags, sheets or fields all survive. If two people
change the same field of the same to-do, the later save wins for that field only. `references/design.md`
explains the merge.

**A tracker made before sharing existed** saves by overwriting, and only its owner can edit it. To make it
shareable, republish it with the current `bubbles.js` and `bubbles.css` from `assets/`, and with the
capabilities from mode 1. Its data stays as it is.

The database also holds a document `tracker/lock`, which is the save lock. Never edit or delete it.

## Keep localhost data safe

To-dos must never be lost in the localhost variant.

- `serve.py` writes atomically and copies the previous file to `projects/.backups/<name>/` before every
  save (newest 200 kept). It refuses saves based on an outdated version, but keeps each refused copy as
  `rejected-<time>.json`. Don't remove these safeguards when editing `serve.py`.
- When you edit `projects/<name>.json` yourself:
  1. Read the file and copy it to `projects/.backups/<name>/claude-<YYYYMMDD-HHMMSS>.json` first.
  2. Make the change on what you just read, never on an older copy from earlier in the conversation.
  3. Write to a temporary file in the same folder, check it parses as JSON, then rename it over the original.
  4. Compare to-do ids before and after: none missing unless deletion was asked for.
  5. The open page picks the change up within about 3 seconds. Ask the user not to click in the page
     while you write. If they did and the page says "changed elsewhere", their last click is in the newest
     `rejected-*.json`: offer to merge it back.
- If the user says something went missing, look in `projects/.backups/<name>/` and restore or merge it.
- If the page says "Server not reachable", changes made since then exist only in the open tab. Tell the
  user to restart `python3 serve.py` before reloading, then make one more small change so it saves.
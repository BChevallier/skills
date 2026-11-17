---
name: create-presentation
description: Build or rework a reveal.js presentation (talk, deck, slides) in a minimal house style. The style is true black and left-aligned, opens with a hook and ends with a callback, closes with Inspiration and Sources slides, puts the detail in speaker notes written in the speaker's voice, and uses figures in light and dark versions. Decks are served locally only. Use whenever the user wants to create, start, draft, restructure or extend a presentation, talk, deck or slides, or turn a draft, outline or analysis into a reveal.js deck, even if they don't say "reveal.js".
---

# create-presentation

Made for talks to a lay audience by someone who learns by explaining. The deck is **the speaker's own thinking**: they write the first draft, and Claude reworks it into slides, layout, figures and notes.

`<skill-dir>` means the folder this file lives in. Read these before building:
- `references/style.md`: the house style (look, structure, notes, figures, closing slides, code rules). Follow it.
- `references/patterns.md`: copy-paste HTML for the reveal patterns.
- `assets/template.html`: the starting `index.html`, including the next-slide cue.

## Step 1 — Draft and context

- Ask for the user's draft if they haven't given one (text, outline, bullets or a voice-note transcript). Don't invent the talk. A bare topic is not enough: ask for the draft.
- Settle the **language** and the audience. All slide text, including the closing-slide titles, is in that language.
- **Where it lives:** if the talk belongs to an existing repo (an analysis, paper or project), put it in that repo's `presentation/` folder, or in the repo root if the repo *is* the talk. Otherwise use `presentations/<slug>/` in the current working folder. If the folder has a CLAUDE.md or similar project notes, read them first and follow their conventions.
- If the repo already has its own deck setup (a bundler, components, an existing deck), use that setup instead of the template. The style rules still apply.

## Step 2 — Rework the draft

Reworking means:
- splitting the draft into one-idea slides;
- shortening sentences and choosing titles;
- deciding what becomes a fragment, a figure, an animation or a speaker note;
- fixing the arc: hook → build-up → payoff → callback.

It does **not** mean adding claims, examples or jokes the user didn't write. Suggest what's missing in chat and mark the slot `[...]` on the slide. The user's short phrasing beats a polished rewrite.

Afterwards, list briefly what you changed and why (cut, merged, moved to notes, reworded), so the user can revert anything.

## Step 3 — Serve locally and check

- **Local only** until the user explicitly says to publish: no GitHub Pages, no pushing, no hosted preview.
- Serve the deck folder over HTTP, because `file://` breaks relative media. For example, run `python3 -m http.server <port> --directory <deck folder>` on a free port. If the environment has a preview or launch configuration (such as `.claude/launch.json`), add the server there.
- Step through every slide and take screenshots. In a browser you can drive, `Reveal.slide(h, v)` jumps to a slide, and `Reveal.slide(h, v, 99)` also shows all its fragments. Check that:
  - titles sit at the same height on every slide;
  - nothing overflows the 960×700 frame;
  - figures are readable on black;
  - links work;
  - the console shows no errors;
  - the next-slide cue is on exactly when the next press changes slide.

  Fix any problems, then show the user screenshots of the slides that changed.
- Give the user the local URL and tell them that `S` opens speaker view.

## Step 4 — Iterate

Expect close review of details such as alignment, animation timing and link colour. Change only what the user points at, take new screenshots, and keep any project changelog up to date.

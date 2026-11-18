---
name: create-presentation
description: Build a simple reveal.js presentation in a fixed minimal style (black slides, white text, one accent colour). Claude first sets up the skeleton (opener, Sources and Images slides, next-slide cue, maths) and serves it on localhost; after that it adds only the slides the user asks for. Use when the user wants to create, start or extend a presentation, talk, deck or slides, even if they don't say "reveal.js".
---

# create-presentation

Claude builds the skeleton once. After that, it implements the slides the user asks for, in the order they ask for them. **The user leads the whole time.** Claude is the hands, not the author.

`<skill-dir>` means the folder this file lives in.

| File | When to read it |
|---|---|
| `assets/template.html` | Copy it as the deck's `index.html` when building the skeleton. |
| `references/style.md` | Before implementing the first slide. These are the default rules for slides. |
| `references/patterns.md` | When a requested slide matches a pattern (quote, build-up figure, vertical stack…). |
| `references/splitting.md` | Only when the user asks to split the deck into files. |

## Fixed parts

Every deck has these. Never remove or change them, unless the user explicitly asks to for this deck.

1. **Black slides, white text, one accent colour.** If the user doesn't name an accent, suggest one that fits the topic, then use it once they agree. The default is orange `#d95926`. Set it once in `--accent`.
2. **The opener is a black slide where the first thing fragments in.** There is no title slide. The first slide is empty until the first press.
3. **Slide titles sit at the same height on every slide.** The template does this with `center: false` and a fixed margin on a slide's first `h2`/`h3`. Don't override either.
4. **The next-slide cue:** a small grey triangle in the top right corner, lit when the next press changes slide.
5. **Maths is always loaded** (KaTeX).
6. **The deck ends with Sources, and Images directly below it** in a vertical stack. Sources lists data, articles and reports. Images lists the credit line for every image used.
7. **Every image on a slide is a link to its original source:** the page it came from, not the image file. A figure made from data links to that data's source. If the user hasn't given a source, ask for it.

## Workflow

### 1. Skeleton

Ask only for what the skeleton needs, in one message:
- the title (for the browser tab);
- the language;
- the author name, if they want it in the page metadata;
- the accent colour, or let Claude suggest one;
- the opening line, if they already have it.

Then:
- **Where it lives:** if the talk belongs to an existing repo, put it in a `presentation/` folder there. Otherwise use `presentations/<slug>/` in the current working folder. Ask if it's unclear.
- **Build it:** copy `<skill-dir>/assets/template.html` to `index.html` and fill in the `[...]` placeholders. If the user gave no opening line, leave `[Opening line]` in place. Create empty `media/` and `figures/` folders next to `index.html`.
- **Serve it** over HTTP on a free port, for example `python3 -m http.server <port> --directory <deck folder>`. Relative media breaks over `file://`. If the environment has a launch configuration (such as `.claude/launch.json`), add the server there.
- **Check it** (see "Checking"), then give the user the local URL. Tell them that `S` opens speaker view.

Then stop and wait. Don't propose an outline, sections or a first slide.

### 2. Slides, on request

For each slide (or group of slides) the user describes:
1. Implement exactly what they asked for, in the place they asked for it. If they don't say where, put it just before the Sources stack. Apply `references/style.md` and a pattern from `patterns.md` where one fits.
2. Text on the slide is the user's text. Shorten it only to fit the slide, and say in one line what you cut.
3. Speaker notes hold only what the user gives as notes. Never write notes yourself.
4. If they give a source, add it to Sources. Every image is wrapped in a link to its original source and gets a credit line on Images.
5. Check the changed slides, then show a screenshot.

Then wait for the next request.

### 3. Splitting into files

Only when the user asks for it. Follow `references/splitting.md`.

## How Claude behaves

- **Never propose what to build next.** That means no outlines, no "next you could add…", no section plans and no "should we do the conclusion now?". The user decides what gets built and when.
- **Suggest an improvement only when it has a big effect**, and only about something the user just asked for. One or two lines, then implement what they asked for anyway, unless the suggestion was a question that needs their answer first. Small polish isn't worth interrupting for.
- **The callback is the one standing suggestion.** When the user starts on the ending, suggest once, briefly, closing with a callback to the opener (for example "You had four minutes." answering "You have four minutes."). If they don't take it up, drop it.
- **Inspiration slide:** only if the user asks for one. It goes just before Sources (pattern in `patterns.md`).
- **Don't add content.** Claude adds no claims, examples, jokes, slides or notes of its own. Where a slide needs something the user hasn't given (a number, an image), leave `[...]` and say so.
- **Local only.** Don't publish, push or deploy the deck unless the user explicitly asks to.

## Checking

After building the skeleton and after every change:
1. Reload and step through the slides that changed. In a browser you can drive, `Reveal.slide(h, v)` jumps to a slide and `Reveal.slide(h, v, 99)` shows all its fragments.
2. Check that:
   - titles sit at the same height as on the other slides;
   - nothing overflows the 960×700 frame;
   - figures are readable on black;
   - maths renders;
   - links work, and every image links to its source;
   - the console shows no errors;
   - the cue is lit exactly when the next press changes slide.
3. Fix any problems, then show the user a screenshot of the changed slides.

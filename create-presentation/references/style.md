# Default style for slides

These defaults apply when implementing a slide the user asked for, unless the user says otherwise. The fixed parts (black, accent, opener, title height, cue, maths, Sources and Images) are in SKILL.md and are not up for debate. The HTML for the patterns named here is in `patterns.md`.

## Layout
- **Left-aligned.** Centre only quote slides, section dividers, single big statements and full-slide figures (class `centered`).
- **Headings are never uppercased.**
- **Quotes** use `<blockquote>`, with the attribution linked to its source.
- **The accent colour is used sparingly:** a key number or a punchline word, nothing else.
- **Section dividers** are a centred `<h2>` alone on a slide.

## Text
- **Few words.** Titles are short sentences or questions, often ending with a full stop ("It follows the model.", "What makes a fish a fish?").
- **Bullets:** one idea each, one line if possible, revealed one at a time with `class="fragment"`.
- **Detail goes in the speaker notes**, if the user provides it. Never write notes yourself.

## Reveal features
- **Vertical stack** for a claim and its explanation below, or for backup and drill-down slides.
- **`data-auto-animate`** when the same object changes between two slides.
- **`r-stack` with fragments** to build a figure up step by step.
- **A `*` footnote** for a dry aside.
- **`highlight-current-green` or `semi-fade-out`** to point at words.

## Figures
- **Charts and diagrams** are made by scripts kept in the deck folder or the project, never edited by hand. To change a figure, change its script.
  - Save every figure in a light and a dark version (`<name>_light.*`, `<name>_dark.*`).
  - Slides use the `_dark` one, with a figure background of exactly `#000` so it sits flush with the slide.
- **Generated figures** go in `figures/`. Photos and other media go in `media/`. Use relative paths only.
- **Every `<img>`** has a real `alt` text and is wrapped in `<a href="[original source]" target="_blank" rel="noopener">`. This rule is fixed (see SKILL.md).

## Images
- **Use only images that may be published online:** public domain, CC0, CC BY or CC BY-SA. Check the licence on the image's own page, not just in search results. If an image-sourcing skill is installed, use it.
- **Every image gets a credit line on the Images slide:** title linked to its page, author, licence linked, and where it came from. A figure redrawn from someone else's chart is credited "redrawn from <source>, data from <origin>".
- **If a requested image isn't freely licensed,** say so, and offer to link to it or redraw it from the data instead.

## Sources
- **Sources lists** data sets (with their licence), articles and reports used on the slides.
- **If it doesn't fit on one slide,** continue below in the same vertical stack ("Sources II"), above Images.

## Code
- **One `index.html`**, built from the template. reveal.js is pinned from jsDelivr, with no build step.
- **Deck-specific CSS** goes at the end of the `<style>` block and uses the template's variables.
- **Each slide** gets an HTML comment above it saying what it is and which script makes its figure.

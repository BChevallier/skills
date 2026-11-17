# House style

`<skill-dir>` means the skill folder. The code for the reveal patterns is in `patterns.md`.

## Look
- reveal.js 5.x, `black` theme, **true black** background (`#000`). Headings never uppercased.
- **Left-aligned** unless the user asks otherwise. Slide titles sit at the **same height on every slide** (the template does this; reveal's vertical centring is off).
- Centred only for: quote slides, section dividers, single big statements, full-slide figures (class `centered`).
- Quotes = `<blockquote>` (soft `rgba(255,255,255,0.1)` box), attribution linked to the source.
- One **accent colour**, used sparingly for key numbers or a punchline word (default orange `#d95926`; follow the topic or the user's choice).
- **Few words.** Titles are short sentences or questions, often with a full stop ("It follows the model.", "What makes a fish a fish?"). Bullets: one idea, one line if possible, revealed one at a time with `class="fragment"`.
- **Next-slide cue**: a dim grey corner triangle, top right, lit once the next press changes slide (last fragment out). Visible only to someone who knows to look. It's built into the template (CSS + JS at the bottom); keep it in every deck. Colour and size: `--cue`, `--cue-size`.

## Structure
- **Open with a hook, not a title slide**: a quote, a question, a scenario ("You have four minutes." → fragment "RUN!"), a teaser ("Five questions."). Title slide with names only for formal settings (seminar, hackathon) or on request.
- **Close with a callback** to the opener ("You had four minutes.", "Five questions. One answer.") or a closing quote with attribution.
- Section dividers: a centred `<h2>` alone on a slide.
- Fixed ending: content → takeaway/callback → **Inspiration** → **Sources** → optional **Backup** (divider slide "Backup", then extra slides).

## Reveal patterns
Vertical stack for claim → explanation or drill-down/backup data; `data-auto-animate` when the same object changes; `r-stack` + fragments to build a figure up (cumulative images, same size); `*` footnote for a dry aside; `highlight-current-green` / `semi-fade-out` to point at words; KaTeX only when the deck has formulas.

## Speaker notes
- Every content slide gets `<aside class="notes">`. Detail lives here, not on the slide.
- `<p class="fact">` lines first (numbers, sources, caveats), then plain paragraphs in **the speaker's voice**: first person, plain, dry, short. No presenter instructions ("pause here", "ask the audience"), no LLM filler ("that's a common mistake", "let's dive in"). Base notes on the user's draft; flag anything you added.

## Figures and images
- Charts/diagrams: Python scripts in the repo (`scripts/` or the project's existing ones), saved in **light and dark** (`<name>_light.*`, `<name>_dark.*`); slides use `_dark`, figure surface exactly `#000` so it sits flush. Use a venv. Never hand-edit a generated figure — change the script.
- Photos and illustrations: only freely licensed ones (public domain, CC0, CC BY, CC BY-SA), with the licence checked on the source page. Save them in the deck's `media/` folder. Each one gets a credit line on the Sources slide: title, author, source and licence. If an image-sourcing skill is installed, use it.
- Every `<img>` has a real `alt` and, when it has a source, is wrapped in a link to it (landing page, dataset, article).
- A figure redrawn from someone else's chart: link the original, credit "redrawn from <source>, data from <origin>" on Sources.

## Inspiration slide ("Inspired by..." / "Inspiriert von..." / "Inspiration")
- What the speaker learned from: videos, blogs, books, talks, papers.
- Link text = the **creator's name**, not a URL or title: `3Blue1Brown`, `CGP Grey (continents, countries)` with each topic linked.
- Academic talk: `Author (year)` as the link, then the title (muted), then an italic one-line *why* it matters.
- Notes: "These are the sources and explanations I learned from."

## Sources slide ("Sources" / "Quellen")
- Image credits (title linked to its source page, author, licence linked) and actual sources: data sets (with licence), articles, reports quoted on slides.
- Too many for one slide → vertical stack ("Sources I", "Sources II", or "Data" / "Images" / "Articles").

## Code
- Single `index.html` from `assets/template.html`, reveal.js pinned from jsDelivr, no build step. Deck-specific CSS goes in the `<style>` block using the template's variables.
- An HTML comment above every slide: what it is, which script makes its figure.
- Media in `media/`, generated plots in `figures/`, next to `index.html`; relative paths only.

# Splitting the deck into files

Only do this when the user asks for it. The template already contains the loader; splitting just switches it on.

## How it works

`index.html` keeps the `<head>`, the CSS and the scripts. Its `.slides` div stays empty. The `SECTIONS` list at the bottom names the section files in order. When the list isn't empty, the page fetches those files, puts them into `.slides`, and only then starts reveal. There's no build step, and it works because the deck is always served over HTTP.

```
<deck>/
  index.html
  sections/
    00-opener.html
    10-<section>.html
    20-<section>.html
    99-closing.html      (Inspiration if any, then Sources with Images below)
  figures/
  media/
```

Each section file contains only the `<section>` elements for that part of the talk: no `<html>`, `<head>` or `<body>`.

## Steps

1. Agree on the split with the user: which slides go into which section, and the file names. Use numbered prefixes in steps of 10, so a new section can go in between later.
2. Move the slides, unchanged, from `.slides` into `sections/*.html`, in their current order. The opener and the closing get files of their own. Keep each slide's HTML comment with it.
3. Leave `<div class="slides"></div>` empty in `index.html`, and list the files in `SECTIONS`:
   ```js
   const SECTIONS = ["sections/00-opener.html", "sections/10-intro.html", "sections/99-closing.html"];
   ```
4. Paths inside section files (images, figures) stay relative to `index.html`, not to `sections/`.
5. Check that nothing changed: the slide count is the same as before (`Reveal.getTotalSlides()`), every slide renders, maths renders and the cue works. If a file is missing, the page shows "Could not load sections" with its name.

From then on, add a slide to the section file it belongs in. A new section means a new file plus an entry in `SECTIONS`.

## Going back to one file

Paste the files' contents into `.slides` in `SECTIONS` order, then set `SECTIONS = []`.

# Reveal patterns

Copy and adapt. Decks built from these snippets and from `assets/template.html` may be published under any terms (see `LICENSE-EXCEPTION` at the repository root).

## Quote slide
```html
<section class="centered">
  <blockquote>
    &ldquo;For a successful technology, reality must take precedence over public relations, for nature cannot be fooled.&rdquo;
    <span class="by">&mdash; <a href="https://www.nasa.gov/history/rogersrep/v2appf.htm">Richard P. Feynman</a>, Rogers Commission Report, Appendix F (1986)</span>
  </blockquote>
</section>
```

## Claim, then explanation below (vertical stack)
```html
<section>
  <section class="centered">
    <blockquote>The Vatican has an average of two popes per square kilometre.</blockquote>
  </section>
  <section>
    <h3>Explanation</h3>
    <ul>
      <li class="fragment">The Vatican has an area of 0.49 km².</li>
      <li class="fragment">There is one pope.</li>
    </ul>
  </section>
</section>
```

## Section divider
```html
<section class="centered"><h2>Misleading graphics</h2></section>
```

## Teaser list that pays off at the end (fragment indices)
```html
<h3>Five questions. <span class="fragment" data-fragment-index="2">One answer.</span></h3>
<ul>
  <li><span class="fragment fade-in-then-semi-out" data-fragment-index="1">What makes a fish a fish?</span>
      <span class="fragment" data-fragment-index="2">We do.</span></li>
</ul>
```

## Build a figure up step by step (cumulative images, same size)
```html
<section>
  <h3>How VO₂ kinetics are usually modelled.</h3>
  <div class="r-stack">
    <a href="[source]" target="_blank" rel="noopener"><img src="figures/model_data_dark.png" alt="..."></a>
    <a class="fragment" href="[source]" target="_blank" rel="noopener"><img src="figures/model_fit_dark.png" alt="..."></a>
    <a class="fragment" href="[source]" target="_blank" rel="noopener"><img src="figures/model_phases_dark.png" alt="..."></a>
  </div>
</section>
```
In an `r-stack`, the `fragment` class goes on the link, not on the image. To swap an empty frame for a filled one, give a `fragment fade-out` link and a `fragment` link the same `data-fragment-index`.

## Same object changes between slides (auto-animate)
```html
<section data-auto-animate>
  <h3>Let's write it as a formula.</h3>
  <div class="math" data-id="bayes">$$P(A|B) = \frac{P(B|A)\,P(A)}{P(B)}$$</div>
</section>
<section data-auto-animate>
  <h3>Let's write it as a formula.</h3>
  <div class="math" data-id="bayes">$$P(H|e) = \frac{P(e|H)\,P(H)}{P(e)}$$</div>
</section>
```
Also works for a graph whose axis changes (`data-id` on the wrapper) and for coloured divs that split/resize. Easing that works well: `data-auto-animate-easing="cubic-bezier(0.770, 0.000, 0.175, 1.000)"`.

## Point at words in a definition
```html
<blockquote>A fish is an <span class="fragment highlight-current-green">aquatic</span>,
  <span class="fragment highlight-current-green">gill-bearing</span> vertebrate ...</blockquote>
```

## Dim everything but the keyword
```html
<li class="fragment"><span class="fragment semi-fade-out" data-fragment-index="6">Maximising your average </span><strong>speed</strong><span class="fragment semi-fade-out" data-fragment-index="6"> on a run.</span></li>
```

## Footnote aside
```html
<section class="with-footnote">
  <h3>The most powerful equation in all of mathematics*</h3>
  ...
  <small class="footnote">*Probably not, but "one of many very cool equations" makes for a bad title.</small>
</section>
```

## Accent word in a title, revealed late
```html
<h3>A simple, robust, meaningful, and repeatable marker.<span class="fragment accent"> Maybe.</span></h3>
```

## Single image
```html
<section>
  <h3>[Title.]</h3>
  <figure><a href="[original source page]" target="_blank" rel="noopener"><img src="media/[file]" alt="[what it shows]"></a></figure>
</section>
```

## Two figures side by side
```html
<div style="display: flex; gap: 0.6em;">
  <figure style="flex: 1"><a href="[source]" target="_blank" rel="noopener"><img src="figures/a_dark.png" alt="..." style="width: 100%"></a><p class="graph-label">Runner</p></figure>
  <figure style="flex: 1"><a href="[source]" target="_blank" rel="noopener"><img src="figures/b_dark.png" alt="..." style="width: 100%"></a><p class="graph-label">Cyclist</p></figure>
</div>
```

## Video
Videos get no link wrapper, because it would block the controls. Credit the source on the Images slide instead.
```html
<section class="centered"><video data-src="media/anim_dark.mp4" muted playsinline controls style="max-height: 80vh"></video></section>
```

## Table whose cells jump to detail slides
Give each detail slide an `id` and link `<a href="#/gdp-spd">-0.76</a>` (hash: true is set).

## Inspiration slide (only on request, just before Sources)
What the speaker learned from. The link text is the creator's name, not a URL or a title.
```html
<section>
  <h3>Inspired by...</h3>
  <ul class="refs">
    <li><a href="[url]" target="_blank" rel="noopener">[Creator]</a> <span class="ref-title">[topic or title]</span></li>
  </ul>
</section>
```
For an academic talk, use two columns: `Author (year)` as the link, then the title, then one line on why it matters.
```html
<section>
  <h3>Inspiration</h3>
  <div class="refs-pair">
    <ul class="refs">
      <li><a href="https://doi.org/..." target="_blank" rel="noopener">Poole &amp; Jones (2012)</a>
        <span class="ref-title">Oxygen uptake kinetics. <em>Compr Physiol</em></span>
        <span class="ref-why">The review to start with</span></li>
    </ul>
    <ul class="refs">...</ul>
  </div>
</section>
```

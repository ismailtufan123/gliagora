# The home page's poster

The static poster of the home page's hero (PLAN §10, layer L1): a brain seen from the side, its
folds drawn as contours of its outline, with one calcium wave. Generated, never edited by hand:

```sh
cd tools/poster
node gen.mjs        # poster.svg and anchors.json (node gen.mjs debug: debug.svg with the levels)
node to-tsx.mjs     # src/components/home/HomePoster.tsx from poster.svg
cd ../.. && pnpm format
```

Since M13 (D60) the outlines of the cerebrum, the cerebellum and the brainstem come from the brain
model of the 3D hero, as its camera sees it at rest (`outline.json`, written by
`tools/hero/outline.mjs`; tools/hero/README.md), so the poster and the 3D brain's first frame match;
the lines inside them (the lateral fissure, the dividing sulci, the folia) are still placed here.

`anchors.json` gives the points around the brain where the windows' labels sit, in viewBox units
(1360 × 1000); global.css places the labels there in percent (`.home-poster-links`). The colours,
the wave's draw-in and the forced-colours and print rules are in global.css (`.poster-art`).

Made in M6 (2026-10-01): four drafts in different styles (line art, points, an astrocyte and
contours), judged side by side for anatomy, polish and accessibility; the contour draft won and was
refined. `poster.svg`, `anchors.json` and `debug.svg` are not committed.

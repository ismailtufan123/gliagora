# The hero's point cloud

The home page's 3D layer (PLAN §10, layer L2; M13, D60) draws the brain as a cloud of points, made
here from an openly licensed brain model and written to `public/hero/brain-<hash>.bin`, with its
numbers in `src/components/home/hero/hero-model.ts`. The poster (layer L1, `tools/poster`) is drawn
from the same model's outline, so the 3D brain's first frame takes the poster's place and size.
Made, never edited by hand.

## The model

"Brain Model" by Nevit Dilmen, [NIH 3D 3DPX-002739](https://3d.nih.gov/entries/3DPX-002739),
available under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) (stated on its page and in
NIH 3D's data): a whole brain, with the cerebellum and the brainstem, made from an MRI scan. We make
it into a cloud of points and an outline; the About page credits it ("Data and credits", in the
words the operator approved, D60). Its STL (12.5 MB) is not kept in the repository. To build again,
download it into `source/` (git-ignored); `model.mjs` checks its SHA-256 before using it:

```sh
mkdir -p tools/hero/source
curl -L -o tools/hero/source/brain.stl \
  https://3d.nih.gov/api/submissions/31898/runs/0c4804ee-75bf-4d15-88a8-c2c431f81c69/output-files/868575
sha256sum tools/hero/source/brain.stl   # c154205eba0de965caba983448a71f5eb2c4255c5df45790a20001f930e87cc5
```

## Building

```sh
node tools/hero/outline.mjs            # tools/poster/outline.json: the poster's outlines
node tools/hero/build.mjs              # the point file and hero-model.ts
cd tools/poster && node gen.mjs && node to-tsx.mjs && cd ../..   # the poster (tools/poster/README.md)
pnpm format
```

After the poster changes, copy its anchors (`tools/poster/anchors.json`, which `gen.mjs` writes)
to `global.css` (`.home-poster-links`, in percent of 1360 × 1000) and to `MODEL.anchors` in
`model.mjs`, and its cell (`.poster-cell` in `HomePoster.tsx`) to `MODEL.cell`, then build the point
file again.

- `model.mjs`: the model, its turn to the left side's view, and the spots of the poster it serves:
  the cell where the wave starts, the windows' anchors (as in global.css).
- `fit.mjs`: the model in the scene's units, fitted to the poster (its length to the poster's
  cerebrum, its top to the cerebrum's top).
- `project.mjs`: the model as the scene's camera sees it at rest, on the poster's grid.
- `outline.mjs`: the poster's outlines from that view, split where one part hides another (a jump
  in depth) into the cerebrum, the cerebellum and the brainstem.
- `sample.mjs`: the surface's normals, the depth of its folds (a smoothed copy of the surface, as
  in sulcal depth maps), the triangles the camera sees, and an even sample of points on them.
- `logo.mjs`: the 6b mark (`public/brand/gliagora-mark.svg`, D12) sampled into target points for
  the last frame of the scroll (F4): read from the file, never redrawn.
- `encode.mjs`: the file format, which `src/components/home/hero/data.ts` reads (its comment
  describes the layout).

The file holds 19,500 points in random order (a lighter quality draws the first part of them) and
the mark's 3,248 points, at most 150 KB (PLAN §10.5); the build prints its size.

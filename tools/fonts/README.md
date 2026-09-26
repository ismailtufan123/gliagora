# Web fonts

The site serves its own WOFF2 files from `src/fonts/` through `next/font/local` (PLAN §7.3). Nothing is loaded from Google Fonts or any other domain.

| File | Source | Settings |
| --- | --- | --- |
| `commissioner-latin.woff2` | Commissioner (SIL OFL 1.1) | Upright; Flair fixed at 60; weight 600–700 |
| `atkinson-hyperlegible-next-latin.woff2` | Atkinson Hyperlegible Next (SIL OFL 1.1) | Upright; weight 400–700 |

Both are subset to Latin and Latin Extended-A/B (Turkish, German, Spanish, French, Romanian and more), punctuation and currency signs. Atkinson Hyperlegible Next has no Turkish lira sign (₺) or schwa (ə); browsers draw those two characters with a fallback font. Italic and other weights are added when a page needs them.

Neither font declares a Reserved Font Name, so the subset files keep their names. The licences are in `src/fonts/OFL-*.txt` and must stay next to the font files.

## Rebuilding

Source files, downloaded from the Google Fonts repository on 2026-09-26:

| File | URL | SHA-256 |
| --- | --- | --- |
| `Commissioner[FLAR,VOLM,slnt,wght].ttf` | https://github.com/google/fonts/tree/main/ofl/commissioner | `db01279a6eb8676ee62675a4d7e5edbfe5f08fbc109358e2f49760b70c0447d3` |
| `AtkinsonHyperlegibleNext[wght].ttf` | https://github.com/google/fonts/tree/main/ofl/atkinsonhyperlegiblenext | `5a455d1cfa099b601ab70751bb9673e8fe1854dc4500c80e1a220d0d75e31745` |

```sh
python3 -m venv .venv-fonts
.venv-fonts/bin/pip install fonttools==4.60.1 brotli
.venv-fonts/bin/python tools/fonts/build.py <folder with the two TTF files>
```

Change the axis ranges or character ranges in `tools/fonts/build.py`, not by hand.

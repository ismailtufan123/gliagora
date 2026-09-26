"""Build the self-hosted WOFF2 web fonts in src/fonts/ (PLAN §7.3).

Usage:
    python3 -m venv .venv-fonts && .venv-fonts/bin/pip install fonttools==4.60.1 brotli
    .venv-fonts/bin/python tools/fonts/build.py <folder with the source TTF files>

The source files and their checksums are listed in tools/fonts/README.md.
"""

import sys
from io import BytesIO
from pathlib import Path

from fontTools import subset
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "src" / "fonts"

# Latin + Latin Extended-A/B (Turkish ğ ş ı İ, German ẞ, Spanish, French, Romanian ș ț,
# Azerbaijani ə), spacing modifiers, general punctuation and currency signs (including ₺).
UNICODES = (
    "U+0000-00FF, U+0100-024F, U+0259, U+02B0-02FF, U+0304, U+0308, U+0329, U+1E9E, "
    "U+2000-206F, U+20A0-20C0, U+2113, U+2122, U+2190-2193, U+2212, U+2215, U+FEFF, U+FFFD"
)

FONTS = [
    # Display: upright, Flair fixed at 60 and weight 600–700 (PLAN §7.3).
    (
        "Commissioner[FLAR,VOLM,slnt,wght].ttf",
        "commissioner-latin.woff2",
        {"slnt": 0, "VOLM": 0, "FLAR": 60, "wght": (600, 700, 700)},
    ),
    # Body and UI: weight 400–700.
    (
        "AtkinsonHyperlegibleNext[wght].ttf",
        "atkinson-hyperlegible-next-latin.woff2",
        {"wght": (400, 400, 700)},
    ),
]


def build(src_dir: Path) -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for source, target, limits in FONTS:
        font = TTFont(src_dir / source)
        font = instancer.instantiateVariableFont(font, limits, updateFontNames=False)
        # Save and reload so the subsetter sees fully rebuilt tables.
        buffer = BytesIO()
        font.save(buffer)
        buffer.seek(0)
        font = TTFont(buffer)
        options = subset.Options()
        options.flavor = "woff2"
        options.layout_features = ["*"]
        options.name_IDs = ["*"]
        options.notdef_outline = True
        subsetter = subset.Subsetter(options=options)
        subsetter.populate(unicodes=subset.parse_unicodes(UNICODES))
        subsetter.subset(font)
        font.flavor = "woff2"
        font.save(OUT / target)
        print(f"{target}: {(OUT / target).stat().st_size / 1024:.1f} KiB")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    build(Path(sys.argv[1]))

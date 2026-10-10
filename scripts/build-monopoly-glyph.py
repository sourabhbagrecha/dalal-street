"""
Builds apps/web/src/assets/fonts/monopoly-m.woff: a one-glyph font carrying the
Classic deck's currency sign (an M struck through twice), which Unicode has no
code point for. The glyph sits on U+E000; styles/money-glyph.css hangs it onto
the app's font families. Needs fontTools: `python3 scripts/build-monopoly-glyph.py`.
"""

from pathlib import Path

from fontTools.fontBuilder import FontBuilder
from fontTools.pens.ttGlyphPen import TTGlyphPen

OUT = Path(__file__).resolve().parent.parent / "apps/web/src/assets/fonts/monopoly-m.woff"

EM = 1000
CAP = 700
ADVANCE = 720
# The M: two stems and a V that comes down to the baseline, one closed outline.
LEFT, RIGHT, STEM = 70, 650, 140
MID = (LEFT + RIGHT) // 2
NOTCH_TOP, NOTCH_INNER = 325, 375
# The two strikes, a little wider than the letter.
BAR_LEFT, BAR_RIGHT = 10, 710
BARS = [(240, 295), (405, 460)]


def polygon(pen, points):
    pen.moveTo(points[0])
    for p in points[1:]:
        pen.lineTo(p)
    pen.closePath()


def draw_sign():
    pen = TTGlyphPen(None)
    polygon(
        pen,
        [
            (LEFT, 0),
            (LEFT, CAP),
            (LEFT + STEM, CAP),
            (MID, NOTCH_TOP),
            (RIGHT - STEM, CAP),
            (RIGHT, CAP),
            (RIGHT, 0),
            (RIGHT - STEM, 0),
            (RIGHT - STEM, NOTCH_INNER),
            (MID, 0),
            (LEFT + STEM, NOTCH_INNER),
            (LEFT + STEM, 0),
        ],
    )
    for bottom, top in BARS:
        polygon(pen, [(BAR_LEFT, bottom), (BAR_LEFT, top), (BAR_RIGHT, top), (BAR_RIGHT, bottom)])
    glyph = pen.glyph()
    # The strikes cross the letter: tell the rasteriser the contours overlap.
    glyph.flags[0] |= 0x40
    return glyph


def main():
    fb = FontBuilder(EM, isTTF=True)
    fb.setupGlyphOrder([".notdef", "monopolySign"])
    fb.setupCharacterMap({0xE000: "monopolySign"})
    fb.setupGlyf({".notdef": TTGlyphPen(None).glyph(), "monopolySign": draw_sign()})
    fb.setupHorizontalMetrics({".notdef": (ADVANCE, 0), "monopolySign": (ADVANCE, BAR_LEFT)})
    fb.setupHorizontalHeader(ascent=800, descent=-200)
    fb.setupNameTable({"familyName": "Monopoly Sign", "styleName": "Regular"})
    fb.setupOS2(sTypoAscender=800, sTypoDescender=-200, sTypoLineGap=0, usWinAscent=800, usWinDescent=200, sCapHeight=CAP)
    fb.setupPost()
    fb.font.flavor = "woff"
    OUT.parent.mkdir(parents=True, exist_ok=True)
    fb.save(OUT)
    print(f"{OUT} ({OUT.stat().st_size} bytes)")


if __name__ == "__main__":
    main()

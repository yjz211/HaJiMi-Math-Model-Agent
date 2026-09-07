"""Create a reproducible regular TrueType instance; retain upstream OFL metadata."""
import argparse
from pathlib import Path
from tempfile import TemporaryDirectory
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont


def build(source, output):
    if output.exists():
        raise ValueError('Font output must be new')
    with TTFont(source, recalcTimestamp=False) as font:
        if 'glyf' not in font or 'fvar' not in font:
            raise ValueError('Expected reviewed variable TrueType source, not CFF/OTF')
        if {axis.axisTag for axis in font['fvar'].axes} != {'wght'}:
            raise ValueError('Unexpected variation axes')
        instantiateVariableFont(font, {'wght': 400}, inplace=True, updateFontNames=True)
        assert 'fvar' not in font and font['OS/2'].usWeightClass == 400
        assert 'Regular' in font['name'].getDebugName(6)
        font.save(output)
    verify_render(output)


def verify_render(path):
    # Extractable PDF text can still be completely invisible with CFF/Type42.
    import matplotlib
    matplotlib.use('Agg')
    from matplotlib import pyplot as plt, font_manager
    import numpy as np
    from PIL import Image
    import pymupdf
    phrase = '输入参数 0123456789 线性方程组的解'
    with TemporaryDirectory(prefix='hajimi-font-') as directory:
        root = Path(directory)
        with matplotlib.rc_context({'pdf.fonttype': 42}):
            fig = plt.figure(figsize=(6, 2), dpi=144)
            fig.text(.05, .5, phrase, fontproperties=font_manager.FontProperties(fname=str(path)), fontsize=16)
            fig.savefig(root / 'reference.png', dpi=144)
            fig.savefig(root / 'vector.pdf')
            plt.close(fig)
        with pymupdf.open(root / 'vector.pdf') as doc:
            assert doc[0].get_text().strip() == phrase, 'PDF text mapping lost'
            assert not doc[0].get_images(), 'Vector font check must not be rasterized'
            rendered = doc[0].get_pixmap(dpi=144)
            pixels = np.frombuffer(rendered.samples, dtype=np.uint8).reshape(rendered.height, rendered.width, rendered.n)
            pdf_ink = np.count_nonzero(pixels[:, :, :3].min(axis=2) < 200)
        with Image.open(root / 'reference.png') as reference:
            png_ink = np.count_nonzero(np.asarray(reference.convert('RGB')).min(axis=2) < 200)
        assert png_ink > 100 and .75 < pdf_ink / png_ink < 1.25, (pdf_ink, png_ink)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source', type=Path)
    parser.add_argument('output', type=Path)
    args = parser.parse_args()
    build(args.source, args.output)

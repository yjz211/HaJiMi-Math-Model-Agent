"""Managed-runtime defaults; not a security boundary against arbitrary Python code."""
import os
from pathlib import Path

if os.environ.get('HAJIMI_MANAGED_RUNTIME') == '1':
    # Matplotlib's initial registry contains ONLY shipped fonts, not Windows' font registry.
    # This is intentional runtime adaptation, not a replacement modeling method.
    import matplotlib
    from matplotlib import font_manager
    shipped = Path(os.environ['HAJIMI_FONTS_ROOT'])
    bundled_mpl = Path(matplotlib.get_data_path()) / 'fonts'
    font_manager.fontManager.ttflist[:] = []
    for directory in (shipped, bundled_mpl):
        for extension in ('*.ttf', '*.otf'):
            for path in directory.rglob(extension):
                font_manager.fontManager.addfont(str(path))
    font = shipped / 'NotoSansCJKsc-Regular.ttf'
    if not font.is_file(): raise RuntimeError('Managed CJK font is missing')
    family = font_manager.FontProperties(fname=str(font)).get_name()
    matplotlib.rcParams.update({'font.family': 'sans-serif', 'font.sans-serif': [family, 'DejaVu Sans'], 'axes.unicode_minus': False})

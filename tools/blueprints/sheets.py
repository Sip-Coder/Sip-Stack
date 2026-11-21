#!/usr/bin/env python3
"""Typeset the independent designs, matching model elevations and silhouette overlays."""

import argparse
import json
import math
from functools import lru_cache
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

HERE = Path(__file__).resolve().parent
OUTPUT = HERE.parents[1] / 'characters-review/blueprints'
CAM = json.loads((HERE / 'views.json').read_text())
PAPER, INK, MUTED = '#FAF7EE', '#172F2F', '#485F59'
EMERALD, OCHRE, RULE, GRID = '#1A5552', '#914C2C', '#B6C0B5', '#DBE0D5'
COMMON, DESIGN, MODEL = '#264E4C', '#D78932', '#5C9ED4'
MARGIN, WIDTH = 76, 2400
VIEWS = {
    'front': 'Front',
    'back': 'Back',
    'left': 'Anatomical left',
    'right': 'Anatomical right',
    'high-front': 'High front three-quarter',
    'rear-three-quarter': 'Level rear three-quarter',
    'top': 'Top · toes down',
}
LANDMARKS = {
    'eyes': 'Eyes',
    'chin': 'Chin',
    'shoulders': 'Shoulders',
    'waist': 'Waist',
    'knee': 'Knee',
    'ankleCuff': 'Ankle cuff',
    'hairWidth': 'Groom width',
}
FONT_DIR = Path('/usr/share/fonts/truetype/dejavu')


@lru_cache(maxsize=None)
def font(kind, size):
    family = {
        'title': 'DejaVuSerif',
        'body': 'DejaVuSans',
        'bold': 'DejaVuSans-Bold',
        'mono': 'DejaVuSansMono',
    }[kind]
    return ImageFont.truetype(str(FONT_DIR / (family + '.ttf')), size)


def text(draw, x, y, s, size=23, kind='body', fill=INK, anchor='la'):
    draw.text((x, y), str(s), font=font(kind, size), fill=fill, anchor=anchor)


def lines(draw, string, width, kind, size):
    words = string.split()
    current = ''
    for word in words:
        trial = (current + ' ' + word).strip()
        if current and draw.textlength(trial, font=font(kind, size)) > width:
            yield current
            current = word
        else:
            current = trial
    if current:
        yield current


def section(draw, x, y, title):
    text(draw, x, y, title, 29, 'bold', EMERALD)


def header(draw, spec, subtitle):
    text(draw, MARGIN, 50, 'SIP STUDIES  /  HEROS', 23, 'bold', EMERALD)
    text(draw, MARGIN - 3, 90, spec['name'], 82, 'title')
    text(
        draw,
        MARGIN + max(350, int(draw.textlength(spec['name'], font=font('title', 82))) + 45),
        130,
        subtitle,
        39,
        'body',
    )
    text(draw, WIDTH - MARGIN, 60, f"{spec['heightIn']//12} ft {spec['heightIn']%12} in  /  standing height", 25, 'mono', anchor='ra')
    text(draw, WIDTH - MARGIN, 114, spec['role'], 23, fill=MUTED, anchor='ra')
    draw.line((MARGIN, 208, WIDTH - MARGIN, 208), fill=EMERALD, width=3)


def image_panel(canvas, source, box, crop=None):
    x, y, w, h = box
    with Image.open(source) as raw:
        layer = raw.convert('RGBA')
    if crop:
        layer = layer.crop(crop)
    layer.thumbnail((w, h), Image.Resampling.LANCZOS)
    canvas.paste(layer, (x + (w - layer.width) // 2, y + (h - layer.height) // 2), layer)


def grid(draw, x, y, w, h, label_x=None):
    for pct in range(0, 101, 10):
        line = round(y + h * (0.5 + (pct / 100 - 0.5) / CAM['verticalSpanHeights']))
        draw.line((x, line, x + w, line), fill=RULE if pct in (0, 50, 100) else GRID, width=1)
        if label_x is not None and pct % 20 == 0:
            text(draw, label_x, line, f'{pct}%', 17, 'mono', MUTED, 'rm')


def orthos_and_rotations(canvas, directory):
    d = ImageDraw.Draw(canvas)
    section(d, MARGIN, 238, 'Orthographic elevations')
    section(d, 1705, 238, 'Rotation studies')
    y, h, w = 310, 567, 378
    grid(d, 143, y, 4 * w, h, 131)
    for i, key in enumerate(('front', 'back', 'left', 'right')):
        x = 143 + i * w
        d.line((x + w // 2, y + 48, x + w // 2, y + h - 46), fill=GRID, width=1)
        image_panel(canvas, directory / (key + '.png'), (x, y, w, h))
        text(d, x + w // 2, y + h + 4, VIEWS[key], 22, 'bold', anchor='ma')
    d.line((1678, 284, 1678, 913), fill=RULE, width=2)
    for i, key in enumerate(('high-front', 'rear-three-quarter')):
        x = 1700 + i * 310
        image_panel(canvas, directory / (key + '.png'), (x, 292, 305, 340))
        text(d, x + 153, 635, VIEWS[key], 20, 'bold', anchor='ma')
    image_panel(canvas, directory / 'top.png', (1770, 687, 470, 177), (0, 216, 512, 552))
    text(d, 2012, 880, VIEWS['top'], 20, 'bold', anchor='ma')
    d.line((MARGIN, 940, WIDTH - MARGIN, 940), fill=RULE, width=2)


def design_sheet(spec, folder):
    palette = spec['palette']
    rows = math.ceil(len(palette) / 8)
    palette_y = 1216
    detail_y = palette_y + 72 + rows * 109
    probe = ImageDraw.Draw(Image.new('RGB', (1, 1)))
    callouts = spec['callouts']
    width = (WIDTH - 2 * MARGIN) // max(1, min(3, len(callouts)))
    wrapped = [list(lines(probe, c['text'], width - 56, 'body', 23)) for c in callouts]
    row_heights = [max(len(x) for x in wrapped[i : i + 3]) * 33 + 80 for i in range(0, len(wrapped), 3)]
    height = detail_y + 107 + sum(row_heights)
    canvas = Image.new('RGB', (WIDTH, height), PAPER)
    d = ImageDraw.Draw(canvas)
    header(d, spec, 'Character blueprint')
    orthos_and_rotations(canvas, folder / 'design')
    section(d, MARGIN, 969, 'Standing landmarks')
    text(
        d,
        WIDTH - MARGIN,
        977,
        'Vertical positions measured down from the highest crown · width measured across the widest groom or dome',
        19,
        fill=MUTED,
        anchor='ra',
    )
    for i, (key, label) in enumerate(LANDMARKS.items()):
        x = MARGIN + i * ((WIDTH - 2 * MARGIN) // 7)
        value = spec['landmarks'][key]
        text(
            d, x, 1029, 'Dome width' if key == 'hairWidth' and spec['name'] == 'Hummin' else label, 22, 'bold'
        )
        text(d, x, 1069, f'{value:g}%', 39, 'title', EMERALD)
        text(d, x, 1130, f'{value*spec["heightIn"]/100:.1f} in', 22, 'mono', MUTED)
    d.line((MARGIN, 1182, WIDTH - MARGIN, 1182), fill=RULE, width=2)
    section(d, MARGIN, palette_y, 'Lit material palette')
    text(d, WIDTH - MARGIN, palette_y + 8, 'D65 neutral light  /  sRGB', 20, 'mono', MUTED, 'ra')
    for i, swatch in enumerate(palette):
        x = MARGIN + (i % 8) * 281
        y = palette_y + 66 + (i // 8) * 109
        d.rounded_rectangle((x, y, x + 244, y + 30), radius=4, fill=swatch['hex'], outline=RULE, width=1)
        text(
            d,
            x,
            y + 36,
            swatch['label'],
            min(21, max(14, int(21 * 240 / max(240, d.textlength(swatch['label'], font=font('bold', 21)))))),
            'bold',
        )
        text(d, x, y + 66, swatch['hex'].upper(), 17, 'mono', MUTED)
    d.line((MARGIN, detail_y - 12, WIDTH - MARGIN, detail_y - 12), fill=RULE, width=2)
    section(d, MARGIN, detail_y + 11, 'Signature details')
    for i, call in enumerate(callouts):
        x = MARGIN + (i % 3) * width
        y = detail_y + 69 + sum(row_heights[: i // 3])
        text(d, x, y, call['label'], 25, 'bold', OCHRE)
        for j, line in enumerate(wrapped[i]):
            text(d, x, y + 43 + j * 33, line, 23)
    canvas.save(folder / 'blueprint.jpg', quality=94, subsampling=0, optimize=True)


def model_sheet(spec, folder):
    canvas = Image.new('RGB', (WIDTH, 1010), PAPER)
    d = ImageDraw.Draw(canvas)
    header(d, spec, 'Production model')
    orthos_and_rotations(canvas, folder / 'model')
    text(
        d,
        MARGIN,
        961,
        'Identical orthographic cameras and world scale across the design and model.',
        21,
        fill=MUTED,
    )
    canvas.save(folder / 'model.jpg', quality=94, subsampling=0, optimize=True)


def comparison_sheet(spec, folder):
    canvas = Image.new('RGB', (WIDTH, 1570), PAPER)
    draw = ImageDraw.Draw(canvas)
    header(draw, spec, 'Explorer comparison')
    for column, (source, title) in enumerate((('design', 'Original design sheet'), ('model', 'Posed production model'))):
        left = MARGIN + column * 1150
        section(draw, left, 247, title)
        for index, (view, w, h) in enumerate((('front', 500, 740), ('left', 500, 740), ('back', 475, 445),
                                               ('high-front', 475, 445))):
            x = left + (index % 2) * 530
            y = 310 if index < 2 else 1080
            image_panel(canvas, folder / source / (view + '.png'), (x, y, w, h))
            text(draw, x+w//2, y+h-8, VIEWS[view], 22, 'bold', anchor='ma')
    draw.line((1196, 242, 1196, 1502), fill=RULE, width=2)
    canvas.save(folder / 'comparison.jpg', quality=94, subsampling=0, optimize=True)


def overlay_sheet(spec, folder):
    result = json.loads((folder / 'match.json').read_text())
    canvas = Image.new('RGB', (WIDTH, 1734), PAPER)
    d = ImageDraw.Draw(canvas)
    header(d, spec, 'Silhouette overlays')
    for i, (name, tint) in enumerate((('Both', COMMON), ('Blueprint only', DESIGN), ('Model only', MODEL))):
        x = MARGIN + i * 288
        d.rounded_rectangle((x, 250, x + 30, 280), 4, fill=tint)
        text(d, x + 45, 249, name, 23, 'bold')
    text(
        d,
        WIDTH - MARGIN,
        250,
        'Half-coverage mask · fixed view and scale · no registration',
        20,
        'mono',
        MUTED,
        'ra',
    )
    for row, keys in enumerate(
        (('front', 'back', 'left', 'right'), ('high-front', 'rear-three-quarter', 'top'))
    ):
        for col, key in enumerate(keys):
            with Image.open(folder / 'design' / (key + '.png')) as raw:
                a = np.array(raw.getchannel('A')) >= 128
            with Image.open(folder / 'model' / (key + '-mask.png')) as raw:
                b = np.array(raw.convert('L')) >= 128
            layer = Image.new('RGBA', (CAM['width'], CAM['height']))
            for region, tint in ((a & b, COMMON), (a & ~b, DESIGN), (b & ~a, MODEL)):
                layer.paste(tint, (0, 0, layer.width, layer.height), Image.fromarray(region))
            x = MARGIN + col * 564
            y = 303 + row * 716
            # The ratio of the rendered frame to the plot is identical in all seven cells.
            layer = layer.resize((396, 594), Image.Resampling.LANCZOS)
            canvas.paste(layer, (x + 83, y), layer)
            text(d, x + 282, y + 600, VIEWS[key], 24, 'bold', anchor='ma')
            text(
                d,
                x + 282,
                y + 638,
                'IoU ' + format(result['silhouettes'][key]['iou'], '.4f'),
                22,
                'mono',
                MUTED,
                'ma',
            )
    x = MARGIN + 3 * 564
    y = 1100
    section(d, x, y, 'Landmark errors')
    for i, (key, label) in enumerate(LANDMARKS.items()):
        err = result['landmarks'][key]['errorPctHeight']
        yy = y + 72 + i * 53
        if key == 'hairWidth' and spec['name'] == 'Hummin':
            label = 'Dome width'
        text(d, x, yy, label, 23)
        text(d, WIDTH - MARGIN, yy, f'{err:.2f}% H', 23, 'mono', anchor='ra')
        d.line((x, yy + 39, WIDTH - MARGIN, yy + 39), fill=GRID)
    canvas.save(folder / 'overlay.jpg', quality=94, subsampling=0, optimize=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--out', type=Path, default=OUTPUT)
    parser.add_argument('--hero', choices=('sippy', 'roma', 'hummin'), action='append')
    parser.add_argument('--design-only', action='store_true')
    args = parser.parse_args()
    for hero in args.hero or ('sippy', 'roma', 'hummin'):
        spec = json.loads((HERE / (hero + '.json')).read_text())
        folder = args.out / hero
        design_sheet(spec, folder)
        if not args.design_only:
            model_sheet(spec, folder)
            comparison_sheet(spec, folder)
            overlay_sheet(spec, folder)


if __name__ == '__main__':
    main()

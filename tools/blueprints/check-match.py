#!/usr/bin/env python3
"""Compare the frozen design against the posed production meshes at the same projection."""

import argparse
import json
import math
from pathlib import Path

import numpy as np
from PIL import Image

from colour import delta_e_2000, srgb_lab

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[1]
HEROES = ('sippy', 'roma', 'hummin')
LANDMARKS = ('eyes', 'chin', 'shoulders', 'waist', 'knee', 'ankleCuff', 'hairWidth')
VIEWS = json.loads((HERE / 'views.json').read_text())


def read_mask(path, channel):
    with Image.open(path) as image:
        if image.size != (VIEWS['width'], VIEWS['height']):
            raise ValueError(f'{path} has the wrong frame size')
        coverage = np.asarray(image.getchannel(channel) if channel == 'A' else image.convert('L')) >= 128
    if (
        not coverage.any()
        or coverage[0].any()
        or coverage[-1].any()
        or coverage[:, 0].any()
        or coverage[:, -1].any()
    ):
        raise ValueError(f'Empty or cropped silhouette in {path}')
    return coverage


def measure(hero, root):
    spec = json.loads((HERE / f'{hero}.json').read_text())
    folder = root / hero
    actual = json.loads((folder / 'model/landmarks.json').read_text())
    height = actual['standingHeightM']
    if not all(math.isfinite(x) and x > 0 for x in (height, actual['headCount'])):
        raise ValueError(f'Invalid measured crown or chin for {hero}')
    result = {
        'heightM': height,
        'headCount': actual['headCount'],
        'landmarks': {},
        'silhouettes': {},
        'materials': [],
        'failures': [],
    }
    failures = result['failures']
    if abs(height / spec['heightM'] - 1) > .02:
        failures.append(f'Measured height {height:.3f} m is outside the 2% tolerance')
    if hero in ('sippy', 'roma') and not 3 <= actual['headCount'] <= 3.5:
        failures.append(f"Human proportion {actual['headCount']:.3f} heads is outside 3–3.5")
    for key in LANDMARKS:
        design, model = spec['landmarks'][key], actual['landmarks'][key]
        if not all(math.isfinite(x) and 0 < x < 105 for x in (design, model)):
            raise ValueError(f'Invalid landmark {hero} {key}')
        error = abs(model - design)
        result['landmarks'][key] = {'designPct': design, 'modelPct': model, 'errorPctHeight': error}
        if error > 1.5:
            failures.append(f'{key} error {error:.2f} percentage points')
    for view in VIEWS['views']:
        design = read_mask(folder / 'design' / f'{view}.png', 'A')
        model = read_mask(folder / 'model' / f'{view}-mask.png', 'L')
        intersection = int(np.count_nonzero(design & model))
        union = int(np.count_nonzero(design | model))
        iou = intersection / union
        result['silhouettes'][view] = {'intersectionPx': intersection, 'unionPx': union, 'iou': iou}
        if view in ('front', 'left', 'right') and iou < 0.92:
            failures.append(f'{view} IoU {iou:.4f}')
    samples = json.loads((folder / 'model/materials.json').read_text())
    expected = {entry['id']: entry['hex'] for entry in spec['palette']}
    if not expected or len(expected) != len(spec['palette']):
        raise ValueError(f'Empty palette or duplicate swatch IDs in {hero}')
    rows = samples['materials']
    if (
        not rows
        or samples['materialCount'] < 1
        or {row['index'] for row in rows} != set(range(1, samples['materialCount'] + 1))
        or len(rows) != samples['sampleCount']
    ):
        raise ValueError(f'Incomplete material coverage for {hero}')
    covered = set()
    for row in rows:
        material, swatch, measured = row['material'], row['id'], row['hex']
        if swatch not in expected:
            failures.append(f'{material} missing design swatch')
            continue
        covered.add(swatch)
        target = expected[swatch]
        difference = delta_e_2000(srgb_lab(target), srgb_lab(measured))
        result['materials'].append(
            {
                'material': material,
                'id': swatch,
                'designHex': target,
                'modelHex': measured,
                'deltaE00': difference,
            }
        )
        if difference > 6:
            failures.append(f'{material} ΔE00 {difference:.2f}')
    for swatch in sorted(expected.keys() - covered):
        failures.append(f'No measured material for {swatch}')
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        '--out', type=Path, default=REPO / 'characters-review/blueprints', help='Review directory'
    )
    parser.add_argument('--hero', choices=HEROES, action='append')
    args = parser.parse_args()
    failed = False
    for hero in args.hero or HEROES:
        result = measure(hero, args.out)
        (args.out / hero / 'match.json').write_text(json.dumps(result, indent=2, allow_nan=False) + '\n')
        iou = [result['silhouettes'][key]['iou'] for key in ('front', 'left', 'right')]
        error = max(row['errorPctHeight'] for row in result['landmarks'].values())
        de = max((row['deltaE00'] for row in result['materials']), default=math.inf)
        print(
            f'{hero}: {error:.2f}% H max landmark error; IoU {iou[0]:.4f}/{iou[1]:.4f}/{iou[2]:.4f}; max ΔE00 {de:.2f}'
        )
        for failure in result['failures']:
            print('  ' + failure)
        failed |= bool(result['failures'])
    return int(failed)


if __name__ == '__main__':
    raise SystemExit(main())

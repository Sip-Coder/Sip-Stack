"""Render orthographic High-tier Heros models and measure their neutral-lit materials.

THREE_ROOT=/path/to/three-0.170.0 python tools/blueprints/render-models.py
Use --hero to isolate a character, --docs to compare another checked-out revision,
and --out to keep a pilot outside the review folder. --pilot permits unbound
historical materials and skips the new anatomical bindings. Release runs reject
any unmapped real surface and require every authored palette ID to be represented.
Requires Chromium, Playwright for Python, NumPy and Pillow.
"""
import argparse
import base64
import io
import json
import os
from pathlib import Path
from urllib.parse import unquote, urlsplit

import numpy as np
from PIL import Image
from playwright.sync_api import sync_playwright

TOOLS = Path(__file__).resolve().parent
ROOT = TOOLS.parents[1]
HEROES = ('sippy', 'roma', 'hummin')
ORIGIN = 'http://127.0.0.1:39177'
HTML = """<!doctype html><meta charset="utf-8"><script type="importmap">
{"imports":{"three":"/three/build/three.module.js","three/addons/":"/three/examples/jsm/"}}
</script><title>Orthographic model capture</title>"""
AIM = {'encoding': '8-bit sRGB / D65', 'lighting': 'Uniform neutral D65 environment at unit linear radiance, '
       'normalized diffuse irradiance 1; actual material specular BRDF, texture, emission and alpha enabled.',
       'background': '18% linear neutral grey; half-float linear blending before sRGB output', 'toneMapping': 'none',
       'readout': 'Per-channel median of the central 50% × 50% of a 128 px square planar swatch. '
       'The swatch uses the production material object and its actual maps/shader, with representative '
       'source-geometry vertex colours where used. Region bindings specify UV or object-space footprints.'}


def save_json(path, obj):
    path.write_text(json.dumps(obj, indent=2, ensure_ascii=False) + '\n')


def image(data):
    return Image.open(io.BytesIO(base64.b64decode(data.split(',', 1)[1]))).convert('RGBA')


def route_source(route, docs, three):
    path = unquote(urlsplit(route.request.url).path)
    if path == '/':
        route.fulfill(content_type='text/html', body=HTML)
        return
    for prefix, directory in [('/three/', three), ('/tools/blueprints/', TOOLS), ('/', docs)]:
        if path.startswith(prefix):
            file = (directory / path[len(prefix):]).resolve()
            if file.is_relative_to(directory) and file.is_file():
                route.fulfill(path=file, content_type='text/javascript')
            else:
                route.fulfill(status=404, body='No such source module')
            return
    route.fulfill(status=404, body='No such resource')


def encode_hex(values):
    return '#' + ''.join(f'{int(np.rint(c)):02x}' for c in values)


def write_views(page, folder, spec):
    cameras, observed = {}, {}
    for view in spec['views']:
        result = page.evaluate('name => window.capture.view(name)', view)
        rgba, index_image = image(result['rgba']), image(result['ids'])
        rgba.save(folder / (view + '.png'))
        channels = np.asarray(index_image).astype(np.uint32)
        ids = channels[:, :, 0] + 256 * channels[:, :, 1] + 65536 * channels[:, :, 2]
        mask = channels[:, :, 3] > 0
        assert np.all(ids[~mask] == 0) and np.all(ids[mask] > 0), view
        assert 0 < mask.sum() < mask.size * .95, view
        assert ids.max() <= 65535, 'Material IDs exceed the 16-bit identity map'
        Image.fromarray((mask * 255).astype(np.uint8)).save(folder / (view + '-mask.png'))
        Image.fromarray(ids.astype(np.uint16)).save(folder / (view + '-materials.png'))
        beauty = np.asarray(rgba)
        for i in np.unique(ids[mask]):
            pixels = beauty[(ids == i) & (beauty[:, :, 3] > 0), :3]
            if len(pixels):
                observed.setdefault(int(i), {})[view] = {
                    'pixels': len(pixels), 'medianSrgb': encode_hex(np.median(pixels, axis=0))}
        cameras[view] = result['camera']
    save_json(folder / 'cameras.json', {'camera': spec, 'views': cameras})
    return observed


def write_materials(page, folder, hero, observed, pilot):
    result = page.evaluate('() => window.capture.materials()')
    atlas = image(result['atlas']).convert('RGB')
    atlas.save(folder / 'material-swatches.png')
    samples = result['samples']
    assert set(observed).issubset({s['index'] for s in samples})
    for sample in samples:
        x, y, w, h = sample['tile']
        box = (x + w//4, y + h//4, x + 3*w//4, y + 3*h//4)
        mid = np.median(np.asarray(atlas.crop(box)), axis=(0, 1))
        sample['hex'] = encode_hex(mid)
        sample['modelViews'] = observed.get(sample['index'], {})
    output = {'method': AIM, 'calibration': result['calibration'], 'materialCount': result['materialCount'], 'sampleCount': len(samples),
              'materials': samples}
    save_json(folder / 'materials.json', output)
    if not pilot:
        palette = {p['id'] for p in json.loads((TOOLS / (hero + '.json')).read_text())['palette']}
        bound = {s['id'] for s in samples}
        if bound != palette:
            raise ValueError(f'{hero} missing swatches {palette-bound}, unknown material bindings {bound-palette}')


def main():
    cli = argparse.ArgumentParser(description=__doc__)
    cli.add_argument('--docs', type=Path, default=ROOT / 'docs')
    cli.add_argument('--out', type=Path, default=ROOT / 'characters-review' / 'blueprints')
    cli.add_argument('--hero', choices=HEROES)
    cli.add_argument('--pilot', action='store_true')
    opts = cli.parse_args()
    docs = opts.docs.resolve()
    if 'THREE_ROOT' not in os.environ:
        cli.error('Set THREE_ROOT to the unpacked three@0.170.0 package')
    three = Path(os.environ['THREE_ROOT']).resolve()
    assert json.loads((three / 'package.json').read_text())['version'] == '0.170.0'
    spec = json.loads((TOOLS / 'views.json').read_text())
    with sync_playwright() as pw:
        browser = pw.chromium.launch(executable_path=os.environ.get('CHROME', '/usr/bin/chromium'),
            args=['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage'])
        for hero in ([opts.hero] if opts.hero else HEROES):
            folder = opts.out / hero / 'model'
            folder.mkdir(parents=True, exist_ok=True)
            page = browser.new_page()
            page.set_default_timeout(120000)
            page.route(ORIGIN + '/**', lambda r: route_source(r, docs, three))
            errors = []
            page.on('pageerror', lambda e: errors.append(str(e)))
            page.goto(ORIGIN)
            page.evaluate("""async ([hero,spec,pilot])=>{
              const {setup}=await import('/tools/blueprints/render-models.mjs');
              window.capture=await setup(hero,spec,!pilot,!pilot);
            }""", [hero,spec,opts.pilot])
            observed = write_views(page, folder, spec)
            write_materials(page, folder, hero, observed, opts.pilot)
            if not opts.pilot:
                save_json(folder / 'landmarks.json', page.evaluate('window.capture.landmarks'))
            if errors:
                raise RuntimeError('; '.join(errors))
            page.close()
            print(f'{hero}: seven registered orthographic views and real material samples in {folder}', flush=True)
        browser.close()


if __name__ == '__main__':
    main()

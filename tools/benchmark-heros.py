"""Measure the genuine Heros render and physics in Chromium on an arbitrary checkout.

Example: THREE_ROOT=/path/to/three-r170 python tools/benchmark-heros.py --repo . --output /tmp/heros.json
The npm three@0.170.0 distribution, Python Playwright and Chromium are required.
"""
import argparse
from functools import lru_cache
import gzip
import hashlib
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import mimetypes
import os
from pathlib import Path
import statistics
import subprocess
import threading
from urllib.parse import unquote, urlsplit

from playwright.sync_api import sync_playwright

TOOLS = Path(__file__).resolve().parent
CDN = 'https://cdn.jsdelivr.net/npm/three@0.170.0/'
NETWORK = dict(offline=False, latency=60, downloadThroughput=9_000_000 / 8, uploadThroughput=1_500_000 / 8, connectionType='cellular4g')


def server(repo, three):
    roots = (repo / 'docs', three)
    assert json.loads((three / 'package.json').read_text())['version'] == '0.170.0'

    fingerprints = {}

    @lru_cache(maxsize=1024)
    def content(name):
        third_party = name.startswith('/__three/')
        root = roots[third_party]
        file = (root / (name.removeprefix('/__three/') if third_party else name.lstrip('/') or 'index.html')).resolve()
        if not file.is_relative_to(root) or not file.is_file():
            raise FileNotFoundError(name)
        data = file.read_bytes()
        fingerprints[name] = hashlib.sha256(data).hexdigest()
        kind = mimetypes.guess_type(file.name)[0] or 'application/octet-stream'
        if file.suffix in ('.js', '.mjs', '.html', '.css'):
            # Serve the identical pinned CDN package over the same throttled
            # connection. Playwright route.fulfill would bypass network shaping.
            data = data.replace(CDN.encode(), b'/__three/')
            if file.name == 'index.html':
                data = data.replace(b'https://fonts.googleapis.com/css2?', b'/__system-fonts?')
            return gzip.compress(data, compresslevel=6, mtime=0), kind, 'gzip'
        return data, kind, None

    class Handler(BaseHTTPRequestHandler):
        protocol_version = 'HTTP/1.1'

        def do_GET(self):
            name = unquote(urlsplit(self.path).path)
            try:
                data, kind, encoding = (b'', 'text/css', None) if name == '/__system-fonts' else content(name)
            except FileNotFoundError:
                self.send_error(404)
                return
            self.send_response(200)
            self.send_header('Content-Type', kind)
            self.send_header('Cache-Control', 'no-store')
            self.send_header('Content-Length', str(len(data)))
            if encoding:
                self.send_header('Content-Encoding', encoding)
            self.end_headers()
            try:
                self.wfile.write(data)
            except (BrokenPipeError, ConnectionResetError):
                pass

        def log_message(self, *args):
            pass

    httpd = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
    httpd.fingerprints = fingerprints
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd


def hot_open(browser, url):
    ctx = browser.new_context(viewport={'width': 800, 'height': 680}, device_scale_factor=1, reduced_motion='reduce')
    ctx.add_init_script(path=TOOLS / 'heros-frame-cost.js')
    page = ctx.new_page()
    page.goto(url + '/?review=heros#heros', wait_until='commit', timeout=180000)
    page.wait_for_function("document.querySelector('#character-test')?.characterTest?.snapshot()?.visible && document.querySelector('#character-test canvas')?.style.visibility === 'visible'", timeout=180000)
    page.evaluate("document.querySelector('#character-test').characterTest.setManual(true)")
    return ctx, page


def hot_run(page, hero, tier, frame_count, step_count):
    renderer = page.evaluate('''async ([hero,tier]) => {
        const host = document.querySelector('#character-test'), t = host.characterTest;
        await t.tier(tier);
        if (hero === 'lineup') await t.view('lineup');
        else await t.select(hero);
        await t.reset();
        if (t.primeSecondary && !await t.primeSecondary()) throw Error('Secondary motion did not load');
        t.render();
        const snap=t.snapshot();
        if (snap.tier!==tier || (hero==='lineup' ? snap.view!=='lineup' : snap.name!==hero))
          throw Error('Unexpected actual actor or tier: '+JSON.stringify(snap));
        const gl=host.querySelector('canvas').getContext('webgl2'), ext=gl.getExtension('WEBGL_debug_renderer_info');
        return gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER);
    }''', [hero, tier])
    step = page.evaluate('''async n => {
        const t = document.querySelector('#character-test').characterTest;
        const input = {x:0,z:1,run:true};
        t.tick(8,input);
        const chunks = [];
        for (let i=0; i<n; i+=4) {
          const a=performance.now(); t.tick(4,input); chunks.push((performance.now()-a)/4);
        }
        await t.reset();
        return chunks;
    }''', step_count)
    refresh = page.evaluate("heroFrameCost.count(() => document.querySelector('#character-test').characterTest.render())")
    page.evaluate('''() => {
      const host = document.querySelector('#character-test');
      host.characterTest.setManual(false);
      host.querySelector('canvas').focus();
    }''')
    page.keyboard.down('w')
    page.wait_for_timeout(300)
    page.evaluate('heroFrameCost.start()')
    page.wait_for_function('n => heroFrameCost.frames.length >= n', arg=frame_count, polling=200, timeout=240000)
    frames = page.evaluate('heroFrameCost.stop()')[:frame_count]
    page.keyboard.up('w')
    page.evaluate("document.querySelector('#character-test').characterTest.setManual(true)")
    assert len(frames) == frame_count and refresh > 0 and all(f['draws'] for f in frames)
    return dict(hero=hero, tier=tier, renderer=renderer, stepMs=statistics.mean(step),
                stepMedianMs=statistics.median(step), scriptMs=statistics.mean(f['ms'] for f in frames),
                fps=1000*(len(frames)-1)/(frames[-1]['now']-frames[0]['now']),
                drawsMean=statistics.mean(f['draws'] for f in frames), drawsRefresh=refresh,
                drawsMax=max(refresh, max(f['draws'] for f in frames)), poseSamples=step, frames=frames)


def cold_run(browser, url, tier):
    ctx = browser.new_context(viewport={'width': 800, 'height': 680}, device_scale_factor=1, reduced_motion='reduce')
    try:
        opts = json.dumps(dict(tier=tier))
        ctx.add_init_script(script=f'window.heroBenchmarkOptions={opts};\n' + (TOOLS / 'heros-first-frame.js').read_text())
        page = ctx.new_page()
        cdp = ctx.new_cdp_session(page)
        cdp.send('Network.enable')
        cdp.send('Network.setCacheDisabled', {'cacheDisabled': True})
        cdp.send('Network.emulateNetworkConditions', NETWORK)
        cdp.send('Emulation.setCPUThrottlingRate', {'rate': 4})
        page.goto(url + '/#heros', wait_until='commit', timeout=180000)
        page.wait_for_function('heroFirstFrame.done || heroFirstFrame.error', polling=200, timeout=300000)
        captured = page.evaluate('heroFirstFrame')
        if captured.get('error'):
            raise RuntimeError(captured['error'])
        visits = {}
        for visit in captured['visits']:
            resources = visit.pop('resources')
            assert any(r['path'].endswith('three.module.js') and r['body'] > 0 for r in resources)
            assert not any(r['path'].endswith('review-controls.js') for r in resources)
            visits[visit['hero']] = dict(hero=visit['hero'], tier=tier, cold=visit, resources=resources,
                        bytes=sum(r['body'] for r in resources), transferBytes=sum(r['wire'] for r in resources),
                        modules=len({r['path'] for r in resources if r['path'].endswith(('.js', '.mjs'))}))
        return visits
    finally:
        ctx.close()


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--repo', type=Path, default=TOOLS.parent)
    p.add_argument('--output', type=Path, required=True)
    p.add_argument('--three', type=Path, default=os.getenv('THREE_ROOT'))
    p.add_argument('--chrome', default=os.getenv('CHROME', '/usr/bin/chromium'))
    p.add_argument('--tiers', nargs='+', choices=['mobile','high'], default=['mobile','high'])
    p.add_argument('--heroes', nargs='+', choices=['sippy','roma','hummin','lineup'], default=['sippy','roma','hummin','lineup'])
    p.add_argument('--phase', choices=['cold','hot','both'], default='both')
    p.add_argument('--frames', type=int, default=12)
    p.add_argument('--steps', type=int, default=32)
    a = p.parse_args()
    if not a.three or a.steps < 4 or a.steps % 4 or a.frames < 3:
        p.error('Provide THREE_ROOT/--three, a positive step count divisible by 4 and at least three frames.')
    repo = a.repo.resolve()
    httpd = server(repo, a.three.resolve())
    data = {'revision':subprocess.check_output(['git','-C',str(repo),'rev-parse','HEAD'],text=True).strip(), 'rows':[]}
    a.output.parent.mkdir(parents=True, exist_ok=True)
    try:
        with sync_playwright() as pw:
            browser = pw.chromium.launch(executable_path=a.chrome, args=['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-background-timer-throttling','--disable-renderer-backgrounding'])
            data.update(browser=browser.version, network=NETWORK, coldCpuMultiplier=4, hotCpuMultiplier=1)
            url = f'http://127.0.0.1:{httpd.server_port}'
            for tier in a.tiers:
                if a.phase != 'hot':
                    print(f'Measuring normal cold navigation and real picker actions at {tier}', flush=True)
                cold = cold_run(browser, url, tier) if a.phase != 'hot' else {}
                for hero in a.heroes:
                    print(f'Measuring {tier} {hero}', flush=True)
                    row = {}
                    if a.phase != 'cold':
                        ctx, page = hot_open(browser, url)
                        try:
                            row = hot_run(page, hero, tier, a.frames, a.steps)
                        finally:
                            ctx.close()
                    if a.phase != 'hot':
                        row.update(cold[hero])
                    data['rows'].append(row)
                    data['sourceSha256'] = dict(sorted(httpd.fingerprints.items()))
                    a.output.write_text(json.dumps(data, indent=2)+'\n')
                    print({k: row[k] for k in ('hero','tier','modules','bytes','stepMs','scriptMs','fps','drawsMax') if k in row}, row.get('cold', {}).get('ms'), flush=True)
            browser.close()
    finally:
        httpd.shutdown()


if __name__ == '__main__':
    main()

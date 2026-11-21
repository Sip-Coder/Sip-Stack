#!/usr/bin/env python3
"""Measure complete production frames, including shadows, reflections and postprocessing.

THREE_ROOT=/path/to/three-0.170.0 python tools/check-scene-draws.py http://localhost:8000/ --report frames.json
Use --observe to measure an earlier revision that exceeds the 300-draw limit.
"""
import argparse
import json
import os
from pathlib import Path
from statistics import median
from urllib.parse import urlsplit

from playwright.sync_api import sync_playwright

SCENES = {
    'village': ('.vl-stage', '.vl-quality', '.vl-track input', '[data-act="play"]'),
    'tidelight': ('.craft-stage', '.craft-quality', '.craft-scrub', '.craft-play'),
    'creek': ('.creek-stage', '.creek-quality', '.creek-time', '.creek-pause'),
}
# WebGLRenderer.info resets on each render in a multipass frame. Count the GL
# submissions on the active canvas instead, grouped by the browser RAF stamp.
HOOK = '''(() => {
  const gl = WebGL2RenderingContext.prototype, depthShaders = new WeakSet(), depthPrograms = new WeakSet();
  const program = new WeakMap();
  const shaderSource = gl.shaderSource, attach = gl.attachShader, use = gl.useProgram;
  gl.shaderSource = function(s, code) {
    if (code.includes('#define SHADER_TYPE MeshDepthMaterial')) depthShaders.add(s);
    return shaderSource.call(this,s,code);
  };
  gl.attachShader = function(p,s) {if(depthShaders.has(s)) depthPrograms.add(p);return attach.call(this,p,s);};
  gl.useProgram = function(p) {program.set(this,p);return use.call(this,p);};
  let canvas, stamp = null, draws = 0;
  const rows = new Map(), raf = requestAnimationFrame.bind(window);
  function count(context) {
    if (context.canvas !== canvas || stamp === null) return;
    let row=rows.get(stamp);
    if (!row) {row={stamp,draws:0,depthDraws:0,callbackMs:0};rows.set(stamp,row);}
    row.draws++; draws++;
    if(depthPrograms.has(program.get(context))) row.depthDraws++;
  }
  for(const name of ['drawArrays','drawElements','drawArraysInstanced','drawElementsInstanced']) {
    const actual=gl[name];gl[name]=function(...args){count(this);return actual.apply(this,args);};
  }
  window.requestAnimationFrame = cb => raf(t => {
    const before=draws, start=performance.now();stamp=t;
    try {return cb(t);} finally {if(draws>before) rows.get(t).callbackMs+=performance.now()-start;stamp=null;}
  });
  window.sceneCounter={start(c){canvas=c;rows.clear();},records(){return [...rows.values()];}};
})()'''


def run(browser, url, package, scene, tier, frames):
    context = browser.new_context(viewport={'width': 800, 'height': 700}, device_scale_factor=1,
                                  reduced_motion='no-preference')
    prefix = 'https://cdn.jsdelivr.net/npm/three@0.170.0/'
    if package:
        context.route(prefix + '**', lambda r: r.fulfill(path=package / urlsplit(r.request.url[len(prefix):]).path,
            content_type='text/javascript', headers={'Access-Control-Allow-Origin': '*'}))
    for host in ('fonts.googleapis.com', 'fonts.gstatic.com'):
        context.route('https://' + host + '/**', lambda r: r.fulfill(body='', content_type='text/css'))
    page = context.new_page()
    page.add_init_script(HOOK)
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    stage, quality, track, play = SCENES[scene]
    try:
        page.goto(url.rstrip('/') + '/#village', wait_until='domcontentloaded')
        page.locator(stage).evaluate("s=>s.scrollIntoView({block:'center'})")
        page.wait_for_function("s=>document.querySelector(s+' canvas')?.style.visibility==='visible'",
                               arg=stage, timeout=180000)
        page.locator(quality).select_option(label=tier)
        # Sample the opening, every quarter flight, and the final working area.
        # Re-select the displayed tier at each waypoint to request a fresh shadow.
        results, waypoints = [], []
        for fraction in (0, .25, .5, .75, 1):
            page.evaluate('''([stage,quality,track,time])=>{
              sceneCounter.start(document.querySelector(stage+' canvas'));
              const slider=document.querySelector(track);slider.value=slider.max*time;
              slider.dispatchEvent(new Event('input',{bubbles:true}));
              document.querySelector(quality).dispatchEvent(new Event('change',{bubbles:true}));
            }''', [stage, quality, track, fraction])
            page.wait_for_function('sceneCounter.records().length>0', polling=20, timeout=120000)
            samples = page.evaluate('sceneCounter.records()')
            results.extend(samples)
            peak = max(samples, key=lambda row: row['draws'])
            waypoints.append({'flightFraction': fraction, 'draws': peak['draws'], 'depthDraws': peak['depthDraws']})
        page.evaluate('''([stage,track,play])=>{
          sceneCounter.start(document.querySelector(stage+' canvas'));
          const slider=document.querySelector(track);slider.value=0;slider.dispatchEvent(new Event('input'));
          document.querySelector(play).click();
        }''', [stage, track, play])
        # Creek suspends at the end of its 20-second flight. A software GPU can
        # produce fewer than the requested frame count in one traversal.
        page.wait_for_function('''([n,scene])=>{
          if(sceneCounter.records().length>=n) return true;
          if(scene==='creek') {
            const slider=document.querySelector('.creek-time');
            if(slider.valueAsNumber>=Number(slider.max)) document.querySelector('.creek-replay').click();
          }
          return false;
        }''', arg=[frames, scene], polling=50, timeout=240000)
        animation = page.evaluate('sceneCounter.records()')[:frames]
        results.extend(animation)
        intervals = [b['stamp']-a['stamp'] for a,b in zip(animation,animation[1:])]
        size = page.locator(stage+' canvas').evaluate('c=>[c.width,c.height]')
        if errors:
            raise RuntimeError('\n'.join(errors))
        return {'scene': scene, 'tier': tier, 'drawingBuffer': size, 'waypoints': waypoints,
                'animationFrames': len(animation), 'peakDraws': max(r['draws'] for r in results),
                'peakDepthDraws': max(r['depthDraws'] for r in results),
                'medianAnimationDraws': median(r['draws'] for r in animation),
                'meanPresentedFps': 1000*len(intervals)/sum(intervals),
                'medianDrawCallbackMs': median(r['callbackMs'] for r in animation)}
    finally:
        context.close()


def main():
    cli = argparse.ArgumentParser(description=__doc__)
    cli.add_argument('url')
    cli.add_argument('--report', type=Path)
    cli.add_argument('--observe', action='store_true')
    cli.add_argument('--scene', choices=SCENES, action='append')
    cli.add_argument('--tier', choices=['Mobile', 'High'], action='append')
    cli.add_argument('--frames', type=int, default=24)
    opts = cli.parse_args()
    if opts.frames < 3:
        cli.error('Use at least three animation frames')
    package = Path(os.environ['THREE_ROOT']).resolve() if os.environ.get('THREE_ROOT') else None
    if package and json.loads((package/'package.json').read_text())['version'] != '0.170.0':
        cli.error('Expected three@0.170.0')
    results = []
    with sync_playwright() as pw:
        browser = pw.chromium.launch(executable_path=os.getenv('CHROME', '/usr/bin/chromium'),
            args=['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage'])
        try:
            for scene in opts.scene or SCENES:
                for tier in opts.tier or ['Mobile', 'High']:
                    row = run(browser, opts.url, package, scene, tier, opts.frames)
                    results.append(row)
                    print(json.dumps(row), flush=True)
                    if opts.report:
                        opts.report.write_text(json.dumps(results, indent=2) + '\n')
        finally:
            browser.close()
    if not opts.observe and any(r['peakDraws'] >= 300 or (r['tier'] == 'High' and not r['peakDepthDraws']) for r in results):
        raise SystemExit('Expected fewer than 300 complete-frame draws and a measured High shadow pass')


if __name__ == '__main__':
    main()

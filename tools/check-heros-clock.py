#!/usr/bin/env python3
"""Exercise the production Heros frame loop at deterministic wall times without a GPU.

THREE_ROOT=/path/to/three-0.170.0 python tools/check-heros-clock.py
"""
import os
from pathlib import Path
from urllib.parse import urlsplit

from playwright.sync_api import sync_playwright

DOCS = Path(__file__).resolve().parents[1] / 'docs'
ORIGIN = 'http://heros.test'
# This fixture exercises only the floor clock. Inspector visibility and real GPU draws
# are covered by check-axon-performance.py.
HTML = '''<meta charset="utf-8"><style>.ct-study{display:none}</style><script type="importmap">
{"imports":{"three":"/three/build/three.module.js","three/addons/":"/three/examples/jsm/"}}
</script><div id="character-test"></div>'''
# The real rig, controller, controls, HUD, quality policy and scheduler all run.
# Replace the GPU and artwork so time and observed step counts are independent
# of the host hardware. A UI render still presents one counted RAF callback.
STAGE = '''import * as T from 'three';
export function createStage(el) {
  const canvas = document.createElement('canvas');
  el.prepend(canvas);
  return {canvas, scene:new T.Scene(), camera:new T.PerspectiveCamera(), scale:{},
    autoTier:()=> 'high', warm:async()=>{}, fit:()=>true,
    quality:q=>{window.activeTier=q}, invalidateShadow(){}, illuminate(){}, draw(){}};
}
export const contactShadows = () => () => {};'''
HERO = 'export const buildSippy = () => () => { window.steps++; };'


def run(page, package):
    def resource(route):
        path = urlsplit(route.request.url).path
        if path == '/':
            route.fulfill(content_type='text/html', body=HTML)
        elif path in ('/characters/stage.js', '/characters/sippy.js'):
            route.fulfill(content_type='text/javascript', body=STAGE if path.endswith('stage.js') else HERO)
        else:
            file = package / path.removeprefix('/three/') if path.startswith('/three/') else DOCS / path[1:]
            route.fulfill(content_type='text/javascript', path=file)

    page.route(ORIGIN + '/**', resource)
    page.goto(ORIGIN)
    page.evaluate('''async () => {
      const {mountCharacters} = await import('/characters/main.js');
      let next = 0, now = 0;
      const queue = new Map();
      window.steps = 0;
      window.requestAnimationFrame = callback => {queue.set(++next, callback); return next;};
      window.cancelAnimationFrame = id => queue.delete(id);
      window.advance = (elapsed, count=1) => {
        const before = steps;
        for (let i=0; i<count; ++i) {
          const pending = [...queue.values()];
          if (pending.length !== 1) throw Error('Expected one scheduled frame; got ' + pending.length);
          queue.clear();
          now += elapsed;
          pending[0](now);
        }
        return steps - before;
      };
      window.instance = mountCharacters(document.querySelector('#character-test'));
      instance.setVisible(true);
    }''')
    page.wait_for_function('steps > 0', polling=10)
    assert page.evaluate('advance(0)') == 0
    assert page.evaluate('advance(10)') == 0
    assert page.evaluate('advance(10)') == 1
    assert page.evaluate('advance(2000)') == 2
    assert page.evaluate('advance(1)') == 0, 'Overdue whole steps leaked into the following frame'
    assert page.evaluate('advance(13)') == 1, 'Fractional time should survive a long frame'

    # A pause resets the debt, budget window and downshift history.
    page.evaluate('instance.setVisible(false); instance.setVisible(true)')
    assert page.evaluate('advance(5000)') == 0
    assert page.evaluate('advance(40, 75)') == 150
    assert page.evaluate('activeTier') == 'high', 'Exactly 50 Hz should retain High'
    assert page.evaluate('advance(50, 20)') == 40
    assert page.evaluate('activeTier') == 'high', 'A single low-rate window should retain High'
    assert page.evaluate('advance(50, 20)') == 40
    assert page.evaluate('activeTier') == 'mobile', 'A sustained 40 Hz in Auto should select Mobile'
    assert '40 Hz physics' in page.locator('[data-rate]').inner_text()
    assert '16.7 ms' in page.locator('[data-rate]').inner_text()

    tier = page.locator('[data-setting=tier]')
    tier.select_option('high')
    assert page.evaluate('advance(50, 60)') == 120
    assert page.evaluate('activeTier') == 'high', 'Manual High should survive slow frames'
    tier.select_option('auto')
    page.locator('[data-setting=slow]').check()
    assert page.evaluate('advance(20, 150)') == 45
    assert page.evaluate('activeTier') == 'high', 'Intentional quarter speed should retain High'


if __name__ == '__main__':
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(executable_path=os.getenv('CHROME', '/usr/bin/chromium'),
            args=['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'])
        try:
            run(browser.new_page(viewport={'width': 1120, 'height': 900}), Path(os.environ['THREE_ROOT']))
        finally:
            browser.close()
    print('Heros fixed-step cap, fractional carry, resume, budget HUD and Auto/High/slow-mode policy passed.')

"""Check retained tab routes, Village flicker safeguards and failed-module recovery.

Serve docs/ and pass its URL. Set THREE_ROOT to an unpacked three@0.170.0
and MERMAID_ROOT to an unpacked mermaid@11 to mirror the pinned CDN files.
Set CHROME for a non-default Chromium executable.
"""

import argparse
import json
import os
from pathlib import Path
from urllib.parse import urlsplit

from playwright.sync_api import sync_playwright


PROBE = """
(() => {
  const contexts = new Set(), villageContexts = new Set();
  const result = { villageContexts, clears: 0, black: 0, frames: 0, byTab: {}, sample: false };
  window.appChecks = result;
  const get = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function(kind, ...args) {
    const ctx = get.call(this, kind, ...args);
    if (ctx && kind === 'webgl2') contexts.add(ctx);
    return ctx;
  };
  const clear = WebGL2RenderingContext.prototype.clear;
  WebGL2RenderingContext.prototype.clear = function(mask) {
    if (mask & this.COLOR_BUFFER_BIT && this.canvas.closest('.vl-stage')
      && !this.getParameter(this.DRAW_FRAMEBUFFER_BINDING)) result.clears++;
    return clear.call(this, mask);
  };
  const swatch = document.createElement('canvas');
  swatch.width = swatch.height = 24;
  const painter = swatch.getContext('2d', {willReadFrequently:true});
  result.painted = c => {
    painter.clearRect(0,0,24,24);
    painter.drawImage(c,0,0,24,24);
    const bytes = painter.getImageData(0,0,24,24).data;
    let lit = 0;
    for (let i = 0; i < bytes.length; i += 4) {
      if (bytes[i]+bytes[i+1]+bytes[i+2] > 24 && bytes[i+3] > 16) lit++;
    }
    return lit > 12;
  };
  function inspect() {
    if (result.sample) {
      for (const gl of contexts) {
        const c = gl.canvas;
        if (!c.closest('.vl-stage')) continue;
        villageContexts.add(gl);
        if (gl.isContextLost() || !c.checkVisibility({visibilityProperty:true})) continue;
        const rect = c.getBoundingClientRect();
        if (rect.width && rect.height && rect.bottom > 0 && rect.top < innerHeight) {
          result.frames++;
          const tab = document.body.dataset.mode;
          result.byTab[tab] = (result.byTab[tab] || 0) + 1;
          if (!result.painted(c)) result.black++;
        }
      }
    }
    requestAnimationFrame(inspect);
  }
  requestAnimationFrame(inspect);
})();"""

VILLAGE = '#village .vl-stage canvas'
TAB = '.seg [role=tab]'
LEGACY_LINKS = (
    ('#heros', ''),
    ('#characters', ''),
    ('#heros/legacy', ''),
    ('?debug=characters&keep=1#heros', '?keep=1'),
    ('?review=heros&keep=2#characters', '?keep=2'),
    ('?debug=heros&keep=3', '?keep=3'),
    ('?view=example%20space#heros', '?view=example%20space'),
)
VILLAGE_PIN = '#village:has(.vl-pin.active[data-pin="auger"]) .vl-note h4'
WORLD_NOTE = '#world .card[data-id="05"][data-pin="red"] .hs-pop'
OUTLINE_CHART = '#chart-05.active .mermaid-wrap svg'


def browser_context(browser, device, packages):
    context = browser.new_context(reduced_motion='reduce', **device)
    for prefix, package in packages.items():
        def local_script(route, root=package, base=prefix):
            relative = urlsplit(route.request.url.removeprefix(base)).path
            route.fulfill(path=root / relative, content_type='text/javascript',
                          headers={'Access-Control-Allow-Origin': '*'})
        context.route(prefix + '**', local_script)
    context.route('https://fonts.googleapis.com/**', lambda route: route.fulfill(body='', content_type='text/css'))
    context.add_init_script(PROBE)
    return context


def packages_from_env():
    packages = {}
    for name, pinned, variable in (('three', '0.170.0', 'THREE_ROOT'), ('mermaid', '11', 'MERMAID_ROOT')):
        if not (path := os.getenv(variable)):
            continue
        package = Path(path).resolve()
        manifest = json.loads((package / 'package.json').read_text())
        version = manifest['version'] if name == 'three' else manifest['version'].split('.')[0]
        assert manifest['name'] == name and version == pinned, (variable, manifest['name'], manifest['version'])
        packages[f'https://cdn.jsdelivr.net/npm/{name}@{pinned}/'] = package
    return packages


MOBILE = dict(viewport={'width': 412, 'height': 915}, device_scale_factor=2.6, is_mobile=True, has_touch=True)
DESKTOP = dict(viewport={'width': 800, 'height': 680})


def show_tab(page, view, target=None):
    tab = page.locator(f'{TAB}[data-mode="{view}"]')
    tab.wait_for(state='visible')
    page.wait_for_function('(view) => document.body.dataset.mode === view', arg=view)
    assert tab.get_attribute('aria-selected') == 'true', view
    assert page.locator('section.view.active').count() == 1, view
    assert page.locator(f'#{view}.active').count() == 1, view
    content = {
        'world': '#world .card[data-id="01"] svg.scene',
        'outline': '#outline .active .mermaid-wrap svg',
        'village': VILLAGE,
    }
    page.locator(target or content[view]).first.wait_for(state='visible')
    if view == 'village' and target is None:
        page.locator(VILLAGE).evaluate("c => c.scrollIntoView({block:'center',behavior:'instant'})")
        page.wait_for_function('(selector) => appChecks.painted(document.querySelector(selector))', arg=VILLAGE)


def visit(page, url):
    response = page.goto(url, wait_until='domcontentloaded')
    assert response is None or response.status == 200, url


def failures(page):
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.on('console', lambda message: errors.append(message.text)
            if message.type == 'error' or 'INVALID_OPERATION' in message.text else None)
    return errors


def watch_requests(context):
    deleted, failed = [], []

    def request(record):
        path = urlsplit(record.url).path
        if '/characters/' in path or 'heros' in path:
            deleted.append(path)

    def response(record):
        if record.status >= 400:
            failed.append((urlsplit(record.url).path, record.status))

    context.on('request', request)
    context.on('response', response)
    return deleted, failed


def check_routes(context, url):
    deleted, failed = watch_requests(context)
    page = context.new_page()
    errors = failures(page)
    page.set_default_timeout(60000)
    for old, canonical in LEGACY_LINKS:
        visit(page, url + old)
        show_tab(page, 'world')
        assert page.url == url + canonical, (old, page.url)
        assert page.locator(TAB).all_text_contents() == ['World', 'Outline', 'Village']
        assert not page.locator('#heros, #character-test, a[href="#heros"]').count()
        assert page.locator('#world .card').count() == 9

    visit(page, url + '?keep=history#outline/05')
    show_tab(page, 'outline', OUTLINE_CHART)
    history_length = page.evaluate('history.length')
    page.evaluate("location.hash = 'heros'")
    show_tab(page, 'world')
    assert page.url == url + '?keep=history'
    assert page.evaluate('history.length') == history_length + 1
    page.go_back(wait_until='commit')
    show_tab(page, 'outline', OUTLINE_CHART)
    assert page.url == url + '?keep=history#outline/05'
    page.go_forward(wait_until='commit')
    show_tab(page, 'world')
    page.reload(wait_until='domcontentloaded')
    show_tab(page, 'world')
    assert page.url == url + '?keep=history'

    visit(page, url + '#world/05/red')
    show_tab(page, 'world', WORLD_NOTE)
    visit(page, url + '#village/auger')
    show_tab(page, 'village', VILLAGE_PIN)
    show_tab(page, 'village')
    drip = page.locator('.vl-toggles [data-t=drip]')
    drip.click()
    assert drip.get_attribute('aria-pressed') == 'true'
    page.go_back(wait_until='commit')
    show_tab(page, 'world', WORLD_NOTE)
    page.go_forward(wait_until='commit')
    show_tab(page, 'village', VILLAGE_PIN)
    assert page.url == url + '#village/auger'
    assert not (deleted or failed or errors), (deleted, failed, errors)
    return dict(legacyLinks=len(LEGACY_LINKS), savedRoutes=3, worldCards=9, villageDripToggle=True)


def check_rendering(context, url, tier, cycles):
    deleted, failed = watch_requests(context)
    page = context.new_page()
    errors = failures(page)
    page.set_default_timeout(60000)
    visit(page, url + '#village/auger')
    show_tab(page, 'village')
    quality = page.locator('.vl-quality')
    quality.select_option(tier)
    show_tab(page, 'village')
    assert quality.input_value() == tier
    page.evaluate('Object.assign(appChecks, {clears:0, black:0, frames:0, byTab:{}, sample:true})')
    for _ in range(cycles):
        for view in ('world', 'outline', 'village'):
            page.locator(f'{TAB}[data-mode="{view}"]').click()
            show_tab(page, view)
        page.evaluate('() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))')
    stats = page.evaluate("""() => {
        appChecks.sample = false;
        const {clears,black,frames,byTab,villageContexts} = appChecks;
        return {clears,black,frames,byTab,villageContexts:villageContexts.size};
    }""")
    assert stats['clears'] == stats['black'] == 0 and stats['frames'] >= 2 * cycles, stats
    assert stats['villageContexts'] == 1, stats

    restore_context(page)
    assert not (deleted or failed or errors), (deleted, failed, errors)
    return dict(stats, tier=tier, deviceRatio=page.evaluate('devicePixelRatio'), cycles=cycles, contextRestored=True)


def restore_context(page, during_loss=None):
    canvas = page.locator(VILLAGE)
    canvas.evaluate("""c => {
        const gl = c.getContext('webgl2');
        if (!gl.getContextAttributes().preserveDrawingBuffer) throw Error('Village did not retain its framebuffer');
        window.villageLoss = gl.getExtension('WEBGL_lose_context');
        if (!villageLoss) throw Error('Missing WEBGL_lose_context');
        villageLoss.loseContext();
    }""")
    page.wait_for_function("selector => document.querySelector(selector).style.visibility === 'hidden'", arg=VILLAGE)
    if during_loss:
        page.evaluate(during_loss)
    page.wait_for_timeout(300)
    page.evaluate('villageLoss.restoreContext()')
    show_tab(page, 'village')
    assert canvas.evaluate("c => { const gl = c.getContext('webgl2'); return !gl.isContextLost() && gl.getError() === gl.NO_ERROR; }")


def check_recovery(context, url, scene, permanent=False):
    page = context.new_page()
    page.set_default_timeout(60000)
    errors = failures(page)
    documents = []
    attempts = []

    def request(record):
        if record.resource_type == 'document':
            documents.append(record.url)

    status = 503 if scene == 'world' else 404

    def fail_module(route):
        kind = route.request.resource_type
        attempts.append(kind)
        if kind == 'script' and (permanent or attempts.count('script') == 1):
            route.fulfill(status=status, content_type='text/javascript', body='')
        else:
            route.continue_()

    page.on('request', request)
    path = 'sip-charts.js' if scene == 'world' else 'sip-village.js'
    context.route(url + 'assets/' + path, fail_module)
    if scene == 'world':
        visit(page, url + '?keep=recovery#heros')
        canonical = url + '?keep=recovery'
    else:
        visit(page, url + '#world')
        show_tab(page, 'world')
        assert not attempts, attempts
        page.get_by_role('tab', name='Village', exact=True).click()
        canonical = url + '#village'

    page.wait_for_function("sessionStorage.getItem('sip-recovered-at')")
    if permanent:
        page.get_by_text('Village could not load. Refresh to try again.', exact=True).wait_for()
    else:
        show_tab(page, scene)
    assert page.url == canonical, page.url
    assert len(documents) == 2 and attempts.count('script') == 2 and 'fetch' in attempts, (documents, attempts)
    expected = (str(status), f'{scene.capitalize()} failed to load')
    assert not [error for error in errors if not any(fragment in error for fragment in expected)], errors
    return dict(injectedStatus=status, moduleRequests=attempts, documentLoads=len(documents),
                retryMessage=permanent, repainted=not permanent)


WARM_REJECTION = """
import {warmShaders as native} from './sip-warm.js?native';

export function warmShaders(renderer, jobs) {
  const monitor = window.villageWarmRejection;
  if (!monitor?.pending || !renderer.domElement.closest('.vl-stage')) return native(renderer, jobs);
  const previous = renderer.getRenderTarget();
  const compile = renderer.compileAsync;
  renderer.compileAsync = function (...args) {
    if (!monitor.pending) return compile.apply(this, args);
    monitor.pending = false;
    monitor.rejected++;
    return Promise.reject(new Error('injected Village warm-up rejection'));
  };
  try {
    const result = native(renderer, jobs);
    monitor.targetRestored = renderer.getRenderTarget() === previous;
    return result;
  } finally {
    renderer.compileAsync = compile;
  }
}
"""


def check_warm_rejection(context, url):
    context.route(url + 'assets/sip-warm.js', lambda route: route.fulfill(
        content_type='text/javascript', body=WARM_REJECTION,
    ))
    page = context.new_page()
    page.set_default_timeout(60000)
    errors = failures(page)
    warnings = []
    page.on('console', lambda message: warnings.append(message.text)
            if message.type == 'warning' and 'injected Village' in message.text else None)
    visit(page, url + '#village/auger')
    show_tab(page, 'village')
    restore_context(page, 'window.villageWarmRejection = {pending:true, rejected:0, targetRestored:false}')
    result = page.evaluate('window.villageWarmRejection')
    assert result == {'pending': False, 'rejected': 1, 'targetRestored': True}, result
    assert len(warnings) == 1 and not errors, (warnings, errors)
    return dict(shaderRejections=1, previousTargetRestored=True, canvasRepainted=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('url', help='Static URL serving docs/')
    parser.add_argument('--cycles', type=int, default=3)
    parser.add_argument('--output', type=Path)
    args = parser.parse_args()
    if args.cycles < 1:
        parser.error('--cycles must be positive')
    url = args.url.rstrip('/') + '/'
    packages = packages_from_env()
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(executable_path=os.getenv('CHROME', '/usr/bin/chromium'),
            args=['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage', '--no-sandbox'])
        checks = (
            ('routes', MOBILE, check_routes),
            ('mobile', MOBILE, check_rendering, 'Mobile', args.cycles),
            ('desktop', DESKTOP, check_rendering, 'High', args.cycles),
            ('worldRecovery', MOBILE, check_recovery, 'world'),
            ('villageRecovery', MOBILE, check_recovery, 'village'),
            ('villageRecoveryLimit', MOBILE, check_recovery, 'village', True),
            ('shaderWarmFailure', MOBILE, check_warm_rejection),
        )
        report = dict(chromium=browser.version)
        try:
            for name, device, check, *options in checks:
                context = browser_context(browser, device, packages)
                try:
                    report[name] = check(context, url, *options)
                    print(name, 'passed', flush=True)
                finally:
                    context.close()
        finally:
            browser.close()
    output = json.dumps(report, indent=2)
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(output + '\n')
    print(output)


if __name__ == '__main__':
    main()

"""Exercise the Heros tab with Chromium and Playwright for Python.

Serve docs/ and pass its URL. Optionally set CHROME and THREE_ROOT (the unpacked
three@0.170.0 distribution), and MERMAID_ROOT for an unpacked mermaid@11
package to serve the Outline diagrams locally. --system-fonts uses fallback fonts for
offline runs. All application scripts, the renderer and shader programs run.
"""
import argparse
import json
import os
from pathlib import Path
from urllib.parse import urlsplit

from playwright.sync_api import sync_playwright


PROBE = """
(() => {
  const contexts = new Set(), result = { contexts, clears: 0, black: 0, frames: 0, byTab: {}, sample: false };
  window.characterChecks = result;
  const get = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function(kind, ...args) {
    const ctx = get.call(this, kind, ...args);
    if (ctx && (kind === 'webgl2' || kind === 'webgl')) contexts.add(ctx);
    return ctx;
  };
  const clear = WebGL2RenderingContext.prototype.clear;
  WebGL2RenderingContext.prototype.clear = function(mask) {
    if (mask & this.COLOR_BUFFER_BIT && this.canvas.closest('#character-test')
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
        if (gl.isContextLost() || !c.isConnected || !c.checkVisibility({visibilityProperty:true})) continue;
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
HOST = "#character-test"
HEROES = ("sippy", "roma", "hummin")


def browser_context(browser, *, package=None, system_fonts=False, width=680, height=820, touch=False):
    context = browser.new_context(viewport={"width": width, "height": height},
                                  reduced_motion="reduce", has_touch=touch, ignore_https_errors=True)
    if package:
        assert json.loads((package / "package.json").read_text())["version"] == "0.170.0"
        prefix = "https://cdn.jsdelivr.net/npm/three@0.170.0/"
        context.route(prefix + "**", lambda r: r.fulfill(
            path=package / urlsplit(r.request.url.split(prefix)[1]).path,
            content_type="text/javascript", headers={"Access-Control-Allow-Origin": "*"}))
    if os.getenv("MERMAID_ROOT"):
        mermaid = Path(os.environ["MERMAID_ROOT"]).resolve()
        info = json.loads((mermaid / "package.json").read_text())
        assert info["name"] == "mermaid" and info["version"].split(".")[0] == "11", info["version"]
        diagrams = "https://cdn.jsdelivr.net/npm/mermaid@11/"
        context.route(diagrams + "**", lambda r: r.fulfill(
            path=mermaid / urlsplit(r.request.url.split(diagrams)[1]).path,
            content_type="text/javascript", headers={"Access-Control-Allow-Origin": "*"}))
    if system_fonts:
        context.route("https://fonts.googleapis.com/**", lambda r: r.fulfill(body="", content_type="text/css"))
    return context


def assert_heros_route(page):
    page.wait_for_function("""() => location.hash === '#heros' &&
        document.body.dataset.mode === 'heros' &&
        document.querySelector('#heros.active')""")
    tab = page.get_by_role("tab", name="Heros", exact=True)
    assert tab.get_attribute("aria-selected") == "true"
    assert tab.get_attribute("aria-controls") == "heros"
    assert page.title() == "Heros · Sip-Stack"


def check_saved_links(page, url):
    base = url.rstrip("/") + "/"
    # A saved debug URL must still enable the skeleton/contacts inspector.
    page.goto(base + "?debug=characters&keep=1#characters", wait_until="domcontentloaded")
    assert_heros_route(page)
    assert page.url == base + "?debug=heros&keep=1#heros", page.url
    page.wait_for_function("document.querySelector('#character-test')?.characterTest")
    assert page.get_by_role("heading", name="Heros", exact=True).is_visible()

    # A plain old bookmark works independently of debug. Replacing its
    # fragment must leave exactly one entry between World and Heros.
    page.goto(base + "#characters", wait_until="domcontentloaded")
    assert_heros_route(page)
    assert page.url == base + "#heros"
    page.evaluate("location.hash = 'world'")
    page.wait_for_function("location.hash === '#world' && document.body.dataset.mode === 'world'")
    history_size = page.evaluate("history.length")
    page.evaluate("location.hash = 'characters'")
    assert_heros_route(page)
    assert page.url == base + "#heros"
    assert page.evaluate("history.length") == history_size + 1
    page.go_back()
    page.wait_for_function("location.hash === '#world' && document.body.dataset.mode === 'world'")
    page.go_forward()
    assert_heros_route(page)
    page.locator('.seg button[data-mode="world"]').click()
    page.wait_for_function("document.body.dataset.mode === 'world'")
    page.get_by_role("link", name="Heros", exact=False).click()
    assert_heros_route(page)
    print("Heros deep links, saved debug and tab links, Back/Forward and landing link", flush=True)


def ready(page, url):
    page.goto(url.rstrip("/") + "/?review=heros#heros", wait_until="domcontentloaded")
    assert_heros_route(page)
    page.locator(HOST).scroll_into_view_if_needed()
    page.wait_for_function("document.querySelector('#character-test')?.characterTest")
    page.wait_for_function("""() => {
        const c = document.querySelector('#character-test canvas');
        return c && c.width && c.checkVisibility({visibilityProperty:true});
    }""")


def call(page, fn, *args):
    return page.locator(HOST).evaluate("(e,[fn,args]) => e.characterTest[fn](...args)", [fn, args])


def check_lazy_cast(page):
    page.wait_for_function("document.querySelector('#character-test').characterTest.snapshot().firstHeroPainted")
    assert page.evaluate("performance.getEntriesByName('heros-first-hero-frame').length") == 1
    call(page, "setManual", True)
    cast_modules = """() => performance.getEntriesByType('resource')
      .map(r=>new URL(r.name).pathname).filter(p=>/\\/characters\\/(sippy|roma|hummin)\\.js$/.test(p)).map(p=>p.split('/').pop()).sort()"""
    assert call(page, "snapshot")["built"] == ["sippy"]
    assert page.evaluate(cast_modules) == ["sippy.js"]
    call(page, "select", "hummin")
    assert call(page, "snapshot")["built"] == ["sippy", "hummin"]
    assert page.evaluate(cast_modules) == ["hummin.js", "sippy.js"]
    call(page, "view", "lineup")
    assert call(page, "snapshot")["built"] == list(HEROES)
    warmed = page.evaluate("characterChecks.warms")
    modules = page.evaluate(cast_modules)
    assert modules == ["hummin.js", "roma.js", "sippy.js"]
    for hero in HEROES:
        call(page, "select", hero)
        call(page, "render")
        assert call(page, "snapshot")["name"] == hero
    assert page.evaluate(cast_modules) == modules and page.evaluate("characterChecks.warms") == warmed
    print("First frame Sippy alone; selecting Hummin and then Lineup loads each builder once. "
          "Cached selections reuse the prepared actors.", flush=True)


def switch(page, mode):
    page.locator(f'.seg button[data-mode="{mode}"]').evaluate("b => b.click()")
    page.wait_for_function("mode => document.body.dataset.mode === mode", arg=mode)
    selected = page.locator('.seg button[aria-selected="true"]')
    assert selected.get_attribute("data-mode") == mode
    if mode == "village":
        page.locator(".vl-stage").evaluate("e=>e.scrollIntoView({block:'center',behavior:'instant'})")
        page.wait_for_function("""() => {
            const c=document.querySelector('.vl-stage canvas');
            return c && c.style.visibility==='visible' && characterChecks.painted(c);
        }""")
    if mode == "heros":
        page.locator("#character-test canvas").scroll_into_view_if_needed()
        page.wait_for_function("""() => {
            const c=document.querySelector('#character-test canvas');
            return c.checkVisibility({visibilityProperty:true}) && characterChecks.painted(c);
        }""")
    if mode == "world":
        page.wait_for_selector("#world svg.scene", state="visible")
    if mode == "outline":
        page.wait_for_selector(".panel.active .mermaid-wrap svg", state="visible")
    page.evaluate("() => new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))")


def formation(page):
    call(page, "view", "lineup")
    call(page, "render")
    assert page.locator('[data-action="lineup"]').get_attribute("aria-pressed") == "true"
    group = page.locator('[data-action="group"]')
    group.evaluate("button=>button.click()")
    assert group.get_attribute("aria-pressed") == "true"
    # While walking together, selecting the next driver preserves all world positions.
    travel = page.locator(HOST).evaluate("""async h => {
      const t = h.characterTest;
      const positions = async () => {
        const points = [];
        for (const name of ['sippy','roma','hummin']) {
          await t.select(name); const {x,z}=t.snapshot(); points.push([x,z]);
        }
        return points;
      };
      const start=await positions();
      await t.select('sippy'); t.tick(180,{x:0,z:1});
      const end=await positions();
      return end.map(([x,z],i)=>Math.hypot(x-start[i][0],z-start[i][1]));
    }""")
    assert min(travel) > 1.0, travel
    print("Three-character formation travel (ft)", [round(d * 3.28084, 2) for d in travel], flush=True)
    group.evaluate("button=>button.click()")


def controls(page):
    canvas = page.locator(HOST + " canvas")
    canvas.focus()
    page.keyboard.press("Digit2")
    page.wait_for_function("document.querySelector('#character-test').characterTest.snapshot().name === 'roma'")
    page.keyboard.down("KeyW")
    page.wait_for_function("document.querySelector('#character-test').characterTest.snapshot().speed > 0.9")
    page.keyboard.down("Shift")
    page.wait_for_function("document.querySelector('#character-test').characterTest.snapshot().speed > 3.45")
    page.keyboard.press("Control")
    wait_state(page, "roll")
    page.keyboard.up("KeyW")
    page.keyboard.up("Shift")
    wait_state(page, "idle")
    page.keyboard.press("Space")
    wait_state(page, "jump")
    wait_state(page, "idle")
    page.keyboard.press("KeyE")
    page.wait_for_function("document.querySelector('#character-test').characterTest.snapshot().emote >= 0")
    page.keyboard.press("Tab")
    assert page.locator('[data-setting="slow"]').is_checked()
    page.keyboard.press("Tab")
    page.keyboard.press("KeyR")
    # Exercise the public Gamepad API boundary using a standard-mapped device.
    page.evaluate("""() => {
      window.pad = {connected:true, mapping:'standard', axes:[1,0,0,0], buttons:Array.from({length:16},()=>({pressed:false}))};
      Object.defineProperty(navigator,'getGamepads',{configurable:true,value:()=>[pad]});
    }""")
    page.wait_for_function("document.querySelector('#character-test').characterTest.snapshot().speed > 3.45")
    page.evaluate("pad.buttons[1].pressed=true")
    wait_state(page, "roll")
    page.evaluate("pad.axes[0]=0;pad.buttons[1].pressed=false;delete navigator.getGamepads")
    wait_state(page, "idle")
    print("Keyboard and standard gamepad input", flush=True)


def wait_state(page, state):
    page.wait_for_function("s=>document.querySelector('#character-test').characterTest.snapshot().state === s", arg=state)


def touch_controls(browser, url, package, system_fonts):
    context = browser_context(browser, package=package, system_fonts=system_fonts, width=390, height=844, touch=True)
    try:
        page = context.new_page()
        page.set_default_timeout(120000)
        ready(page, url)
        stage = page.locator(".ct-stage")
        stage.scroll_into_view_if_needed()
        page.locator(".ct-stick").wait_for(state="visible")
        stick = page.locator(".ct-stick").bounding_box()
        cdp = context.new_cdp_session(page)
        pos = {"x":stick["x"]+stick["width"]*.8, "y":stick["y"]+stick["height"]*.5, "id":1}
        cdp.send("Input.dispatchTouchEvent", {"type":"touchStart", "touchPoints":[pos]})
        page.wait_for_function("document.querySelector('#character-test').characterTest.snapshot().speed > .4")
        run = page.locator('[data-touch="run"]').bounding_box()
        button = {"x":run["x"]+run["width"]/2, "y":run["y"]+run["height"]/2, "id":2}
        cdp.send("Input.dispatchTouchEvent", {"type":"touchStart", "touchPoints":[pos,button]})
        page.wait_for_function("document.querySelector('#character-test').characterTest.snapshot().speed > 2.3")
        cdp.send("Input.dispatchTouchEvent", {"type":"touchEnd", "touchPoints":[]})
        wait_state(page, "idle")
        for action in ("jump","roll"):
            page.locator(f'[data-touch="{action}"]').tap()
            wait_state(page, action)
            wait_state(page, "idle")
        print("Touch stick, simultaneous run, jump and roll", flush=True)
    finally:
        context.close()


def exercise(browser, url, package, system_fonts):
    context = browser_context(browser, package=package, system_fonts=system_fonts)
    context.add_init_script(PROBE)
    # Observe the production shader compiler and its render-target handoff.
    # Querying the same module under a distinct URL bypasses this wrapper.
    context.route("**/assets/sip-warm.js", lambda r: r.fulfill(content_type="text/javascript", body="""
        import {warmShaders as native} from './sip-warm.js?observed';
        export function warmShaders(renderer,jobs) {
          if (!renderer.domElement.closest('#character-test')) return native(renderer,jobs);
          const c = window.characterChecks, before = renderer.getRenderTarget();
          const compile = renderer.compileAsync, inject = c.rejectOneWarm;
          if (inject) renderer.compileAsync = function(...args) {
            if (!c.rejectOneWarm) return compile.apply(this,args);
            c.rejectOneWarm = false;
            return Promise.reject(Error('test warm-up rejection'));
          };
          let work;
          try { work = native(renderer,jobs); }
          finally { if (inject) renderer.compileAsync = compile; }
          if (renderer.getRenderTarget() !== before) throw Error('Warm-up changed the render target');
          return work.then(duration => { c.warms = (c.warms || 0) + 1; return duration; });
        }
    """))
    page = context.new_page()
    page.set_default_timeout(120000)
    errors = []
    warm_warnings = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    page.on("console", lambda m: warm_warnings.append(m.text) if
            m.type == "warning" and "test warm-up rejection" in m.text else None)
    try:
        check_saved_links(page, url)
        ready(page, url)
        check_lazy_cast(page)
        call(page, "view", "front")
        canvas = page.locator(HOST + " canvas")
        assert canvas.evaluate("c=>c.getContext('webgl2').getContextAttributes().preserveDrawingBuffer")
        for tier in ("mobile", "high"):
            call(page, "tier", tier)
            for hero in HEROES:
                call(page, "select", hero)
                call(page, "view", "front")
                call(page, "render")
                stats = call(page, "snapshot")
                assert stats["name"].lower() == hero, stats
                assert canvas.evaluate("c => characterChecks.painted(c)"), (tier, hero)
            before = page.evaluate("characterChecks.warms")
            assert before > 0
            canvas.evaluate("""c => {
                window.contextLoss = c.getContext('webgl2').getExtension('WEBGL_lose_context');
                contextLoss.loseContext();
            }""")
            page.wait_for_function("document.querySelector('#character-test canvas').style.visibility==='hidden'")
            page.wait_for_timeout(120)
            if tier == "mobile":
                page.evaluate("characterChecks.rejectOneWarm=true")
            page.evaluate("contextLoss.restoreContext()")
            page.wait_for_function("""() => {
                const c=document.querySelector('#character-test canvas');
                return c.checkVisibility({visibilityProperty:true}) && characterChecks.painted(c);
            }""")
            assert canvas.evaluate("c=>{const gl=c.getContext('webgl2');return gl.getError()===gl.NO_ERROR}"), tier
            assert page.evaluate("characterChecks.warms") > before
            print(f"{tier} · three heroes rendered, context restored and shaders rewarmed", flush=True)
        assert len(warm_warnings) == 1, warm_warnings
        print("Rejected shader warm-up returned to the preserved target and the stage painted", flush=True)
        formation(page)
        call(page, "tier", "mobile")
        call(page, "view", "follow")
        call(page, "reset")
        call(page, "setManual", False)
        controls(page)
        modes = ("world", "outline", "village", "heros")
        for mode in modes:
            switch(page, mode)
        baseline = page.evaluate("characterChecks.contexts.size")
        page.evaluate("characterChecks.sample=true")
        for cycle in range(20):
            for mode in modes:
                switch(page, mode)
            if (cycle + 1) % 5 == 0:
                print(f"Completed {cycle + 1} four-tab cycles", flush=True)
        result = page.evaluate("""() => {
          const {contexts,clears,black,frames,byTab}=characterChecks;
          return {contexts:contexts.size,clears,black,frames,byTab};
        }""")
        assert result["contexts"] == baseline, (baseline, result)
        assert result["frames"] >= 40 and result["clears"] == result["black"] == 0, result
        assert all(result["byTab"].get(tab, 0) >= 20 for tab in ("village", "heros")), result
        print("20 four-tab cycles", json.dumps(result), flush=True)
        assert not errors, errors
    finally:
        if errors:
            print("Browser errors", json.dumps(errors), flush=True)
        context.close()


def check_recovery(browser, url, package, system_fonts):
    for permanent in (False, True):
        print("Injecting", "persistent" if permanent else "transient", "missing hero builder", flush=True)
        context = browser_context(browser, package=package, system_fonts=system_fonts, width=420, touch=True)
        context.add_init_script(PROBE)
        try:
            page = context.new_page()
            page.set_default_timeout(120000)
            requests, documents = [], []
            page.on("request", lambda r: documents.append(r.url) if r.is_navigation_request() else None)

            def stale_builder(route):
                kind = route.request.resource_type
                requests.append(kind)
                if kind == "script" and (permanent or requests.count("script") == 1):
                    route.fulfill(status=404, body="Missing hero module", content_type="text/javascript")
                else:
                    route.continue_()

            page.route("**/characters/sippy.js", stale_builder)
            page.goto(url.rstrip("/") + "/#world", wait_until="domcontentloaded")
            page.wait_for_selector("#world svg.scene", state="visible")
            assert not requests, requests
            page.locator('.seg button[data-mode="heros"]').evaluate("b => b.click()")
            if permanent:
                page.get_by_text("Could not load the character", exact=False).wait_for()
                suppressed = page.evaluate("""async () =>
                  (await import('./assets/sip-recover.js')).recover('QA repeat', Error('still stale'))""")
                assert suppressed is False
            else:
                page.wait_for_function("""() => {
                  const c=document.querySelector('#character-test canvas');
                  return sessionStorage.getItem('sip-recovered-at') &&
                    performance.getEntriesByName('heros-first-hero-frame').length &&
                    c?.checkVisibility({visibilityProperty:true}) && characterChecks.painted(c);
                }""")
            assert_heros_route(page)
            assert len(documents) == 2 and requests.count("script") == 2 and "fetch" in requests, (documents, requests)
            print("Stale selected hero", "loop suppressed" if permanent else "restored",
                  json.dumps({"documents":len(documents), "requests":requests}), flush=True)
        finally:
            context.close()


def launch(pw, mesa=False):
    args = ["--no-sandbox", "--disable-dev-shm-usage", "--hide-scrollbars"]
    if mesa:
        args += ["--ozone-platform=x11", "--enable-gpu", "--ignore-gpu-blocklist",
                 "--disable-gpu-watchdog", "--use-gl=angle", "--use-angle=gl", "--disable-software-rasterizer"]
    else:
        args += ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"]
    return pw.chromium.launch(executable_path=os.getenv("CHROME", "/usr/bin/chromium"), headless=not mesa, args=args)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("url")
    parser.add_argument("--system-fonts", action="store_true")
    parser.add_argument("--mesa", action="store_true", help="Use the local X11 display with Mesa OpenGL")
    args = parser.parse_args()
    package = Path(os.environ["THREE_ROOT"]).resolve() if os.getenv("THREE_ROOT") else None
    with sync_playwright() as pw:
        browser = launch(pw, args.mesa)
        try:
            check_recovery(browser, args.url, package, args.system_fonts)
            exercise(browser, args.url, package, args.system_fonts)
            touch_controls(browser, args.url, package, args.system_fonts)
        finally:
            browser.close()

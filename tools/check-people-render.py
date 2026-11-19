"""Check the three production render paths with Chromium and Playwright for Python.

Pass a static docs URL (including trailing slash) for each checkout to compare.
THREE_ROOT points to an unpacked three@0.170.0. --restore also exercises a real
WebGL context loss and verifies that each canvas repaints its retained scene.
"""

import argparse
import json
import os
from pathlib import Path
from statistics import median
from urllib.parse import urlsplit

from playwright.sync_api import sync_playwright


def measure(browser, url, package, restore, activity=False, motion=False):
    context = browser.new_context(viewport={"width": 390, "height": 844},
                                  has_touch=True, is_mobile=True, reduced_motion="no-preference" if activity or motion else "reduce")

    def resolve(route):
        request = route.request.url
        marker = "cdn.jsdelivr.net/npm/three@0.170.0/"
        if marker in request:
            path = urlsplit(request.split(marker, 1)[1]).path
            route.fulfill(path=package / path, content_type="application/javascript",
                          headers={"Access-Control-Allow-Origin": "*"})
        elif activity and urlsplit(request).path.endswith("/life/physics.js"):
            response = route.fetch()
            source = response.text()
            signature = "function pose(t, action) {"
            assert source.count(signature) == 1
            source = source.replace(signature, signature +
                " window.workerTicks[root.name] = (window.workerTicks[root.name] || 0) + 1;")
            route.fulfill(response=response, body=source)
        elif urlsplit(request).hostname in ("fonts.googleapis.com", "fonts.gstatic.com"):
            route.fulfill(body="", content_type="text/css")
        else:
            route.continue_()

    context.route("**/*", resolve)
    page = context.new_page()
    errors = []
    page.on("pageerror", lambda error: errors.append(error.stack or str(error)))
    page.on("console", lambda msg: errors.append(msg.text) if msg.type == "error" else None)
    if restore:
        page.add_init_script("""window.screenClears = [];
            const clear = WebGL2RenderingContext.prototype.clear;
            WebGL2RenderingContext.prototype.clear = function(mask) {
              const stage = this.canvas.parentElement;
              if ((mask & this.COLOR_BUFFER_BIT) && stage?.matches('.vl-stage,.craft-stage,.creek-stage') &&
                  !this.getParameter(this.DRAW_FRAMEBUFFER_BINDING)) screenClears.push(stage.className);
              return clear.call(this, mask);
            };""")
    page.add_init_script("""Error.stackTraceLimit = 32;
        window.firstSceneFrames = {}; window.workerTicks = {};
        new MutationObserver(records => {
          for (const {target: canvas} of records) {
            if (canvas.nodeName !== 'CANVAS' || canvas.style.visibility !== 'visible') continue;
            const stage = canvas.parentElement.className;
            window.firstSceneFrames[stage] ??= performance.now();
          }
        }).observe(document, {attributes:true,attributeFilter:['style'],subtree:true});""")
    times = {}
    try:
        page.goto(url.rstrip("/") + "/#village", wait_until="domcontentloaded")
        for prefix, module in (("vl", "village"), ("craft", "craft"), ("creek", "creek")):
            stage = "." + prefix + "-stage"
            visible = "s => document.querySelector(s + ' canvas')?.style.visibility === 'visible'"
            page.locator(stage).evaluate("e => e.scrollIntoView({block:'center'})")
            page.wait_for_function(visible, arg=stage, timeout=180000)
            canvas = page.locator(stage + " canvas")
            times[module] = page.evaluate("""([stage,name]) => {
                const script = performance.getEntriesByType('resource').find(
                  e => new URL(e.name).pathname.endsWith('/sip-' + name + '.js'));
                return Math.round(firstSceneFrames[document.querySelector(stage).className] - script.startTime);
            }""", [stage, module])
            assert canvas.evaluate("c => c.getContext('webgl2').getContextAttributes().preserveDrawingBuffer")
            if restore:
                print("Visible frame", module, flush=True)
            if restore and prefix == "vl":
                notes = page.evaluate("""() => {
                    const pins = [...document.querySelectorAll('.vl-list [data-pin]')];
                    return pins.map(pin => {
                      pin.click();
                      return document.querySelector('.vl-note h4').textContent;
                    });
                }""")
                assert len(notes) == len(set(notes)) == 18, notes
                page.locator(".vl-transport [data-act=reset]").evaluate("button => button.click()")
                quality = page.locator(".vl-quality")
                for setting in ("High", "Mobile"):
                    quality.select_option(label=setting)
                    page.evaluate("() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done)))")
            if restore:
                page.locator(stage).evaluate("e => e.scrollIntoView({block:'center'})")
                canvas.evaluate("""c => {
                  window.loss = c.getContext('webgl2').getExtension('WEBGL_lose_context');
                  loss.loseContext();
                }""")
                page.wait_for_function("s=>document.querySelector(s+' canvas').style.visibility==='hidden'",
                                       arg=stage, timeout=30000)
                page.wait_for_timeout(250)
                page.evaluate("loss.restoreContext()")
                page.wait_for_function(visible, arg=stage, timeout=180000)
            if restore:
                print("Restored frame", module, flush=True)
            colors = canvas.evaluate("""c => {
                const sample=document.createElement('canvas'); sample.width=32; sample.height=32;
                const ctx=sample.getContext('2d'); ctx.drawImage(c,0,0,32,32);
                const rgba=ctx.getImageData(0,0,32,32).data;
                return new Set(new Uint32Array(rgba.buffer)).size;
            }""")
            assert colors > 24, (module, "blank framebuffer", colors)
        if activity:
            names = {"vl": "Harvester", "craft": "Pier hand", "creek": "Cooper"}
            for prefix, actor in names.items():
                page.locator("." + prefix + "-stage").evaluate("e=>e.scrollIntoView({block:'center'})")
                start = page.evaluate("name=>workerTicks[name] || 0", actor)
                page.wait_for_function("([k,n])=>workerTicks[k] >= n+3", arg=[actor, start], timeout=60000)
                snapshot = page.evaluate("() => ({...workerTicks})")
                page.wait_for_function("([k,n])=>workerTicks[k] >= n+6", arg=[actor, snapshot[actor]],
                                       timeout=60000)
                end = page.evaluate("() => ({...workerTicks})")
                for inactive in names.values():
                    if inactive != actor:
                        assert end[inactive] == snapshot[inactive], (actor, inactive, snapshot, end)
                print("Exclusive active physics", actor, flush=True)
        assert not errors, errors
        if restore:
            assert not page.evaluate("screenClears"), "default framebuffer cleared during scene render"
        return times
    except Exception:
        if errors:
            print(json.dumps(errors), flush=True)
        raise
    finally:
        context.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("urls", nargs="+")
    parser.add_argument("--runs", type=int, default=1)
    parser.add_argument("--restore", action="store_true")
    parser.add_argument("--activity", action="store_true", help="Verify exclusive physics updates with motion enabled")
    parser.add_argument("--motion", action="store_true", help="Measure cold starts with animation enabled")
    options = parser.parse_args()
    package = Path(os.environ.get("THREE_ROOT", "node_modules/three")).resolve()
    assert json.loads((package / "package.json").read_text())["version"] == "0.170.0"
    with sync_playwright() as driver:
        results = {url: [] for url in options.urls}
        for run in range(options.runs):
            for url in (options.urls if run % 2 == 0 else reversed(options.urls)):
                browser = driver.chromium.launch(executable_path=os.environ.get("CHROME", "/usr/bin/chromium"),
                    args=["--enable-unsafe-swiftshader","--use-angle=swiftshader","--disable-dev-shm-usage","--no-sandbox"])
                try:
                    timing = measure(browser, url, package, options.restore, options.activity, options.motion)
                    results[url].append(timing)
                    print(json.dumps({"run": run + 1, "url": url, "ms": timing}), flush=True)
                finally:
                    browser.close()
        for url, runs in results.items():
            print(json.dumps({"url": url, "medianMs": {key: median(r[key] for r in runs) for key in runs[0]}}))

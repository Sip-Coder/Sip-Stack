"""Check native Bots rendering and compare its phone cost with Village.

Use Python Playwright, Chromium and the unpacked official three@0.170.0 npm package.
THREE_ROOT=/path/to/three python tools/bots/check_viewer.py --output /tmp/bots.json
Set MERMAID_ROOT to an unpacked mermaid@11 package for offline Outline checks.
"""

import argparse
from collections import Counter
import json
import os
from pathlib import Path
import runpy
from statistics import median, quantiles
import subprocess
from urllib.parse import urlsplit

from playwright.sync_api import sync_playwright

REPO = Path(__file__).resolve().parents[2]
MOBILE = dict(viewport={"width": 412, "height": 915}, device_scale_factor=2.6,
              is_mobile=True, has_touch=True)
DESKTOP = dict(viewport={"width": 1440, "height": 960}, device_scale_factor=1)
SELECTORS = {"bots": "#bots .bots-stage", "village": "#village .vl-stage",
             "heros": "#heros .ct-stage"}

PROBE = r"""
(() => {
  const gls = new Map(), owners = new WeakMap();
  const surfaces = Object.entries(__SELECTORS__);
  const result = window.botsAudit = {
    first: {}, visible: {}, frames: [], capture: null, sample: false, counts: {}
  };
  const raf = requestAnimationFrame.bind(window);
  const get = HTMLCanvasElement.prototype.getContext;
  const originalClear = WebGL2RenderingContext.prototype.clear;
  const thumb = document.createElement('canvas');
  thumb.width = thumb.height = 24;
  const pixels = get.call(thumb, '2d', {willReadFrequently: true});

  HTMLCanvasElement.prototype.getContext = function(kind, ...options) {
    const gl = get.call(this, kind, ...options);
    if (gl && kind === 'webgl2' && !owners.has(gl)) {
      owners.set(gl, {canvas: this, route: undefined, draws: 0});
    }
    return gl;
  };
  function owner(gl) {
    const entry = owners.get(gl);
    if (!entry || entry.route) return entry;
    entry.route = surfaces.find(([, sel]) => entry.canvas.closest(sel))?.[0];
    if (entry.route) {
      if (!gls.has(entry.route)) gls.set(entry.route, new Set());
      gls.get(entry.route).add(gl);
    }
    return entry;
  }
  function display(c) {
    const box = c.getBoundingClientRect();
    return box.width > 0 && box.height > 0 && box.top < innerHeight &&
      box.bottom > 0 && c.checkVisibility({visibilityProperty: true});
  }
  function painted(c) {
    pixels.clearRect(0, 0, 24, 24);
    pixels.drawImage(c, 0, 0, 24, 24);
    const p = pixels.getImageData(0, 0, 24, 24).data;
    let lit = 0;
    for (let i = 0; i < p.length; i += 4) {
      if (p[i + 3] > 20 && p[i] + p[i + 1] + p[i + 2] > 30) lit++;
    }
    return lit > 12;
  }
  let current;
  for (const key of ['drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced']) {
    const native = WebGL2RenderingContext.prototype[key];
    WebGL2RenderingContext.prototype[key] = function(...args) {
      const entry = owner(this);
      if (entry?.route) {
        entry.draws++;
        if (current && result.capture === entry.route) current.draws++;
      }
      return native.apply(this, args);
    };
  }
  WebGL2RenderingContext.prototype.clear = function(mask) {
    if (result.sample && mask & this.COLOR_BUFFER_BIT) {
      const entry = owner(this);
      if (entry?.route && !this.getParameter(this.DRAW_FRAMEBUFFER_BINDING) && display(entry.canvas)) {
        const draws = entry.draws;
        // Clearing and painting in the same JS turn is safe. Catch exposed
        // clears with no following draw, such as a clear-only animation tick.
        queueMicrotask(() => {
          if (draws === entry.draws && display(entry.canvas)) {
            const row = result.visible[entry.route] ??= {frames: 0, black: 0, clearOnly: 0};
            row.clearOnly++;
          }
        });
      }
    }
    return originalClear.call(this, mask);
  };
  window.requestAnimationFrame = callback => raf(now => {
    if (!result.capture) return callback(now);
    const frame = {draws: 0, now};
    current = frame;
    const start = performance.now();
    try {
      callback(now);
    } finally {
      if (frame.draws) result.frames.push({...frame, callbackMs: performance.now() - start});
      current = undefined;
    }
  });
  function tick() {
    const route = document.body?.dataset.mode;
    for (const gl of gls.get(route) ?? []) {
      const entry = owner(gl);
      if (!entry.draws || gl.isContextLost() || !display(entry.canvas)) continue;
      if (!result.first[route] && painted(entry.canvas)) {
        result.first[route] = {ms: performance.now(),
          graphics: [entry.canvas.width, entry.canvas.height],
          css: [entry.canvas.clientWidth, entry.canvas.clientHeight],
          preserve: gl.getContextAttributes().preserveDrawingBuffer};
      }
      if (result.sample) {
        const row = result.visible[route] ??= {frames: 0, black: 0, clearOnly: 0};
        row.frames++;
        if (!painted(entry.canvas)) row.black++;
      }
    }
    raf(tick);
  }
  result.stats = route => {
    const scenes = gls.get(route) ?? [];
    const draws = Array.from(scenes, gl => owner(gl).draws).reduce((a, b) => a + b, 0);
    return {contexts: scenes.size || 0, draws, ...(result.visible[route] ?? {})};
  };
  raf(tick);
})();
""".replace("__SELECTORS__", json.dumps(SELECTORS))


def navigate(page, url, route):
    response = page.goto(f"{url}/#{route}", wait_until="commit", timeout=90000)
    assert response is None or response.ok, response


def active(page, route):
    page.wait_for_function("route => document.body.dataset.mode === route", arg=route)
    assert page.locator(f'[role=tab][data-mode="{route}"]').get_attribute("aria-selected") == "true"
    assert page.locator("section.view.active").count() == 1
    assert page.locator(f"section.view.active#{route}").count() == 1


def stage_ready(page, route, *, scroll=True):
    active(page, route)
    stage = page.locator(SELECTORS[route])
    canvas = stage.locator("canvas").first
    if scroll:
        stage.evaluate("e => e.scrollIntoView({block:'center',behavior:'instant'})", timeout=75000)
    canvas.wait_for(state="visible", timeout=90000)
    page.wait_for_function("route => botsAudit.first[route]", arg=route, timeout=90000)
    if route == "bots":
        stage.wait_for()
        assert stage.get_attribute("data-bots-ready") == "true"
    return stage, canvas


def errors_on(page):
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.on("console", lambda msg: errors.append(msg.text)
            if msg.type == "error" or "INVALID_OPERATION" in msg.text else None)
    return errors


def warm_frames(page, stage, route, sample_count):
    if route == "bots":
        turnaround = page.locator('#bots [data-bots-action="turnaround"]')
        turnaround.click()
        assert turnaround.get_attribute("aria-pressed") == "true"
        stage.evaluate("e => e.scrollIntoView({block:'center',behavior:'instant'})")
    else:
        stage.evaluate("e => e.focus({preventScroll:true})")
        page.keyboard.down("ArrowRight")
    try:
        for count in (4, sample_count):
            page.evaluate("route => { botsAudit.frames.length = 0; botsAudit.capture = route; }", route)
            page.wait_for_function("count => botsAudit.frames.length >= count", arg=count,
                                   polling=200, timeout=90000)
        frames = page.evaluate("() => botsAudit.frames.slice()")[:sample_count]
    finally:
        page.evaluate("botsAudit.capture = null")
        if route == "bots":
            turnaround.click()
        else:
            page.keyboard.up("ArrowRight")
    intervals = [b["now"] - a["now"] for a, b in zip(frames, frames[1:])]
    callback = [frame["callbackMs"] for frame in frames]
    assert all(interval > 0 for interval in intervals), intervals
    return {
        "frameIntervalP50Ms": median(intervals),
        "frameIntervalP95Ms": quantiles(intervals, n=20, method="inclusive")[18],
        "cpuCallbackP50Ms": median(callback),
        "cpuCallbackP95Ms": quantiles(callback, n=20, method="inclusive")[18],
        "drawCallsP50": median(frame["draws"] for frame in frames),
        "frames": frames,
    }


def phone_run(browser, url, route, frame_count, benchmark, wire_type):
    context = browser.new_context(**MOBILE, service_workers="block")
    try:
        context.add_init_script(PROBE)
        page = context.new_page()
        errors = errors_on(page)
        cdp = context.new_cdp_session(page)
        ledger = wire_type(cdp)
        cdp.send("Network.enable")
        cdp.send("Network.setCacheDisabled", {"cacheDisabled": True})
        cdp.send("Network.emulateNetworkConditions", benchmark["NETWORK"])
        cdp.send("Emulation.setCPUThrottlingRate", {"rate": 4})
        navigate(page, url, route)
        stage, canvas = stage_ready(page, route)
        proof = page.evaluate("route => botsAudit.first[route]", route)
        assert proof["preserve"], proof
        # Charge through first presentation plus a full second for the same
        # post-paint window on each tab. Finish network accounting before orbit.
        cutoff = page.evaluate("ms => performance.timeOrigin + ms + 1000", proof["ms"])
        page.wait_for_function("ms => performance.timeOrigin + performance.now() >= ms", arg=cutoff)
        wire = ledger.until(cutoff, complete_groom="/bots/hummin.glb" if route == "bots" else None)
        paths = [item["path"] for item in wire["resources"]]
        assert wire["transferBytes"] and "/" in paths
        assert not [item for item in wire["resources"] if (item["status"] or 0) >= 400], wire
        assert not ledger.redirects and {item["origin"] for item in ledger.requests.values()} == {url}
        if route == "bots":
            assert paths.count("/bots/hummin.glb") == 1
            assert not any(name.startswith("/characters/") and name != "/characters/route.js" for name in paths)
        else:
            assert not any(name.startswith("/bots/") for name in paths)
            tier = page.locator(".vl-quality").locator("option").first.inner_text()
            assert "Mobile" in tier, tier

        cdp.send("Network.emulateNetworkConditions", dict(
            offline=False, latency=0, downloadThroughput=-1, uploadThroughput=-1,
        ))
        cdp.send("Emulation.setCPUThrottlingRate", {"rate": 1})
        metrics = warm_frames(page, stage, route, frame_count)
        gl = canvas.evaluate("""c => {
          const gl = c.getContext('webgl2'), ext = gl.getExtension('WEBGL_debug_renderer_info');
          return {hardware: gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER),
            antialias: gl.getContextAttributes().antialias, dpr: devicePixelRatio,
            width: c.width, height: c.height};
        }""")
        assert not errors, errors
        return {"route": route, "firstVisible": proof, "graphics": gl, **wire, **metrics}
    finally:
        context.close()


def browser_guards(browser, url, profile, mermaid):
    device = MOBILE if profile == "mobile" else DESKTOP
    context = browser.new_context(**device, service_workers="block")
    try:
        context.add_init_script(PROBE)
        if mermaid:
            prefix = "https://cdn.jsdelivr.net/npm/mermaid@11/"
            def mirror(route):
                path = urlsplit(route.request.url.removeprefix(prefix)).path
                route.fulfill(path=mermaid / path, content_type="text/javascript",
                              headers={"Access-Control-Allow-Origin": "*"})
            context.route(prefix + "**", mirror)
        paths = []
        context.on("request", lambda req: paths.append(urlsplit(req.url).path))
        page = context.new_page()
        errors = errors_on(page)
        navigate(page, url, "world")
        active(page, "world")
        page.locator("#world .card svg.scene").first.wait_for()
        assert not any(path.startswith("/bots/") for path in paths), paths
        assert page.locator(".seg [role=tab]").all_text_contents() == ["World", "Outline", "Village", "Heros", "Bots"]
        page.locator('.seg [data-mode="bots"]').click()
        stage, canvas = stage_ready(page, "bots")
        assert page.url.endswith("/#bots")
        page.evaluate("botsAudit.sample = true")
        toggle = page.locator('#bots [data-bots-action="turnaround"]')
        toggle.click()
        assert toggle.get_attribute("aria-pressed") == "true"
        page.wait_for_function("botsAudit.stats('bots').frames >= 12", timeout=45000)
        toggle.click()
        assert toggle.get_attribute("aria-pressed") == "false"
        for action in ("blink", "smile", "reset"):
            page.locator(f'#bots [data-bots-action="{action}"]').click()

        page.locator('.seg [data-mode="world"]').click()
        active(page, "world")
        hidden_draws = page.evaluate("botsAudit.stats('bots').draws")
        page.wait_for_timeout(300)
        assert page.evaluate("botsAudit.stats('bots').draws") == hidden_draws
        page.go_back(wait_until="commit")
        stage_ready(page, "bots")
        page.go_forward(wait_until="commit")
        active(page, "world")
        page.locator('.seg [data-mode="bots"]').click()
        stage_ready(page, "bots")

        canvas.evaluate("""c => {
          const gl = c.getContext('webgl2');
          if (!gl.getContextAttributes().preserveDrawingBuffer) throw Error('Framebuffer not preserved');
          window.botsLost = gl.getExtension('WEBGL_lose_context');
          if (!botsLost) throw Error('Cannot force context loss');
          botsLost.loseContext();
        }""")
        page.wait_for_function("e => e.dataset.botsReady === 'false'", arg=stage.element_handle())
        assert not canvas.is_visible()
        page.wait_for_timeout(350)
        page.evaluate("botsLost.restoreContext()")
        page.wait_for_function("e => e.dataset.botsReady === 'true'", arg=stage.element_handle(),
                               timeout=60000)
        canvas.wait_for(state="visible")
        assert canvas.evaluate("""c => {
          const gl = c.getContext('webgl2');
          return !gl.isContextLost() && gl.getError() === gl.NO_ERROR;
        }""")

        page.evaluate("() => {location.hash = 'village/auger'}")
        stage_ready(page, "village")
        page.locator('#village .vl-pin[data-pin="auger"].active').wait_for()
        page.evaluate("() => {location.hash = 'outline/05'}")
        active(page, "outline")
        page.locator("#chart-05.active .mermaid-wrap svg").wait_for(timeout=60000)
        page.evaluate("() => {location.hash = 'heros'}")
        stage_ready(page, "heros")
        assert page.title() == "Heros · Sip-Stack" and "/characters/sippy.js" in paths
        page.evaluate("() => {location.hash = 'bots'}")
        stage_ready(page, "bots")
        result = page.evaluate("botsAudit.stats('bots')")
        assert result["contexts"] == 1 and result["frames"] >= 12
        assert result["black"] == result["clearOnly"] == 0, result
        assert Counter(paths)["/bots/hummin.glb"] == 1, paths
        assert not errors, errors
        return {"profile": profile, "preservedContextRestored": True,
                "glErrors": 0, "httpRequests": len(paths), "bots": result}
    finally:
        context.close()


def stale_glb(browser, url):
    context = browser.new_context(**MOBILE, service_workers="block", reduced_motion="reduce")
    try:
        context.add_init_script(PROBE)
        documents, attempts = [], []
        page = context.new_page()
        page.on("request", lambda req: documents.append(req.url) if req.is_navigation_request() else None)

        def first_missing(route):
            attempts.append(route.request.resource_type)
            if len(attempts) == 1:
                route.fulfill(status=404, body="")
            else:
                route.continue_()

        context.route(url + "/bots/hummin.glb", first_missing)
        navigate(page, url, "bots")
        stage_ready(page, "bots")
        assert len(documents) == 2 and len(attempts) >= 2, (documents, attempts)
        assert page.evaluate("!!sessionStorage.getItem('sip-recovered-at')")
        return {"injectedStatus": 404, "documentLoads": len(documents), "glbRequests": len(attempts),
                "repainted": True}
    finally:
        context.close()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--three", type=Path, default=os.environ.get("THREE_ROOT"), required=not os.environ.get("THREE_ROOT"))
    parser.add_argument("--mermaid", type=Path, default=os.environ.get("MERMAID_ROOT"))
    parser.add_argument("--chrome", default=os.environ.get("CHROME", "/usr/bin/chromium"))
    parser.add_argument("--output", type=Path, default=Path("/tmp/bots.json"))
    parser.add_argument("--rounds", type=int, default=3)
    parser.add_argument("--frames", type=int, default=16)
    parser.add_argument("--only", choices=("all", "perf", "guards"), default="all")
    args = parser.parse_args()
    if args.rounds < 1 or args.frames < 4:
        parser.error("At least one round and four native frames are required")
    benchmark = runpy.run_path(str(REPO / "tools/benchmark-heros.py"))
    wire_type = runpy.run_path(str(REPO / "tools/benchmark-route-load.py"))["Wire"]
    report = {"phone": MOBILE, "visits": [], "guards": [], "summary": {},
              "notes": "Chromium SwiftShader. Cold HTTP transfer through one second after first visible frame. "
                       "Fast 4G and 4× CPU on cold load. Steady orbit uses the Bots Turnaround button "
                       "and Village ArrowRight, both unthrottled."}
    server = benchmark["server"](REPO, args.three.resolve())
    url = f"http://127.0.0.1:{server.server_port}"
    args.output.parent.mkdir(parents=True, exist_ok=True)

    def save():
        args.output.write_text(json.dumps(report, indent=2) + "\n")

    launch_args = ["--no-sandbox", "--use-gl=angle", "--use-angle=swiftshader",
                   "--enable-unsafe-swiftshader", "--disable-gpu-shader-disk-cache"]
    keys = ("requests", "transferBytes", "frameIntervalP50Ms", "frameIntervalP95Ms",
            "cpuCallbackP50Ms", "cpuCallbackP95Ms", "drawCallsP50")
    try:
        with sync_playwright() as playwright:
            if args.only in ("all", "perf"):
                for visit in range(args.rounds):
                    routes = ("bots", "village") if visit % 2 == 0 else ("village", "bots")
                    for route in routes:
                        print(f"Phone visit {visit + 1}: {route}", flush=True)
                        browser = playwright.chromium.launch(executable_path=args.chrome, args=launch_args)
                        try:
                            report["chromium"] = browser.version
                            row = phone_run(browser, url, route, args.frames, benchmark, wire_type)
                        finally:
                            browser.close()
                        report["visits"].append(row)
                        rows = [r for r in report["visits"] if r["route"] == route]
                        report["summary"][route] = {
                            **{key: median(r[key] for r in rows) for key in keys},
                            "firstVisibleMs": median(r["firstVisible"]["ms"] for r in rows),
                        }
                        save()
                        print(report["summary"][route], flush=True)
                bots, village = (report["summary"][route] for route in ("bots", "village"))
                report["botsLighterThanVillage"] = {
                    key: bots[key] < village[key] for key in ("requests", "transferBytes", "frameIntervalP50Ms")
                }
                assert all(report["botsLighterThanVillage"].values()), report["summary"]
            if args.only in ("all", "guards"):
                browser = playwright.chromium.launch(executable_path=args.chrome, args=launch_args)
                try:
                    for profile in ("mobile", "desktop"):
                        print(f"Browser guard: {profile}", flush=True)
                        row = browser_guards(browser, url, profile, args.mermaid)
                        report["guards"].append(row)
                        save()
                        print(row, flush=True)
                    report["staleGlb"] = stale_glb(browser, url)
                    save()
                finally:
                    browser.close()
        changed = subprocess.run(["git", "-C", str(REPO), "diff", "--name-only", "94deb9d", "--",
                                  "docs/characters", "docs/assets/sip-warm.js", "docs/assets/sip-recover.js"],
                                 check=True, capture_output=True, text=True).stdout
        assert not changed, changed
        report["herosAndSharedRecoveryChanged"] = False
    finally:
        server.shutdown()
        server.server_close()
        save()


if __name__ == "__main__":
    main()

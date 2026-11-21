"""Measure the visible Axon View, its offscreen idle and shared GL context.

THREE_ROOT=/path/to/three-0.170.0 python tools/check-axon-performance.py --output /tmp/axon.json
"""

import argparse
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
from urllib.parse import urlsplit
from playwright.sync_api import sync_playwright

sys.dont_write_bytecode = True
TOOLS = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("heros_benchmark", TOOLS / "benchmark-heros.py")
benchmark = importlib.util.module_from_spec(spec)
spec.loader.exec_module(benchmark)

NATIVE = r"""
(() => {
  const contexts = new Set(), frames = new Map();
  let stamp, task, diagramDepth = 0;
  const qa = window.axPerf = {draws: 0, diagramDraws: 0, passes: 0, blits: 0, minColors: 4096};
  const copyPixels=CanvasRenderingContext2D.prototype.putImageData;
  CanvasRenderingContext2D.prototype.putImageData=function(image,...args) {
    if(this.canvas.matches('[data-axon-canvas]')){
      const colors=new Set(), {width,height,data}=image;
      for(let y=0;y<height;y+=Math.max(1,Math.floor(height/48))) {
        for(let x=0;x<width;x+=Math.max(1,Math.floor(width/48))){
          const i=4*(y*width+x);
          colors.add((data[i]>>4)*256+(data[i+1]>>4)*16+(data[i+2]>>4));
        }
      }
      qa.minColors=Math.min(qa.minColors,colors.size);
      qa.blits++;
    }
    return copyPixels.call(this,image,...args);
  };
  const originalContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (...args) {
    const gl = originalContext.apply(this, args);
    if (gl && /^(webgl2?|experimental-webgl)$/.test(args[0])) contexts.add(gl);
    return gl;
  };
  const raf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = callback => raf(now => {
    stamp = now;
    try { return callback(now); } finally { stamp = undefined; }
  });
  function frame() {
    if (stamp === undefined && !task) {
      task = Symbol();
      queueMicrotask(() => { task = undefined; });
    }
    const key = stamp ?? task;
    if (!frames.has(key)) frames.set(key, {draws: 0, diagram: 0, passes: 0});
    return frames.get(key);
  }
  for (const method of ['drawElements','drawArrays','drawElementsInstanced','drawArraysInstanced']) {
    const original = WebGL2RenderingContext.prototype[method];
    WebGL2RenderingContext.prototype[method] = function (...args) {
      const current = frame();
      ++current.draws; ++qa.draws;
      if (diagramDepth > 0) { ++current.diagram; ++qa.diagramDraws; }
      return original.apply(this,args);
    };
  }
  qa.observeScene = async () => {
    const url = JSON.parse(document.querySelector('script[type=importmap]').textContent).imports.three;
    const T = await import(url); // Already imported by the fully rendered simulator.
    const proto = T.Scene.prototype, before = proto.onBeforeRender, after = proto.onAfterRender;
    proto.onBeforeRender = function (...args) {
      if (this.name === 'Axon View') {
        if (!args[2].isOrthographicCamera) throw Error('Axon View must use its orthographic camera');
        ++diagramDepth; ++qa.passes; ++frame().passes;
      }
      return before.apply(this,args);
    };
    proto.onAfterRender = function (...args) {
      try { return after.apply(this,args); }
      finally { if (this.name === 'Axon View') --diagramDepth; }
    };
  };
  qa.reset = () => { frames.clear(); };
  qa.measure = () => {
    const rows = [...frames.values()].filter(row => row.passes > 0);
    return {frames:rows.length, passes:rows.reduce((s,r)=>s+r.passes,0),
      submissionCounts:[...new Set(rows.map(r=>r.diagram))],
      maxPasses: Math.max(0,...rows.map(r=>r.passes)),
      maxDiagramDraws: Math.max(0,...rows.map(r=>r.diagram)),
      maxAllDraws: Math.max(0,...rows.map(r=>r.draws))};
  };
  qa.contexts = () => [...contexts].map(gl=>({live: !gl.isContextLost(), canvasClass:gl.canvas.className}));
})();
"""


def slider(page, value):
    page.locator("[data-explode]").evaluate(
        """(el,value)=>{el.value=value;el.dispatchEvent(new Event('input',{bubbles:true}));}""",
        value,
    )


def presented(page, previous):
    page.wait_for_function("n=>axPerf.passes>n", arg=previous, timeout=30000)
    page.evaluate("new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))")


def wait_for_model(page, name, tier):
    page.wait_for_function(
        """([name,tier])=>{
            const section=document.querySelector('[data-axon]');
            return section?.dataset.ready===name+'-'+tier && section.axonInspector.stats().ready;
        }""",
        arg=[name, tier],
        timeout=60000,
    )


def native_rows(page):
    rows = []
    for tier in ("mobile", "high"):
        # Use the normal quality handler without scrolling the shared stage into view.
        page.locator("[data-setting=tier]").evaluate(
            "(e,t)=>{e.value=t;e.dispatchEvent(new Event('change',{bubbles:true}))}", tier
        )
        for name in ("sippy", "roma", "hummin"):
            page.locator("[data-axon-hero]").select_option(name)
            canvas = page.locator("[data-axon-canvas]")
            canvas.evaluate("e=>e.scrollIntoView({block:'center',behavior:'instant'})")
            wait_for_model(page, name, tier)
            slider(page, 0.2)
            page.evaluate("new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))")
            draws = {}
            for value in (0, 0.5, 1):
                previous = page.evaluate("axPerf.passes")
                page.evaluate("axPerf.reset()")
                slider(page, value)
                presented(page, previous)
                observed = page.evaluate("axPerf.measure()")
                assert 0 < observed["maxDiagramDraws"] <= observed["maxAllDraws"] < 300, (
                    name,
                    tier,
                    value,
                    observed,
                )
                assert observed["maxPasses"] == 1, (name, tier, value, observed)
                reported = page.locator("[data-axon]").evaluate("e=>e.axonInspector.stats().draws")
                assert reported in observed["submissionCounts"], (name, tier, value, reported, observed)
                draws[str(value)] = observed
            # Translucent materials and selection outlines can add submissions.
            # Exercise every visible layer together before restoring the defaults.
            previous = page.evaluate("axPerf.passes")
            page.evaluate("axPerf.reset()")
            page.locator("[data-axon]").evaluate("""e=>{
                for(const input of e.querySelectorAll('[data-opacity]')){
                    input.value=55;input.dispatchEvent(new Event('input',{bubbles:true}));
                }
                const part=e.querySelector('[data-part]');
                part.value='0';part.dispatchEvent(new Event('change',{bubbles:true}));
            }""")
            presented(page, previous)
            translucent = page.evaluate("axPerf.measure()")
            assert 0 < translucent["maxDiagramDraws"] <= translucent["maxAllDraws"] < 300, (
                name,
                tier,
                translucent,
            )
            assert translucent["maxPasses"] == 1, (name, tier, translucent)
            draws["allLayersTranslucentWithSelection"] = translucent
            previous = page.evaluate("axPerf.passes")
            page.locator("[data-axon]").evaluate("""e=>{
                for(const input of e.querySelectorAll('[data-opacity]')){
                    input.value=100;input.dispatchEvent(new Event('input',{bubbles:true}));
                }
                const part=e.querySelector('[data-part]');
                part.value='';part.dispatchEvent(new Event('change',{bubbles:true}));
            }""")
            presented(page, previous)
            rows.append({"hero": name, "tier": tier, "states": draws})
            print(tier, name, max(s["maxAllDraws"] for s in draws.values()), flush=True)
    return rows


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", type=Path, default=TOOLS.parent)
    parser.add_argument("--three", type=Path, default=os.environ.get("THREE_ROOT"))
    parser.add_argument("--chrome", default=os.getenv("CHROME", "/usr/bin/chromium"))
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    if not args.three:
        parser.error("Provide --three or THREE_ROOT")
    repo = args.repo.resolve()
    http = benchmark.server(repo, args.three.resolve())
    try:
        with sync_playwright() as pw:
            browser = pw.chromium.launch(
                executable_path=args.chrome,
                args=[
                    "--no-sandbox",
                    "--use-gl=angle",
                    "--use-angle=swiftshader",
                    "--enable-unsafe-swiftshader",
                ],
            )
            try:
                ctx = browser.new_context(
                    viewport={"width": 800, "height": 680},
                    device_scale_factor=1,
                    reduced_motion="reduce",
                )
                ctx.add_init_script(script=NATIVE)
                page = ctx.new_page()
                errors = []
                requests = []
                page.on("pageerror", lambda exc: errors.append(str(exc)))

                def on_console(message):
                    if message.type == "error":
                        detail = message.text
                        if "WebGLProgram: Shader Error" in detail:
                            errors.append(detail[:1500])
                        print(message.type, detail[:1500], flush=True)

                page.on("console", on_console)
                page.on("request", lambda r: requests.append(urlsplit(r.url).path))
                page.goto(f"http://127.0.0.1:{http.server_port}/#heros", wait_until="commit")
                page.wait_for_function(
                    """document.querySelector('.ct-loading')?.hidden &&
                    document.querySelector('.ct-stage canvas')?.style.visibility==='visible'""",
                    timeout=90000,
                )
                assert not [p for p in requests if "/axon-" in p or "/diagram-" in p]
                assert len(page.evaluate("axPerf.contexts()")) == 1
                page.evaluate("axPerf.observeScene()")
                page.locator("[data-axon]").evaluate(
                    "e=>e.scrollIntoView({block:'start',behavior:'instant'})"
                )
                canvas = page.locator("[data-axon-canvas]")
                canvas.wait_for(timeout=60000)
                canvas.evaluate("e=>e.scrollIntoView({block:'center',behavior:'instant'})")
                page.wait_for_function("axPerf.passes>0", timeout=60000)
                assert canvas.evaluate(
                    "e=>e.getContext('2d')!==null"
                ), "Expected a 2D presentation canvas"
                rows = native_rows(page)
                # Exercise a real scheduling gap; all following presents still have one scene pass.
                begin = page.evaluate("axPerf.passes")
                page.evaluate("axPerf.reset()")
                slider(page, 0.25)
                page.evaluate("()=>{const until=performance.now()+250;while(performance.now()<until){}}")
                slider(page, 0.75)
                presented(page, begin)
                gap = page.evaluate("axPerf.measure()")
                assert gap["maxPasses"] == 1 and gap["maxAllDraws"] < 300, gap
                floor = page.locator(".ct-stage canvas")
                floor.evaluate("e=>e.scrollIntoView({block:'center',behavior:'instant'})")
                page.wait_for_function(
                    """!document.querySelector('[data-axon]').axonInspector.stats().visible &&
                    document.querySelector('[data-axon-canvas]').getBoundingClientRect().top>=innerHeight"""
                )
                page.evaluate("new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))")
                initial = page.evaluate(
                    "({draws:axPerf.draws, passes:axPerf.passes, diagram:axPerf.diagramDraws, blits:axPerf.blits})"
                )
                floor.focus()
                page.keyboard.down("w")
                page.wait_for_function("prior=>axPerf.draws>prior", arg=initial["draws"], timeout=15000)
                page.wait_for_timeout(500)
                page.keyboard.up("w")
                end = page.evaluate(
                    "({draws:axPerf.draws, passes:axPerf.passes, diagram:axPerf.diagramDraws, blits:axPerf.blits})"
                )
                off = {k: end[k] - v for k, v in initial.items()}
                assert off["passes"] == off["diagram"] == off["blits"] == 0 and off["draws"] > 0, off
                # Static previews may reuse their last image on re-entry. A fresh
                # control change must produce another real orthographic draw.
                canvas.evaluate("e=>e.scrollIntoView({block:'center',behavior:'instant'})")
                page.wait_for_function(
                    "document.querySelector('[data-axon]').axonInspector.stats().visible"
                )
                slider(page, 0.9)
                presented(page, end["passes"])
                contexts = page.evaluate("axPerf.contexts()")
                assert len(contexts) == 1 and contexts[0]["live"], contexts
                colors = page.evaluate("({images:axPerf.blits,minimumColorBins:axPerf.minColors})")
                assert colors["images"] >= len(rows) * 4 and colors["minimumColorBins"] >= 5, colors
                assert not errors, errors
                for path, digest in http.fingerprints.items():
                    if path.startswith("/__three/"):
                        source = args.three / path.removeprefix("/__three/")
                    else:
                        source = repo / "docs" / (path.lstrip("/") or "index.html")
                    if hashlib.sha256(source.read_bytes()).hexdigest() != digest:
                        raise RuntimeError(f"Source changed during the measurements: {source}")
                report = {
                    "verifiedServedSources": True,
                    "presentedPixels": colors,
                    "revision": subprocess.check_output(
                        ["git", "-C", str(repo), "rev-parse", "HEAD"], text=True
                    ).strip(),
                    "chromium": browser.version,
                    "renderer": "ANGLE Vulkan SwiftShader",
                    "rows": rows,
                    "stallMs": 250,
                    "afterStall": gap,
                    "offscreen": off,
                    "contexts": contexts,
                    "errors": errors,
                    "sourceSha256": dict(sorted(http.fingerprints.items())),
                }
                args.output.parent.mkdir(parents=True, exist_ok=True)
                args.output.write_text(json.dumps(report, indent=2) + "\n")
            finally:
                browser.close()
    finally:
        http.shutdown()
        http.server_close()


if __name__ == "__main__":
    main()

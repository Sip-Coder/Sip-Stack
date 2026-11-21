"""Verify real Character Ref submissions, scheduling, cache reuse and visibility in Chromium."""

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

PROBE = r"""
(() => {
  const qa = window.refBudget = {frame: 0, glDraws: 0, previews: [], passes: [], images: []};
  const contexts = new Set();
  const getContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type, ...args) {
    const context = getContext.call(this, type, ...args);
    if (context && /^(webgl2?|experimental-webgl)$/.test(type)) contexts.add(context);
    return context;
  };
  qa.contexts = () => [...contexts].map(gl => ({live: !gl.isContextLost(), floor: !!gl.canvas.closest('.ct-stage')}));
  // Mark browser presentation opportunities, including idle work outside a RAF callback.
  requestAnimationFrame(function stamp() { ++qa.frame; requestAnimationFrame(stamp); });
  const copy = CanvasRenderingContext2D.prototype.putImageData;
  CanvasRenderingContext2D.prototype.putImageData = function (image, ...args) {
    const figure = this.canvas.closest('[data-ref] figure[data-panel]');
    if (figure) {
      // Sample the actual RGBA buffer passed to the display canvas, before copying.
      let hash = 2166136261;
      const colors = new Set(), {width, height, data} = image;
      for (let y=0; y<height; y+=Math.max(1,Math.floor(height/44))) {
        for (let x=0; x<width; x+=Math.max(1,Math.floor(width/44))) {
          const i = 4*(y*width+x);
          hash = Math.imul(hash ^ data[i], 16777619);
          hash = Math.imul(hash ^ data[i+1], 16777619);
          hash = Math.imul(hash ^ data[i+2], 16777619);
          colors.add((data[i]>>4)*256+(data[i+1]>>4)*16+(data[i+2]>>4));
        }
      }
      const r=this.canvas.getBoundingClientRect();
      const onScreen=r.width>0 && r.height>0 && r.bottom>0 && r.top<innerHeight && r.right>0 && r.left<innerWidth;
      qa.images.push({frame:qa.frame, panel:figure.dataset.panel, selection:document.querySelector("[data-ref]").dataset.ready, hash:hash>>>0, bins:colors.size,onScreen});
    }
    return copy.call(this,image,...args);
  };
  for (const name of ['drawElements','drawArrays','drawElementsInstanced','drawArraysInstanced']) {
    const old = WebGL2RenderingContext.prototype[name];
    WebGL2RenderingContext.prototype[name] = function (...args) { ++qa.glDraws; return old.apply(this,args); };
  }
  qa.install = async () => {
    const url = JSON.parse(document.querySelector('script[type=importmap]').textContent).imports.three;
    const T = await import(url), proto = T.Scene.prototype;
    const before = proto.onBeforeRender, after = proto.onAfterRender;
    const starts = new WeakMap();
    proto.onBeforeRender = function (renderer,scene,camera,...rest) {
      if (this.name === 'Character Ref' || this.name === 'Character Ref print') {
        if (!renderer.getRenderTarget()) throw Error('Live thumbnail unexpectedly targeted the floor canvas');
        starts.set(this,qa.glDraws);
      }
      return before.call(this,renderer,scene,camera,...rest);
    };
    proto.onAfterRender = function (...args) {
      const result = after.apply(this,args);
      if (starts.has(this)) {
        const item = {frame:qa.frame, name:this.name, draws:qa.glDraws-starts.get(this)};
        qa.passes.push(item);
        if (this.name === 'Character Ref print') qa.previews.push(item);
        starts.delete(this);
      }
      return result;
    };
  };
  qa.snapshot = () => ({draws:qa.glDraws, passes:qa.passes.length, previews:qa.previews.length, images:qa.images.length});
})();
"""


def snapshot(page):
    return page.evaluate("refBudget.snapshot()")


def diff(before, after):
    return {key: after[key] - before[key] for key in before}


def settle(page, frames=6):
    page.evaluate(
        "n=>new Promise(done=>{function frame(){if(--n>0) requestAnimationFrame(frame);else done()} requestAnimationFrame(frame)})",
        frames,
    )


def wait_idle(page):
    # Offscreen cards are intentionally pending until the user scrolls to them.
    page.wait_for_function(
        """()=>{
      const section=document.querySelector('[data-ref]'), state=section.characterRef?.stats();
      if (!state?.active || state.busy || section.dataset.ready!==state.hero+'-'+state.tier) return false;
      return [...section.querySelectorAll('figure[data-panel] .ref-image')].every(frame=>{
        const r=frame.getBoundingClientRect();
        return r.bottom<=0 || r.top>=innerHeight || r.right<=0 || r.left>=innerWidth ||
            frame.closest('figure').dataset.status==='ready';
      });
    }""",
        timeout=90000,
    )
    settle(page, 3)


def stats(page):
    return page.locator("[data-ref]").evaluate("e=>e.characterRef.stats()")


def scroll_to(element, block="center"):
    element.evaluate("(e,block)=>e.scrollIntoView({block,behavior:'instant'})", block)


def select_hero(page, name, tier):
    scroll_to(page.locator("[data-ref]"), "start")
    settle(page, 2)
    page.locator("[data-setting=tier]").evaluate(
        "(e,v)=>{e.value=v;e.dispatchEvent(new Event('change',{bubbles:true}))}", tier
    )
    page.locator("[data-ref-hero]").evaluate(
        "(e,v)=>{e.value=v;e.dispatchEvent(new Event('change',{bubbles:true}))}", name
    )
    page.wait_for_function(
        """([name,tier])=>{const q=document.querySelector('[data-ref]').characterRef.stats();return q.hero===name && q.tier===tier}""",
        arg=[name, tier],
        timeout=60000,
    )
    wait_idle(page)


def show_all(page):
    figures = page.locator("[data-ref] figure[data-panel]").filter(has=page.locator("canvas"))
    total = figures.count()
    assert total >= 10, f"Reference sheet has only {total} renderable panels"
    for i in range(total):
        figure = figures.nth(i)
        scroll_to(figure)
        # Give real intersection callbacks a chance to queue the panel.
        settle(page, 2)
        figure.locator("canvas").wait_for()
        figure.evaluate(
            """fig=>{if(fig.dataset.status==='error') throw Error('Reference panel failed: '+fig.dataset.panel)}"""
        )
        wait_idle(page)
        assert figure.get_attribute("data-status") == "ready", figure.get_attribute("data-panel")
    return total


def sheet_digest(page):
    return page.locator("[data-ref]").evaluate("""async section=>{
      const panels={};
      for(const node of section.querySelectorAll('figure[data-status=ready] canvas')){
        const bytes=node.getContext('2d').getImageData(0,0,node.width,node.height).data;
        const sum=await crypto.subtle.digest('SHA-256',bytes);
        panels[node.closest('figure').dataset.panel]=[...new Uint8Array(sum)].map(v=>v.toString(16).padStart(2,'0')).join('');
      }
      return panels;
    }""")


def measure(page):
    section = page.locator("[data-ref]")
    scroll_to(section, "start")
    page.locator("[data-ref] figure[data-panel] canvas").first.wait_for(timeout=60000)
    page.wait_for_function("refBudget.previews.length>0 && refBudget.images.length>0", timeout=90000)
    wait_idle(page)
    rows = []
    for tier in ("mobile", "high"):
        for hero in ("sippy", "roma", "hummin"):
            # Selection can rebuild all figures; drive every authored panel into view.
            start = snapshot(page)
            select_hero(page, hero, tier)
            total = show_all(page)
            state = stats(page)
            rows.append(
                {
                    "tier": tier,
                    "hero": hero,
                    "renderablePanels": total,
                    "drawWork": diff(start, snapshot(page)),
                    "maxRefDrawsPerFrame": page.evaluate(
                        """start=>{
                        const frames=new Map();
                        for(const p of refBudget.passes.slice(start)) frames.set(p.frame,(frames.get(p.frame)||0)+p.draws);
                        return Math.max(0,...frames.values());
                    }""",
                        start["passes"],
                    ),
                    "stats": state,
                }
            )
            print(tier, hero, total, flush=True)
    # All Hummin High panels have materialized. Ordinary refresh must reconstruct
    # and validate the inputs but avoid any GPU resubmission for identical pixels.
    refresh = page.locator("[data-ref-refresh]")
    scroll_to(refresh)
    settle(page)
    wait_idle(page)
    before = snapshot(page)
    prior = stats(page)
    unchanged_pixels = sheet_digest(page)
    assert len(unchanged_pixels) == rows[-1]["renderablePanels"]
    refresh.click()
    page.wait_for_function(
        "x=>document.querySelector('[data-ref]').characterRef.stats().revalidations>x",
        arg=prior["revalidations"],
        timeout=60000,
    )
    wait_idle(page)
    show_all(page)
    after = snapshot(page)
    revalidated = stats(page)
    assert revalidated["cacheHits"] - prior["cacheHits"] >= rows[-1]["renderablePanels"], revalidated
    unchanged = diff(before, after)
    assert sheet_digest(page) == unchanged_pixels, "Refresh changed pixels with matching model inputs"
    assert unchanged["previews"] == 0 and unchanged["passes"] == 0, unchanged
    # Leave the entire sheet, exercise the simulator, and prove the native
    # pipeline and final image upload are both silent while it remains offscreen.
    floor = page.locator(".ct-stage canvas")
    scroll_to(floor)
    page.wait_for_function(
        """()=>{const el=document.querySelector('[data-ref]');return el.getBoundingClientRect().top>=innerHeight && !el.characterRef.stats().active}""",
        timeout=30000,
    )
    settle(page)
    before = snapshot(page)
    floor.focus()
    page.keyboard.down("w")
    page.wait_for_function("n=>refBudget.glDraws>n", arg=before["draws"], timeout=20000)
    page.wait_for_timeout(500)
    page.keyboard.up("w")
    hidden = diff(before, snapshot(page))
    assert (
        hidden["draws"] > 0 and hidden["passes"] == hidden["previews"] == hidden["images"] == 0
    ), hidden
    prior = stats(page)
    before = snapshot(page)
    scroll_to(section, "start")
    page.wait_for_function(
        "x=>document.querySelector('[data-ref]').characterRef.stats().revalidations>x",
        arg=prior["revalidations"],
        timeout=60000,
    )
    wait_idle(page)
    revisit = diff(before, snapshot(page))
    assert revisit["previews"] == revisit["passes"] == 0, revisit
    results = page.evaluate("""()=>{
        const q=refBudget, byFrame=new Map();
        for(const r of q.previews) byFrame.set(r.frame,(byFrame.get(r.frame)||0)+1);
        const drawsByFrame=new Map();for(const r of q.passes) drawsByFrame.set(r.frame,(drawsByFrame.get(r.frame)||0)+r.draws);
        return {contexts:q.contexts(),prints:q.previews.length,printFrames:byFrame.size,
          maxCompletedPanelsPerFrame:Math.max(0,...byFrame.values()),capturedImages:q.images.length,
          maxDrawsPerScenePass:Math.max(...q.passes.map(r=>r.draws)),maxRefDrawsPerPresentedFrame:Math.max(...drawsByFrame.values()),
          populatedImages:q.images.filter(r=>r.bins>=3).length,
          lowColorPanels:q.images.filter(r=>r.bins<3).map(r=>({selection:r.selection,panel:r.panel,bins:r.bins})),
          offscreenCopies:q.images.filter(r=>!r.onScreen).length,
          rangeOfColorBins:[Math.min(...q.images.map(r=>r.bins)),Math.max(...q.images.map(r=>r.bins))]};
    }""")
    assert results["contexts"] == [{"live": True, "floor": True}], results
    assert results["prints"] >= sum(r["renderablePanels"] for r in rows), results
    assert results["maxCompletedPanelsPerFrame"] == 1 and results["offscreenCopies"] == 0, results
    assert not results["lowColorPanels"], results
    assert (
        results["capturedImages"] >= results["prints"]
        and results["populatedImages"] >= results["prints"]
    ), results
    return {
        "rows": rows,
        "unchangedRefresh": unchanged,
        "unchangedPanelPixelSha256": unchanged_pixels,
        "revalidated": revalidated,
        "floorActiveSheetOffscreen": hidden,
        "cachedReentry": revisit,
        "native": results,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", type=Path, default=TOOLS.parent)
    parser.add_argument("--three", type=Path, default=os.getenv("THREE_ROOT"))
    parser.add_argument("--chrome", default=os.getenv("CHROME", "/usr/bin/chromium"))
    parser.add_argument("--output", type=Path, required=True)
    a = parser.parse_args()
    if not a.three:
        parser.error("Provide --three or THREE_ROOT")
    repo = a.repo.resolve()
    http = benchmark.server(repo, a.three.resolve())
    try:
        with sync_playwright() as pw:
            browser = pw.chromium.launch(
                executable_path=a.chrome,
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
                ctx.add_init_script(script=PROBE)
                page = ctx.new_page()
                errors = []
                requests = []
                page.on("pageerror", lambda e: errors.append(str(e)))
                page.on(
                    "console",
                    lambda m: (
                        errors.append(m.text[:1000])
                        if m.type == "error" and "WebGLProgram: Shader Error" in m.text
                        else None
                    ),
                )
                page.on("request", lambda r: requests.append(urlsplit(r.url).path))
                page.goto(f"http://127.0.0.1:{http.server_port}/#heros", wait_until="commit")
                page.wait_for_function(
                    """document.querySelector('.ct-loading')?.hidden &&
                    document.querySelector('.ct-stage canvas')?.style.visibility==='visible'""",
                    timeout=90000,
                )
                assert not [p for p in requests if "/character-ref" in p or "/ref-" in p]
                assert page.evaluate("refBudget.contexts()") == [{"live": True, "floor": True}]
                page.evaluate("refBudget.install()")
                report = measure(page)
                assert not errors, errors[:5]
                for path, digest in http.fingerprints.items():
                    source = (
                        (a.three / path.removeprefix("/__three/"))
                        if path.startswith("/__three/")
                        else repo / "docs" / (path.lstrip("/") or "index.html")
                    )
                    assert hashlib.sha256(source.read_bytes()).hexdigest() == digest, source
                report.update(
                    browser=browser.version,
                    renderer="ANGLE Vulkan SwiftShader",
                    sourceSha256=dict(sorted(http.fingerprints.items())),
                    verifiedServedSources=True,
                    errors=errors,
                )
                report["revision"] = subprocess.check_output(
                    ["git", "-C", str(repo), "rev-parse", "HEAD"], text=True
                ).strip()
                a.output.parent.mkdir(parents=True, exist_ok=True)
                a.output.write_text(json.dumps(report, indent=2) + "\n")
            finally:
                browser.close()
    finally:
        http.shutdown()
        http.server_close()


if __name__ == "__main__":
    main()

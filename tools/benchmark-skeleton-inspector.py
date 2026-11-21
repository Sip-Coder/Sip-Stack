"""Measure first opening of the lazy Axon View and the real isolated skeleton."""

import argparse
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import statistics
import subprocess
import sys
from urllib.parse import urlsplit

from playwright.sync_api import sync_playwright

sys.dont_write_bytecode = True
TOOLS = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("heros_benchmark", TOOLS / "benchmark-heros.py")
bench = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bench)

RECORD_PAINT = """
window.axonMeasure = {images:0};
const copy = CanvasRenderingContext2D.prototype.putImageData;
CanvasRenderingContext2D.prototype.putImageData = function(image,...args){
  const result = copy.call(this,image,...args);
  if (this.canvas.matches('[data-axon-canvas]')) {
    const q=window.axonMeasure; q.images++;
    if (!q.firstPostPaint){
      q.copied=performance.now();
      requestAnimationFrame(()=>{q.firstPostPaint??=performance.now();});
    }
  }
  return result;
};
"""


def measure(browser, origin, tier, hero, expected_assets=()):
    ctx = browser.new_context(
        viewport={"width": 800, "height": 680},
        device_scale_factor=1,
        service_workers="block",
        reduced_motion="reduce",
    )
    try:
        page = ctx.new_page()
        requested = []
        page.on("request", lambda req: requested.append(urlsplit(req.url).path))
        page.add_init_script(script=RECORD_PAINT)
        cdp = ctx.new_cdp_session(page)
        cdp.send("Network.enable")
        cdp.send("Network.setCacheDisabled", {"cacheDisabled": True})
        page.goto(origin + "/#heros", wait_until="commit")
        page.wait_for_function(
            """document.querySelector('.ct-loading')?.hidden &&
                document.querySelector('.ct-stage canvas')?.style.visibility==='visible'""",
            timeout=90000,
        )
        page.evaluate(
            """async ([tier,hero])=>{
          const T=await import(JSON.parse(document.querySelector('script[type=importmap]').textContent).imports.three);
          const old=T.Mesh.prototype.onAfterRender;
          T.Mesh.prototype.onAfterRender=function(renderer,scene,camera,...args){
            old.call(this,renderer,scene,camera,...args);
            if(!camera.isPerspectiveCamera||!renderer.domElement.closest('.ct-stage'))return;
            let n=this;while(n&&n.name!==hero)n=n.parent;
            if(!n)return;
            let shadow=0;scene.traverse(node=>{if(node.isDirectionalLight && node.castShadow)shadow=node.shadow.mapSize.x});
            if(shadow!==(tier==='mobile'?512:1024))return;
            axonMeasure.renderedActor={name:n.name,shadowMapWidth:shadow};
            T.Mesh.prototype.onAfterRender=old;
          };
          const q=document.querySelector('[data-setting=tier]');q.value=tier;q.dispatchEvent(new Event('change',{bubbles:true}));
          document.querySelector('[data-pick="'+hero+'"]').click();
        }""",
            [tier, hero],
        )
        page.wait_for_function("axonMeasure.renderedActor", timeout=60000)
        assert not any(path.endswith(".glb") or "/meshopt_decoder" in path for path in requested)
        # The floor is already populated. Apply identical shaping before the real
        # first scroll, so opening includes the deferred modules, build, shaders,
        # GPU readback, 2D blit and next browser presentation opportunity.
        cdp.send("Network.emulateNetworkConditions", bench.NETWORK)
        cdp.send("Emulation.setCPUThrottlingRate", {"rate": 4})
        page.evaluate(r"""()=>{
          const urls=performance.getEntriesByType('resource').map(r=>new URL(r.name).pathname);
          if(urls.some(p=>/\/(diagram-|axon-view)|\.glb$|meshopt.decoder/i.test(p)))throw Error('Inspector was prefetched');
          axonMeasure.opened=performance.now();
          document.querySelector('[data-axon] [data-study-body]').scrollIntoView({block:'end',behavior:'instant'});
        }""")
        page.wait_for_function(
            """key=>document.querySelector('[data-axon]').dataset.ready===key &&
                  axonMeasure.firstPostPaint""",
            arg=hero + "-" + tier,
            timeout=90000,
        )
        result = page.evaluate("""()=>{
          const q=axonMeasure, el=document.querySelector('[data-axon]'), api=el.axonInspector;
          const time=q.firstPostPaint;
          const resources=performance.getEntriesByType('resource').filter(r=>r.startTime>=q.opened&&r.responseEnd<=time);
          const list=resources.filter(r=>new URL(r.name).pathname.endsWith('.js'));
          const assets=resources.filter(r=>new URL(r.name).pathname.endsWith('.glb'));
          const inventory=api.inventory(), bones=inventory.filter(p=>p.layer==='skeleton');
          const muscles=inventory.filter(p=>p.layer==='muscles');
          const s=api.stats();
          return {presentedMs:time-q.opened,firstBlitMs:q.copied-q.opened,floor:q.renderedActor,
            bones:bones.length,triangles:bones.reduce((n,b)=>n+b.triangles,0),allDraws:s.draws,allTriangles:s.triangles,
            compositeDraws:s.postDraws??0,muscles:muscles.length,
            muscleTriangles:muscles.reduce((n,p)=>n+p.triangles,0),
            scanAssets:assets.map(r=>({path:new URL(r.name).pathname,bodyBytes:r.encodedBodySize})).sort((a,b)=>a.path.localeCompare(b.path)),
            scripts:list.map(r=>({path:new URL(r.name).pathname,raw:r.decodedBodySize,gzip:r.encodedBodySize})).sort((a,b)=>a.path.localeCompare(b.path))};
        }""")
        page.locator("[data-layer=skeleton] [data-isolate]").evaluate("b=>b.click()")
        page.wait_for_function("axonMeasure.images>=2", timeout=30000)
        el = page.locator("[data-axon]")
        page.wait_for_function(
            "([s,t])=>s===document.querySelector('[data-axon]').axonInspector.stats().triangles",
            arg=[result["triangles"], tier],
            timeout=30000,
        )
        solo = el.evaluate("e=>e.axonInspector.stats()")
        result.update(skeletonDraws=solo["draws"], renderedSkeletonTriangles=solo["triangles"])
        result["rawJs"] = sum(m["raw"] for m in result["scripts"])
        result["gzipJs"] = sum(m["gzip"] for m in result["scripts"])
        wanted = sorted(
            ({"path": "/characters/assets/" + asset.name, "bodyBytes": asset.stat().st_size}
             for asset in expected_assets), key=lambda item: item["path"],
        )
        assert result["scanAssets"] == wanted, result["scanAssets"]
        assert sorted(p for p in requested if p.endswith(".glb")) == [a["path"] for a in wanted]
        result["scanBytes"] = sum(a["bodyBytes"] for a in wanted)
        result["boneBytes"] = sum(a["bodyBytes"] for a in wanted if "/skeleton-" in a["path"])
        result["muscleBytes"] = sum(a["bodyBytes"] for a in wanted if "/bp3d-muscles-" in a["path"])
        result["femaleSupplementBytes"] = sum(
            a["bodyBytes"] for a in wanted if "/vhf-muscles-" in a["path"]
        )
        if result["muscleBytes"]:
            assert result["muscles"] == (339 if result["femaleSupplementBytes"] else 323) and result["muscleTriangles"] > 0, result["muscles"]
        assert any("/diagram-" in m["path"] for m in result["scripts"])
        assert not any(
            "/ref-" in m["path"] or "/character-ref" in m["path"] for m in result["scripts"]
        ), result["scripts"]
        assert 0 < result["skeletonDraws"] <= result["allDraws"] < 300
        assert 0 < result["triangles"] < result["allTriangles"]
        return result
    finally:
        ctx.close()


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--repo", type=Path, default=TOOLS.parent)
    ap.add_argument(
        "--three", type=Path, default=os.getenv("THREE_ROOT"), required=not os.getenv("THREE_ROOT")
    )
    ap.add_argument("--rounds", type=int, default=3)
    ap.add_argument(
        "--baseline", type=Path, help="Check all four skeleton triangle ceilings against this report"
    )
    ap.add_argument("--chrome", default=os.getenv("CHROME", "/usr/bin/chromium"))
    ap.add_argument("--output", type=Path, required=True)
    a = ap.parse_args()
    repo = a.repo.resolve()
    server = bench.server(repo, a.three.resolve())
    report = {
        "revision": subprocess.check_output(
            ["git", "-C", str(repo), "rev-parse", "HEAD"], text=True
        ).strip(),
        "network": bench.NETWORK,
        "cpu": 4,
        "viewport": "800x680@1",
        "renderer": "ANGLE Vulkan SwiftShader",
        "note": "Fresh Chromium process/profile per visit; HTTP cache disabled. Native 2D blit of selected hero at actual tier, plus one RAF. All first scroll JS response bodies (gzip level 6).",
        "rows": [],
    }
    try:
        with sync_playwright() as pw:
            for i in range(a.rounds):
                cases = [(tier, hero) for tier in ("mobile", "high") for hero in ("sippy", "roma")]
                for tier, hero in (reversed(cases) if i % 2 else cases):
                    browser = pw.chromium.launch(
                        executable_path=a.chrome,
                        args=[
                            "--no-sandbox",
                            "--use-gl=angle",
                            "--use-angle=swiftshader",
                            "--enable-unsafe-swiftshader",
                            "--disable-gpu-shader-disk-cache",
                        ],
                    )
                    try:
                        report["browser"] = browser.version
                        sex = "male" if hero == "sippy" else "female"
                        directory = repo / "docs/characters/assets"
                        assets = [directory / f"skeleton-{sex}-{tier}.glb",
                                  directory / f"bp3d-muscles-{tier}-meshopt.glb"]
                        if hero == "roma":
                            assets.append(directory / f"vhf-muscles-{tier}-meshopt.glb")
                        row = measure(browser, f"http://127.0.0.1:{server.server_port}", tier, hero,
                                      [asset for asset in assets if asset.is_file()])
                    finally:
                        browser.close()
                    row.update(round=i + 1, tier=tier, hero=hero)
                    report["rows"].append(row)
                    print(
                        i + 1,
                        tier,
                        hero,
                        round(row["presentedMs"]),
                        row["triangles"],
                        row["skeletonDraws"],
                        row["gzipJs"],
                        flush=True,
                    )
                    report["sourceSha256"] = dict(sorted(server.fingerprints.items()))
                    for path, h in server.fingerprints.items():
                        src = (
                            a.three / path.removeprefix("/__three/")
                            if path.startswith("/__three/")
                            else repo / "docs" / (path.lstrip("/") or "index.html")
                        )
                        assert hashlib.sha256(src.read_bytes()).hexdigest() == h, src
                    report["summary"] = []
                    for tag in cases:
                        rs = [r for r in report["rows"] if (r["tier"], r["hero"]) == tag]
                        if rs:
                            keys = (
                                "presentedMs",
                                "firstBlitMs",
                                "skeletonDraws",
                                "triangles",
                                "bones",
                                "allDraws",
                                "gzipJs",
                                "rawJs",
                                "scanBytes",
                                "boneBytes",
                                "muscleBytes",
                                "femaleSupplementBytes",
                                "muscles",
                                "muscleTriangles",
                                "compositeDraws",
                            )
                            report["summary"].append(
                                {
                                    "tier": tag[0],
                                    "hero": tag[1],
                                    "visits": len(rs),
                                    **{k: statistics.median(r[k] for r in rs) for k in keys},
                                }
                            )
                    a.output.parent.mkdir(parents=True, exist_ok=True)
                    a.output.write_text(json.dumps(report, indent=2) + "\n")
    finally:
        server.shutdown()
        server.server_close()

    if a.baseline:
        old = json.loads(a.baseline.read_text())
        for key in ("browser", "network", "cpu", "viewport", "renderer"):
            if report[key] != old[key]:
                raise ValueError(f"Incompatible comparison setting: {key}")
        by_tier = {(r["tier"], r["hero"]): r for r in old["summary"]}
        for measured in report["summary"]:
            tag = (measured["tier"], measured["hero"])
            prior = by_tier[tag]
            ceiling = int(prior["triangles"]) * 14 // 10
            print(
                f"{tag}: {measured['triangles']:,} skeleton triangles (before {prior['triangles']:,}; ceiling {ceiling:,})"
            )
            if measured["triangles"] > ceiling:
                raise SystemExit(f"{tag}: exceeds 1.40× main")


if __name__ == "__main__":
    main()

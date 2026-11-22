"""Measure first opening of the lazy Axon View and the real isolated skeleton."""

import argparse
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import runpy
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
Wire = runpy.run_path(str(TOOLS / "benchmark-route-load.py"))["Wire"]

RECORD_PAINT = """
window.axonMeasure = {images:0};
const copy = CanvasRenderingContext2D.prototype.putImageData;
CanvasRenderingContext2D.prototype.putImageData = function(image,...args){
  const result = copy.call(this,image,...args);
  if (this.canvas.matches('[data-axon-canvas]')) {
    const q=window.axonMeasure; q.images++;
    if (!q.firstPostPaint) {
      const copied = performance.now();
      requestAnimationFrame(()=>{
        const el = document.querySelector('[data-axon]');
        const stats = el.axonInspector.stats();
        if (el.dataset.progress === 'available-layers' && stats.partial && !q.preview) {
          q.preview = {copied, presented:performance.now(), stage:el.dataset.progress,
            layers:[...new Set(el.axonInspector.inventory().map(part=>part.layer))].sort(),
            triangles:stats.triangles};
        }
        if (el.dataset.ready === q.key && !q.firstPostPaint && stats.ready && !stats.partial) {
          q.copied = copied;
          q.firstPostPaint = performance.now();
        }
      });
    }
  }
  return result;
};
"""


PROFILE = """
const q=window.axonMeasure;
q.events=[];
q.mark = (name, phase, detail) => {
  if(q.opened && !q.firstPostPaint)
    q.events.push({name,phase,ms:performance.now()-q.opened,detail});
};
new PerformanceObserver(entries=>{
  for(const e of entries.getEntries()) if(q.opened && e.startTime>=q.opened &&
     (!q.firstPostPaint || e.startTime < q.firstPostPaint))
    q.events.push({name:'Main-thread task',ms:e.startTime-q.opened,duration:e.duration});
}).observe({type:'longtask'});
for (const key of ['compileShader','linkProgram']) {
  const proto=WebGL2RenderingContext.prototype, native=proto[key];
  proto[key]=function(...args){
    q.mark(key,'start');try{return native.apply(this,args);}finally{q.mark(key,'end');}
  };
}
q.profileRenderer = renderer => {
  for (const method of ['compile','compileAsync','render','readRenderTargetPixelsAsync']) {
    const native=renderer[method];
    renderer[method]=function(...args) {
      const name=args[0]?.name||'';
      q.mark(method,'start',name);
      try {
        const result=native.apply(this,args);
        if(result?.then) result.then(()=>q.mark(method,'resolved',name),()=>q.mark(method,'rejected',name));
        return result;
      } finally {q.mark(method,'returned',name);}
    };
  }
};
"""


def measure(browser, origin, tier, hero, expected_assets=(), mode="legacy", profile=False):
    ctx = browser.new_context(
        viewport={"width": 800, "height": 680},
        device_scale_factor=1,
        service_workers="block",
        reduced_motion="reduce",
    )
    try:
        page = ctx.new_page()
        requested = []
        workers = []
        page.on("worker", lambda worker: workers.append(urlsplit(worker.url).path))
        page.on("request", lambda req: requested.append(urlsplit(req.url).path))
        page.add_init_script(script=RECORD_PAINT + (PROFILE if profile else ""))
        cdp = ctx.new_cdp_session(page)
        wire = Wire(cdp)
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
            axonMeasure.profileRenderer?.(renderer);
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
        page.evaluate(r"""key=>{
          axonMeasure.key=key;
          const urls=performance.getEntriesByType('resource').map(r=>new URL(r.name).pathname);
          if(urls.some(p=>/\/(diagram-|axon-view)|\.glb$|meshopt.decoder/i.test(p)))throw Error('Inspector was prefetched');
          axonMeasure.opened=performance.now();
          document.querySelector('[data-axon] [data-study-body]').scrollIntoView({block:'end',behavior:'instant'});
        }""", hero + "-" + tier)
        page.wait_for_function(
            """key=>document.querySelector('[data-axon]').dataset.ready===key &&
                  axonMeasure.firstPostPaint""",
            arg=hero + "-" + tier,
            timeout=90000,
        )
        result = page.evaluate("""()=>{
          const q=axonMeasure, el=document.querySelector('[data-axon]'), api=el.axonInspector;
          const surface=el.querySelector('[data-axon-canvas]'), box=surface.getBoundingClientRect();
          if(getComputedStyle(surface).visibility!=='visible' || box.bottom<=0 || box.top>=innerHeight)
            throw Error('The populated inspection canvas is hidden or outside the viewport');
          const time=q.firstPostPaint;
          const resources=performance.getEntriesByType('resource').filter(r=>r.startTime>=q.opened&&r.responseEnd<=time);
          const list=resources.filter(r=>new URL(r.name).pathname.endsWith('.js'));
          const assets=resources.filter(r=>new URL(r.name).pathname.endsWith('.glb'));
          const inventory=api.inventory(), bones=inventory.filter(p=>p.layer==='skeleton');
          const muscles=inventory.filter(p=>p.layer==='muscles');
          const s=api.stats();
          return {...(q.events?{profile:q.events,requests:resources.map(r=>({
              path:new URL(r.name).pathname,startMs:r.startTime-q.opened,finishMs:r.responseEnd-q.opened}))}:{}),
            start:performance.timeOrigin+q.opened,end:performance.timeOrigin+time,
            preview:q.preview ? {...q.preview, presentedMs:q.preview.presented-q.opened,
                firstBlitMs:q.preview.copied-q.opened, end:performance.timeOrigin+q.preview.presented} : null,
            fitPath:s.fitPath ?? null,partial:s.partial ?? false,
            presentedMs:time-q.opened,firstBlitMs:q.copied-q.opened,floor:q.renderedActor,
            lastDeferredResponseMs:Math.max(0,...resources.map(r=>r.responseEnd-q.opened)),
            assetWaterfall:assets.map(r=>({path:new URL(r.name).pathname,startMs:r.startTime-q.opened,
              responseMs:r.responseStart-q.opened,finishMs:r.responseEnd-q.opened})),
            layers:[...new Set(inventory.map(p=>p.layer))].sort(),
            bones:bones.length,triangles:bones.reduce((n,b)=>n+b.triangles,0),allDraws:s.draws,allTriangles:s.triangles,
            compositeDraws:s.postDraws??0,muscles:muscles.length,
            muscleTriangles:muscles.reduce((n,p)=>n+p.triangles,0),
            scanAssets:assets.map(r=>({path:new URL(r.name).pathname,bodyBytes:r.encodedBodySize})).sort((a,b)=>a.path.localeCompare(b.path)),
            scripts:list.map(r=>({path:new URL(r.name).pathname,raw:r.decodedBodySize,gzip:r.encodedBodySize})).sort((a,b)=>a.path.localeCompare(b.path))};
        }""")
        images = page.evaluate("axonMeasure.images")
        page.locator("[data-layer=skeleton] [data-isolate]").evaluate("b=>b.click()")
        page.wait_for_function("n=>axonMeasure.images>n", arg=images, timeout=30000)
        el = page.locator("[data-axon]")
        page.wait_for_function(
            "([s,t])=>s===document.querySelector('[data-axon]').axonInspector.stats().triangles",
            arg=[result["triangles"], tier],
            timeout=30000,
        )
        start = result.pop("start")
        traffic = wire.until(result.pop("end"), since=start)
        if result["preview"]:
            preview = result["preview"]
            preview_wire = wire.until(preview.pop("end"), since=start)
            preview["transferBytes"] = preview_wire["transferBytes"]
            for key in ("copied", "presented"):
                preview.pop(key)
        result.update(transferBytes=traffic["transferBytes"], resources=traffic["resources"],
                      workerPaths=workers)
        assert not wire.redirects, wire.redirects
        assert all(r["origin"] == origin for r in wire.requests.values())
        assert all(r["status"] is None or r["status"] < 400 for r in traffic["resources"]), traffic
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
        if mode in ("baked", "source geometry"):
            assert result["fitPath"] == mode and not result["partial"], result
            assert not workers, f"Normal inspection started workers: {workers}"
            fit_modules = ("/diagram-human.", "/diagram-fit-model.", "/diagram-fit-worker.",
                           "/diagram-worker-client.", "/diagram-scan-fit.", "/diagram-muscle-charts.")
            assert not any(fragment in p for p in requested for fragment in fit_modules), requested
            if mode == "baked":
                assert result["muscles"] == (361 if hero == "sippy" else 365)
            else:
                muscles, layers = (
                    (331, ["breast", "clothes", "gluteal-fat", "hip-fat", "muscles", "skeleton", "skin"]) if hero == "roma"
                    else (361, ["clothes", "muscles", "skeleton", "skin"])
                )
                assert result["bones"] >= 142 and result["muscles"] == muscles, result
                assert result["layers"] == layers, result
                assert result["allTriangles"] >= result["triangles"] + result["muscleTriangles"], result
                if hero == "roma":
                    assert result["preview"] and result["preview"]["stage"] == "available-layers", result
                    assert "skeleton" in result["preview"]["layers"] and result["preview"]["triangles"] > 0
                    assert 0 < result["preview"]["presentedMs"] < result["presentedMs"]
                else:
                    assert result["preview"] is None
        else:
            assert not workers, workers
            result["fitPath"] = "runtime fit" if result["scanBytes"] else "procedural"
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
    ap.add_argument("--time-baseline", type=Path,
                    help="Check first-frame medians against 1.5× this baseline.")
    ap.add_argument("--source-geometry", action="store_true",
                    help="Expect the unmodified source assets and rigid-transform renderer.")
    ap.add_argument("--chrome", default=os.getenv("CHROME", "/usr/bin/chromium"))
    ap.add_argument("--output", type=Path, required=True)
    ap.add_argument("--tiers", choices=["mobile", "high"], nargs="+", default=["mobile", "high"])
    ap.add_argument("--heroes", choices=["sippy", "roma"], nargs="+", default=["sippy", "roma"])
    ap.add_argument("--profile", action="store_true", help="Record diagnostic timings for actual WebGL/Three.js methods and main-thread tasks.")
    a = ap.parse_args()
    if a.time_baseline and (a.rounds < 3 or set(a.heroes) != {"sippy", "roma"} or
                            set(a.tiers) != {"mobile", "high"} or a.profile):
        ap.error("The time budget requires three or more unprofiled visits for every character and tier.")
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
        "note": "Fresh Chromium process and profile per visit, with HTTP cache disabled. Real scroll to a fully populated native 2D blit of the selected hero at the requested tier, plus one RAF. The CDP ledger includes headers. JS responses use gzip level 6. GLB files use meshopt.",
        "rows": [],
    }
    try:
        with sync_playwright() as pw:
            for i in range(a.rounds):
                cases = [(tier, hero) for tier in a.tiers for hero in a.heroes]
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
                        mode = "legacy"
                        if a.source_geometry:
                            mode = "source geometry"
                            assets = [directory / f"skeleton-{sex}-{tier}.glb"]
                            if hero == "roma":
                                stems = ("roma-adapted-bp3d", "roma-adapted-zanatomy")
                                assets.append(directory / "vhf-muscles-source-meshopt.glb")
                            else:
                                stems = ("bp3d-muscles", "bp3d-missing-muscles", "zanatomy-lats-rectus")
                            assets.extend(directory / f"{name}-{tier}-meshopt.glb" for name in stems)
                            assert all(asset.is_file() for asset in assets)
                        elif (directory / f"axon-{hero}-{tier}.glb").is_file():
                            mode = "baked"
                            assets = [directory / f"axon-{hero}-{tier}{suffix}.glb" for suffix in ("","-sa")]
                            assert all(asset.is_file() for asset in assets)
                        else:
                            assets = [directory / f"skeleton-{sex}-{tier}.glb",
                                      directory / f"bp3d-muscles-{tier}-meshopt.glb"]
                            if hero == "roma":
                                assets.append(directory / f"vhf-muscles-{tier}-meshopt.glb")
                        row = measure(browser, f"http://127.0.0.1:{server.server_port}", tier, hero,
                                      [asset for asset in assets if asset.is_file()], mode=mode, profile=a.profile)
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
                                "transferBytes",
                                "boneBytes",
                                "muscleBytes",
                                "femaleSupplementBytes",
                                "muscles",
                                "muscleTriangles",
                                "compositeDraws",
                            )
                            preview = [r["preview"] for r in rs if r["preview"]]
                            report["summary"].append(
                                {
                                    "tier": tag[0],
                                    "hero": tag[1],
                                    "visits": len(rs),
                                    **{k: statistics.median(r[k] for r in rs) for k in keys},
                                    **({"previewPresentedMs": statistics.median(r["presentedMs"] for r in preview),
                                        "previewTransferBytes": statistics.median(r["transferBytes"] for r in preview)}
                                       if preview else {}),
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

    if a.time_baseline:
        old = json.loads(a.time_baseline.read_text())
        for key in ("browser", "network", "cpu", "viewport", "renderer"):
            if report[key] != old[key]:
                raise ValueError(f"Incompatible comparison setting: {key}")
        by_case = {(r["tier"], r["hero"]): r["presentedMs"] for r in old["summary"]}
        failures = []
        for measured in report["summary"]:
            tag = measured["tier"], measured["hero"]
            ceiling_ms = 1.5 * by_case[tag]
            observed_ms = measured["presentedMs"]
            print(f"{tag}: median first populated frame {observed_ms:.0f} ms, cap {ceiling_ms:.0f} ms")
            if measured["visits"] < 3 or observed_ms > ceiling_ms:
                failures.append(tag)
        if failures:
            raise SystemExit(f"Insufficient visits or latency above the 1.5× time cap: {failures}")


if __name__ == "__main__":
    main()

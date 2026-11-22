"""Compare both real routes on equivalent cold Chromium connections.

THREE_ROOT=/path/to/three-0.170.0 python tools/benchmark-route-load.py --repo . --output /tmp/routes.json
Use a separate, detached checkout for a baseline. At least five rounds are recommended.
"""

import argparse
from collections import defaultdict
import hashlib
import importlib.util
import json
import math
import os
from pathlib import Path
import statistics
import subprocess
import sys
import time
from urllib.parse import urlsplit

from playwright.sync_api import sync_playwright

sys.dont_write_bytecode = True
TOOLS = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("heros_benchmark", TOOLS / "benchmark-heros.py")
benchmark = importlib.util.module_from_spec(spec)
spec.loader.exec_module(benchmark)


class Wire:
    """Timestamp CDP response bytes including the document and incomplete responses."""

    def __init__(self, cdp):
        self.requests = {}
        self.origin_offset = None
        self.redirects = []
        for event, callback in (
            ("requestWillBeSent", self.request),
            ("responseReceived", self.response),
            ("dataReceived", self.data),
            ("loadingFinished", self.finish),
        ):
            cdp.on("Network." + event, callback)

    def request(self, event):
        url = urlsplit(event["request"]["url"])
        if url.scheme not in ("http", "https"):
            return
        if "redirectResponse" in event:
            self.redirects.append(event["redirectResponse"]["url"])
        self.requests[event["requestId"]] = dict(
            path=url.path,
            origin=url.scheme + "://" + url.netloc,
            at=event["timestamp"],
            kind=event["type"],
            pieces=[],
        )
        if self.origin_offset is None and event["type"] == "Document":
            self.origin_offset = event["wallTime"] - event["timestamp"]

    def response(self, event):
        r = self.requests.get(event["requestId"])
        if r is not None:
            r.update(
                responseAt=event["timestamp"],
                headers=max(0, event["response"]["encodedDataLength"]),
                status=event["response"]["status"],
                mime=event["response"]["mimeType"],
            )

    def data(self, event):
        r = self.requests.get(event["requestId"])
        if r is not None:
            r["pieces"].append((event["timestamp"], event["encodedDataLength"]))

    def finish(self, event):
        r = self.requests.get(event["requestId"])
        if r is not None:
            r.update(end=event["timestamp"], total=event["encodedDataLength"])

    def until(self, when, since=None):
        start = since / 1000 - self.origin_offset if since is not None else -math.inf
        cutoff = when / 1000 - self.origin_offset
        resources = []
        for r in self.requests.values():
            if not start <= r["at"] <= cutoff:
                continue
            complete = r.get("end", float("inf")) <= cutoff
            wire = (
                r["total"]
                if complete
                else (r.get("headers", 0) if r.get("responseAt", float("inf")) <= cutoff else 0)
                + sum(n for t, n in r["pieces"] if t <= cutoff)
            )
            resources.append(dict(path=r["path"], wire=wire, complete=complete, status=r.get("status")))
        return dict(
            requests=len(resources),
            modules=len({r["path"] for r in resources if r["path"].endswith((".js", ".mjs"))}),
            transferBytes=sum(r["wire"] for r in resources),
            resources=resources,
        )


def confirm_graph(page, cdp, route, tier, resources, key, code):
    # Release the held movement key before the post-timing module audit. On a
    # slow renderer Village otherwise keeps panning past its visible workers.
    cdp.send("Input.dispatchKeyEvent", {"type": "keyUp", "key": key, "code": code})
    # Attach after the timed endpoint so enabling the debugger cannot perturb it.
    scripts = set()

    def parsed(event):
        u = urlsplit(event["url"])
        if event.get("isModule") and u.scheme in ("http", "https"):
            scripts.add(u.path)

    cdp.on("Debugger.scriptParsed", parsed)
    cdp.send("Debugger.enable")
    fetched = {r["path"] for r in resources if r["path"].endswith((".js", ".mjs"))}
    # A movement-triggered module can still be in flight at the acknowledgement.
    # Let the browser finish its existing requests before checking their ESM type.
    deadline = time.monotonic() + 20
    while fetched - scripts and time.monotonic() < deadline:
        page.wait_for_timeout(100)
    missing = sorted(fetched - scripts)
    assert not missing, f"JavaScript counted in transfer but unverified as an ES module: {missing}"
    cdp.send("Debugger.disable")

    page.evaluate(
        """async route=>{
        const T=await import(JSON.parse(document.querySelector('script[type=importmap]').textContent).imports.three);
        const old=T.Mesh.prototype.onAfterRender, village=route==='village';
        const canvas=document.querySelector(village?'.vl-stage canvas':'#character-test canvas');
        const expected=village?new Set(window.routeLoad.proof.names):new Set(['sippy']);
        window.qualityProof=null;
        T.Mesh.prototype.onAfterRender=function(renderer,scene,camera,...args){
            old.call(this,renderer,scene,camera,...args);
            if(renderer.domElement!==canvas||!camera.isPerspectiveCamera||!this.geometry) return;
            let node=this;
            while(node&&!expected.has(node.name)) node=node.parent;
            const vertices=this.geometry.getAttribute('position')?.count||0;
            if(!node||vertices<100) return;
            let shadow;
            scene.traverse(child=>{if(child.isDirectionalLight&&child.castShadow)shadow=child.shadow.mapSize.x});
            if(!shadow) return;
            window.qualityProof={shadowMapWidth:shadow,actor:node.name,renderedMesh:this.name,
                  meshVertices:vertices,actualReducedMotion:matchMedia('(prefers-reduced-motion: reduce)').matches};
            T.Mesh.prototype.onAfterRender=old;
        };
    }""",
        route,
    )
    cdp.send(
        "Input.dispatchKeyEvent",
        {
            "type": "rawKeyDown",
            "key": key,
            "code": code,
            "windowsVirtualKeyCode": 39 if route == "village" else 87,
        },
    )
    page.wait_for_function("window.qualityProof", timeout=20000)
    quality = page.evaluate("qualityProof")
    assert quality["actualReducedMotion"]
    expected = 512 if tier == "mobile" else (2048 if route == "village" else 1024)
    assert quality["shadowMapWidth"] == expected, (quality, tier)
    return dict(esModules=sorted(fetched), quality=quality)


def trial(browser, url, route, tier, probe, verify):
    ctx = browser.new_context(
        viewport={"width": 800, "height": 680},
        device_scale_factor=1,
        reduced_motion="reduce",
        service_workers="block",
    )
    try:
        page = ctx.new_page()
        cdp = ctx.new_cdp_session(page)
        page.on(
            "console",
            lambda message: (
                print(message.type, message.text, flush=True)
                if message.type in ("error", "warning")
                or message.text.startswith(("Village shaders", "Route popped"))
                else None
            ),
        )
        page.on("pageerror", lambda error: print("Browser error", error, flush=True))
        ledger = Wire(cdp)
        cdp.send("Network.enable")
        cdp.send("Network.setCacheDisabled", {"cacheDisabled": True})
        cdp.send("Network.emulateNetworkConditions", benchmark.NETWORK)
        cdp.send("Emulation.setCPUThrottlingRate", {"rate": 4})
        key, code = ("ArrowRight", "ArrowRight") if route == "village" else ("w", "KeyW")

        options = json.dumps([route, tier])
        # In both routes the real renderer already exists before the observer
        # imports its cached module and selects the ordinary quality control.
        page.add_init_script(
            script=probe
            + """
            const [benchRoute] = """
            + options
            + """;
            const selector=benchRoute==='village'?'.vl-stage canvas':'#character-test canvas';
            const observer=new MutationObserver(()=>{
              if (!document.querySelector(selector)) return;
              observer.disconnect();
              observeRoute(..."""
            + options
            + """).catch(e=>{window.routeLoad={error:String(e.stack||e)}});
            });
            observer.observe(document,{subtree:true,childList:true});"""
        )
        print("  navigating", flush=True)
        page.goto(url + "/#" + route, wait_until="commit", timeout=180000)
        print("  committed", flush=True)
        try:
            page.wait_for_function(
                "window.routeLoad?.presentedMs || window.routeLoad?.error", polling=10, timeout=45000
            )
            cdp.send(
                "Input.dispatchKeyEvent",
                {
                    "type": "rawKeyDown",
                    "key": key,
                    "code": code,
                    "windowsVirtualKeyCode": 39 if route == "village" else 87,
                },
            )
            page.wait_for_function(
                "window.routeLoad?.done || window.routeLoad?.error", polling=100, timeout=45000
            )
        except Exception:
            print(
                "Diagnostic:",
                page.evaluate(
                    "({probe:window.routeLoad,mode:document.body.dataset.mode,tier:document.querySelector('.vl-quality')?.value,stage:document.querySelector('.vl-loading')?.outerHTML,hero:document.querySelector('.ct-loading')?.outerHTML})"
                ),
                flush=True,
            )
            raise
        p = page.evaluate("window.routeLoad")
        assert not p.get("error"), p
        origin = page.evaluate("performance.timeOrigin")
        wire = ledger.until(origin + p["interactiveMs"])
        assert wire["resources"][0]["path"] == "/" and wire["resources"][0]["wire"] > 0
        inspector_paths = [r["path"] for r in wire["resources"] if
                           r["path"].startswith(("/characters/diagram-", "/characters/axon-",
                                                "/characters/ref-", "/characters/character-ref"))
                           or r["path"].endswith(".glb") or "meshopt_decoder" in r["path"]]
        assert not inspector_paths, f"Cold {route} opened an inspector dependency: {inspector_paths}"
        assert p["proof"]["tier"].lower() == tier and p["proof"]["names"]
        assert p["presentedMs"] <= p["inputMs"] <= p["interactiveMs"]
        dx, _, dz = (b - a for a, b in zip(p["positionBefore"], p["positionAfter"]))
        assert (
            math.hypot(dx, dz) > 0.00001
        ), "Input did not change the camera/actor's horizontal position"
        assert not [r for r in wire["resources"] if r["status"] and r["status"] >= 400], wire[
            "resources"
        ]
        assert not ledger.redirects, f"Unexpected HTTP redirects: {ledger.redirects}"
        assert {r["origin"] for r in ledger.requests.values()} == {
            url
        }, "Uncontrolled external origin in the measured session"
        audit = confirm_graph(page, cdp, route, tier, wire["resources"], key, code) if verify else None
        return dict(
            graphAndTier=audit,
            route=route,
            tier=tier,
            presentedMs=p["presentedMs"],
            interactiveMs=p["interactiveMs"],
            inputAtMs=p["inputMs"],
            firstProof=p["proof"],
            positionBefore=p["positionBefore"],
            positionAfter=p["positionAfter"],
            **wire,
        )
    finally:
        ctx.close()


def evidence(report):
    """Reuse identical, fully enumerated HTTP ledgers across repeated visits."""
    unique = {}
    module_graphs = {}
    visits = []
    for recorded in report["rows"]:
        row = dict(recorded)
        resources = sorted(row.pop("resources"), key=lambda r: (r["path"], r["wire"]))
        identity = hashlib.sha256(json.dumps(resources, sort_keys=True).encode()).hexdigest()[:16]
        unique[identity] = resources
        row["requestLedger"] = identity
        graph = row.pop("graphAndTier", None)
        if graph:
            module_graphs[identity] = graph["esModules"]
            row["tierAndGeometry"] = graph["quality"]
        visits.append(row)
    return dict(report, rows=visits, requestLedgers=unique, verifiedModuleGraphs=module_graphs)


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument(
        "--audit",
        action="store_true",
        help="After each timed endpoint, verify fetched ES modules and the real shadow-map tier and rendered actor geometry.",
    )
    p.add_argument("--repo", type=Path, default=TOOLS.parent)
    p.add_argument("--three", type=Path, default=os.getenv("THREE_ROOT"))
    p.add_argument("--chrome", default=os.getenv("CHROME", "/usr/bin/chromium"))
    p.add_argument("--rounds", type=int, default=5)
    p.add_argument("--output", type=Path, required=True)
    p.add_argument("--tiers", nargs="+", choices=["mobile", "high"], default=["mobile", "high"])
    p.add_argument("--routes", nargs="+", choices=["village", "heros"], default=["village", "heros"])
    a = p.parse_args()
    repo = a.repo.resolve()
    if not a.three or a.rounds < 1:
        p.error("Provide THREE_ROOT and positive sample count")
    server = benchmark.server(repo, a.three.resolve())
    url = f"http://127.0.0.1:{server.server_port}"
    probe = (TOOLS / "benchmark-route-load.js").read_text()
    report = dict(
        revision=subprocess.check_output(
            ["git", "-C", str(repo), "rev-parse", "HEAD"], text=True
        ).strip(),
        origin=url,
        network=benchmark.NETWORK,
        cpu=4,
        viewport=[800, 680],
        probeSha256=hashlib.sha256(probe.encode()).hexdigest(),
        note="Gzip level 6 HTML/CSS/JS, pinned local three 0.170.0 mirror, system font fallback, HTTP/1.1, Chromium SwiftShader. Each visit uses a new Chromium process and profile, HTTP cache and GPU shader disk cache disabled.",
        rows=[],
        summary=[],
    )
    a.output.parent.mkdir(parents=True, exist_ok=True)
    try:
        with sync_playwright() as pw:
            for i in range(a.rounds):
                for tier in a.tiers:
                    for route in a.routes[:: (-1 if i % 2 else 1)]:
                        print(f"round {i+1} {route} {tier}", flush=True)
                        # A new process/profile also discards previous trials' shader caches.
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
                        report["browser"] = browser.version
                        try:
                            r = trial(browser, url, route, tier, probe, a.audit)
                        finally:
                            browser.close()
                        r["round"] = i + 1
                        report["rows"].append(r)
                        groups = defaultdict(list)
                        for row in report["rows"]:
                            groups[(row["route"], row["tier"])].append(row)
                        report["summary"] = [
                            dict(
                                route=k[0],
                                tier=k[1],
                                samples=len(rs),
                                **{
                                    attr: statistics.median(v[attr] for v in rs)
                                    for attr in (
                                        "presentedMs",
                                        "interactiveMs",
                                        "transferBytes",
                                        "requests",
                                        "modules",
                                    )
                                },
                            )
                            for k, rs in groups.items()
                        ]
                        report["sourceSha256"] = dict(sorted(server.fingerprints.items()))
                        for path, expected in report["sourceSha256"].items():
                            source = (
                                a.three / path.removeprefix("/__three/")
                                if path.startswith("/__three/")
                                else repo / "docs" / (path.lstrip("/") or "index.html")
                            )
                            if hashlib.sha256(source.read_bytes()).hexdigest() != expected:
                                raise RuntimeError(f"Source changed since first transfer: {source}")
                        report["verifiedServedSources"] = True
                        a.output.write_text(json.dumps(evidence(report), indent=2) + "\n")
                        print(
                            {
                                k: r[k]
                                for k in (
                                    "presentedMs",
                                    "interactiveMs",
                                    "transferBytes",
                                    "requests",
                                    "modules",
                                )
                            },
                            flush=True,
                        )
    finally:
        server.shutdown()
        server.server_close()


if __name__ == "__main__":
    main()

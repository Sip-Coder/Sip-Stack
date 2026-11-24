"""Measure Village's cold transfer, first frame and accepted input in Chromium.

THREE_ROOT=/path/to/three-0.170.0 python tools/benchmark-route-load.py --repo . --output /tmp/routes.json
Use a separate, detached checkout for a baseline. At least five rounds are recommended.
"""

import argparse
from collections import defaultdict
from functools import lru_cache
import gzip
import hashlib
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import math
import mimetypes
import os
from pathlib import Path
import statistics
import subprocess
import threading
import time
from urllib.parse import unquote, urlsplit

from playwright.sync_api import sync_playwright

TOOLS = Path(__file__).resolve().parent
CDN = 'https://cdn.jsdelivr.net/npm/three@0.170.0/'
NETWORK = dict(offline=False, latency=60, downloadThroughput=9_000_000 / 8,
               uploadThroughput=1_500_000 / 8, connectionType='cellular4g')
DEVICES = {
    'mobile': dict(viewport={'width': 412, 'height': 915}, device_scale_factor=2.6, is_mobile=True, has_touch=True),
    'high': dict(viewport={'width': 800, 'height': 680}, device_scale_factor=1),
}


def server(repo, three):
    roots = (repo / 'docs', three)
    assert json.loads((three / 'package.json').read_text())['version'] == '0.170.0'
    fingerprints = {}

    @lru_cache(maxsize=1024)
    def content(name):
        third_party = name.startswith('/__three/')
        root = roots[third_party]
        file = (root / (name.removeprefix('/__three/') if third_party else name.lstrip('/') or 'index.html')).resolve()
        if not file.is_relative_to(root) or not file.is_file():
            raise FileNotFoundError(name)
        data = file.read_bytes()
        fingerprints[name] = hashlib.sha256(data).hexdigest()
        kind = mimetypes.guess_type(file.name)[0] or 'application/octet-stream'
        if file.suffix in ('.js', '.mjs', '.html', '.css'):
            # Serve the pinned CDN package over the same throttled connection.
            # Playwright route fulfillment would bypass network shaping.
            data = data.replace(CDN.encode(), b'/__three/')
            if file.name == 'index.html':
                data = data.replace(b'https://fonts.googleapis.com/css2?', b'/__system-fonts?')
            return gzip.compress(data, compresslevel=6, mtime=0), kind, 'gzip'
        return data, kind, None

    class Handler(BaseHTTPRequestHandler):
        protocol_version = 'HTTP/1.1'

        def do_GET(self):
            name = unquote(urlsplit(self.path).path)
            try:
                data, kind, encoding = (b'', 'text/css', None) if name == '/__system-fonts' else content(name)
            except FileNotFoundError:
                self.send_error(404)
                return
            self.send_response(200)
            self.send_header('Content-Type', kind)
            self.send_header('Cache-Control', 'no-store')
            self.send_header('Content-Length', str(len(data)))
            if encoding:
                self.send_header('Content-Encoding', encoding)
            self.end_headers()
            try:
                self.wfile.write(data)
            except (BrokenPipeError, ConnectionResetError):
                pass

        def log_message(self, *args):
            pass

    httpd = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
    httpd.fingerprints = fingerprints
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd


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
            )

    def data(self, event):
        r = self.requests.get(event["requestId"])
        if r is not None:
            r["pieces"].append((event["timestamp"], event["encodedDataLength"]))

    def finish(self, event):
        r = self.requests.get(event["requestId"])
        if r is not None:
            r.update(end=event["timestamp"], total=event["encodedDataLength"])

    def until(self, when):
        cutoff = when / 1000 - self.origin_offset
        resources = []
        for r in self.requests.values():
            if r["at"] > cutoff:
                continue
            finished = r.get("end", float("inf")) <= cutoff
            body = sum(n for t, n in r["pieces"] if t <= cutoff)
            headers = r.get("headers", 0) if r.get("responseAt", float("inf")) <= cutoff else 0
            wire = r["total"] if finished else headers + body
            resources.append(dict(path=r["path"], wire=wire, complete=finished, status=r.get("status")))
        return dict(
            requests=len(resources),
            modules=len({r["path"] for r in resources if r["path"].endswith((".js", ".mjs"))}),
            transferBytes=sum(r["wire"] for r in resources),
            resources=resources,
        )


def confirm_graph(page, cdp, tier, resources):
    # Release the held movement key before the post-timing module audit. On a
    # slow renderer Village otherwise keeps panning past its visible workers.
    cdp.send("Input.dispatchKeyEvent", {"type": "keyUp", "key": "ArrowRight", "code": "ArrowRight"})
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
        """async () => {
        const T=await import(JSON.parse(document.querySelector('script[type=importmap]').textContent).imports.three);
        const old=T.Mesh.prototype.onAfterRender;
        const canvas=document.querySelector('.vl-stage canvas');
        const expected=new Set(window.routeLoad.proof.names);
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
    )
    cdp.send(
        "Input.dispatchKeyEvent",
        {
            "type": "rawKeyDown",
            "key": "ArrowRight",
            "code": "ArrowRight",
            "windowsVirtualKeyCode": 39,
        },
    )
    page.wait_for_function("window.qualityProof", timeout=20000)
    quality = page.evaluate("qualityProof")
    assert quality["actualReducedMotion"]
    expected = 512 if tier == "mobile" else 2048
    assert quality["shadowMapWidth"] == expected, (quality, tier)
    return dict(esModules=sorted(fetched), quality=quality)


def trial(browser, url, tier, probe, verify):
    ctx = browser.new_context(
        reduced_motion="reduce",
        service_workers="block",
        **DEVICES[tier],
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
        cdp.send("Network.emulateNetworkConditions", NETWORK)
        cdp.send("Emulation.setCPUThrottlingRate", {"rate": 4})

        # The real renderer already exists before the observer imports its
        # cached module and selects the ordinary quality control.
        page.add_init_script(
            script=probe
            + """
            const observer=new MutationObserver(()=>{
              if (!document.querySelector('.vl-stage canvas')) return;
              observer.disconnect();
              observeRoute("""
            + json.dumps(tier)
            + """).catch(e=>{window.routeLoad={error:String(e.stack||e)}});
            });
            observer.observe(document,{subtree:true,childList:true});"""
        )
        print("  navigating", flush=True)
        page.goto(url + "/#village", wait_until="commit", timeout=180000)
        print("  committed", flush=True)
        try:
            page.wait_for_function(
                "window.routeLoad?.presentedMs || window.routeLoad?.error", polling=10, timeout=45000
            )
            cdp.send(
                "Input.dispatchKeyEvent",
                {
                    "type": "rawKeyDown",
                    "key": "ArrowRight",
                    "code": "ArrowRight",
                    "windowsVirtualKeyCode": 39,
                },
            )
            page.wait_for_function(
                "window.routeLoad?.done || window.routeLoad?.error", polling=100, timeout=45000
            )
        except Exception:
            print(
                "Diagnostic:",
                page.evaluate(
                    "({probe:window.routeLoad,mode:document.body.dataset.mode,tier:document.querySelector('.vl-quality')?.value,stage:document.querySelector('.vl-loading')?.outerHTML})"
                ),
                flush=True,
            )
            raise
        p = page.evaluate("window.routeLoad")
        assert not p.get("error"), p
        origin = page.evaluate("performance.timeOrigin")
        wire = ledger.until(origin + p["interactiveMs"])
        assert wire["resources"][0]["path"] == "/" and wire["resources"][0]["wire"] > 0
        assert p["proof"]["tier"].lower() == tier and p["proof"]["names"]
        assert p["presentedMs"] <= p["inputMs"] <= p["interactiveMs"]
        dx, _, dz = (b - a for a, b in zip(p["positionBefore"], p["positionAfter"]))
        assert (
            math.hypot(dx, dz) > 0.00001
        ), "Input did not change the camera's horizontal position"
        assert not [r for r in wire["resources"] if r["status"] and r["status"] >= 400], wire[
            "resources"
        ]
        assert not ledger.redirects, f"Unexpected HTTP redirects: {ledger.redirects}"
        assert {r["origin"] for r in ledger.requests.values()} == {
            url
        }, "Uncontrolled external origin in the measured session"
        audit = confirm_graph(page, cdp, tier, wire["resources"]) if verify else None
        return dict(
            graphAndTier=audit,
            route="village",
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
    p.add_argument("--routes", nargs="+", choices=["village"], default=["village"],
                   help="Retained for existing Village benchmark commands.")
    p.add_argument("--tiers", nargs="+", choices=["mobile", "high"], default=["mobile", "high"])
    a = p.parse_args()
    repo = a.repo.resolve()
    if not a.three or a.rounds < 1:
        p.error("Provide THREE_ROOT and positive sample count")
    httpd = server(repo, a.three.resolve())
    url = f"http://127.0.0.1:{httpd.server_port}"
    probe = (TOOLS / "benchmark-route-load.js").read_text()
    report = dict(
        revision=subprocess.check_output(
            ["git", "-C", str(repo), "rev-parse", "HEAD"], text=True
        ).strip(),
        origin=url,
        network=NETWORK,
        cpu=4,
        devices=DEVICES,
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
                    print(f"round {i + 1} village {tier}", flush=True)
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
                        r = trial(browser, url, tier, probe, a.audit)
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
                    report["sourceSha256"] = dict(sorted(httpd.fingerprints.items()))
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
        httpd.shutdown()
        httpd.server_close()


if __name__ == "__main__":
    main()

"""Check baked Axon demand, genuine worker streaming, cancellation and recovery."""

import argparse
import gzip
import hashlib
import json
import os
from pathlib import Path
import re
import runpy
from urllib.parse import urlsplit
from urllib.request import urlopen

from playwright.sync_api import sync_playwright

TOOLS = Path(__file__).resolve().parent
stage = runpy.run_path(str(TOOLS / "check-characters.py"))
sheet = runpy.run_path(str(TOOLS / "check-character-ref.py"))
section = "[data-axon]"


def show(page, selector):
    page.locator(selector).evaluate("e=>e.scrollIntoView({block:'start',behavior:'instant'})")


def rendered(page, key):
    page.wait_for_function(
        "key=>document.querySelector('[data-axon]')?.dataset.ready===key && "
        "document.querySelector('[data-axon]').axonInspector?.stats().ready", arg=key
    )


def load_floor(page, url):
    page.goto(url.rstrip("/") + "/#heros", wait_until="commit")
    page.wait_for_function(
        "document.querySelector('.ct-loading')?.hidden && "
        "document.querySelector('.ct-stage canvas')?.style.visibility==='visible'"
    )
    page.locator('[data-setting="tier"]').select_option("mobile")


def fresh(browser, three, fonts):
    return stage["browser_context"](
        browser, package=three, system_fonts=fonts, width=800, height=680
    )


def verify(browser, url, three, fonts):
    ctx = fresh(browser, three, fonts)
    try:
        page = ctx.new_page()
        page.set_default_timeout(60000)
        paths, workers = [], []
        page.on("worker", lambda worker: workers.append(worker.url))
        page.on("request", lambda req: paths.append(urlsplit(req.url).path))
        load_floor(page, url)
        scan_requests = lambda: [p for p in paths if p.endswith(".glb")]
        decoder = lambda: [p for p in paths if "meshopt_decoder" in p or "GLTFLoader" in p]
        assert not scan_requests() and not decoder() and not workers, paths

        sheet["open_sheet"](page, "sippy", "mobile")
        page.wait_for_function(
            "document.querySelector('[data-panel=portrait]')?.dataset.status==='ready'"
        )
        assert not scan_requests() and not decoder() and not workers, paths

        page.locator('[data-pick="hummin"]').evaluate("e=>e.click()")
        show(page, f"{section} [data-study-body]")
        rendered(page, "hummin-mobile")
        assert not scan_requests() and not decoder() and not workers, paths
        assert not page.locator("[data-ghost]").is_visible()
        page.locator("[data-axon-hero]").select_option("roma")
        rendered(page, "roma-mobile")
        first_files = sorted([
            "/characters/assets/axon-roma-mobile.glb",
            "/characters/assets/axon-roma-mobile-sa.glb",
        ])
        assert sorted(scan_requests()) == first_files, scan_requests()
        parts = page.locator(section).evaluate("e=>e.axonInspector.inventory()")
        assert len([p for p in parts if p["layer"] == "muscles"]) == 365
        assert not workers and page.locator(section).evaluate("e=>e.axonInspector.stats().fitPath") == "baked"
        assert not any("diagram-scan-source" in p or "diagram-worker" in p or "GLTFLoader" in p for p in paths)
        assert sum("meshopt_decoder" in p for p in decoder()) == 1, decoder()
        page.evaluate("scrollTo({top:0,behavior:'instant'})")
        page.wait_for_function("!document.querySelector('[data-axon]').axonInspector.stats().visible")
        show(page, f"{section} [data-study-body]")
        rendered(page, "roma-mobile")
        assert sorted(scan_requests()) == first_files, scan_requests()
        print("Cold Heros, live Character Ref and Hummin requested zero scans or decoders. "
              "Reopening Roma reused the selected scan.", flush=True)
        held = []
        def hold_scan(route):
            held.append(route)
            page.evaluate("window.scanRequestHeld=true")
        page.route("**/axon-sippy-mobile.glb", hold_scan)
        documents = []
        page.on("framenavigated", lambda frame: documents.append(frame.url) if frame == page.main_frame else None)
        with page.expect_request("**/axon-sippy-mobile.glb"):
            page.locator("[data-axon-hero]").select_option("sippy")
        page.wait_for_function("window.scanRequestHeld")
        assert len(held) == 1
        page.locator("[data-axon-hero]").select_option("hummin")
        rendered(page, "hummin-mobile")
        held[0].abort()
        page.wait_for_function("document.querySelector('[data-axon]').axonInspector.stats().ready")
        assert not documents and not page.evaluate("sessionStorage.getItem('sip-recovered-at')")
        print("A delayed human scan could be superseded by Hummin without a stale reload.", flush=True)
        assert sorted(scan_requests()) == sorted(first_files + ["/characters/assets/axon-sippy-mobile.glb",
                                                                 "/characters/assets/axon-sippy-mobile-sa.glb"])
        demand = {"firstHuman": "roma-mobile", "requests": scan_requests(), "decoderModules": decoder(),
                  "superseded": "sippy-mobile", "final": "hummin-mobile"}
    finally:
        ctx.close()

    # An ordinary stale asset reloads through sip-recover. A second failure in
    # the same ten-minute window must surface the local Retry control. Serving
    # the file on the next attempt exercises both layers of recovery.
    recoveries = []
    for hero, filename in [
        ("sippy", "axon-sippy-mobile.glb"),
        ("roma", "axon-roma-mobile-sa.glb"),
    ]:
        recoveries.append(recovery(browser, url, three, fonts, hero, filename))
    fallbacks = [fallback(browser, url, three, fonts, "sippy", ""),
                 fallback(browser, url, three, fonts, "roma", "-sa")]
    stopped = cancel_worker(browser, url, three, fonts)
    recoveries.append(recovery(browser, url, three, fonts, "sippy", "bp3d-missing-muscles-mobile-meshopt.glb",
                               missing_bake="axon-sippy-mobile-sa.glb"))
    return {"scanDemand": demand, "recoveries": recoveries, "workerFallback": fallbacks,
            "workerCancellation": stopped}


def fallback(browser, url, three, fonts, hero, suffix):
    ctx = fresh(browser, three, fonts)
    try:
        page = ctx.new_page()
        page.set_default_timeout(120000)
        workers = []
        page.on("worker", lambda w: workers.append(w.url))
        missing = f"axon-{hero}-mobile{suffix}.glb"
        ctx.route("**/" + missing, lambda r: r.fulfill(status=404, body="Missing bake"))
        load_floor(page, url)
        page.locator(f'[data-pick="{hero}"]').evaluate("e=>e.click()")
        # Observe a real presented skeleton, change the selection while muscles
        # fit, then check that the complete model keeps that part selected.
        page.evaluate("""() => {
            const section = document.querySelector('[data-axon]');
            new MutationObserver(() => {
              if (window.partialProof || section.dataset.progress !== 'skeleton') return;
              const stats = section.axonInspector.stats();
              const inventory = section.axonInspector.inventory();
              const picker = section.querySelector('[data-part]');
              picker.value = '0'; picker.dispatchEvent(new Event('change'));
              window.partialProof = {
                ready: stats.ready, partial: stats.partial, fit: stats.fitPath,
                kinds: [...new Set(inventory.map(p => p.layer))], bones: inventory.length,
                selected: section.querySelector('[data-measure] strong')?.textContent
              };
            }).observe(section, {attributes:true, attributeFilter:['data-progress']});
        }""")
        show(page, f"{section} [data-study-body]")
        rendered(page, hero + "-mobile")
        proof = page.evaluate("window.partialProof")
        stats = page.locator(section).evaluate("e=>e.axonInspector.stats()")
        assert proof and proof["ready"] and proof["partial"] and proof["fit"] == "worker", proof
        assert proof["kinds"] == ["skeleton"] and proof["bones"] >= 142, proof
        assert stats["ready"] and stats["fitPath"] == "worker" and not stats["partial"], stats
        assert page.locator(f"{section} [data-part] option:checked").inner_text() == proof["selected"]
        assert " in (W × H × D)" in page.locator(f"{section} [data-measure]").inner_text()
        assert len(workers) == 1 and "diagram-fit-worker.js" in workers[0], workers
        assert not page.evaluate("sessionStorage.getItem('sip-recovered-at')")
        print(f"{missing}: Worker displayed {proof['bones']} selectable bones, then "
              f"completed {stats['parts']} parts and retained the measurement.", flush=True)
        return {"missing": missing, "workers": len(workers), "preview": proof,
                "completedParts": stats["parts"]}
    finally:
        ctx.close()


def cancel_worker(browser, url, three, fonts):
    ctx = fresh(browser, three, fonts)
    try:
        page = ctx.new_page()
        page.set_default_timeout(120000)
        ctx.route("**/axon-sippy-mobile.glb", lambda r: r.fulfill(status=410, body="No bake"))
        raw = "**/bp3d-missing-muscles-mobile-meshopt.glb"
        held = []
        closed = []
        page.on("worker", lambda worker: worker.on("close", lambda: closed.append(worker.url)))
        ctx.route(raw, lambda route: held.append(route))
        load_floor(page, url)
        with ctx.expect_event("request", predicate=lambda r: r.url.endswith(raw[3:])):
            show(page, f"{section} [data-study-body]")
        canvas = page.locator("[data-axon-canvas]")
        assert canvas.evaluate("c=>getComputedStyle(c).visibility === 'hidden'")
        page.evaluate("scrollTo({top:0,behavior:'instant'})")
        page.wait_for_function("!document.querySelector('[data-axon]').axonInspector.stats().visible")
        page.locator('[data-pick="hummin"]').evaluate("e=>e.click()")
        show(page, f"{section} [data-study-body]")
        rendered(page, "hummin-mobile")
        assert canvas.is_visible()
        assert len(closed) == 1 and "diagram-fit-worker.js" in closed[0], closed
        assert held and not page.evaluate("sessionStorage.getItem('sip-recovered-at')")
        held[0].abort()
        print("Scrolling offscreen terminated an active fitting Worker and Hummin opened.", flush=True)
        return {"terminatedWorkers": len(closed), "final": "hummin-mobile"}
    finally:
        ctx.close()


def recovery(browser, url, three, fonts, hero, filename, missing_bake=None):
    ctx = fresh(browser, three, fonts)
    try:
        page = ctx.new_page()
        page.set_default_timeout(60000)
        documents, files = [], []
        page.on("request", lambda req: documents.append(req.url) if req.resource_type == "document" else None)
        def fail_until_retry(route):
            files.append(route.request.url)
            if not restored[0]:
                route.fulfill(status=503, content_type="text/plain", body="Temporary asset outage")
            else:
                route.continue_()

        restored = [False]
        if missing_bake:
            ctx.route("**/" + missing_bake, lambda r: r.fulfill(status=404, body="Missing bake"))
        ctx.route("**/" + filename, fail_until_retry)
        load_floor(page, url)
        page.locator(f'[data-pick="{hero}"]').evaluate("e=>e.click()")
        with page.expect_navigation(wait_until="domcontentloaded"):
            show(page, f"{section} [data-study-body]")
        page.locator(".ct-stage canvas").evaluate("e=>e.scrollIntoView({block:'center',behavior:'instant'})")
        page.wait_for_function("document.querySelector('.ct-loading')?.hidden")
        page.locator('[data-setting="tier"]').select_option("mobile")
        page.locator(f'[data-pick="{hero}"]').evaluate("e=>e.click()")
        show(page, f"{section} [data-study-body]")
        retry = page.locator(f"{section} [data-open-study]")
        page.wait_for_function(
            """() => { const b = document.querySelector('[data-axon] [data-open-study]');
            return b?.checkVisibility() && b.textContent === 'Retry'; }"""
        )
        assert len(documents) == 2 and len(files) >= 2
        assert page.evaluate("Number(sessionStorage.getItem('sip-recovered-at'))>0")
        restored[0] = True
        retry.click()
        rendered(page, hero + "-mobile")
        assert len(documents) == 2 and not retry.is_visible()
        print("A failed scan prompted one self-heal reload. Retry then displayed the recovered file.", flush=True)
        fit = page.locator(section).evaluate("e=>e.axonInspector.stats().fitPath")
        assert fit == ("worker" if missing_bake else "baked"), fit
        return {"file": filename, "fitPath": fit, "documents": len(documents), "attempts": len(files),
                "restored": hero + "-mobile"}
    finally:
        ctx.close()

def compare_worker(browser, url, three, fonts):
    # Use the served application's own import map (including offline mirrors)
    # with a blank body. The UI and streamed selection are exercised by verify.
    base = url.rstrip("/") + "/"
    with urlopen(base) as response:
        data = response.read()
        if response.headers.get("Content-Encoding") == "gzip":
            data = gzip.decompress(data)
    marker = re.search(r'(<script type="importmap">)(.*?)(</script>)', data.decode(), re.S)
    assert marker and json.loads(marker[2])["imports"]["three"]
    html = marker[0]
    probe = (TOOLS / "check-axon-worker.js").read_text()
    rows = []
    for name in ("sippy", "roma"):
        for tier in ("mobile", "high"):
            ctx = fresh(browser, three, fonts)
            try:
                page = ctx.new_page()
                workers = []
                page.on("worker", lambda worker: workers.append(worker.url))
                page.route("**/__axon_parity.html", lambda route: route.fulfill(content_type="text/html", body=html))
                page.goto(base + "__axon_parity.html")
                row = page.evaluate(probe, {"name": name, "tier": tier, "base": base})
                assert len(workers) == 1 and row["previewParts"] == 170, row
                row["packSha256"] = {}
                for suffix in ("", "-sa"):
                    file = f"axon-{name}-{tier}{suffix}.glb"
                    response = ctx.request.get(base + "characters/assets/" + file)
                    assert response.ok
                    row["packSha256"][file] = hashlib.sha256(response.body()).hexdigest()
                rows.append(row)
                print(f"{name} {tier}: {row['vertices']:,} vertices compared, "
                      f"max drift {row['maxVertexIn']:.6f} in.", flush=True)
            finally:
                ctx.close()
    return {"workerGeometry": rows}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("url")
    parser.add_argument("--system-fonts", action="store_true")
    parser.add_argument("--report", type=Path)
    parser.add_argument("--worker-parity", action="store_true", help="compare the browser Worker with all four release GLB pairs")
    args = parser.parse_args()
    three = Path(os.environ["THREE_ROOT"]) if os.getenv("THREE_ROOT") else None
    with sync_playwright() as pw:
        browser = stage["launch"](pw)
        try:
            run = compare_worker if args.worker_parity else verify
            evidence = run(browser, args.url, three, args.system_fonts)
        finally:
            browser.close()
    if args.report:
        args.report.write_text(json.dumps(evidence, indent=2) + "\n")

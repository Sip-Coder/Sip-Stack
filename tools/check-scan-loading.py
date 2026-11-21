"""Check real browser scan demand and recover from one failed geometry response."""

import argparse
import json
import os
from pathlib import Path
import runpy
from urllib.parse import urlsplit

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
        paths = []
        page.on("request", lambda req: paths.append(urlsplit(req.url).path))
        load_floor(page, url)
        scan_requests = lambda: [p for p in paths if p.endswith(".glb")]
        decoder = lambda: [p for p in paths if "meshopt_decoder" in p or "GLTFLoader" in p]
        assert not scan_requests() and not decoder(), paths

        sheet["open_sheet"](page, "sippy", "mobile")
        page.wait_for_function(
            "document.querySelector('[data-panel=portrait]')?.dataset.status==='ready'"
        )
        assert not scan_requests() and not decoder(), paths

        page.locator('[data-pick="hummin"]').evaluate("e=>e.click()")
        show(page, f"{section} [data-study-body]")
        rendered(page, "hummin-mobile")
        assert not scan_requests() and not decoder(), paths
        assert not page.locator("[data-ghost]").is_visible()
        page.locator("[data-axon-hero]").select_option("roma")
        rendered(page, "roma-mobile")
        first_files = sorted([
            "/characters/assets/skeleton-female-mobile.glb",
            "/characters/assets/bp3d-muscles-mobile-meshopt.glb",
            "/characters/assets/vhf-muscles-mobile-meshopt.glb",
        ])
        assert sorted(scan_requests()) == first_files, scan_requests()
        parts = page.locator(section).evaluate("e=>e.axonInspector.inventory()")
        assert len([p for p in parts if p["layer"] == "muscles"]) == 339
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
        page.route("**/skeleton-male-mobile.glb", hold_scan)
        documents = []
        page.on("framenavigated", lambda frame: documents.append(frame.url) if frame == page.main_frame else None)
        with page.expect_request("**/skeleton-male-mobile.glb"):
            page.locator("[data-axon-hero]").select_option("sippy")
        page.wait_for_function("window.scanRequestHeld")
        assert len(held) == 1
        page.locator("[data-axon-hero]").select_option("hummin")
        rendered(page, "hummin-mobile")
        held[0].abort()
        page.wait_for_function("document.querySelector('[data-axon]').axonInspector.stats().ready")
        assert not documents and not page.evaluate("sessionStorage.getItem('sip-recovered-at')")
        print("A delayed human scan could be superseded by Hummin without a stale reload.", flush=True)
        assert sorted(scan_requests()) == sorted(first_files + ["/characters/assets/skeleton-male-mobile.glb"])
        demand = {"firstHuman": "roma-mobile", "requests": scan_requests(), "decoderModules": decoder(),
                  "superseded": "sippy-mobile", "final": "hummin-mobile"}
    finally:
        ctx.close()

    # An ordinary stale asset reloads through sip-recover. A second failure in
    # the same ten-minute window must surface the local Retry control. Serving
    # the file on the next attempt exercises both layers of recovery.
    recoveries = []
    for hero, filename in [
        ("sippy", "skeleton-male-mobile.glb"),
        ("sippy", "bp3d-muscles-mobile-meshopt.glb"),
        ("roma", "vhf-muscles-mobile-meshopt.glb"),
    ]:
        recoveries.append(recovery(browser, url, three, fonts, hero, filename))
    return {"scanDemand": demand, "recoveries": recoveries}


def recovery(browser, url, three, fonts, hero, filename):
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
        page.route("**/" + filename, fail_until_retry)
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
        return {"file": filename, "documents": len(documents), "attempts": len(files),
                "restored": hero + "-mobile"}
    finally:
        ctx.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("url")
    parser.add_argument("--system-fonts", action="store_true")
    parser.add_argument("--report", type=Path)
    args = parser.parse_args()
    three = Path(os.environ["THREE_ROOT"]) if os.getenv("THREE_ROOT") else None
    with sync_playwright() as pw:
        browser = stage["launch"](pw)
        try:
            evidence = verify(browser, args.url, three, args.system_fonts)
        finally:
            browser.close()
    if args.report:
        args.report.write_text(json.dumps(evidence, indent=2) + "\n")

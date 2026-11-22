"""Exercise lazy source scans, cancelled requests and asset recovery in Chromium."""

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
SECTION = "[data-axon]"
TARGET = SECTION + " [data-study-body]"
PICKER = SECTION + " [data-axon-hero]"
ASSETS = "/characters/assets/"


def asset_names(hero, tier):
    sex = "male" if hero == "sippy" else "female"
    names = [f"skeleton-{sex}-{tier}.glb"]
    packs = ["bp3d-muscles", "bp3d-missing-muscles", "zanatomy-lats-rectus"]
    names.extend(f"{name}-{tier}-meshopt.glb" for name in packs)
    if hero == "roma":
        names.append("vhf-muscles-source-meshopt.glb")
    return names


def show(page, selector=TARGET):
    page.locator(selector).evaluate("e=>e.scrollIntoView({block:'start',behavior:'instant'})")


def rendered(page, hero, tier):
    page.wait_for_function(
        """key=>{
            const study = document.querySelector('[data-axon]');
            return study?.dataset.ready === key && study.axonInspector?.stats().ready &&
                getComputedStyle(study.querySelector('[data-axon-canvas]')).visibility === 'visible';
        }""",
        arg=f"{hero}-{tier}",
    )
    return page.locator(SECTION).evaluate("e=>e.axonInspector.stats()")


def load_floor(page, url, tier="mobile"):
    page.goto(url.rstrip("/") + "/#heros", wait_until="commit")
    page.wait_for_function(
        "document.querySelector('.ct-loading')?.hidden && "
        "document.querySelector('.ct-stage canvas')?.style.visibility==='visible'"
    )
    page.locator('[data-setting="tier"]').select_option(tier)


def context(browser, three, fonts):
    return stage["browser_context"](
        browser, package=three, system_fonts=fonts, width=800, height=680
    )


def verify_demand(browser, url, three, fonts):
    ctx = context(browser, three, fonts)
    try:
        page = ctx.new_page()
        page.set_default_timeout(60000)
        paths, workers = [], []
        page.on("worker", lambda worker: workers.append(worker.url))
        page.on("request", lambda req: paths.append(urlsplit(req.url).path))

        def glbs():
            return [p[len(ASSETS):] for p in paths if p.startswith(ASSETS) and p.endswith(".glb")]

        def decode_modules():
            return [p for p in paths if "meshopt_decoder" in p or "GLTFLoader" in p]

        load_floor(page, url)
        assert not glbs() and not decode_modules() and not workers, paths
        sheet["open_sheet"](page, "sippy", "mobile")
        page.wait_for_function("document.querySelector('[data-panel=portrait]')?.dataset.status==='ready'")
        assert not glbs() and not decode_modules() and not workers, paths

        page.locator('[data-pick="hummin"]').evaluate("e=>e.click()")
        show(page)
        rendered(page, "hummin", "mobile")
        assert not glbs() and not decode_modules() and not workers, paths
        assert not page.locator("[data-ghost]").is_visible()

        page.locator(PICKER).select_option("roma")
        model = rendered(page, "roma", "mobile")
        first_files = asset_names("roma", "mobile")
        assert sorted(glbs()) == sorted(first_files), glbs()
        assert model["fitPath"] == "source geometry" and not model["partial"] and not workers, model
        parts = page.locator(SECTION).evaluate("e=>e.axonInspector.inventory()")
        assert {part["layer"] for part in parts} == {"skeleton", "muscles", "skin", "clothes"}
        assert sum("meshopt_decoder" in p for p in decode_modules()) == 1, decode_modules()
        page.evaluate("scrollTo({top:0,behavior:'instant'})")
        page.wait_for_function("!document.querySelector('[data-axon]').axonInspector.stats().visible")
        show(page)
        rendered(page, "roma", "mobile")
        assert sorted(glbs()) == sorted(first_files), glbs()

        held = []
        def hold_scan(route):
            held.append(route)
            page.evaluate("window.scanRequestHeld=true")

        checkpoint = len(glbs())
        pending = "skeleton-male-mobile.glb"
        page.route("**/" + pending, hold_scan)
        documents = []
        page.on("framenavigated", lambda frame: documents.append(frame.url) if frame == page.main_frame else None)
        with page.expect_request("**/" + pending):
            page.locator(PICKER).select_option("sippy")
        page.wait_for_function("window.scanRequestHeld")
        assert len(held) == 1
        assert page.locator(SECTION).evaluate("e=>e.dataset.ready") is None
        page.locator(PICKER).select_option("hummin")
        rendered(page, "hummin", "mobile")
        held[0].abort()
        attempted = glbs()[checkpoint:]
        assert pending in attempted and set(attempted) <= set(asset_names("sippy", "mobile")), glbs()
        assert len(attempted) == len(set(attempted)), attempted
        assert not documents and not page.evaluate("sessionStorage.getItem('sip-recovered-at')")
        print("Cold Heros, Character Ref and Hummin opened with zero scans or decoders. "
              "Reopening Roma reused its inventory; Hummin superseded a held Sippy request.", flush=True)
        return {
            "firstHuman": "roma-mobile",
            "originalRequests": first_files,
            "decoderModules": decode_modules(),
            "supersededRequests": attempted,
            "workers": workers,
            "final": "hummin-mobile",
        }
    finally:
        ctx.close()


def verify_recovery(browser, url, three, fonts, hero, filename):
    ctx = context(browser, three, fonts)
    try:
        page = ctx.new_page()
        page.set_default_timeout(60000)
        documents, failures, workers = [], [], []
        page.on("request", lambda req: documents.append(req.url) if req.resource_type == "document" else None)
        page.on("worker", lambda worker: workers.append(worker.url))
        restored = False

        def fail_until_retry(route):
            failures.append(route.request.url)
            if restored:
                route.continue_()
            else:
                route.fulfill(status=503, content_type="text/plain", body="Temporary asset outage")

        ctx.route("**/" + filename, fail_until_retry)
        load_floor(page, url)
        page.locator(f'[data-pick="{hero}"]').evaluate("e=>e.click()")
        with page.expect_navigation(wait_until="domcontentloaded"):
            show(page)
        page.locator(".ct-stage canvas").evaluate("e=>e.scrollIntoView({block:'center',behavior:'instant'})")
        page.wait_for_function("document.querySelector('.ct-loading')?.hidden")
        page.locator('[data-setting="tier"]').select_option("mobile")
        page.locator(f'[data-pick="{hero}"]').evaluate("e=>e.click()")
        show(page)
        retry = page.locator(SECTION + " [data-open-study]")
        page.wait_for_function(
            """() => { const button = document.querySelector('[data-axon] [data-open-study]');
            return button?.checkVisibility() && button.textContent === 'Retry'; }"""
        )
        assert len(documents) == 2 and len(failures) >= 2 and not workers
        assert page.evaluate("Number(sessionStorage.getItem('sip-recovered-at'))>0")
        restored = True
        retry.click()
        stats = rendered(page, hero, "mobile")
        assert stats["fitPath"] == "source geometry" and not stats["partial"] and not workers, stats
        assert len(documents) == 2 and not retry.is_visible()
        print(f"{filename}: one self-heal reload, then successful local Retry.", flush=True)
        return {"file": filename, "fitPath": stats["fitPath"], "documents": len(documents),
                "attempts": len(failures), "restored": hero + "-mobile"}
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
            evidence = {
                "scanDemand": verify_demand(browser, args.url, three, args.system_fonts),
                "recoveries": [
                    verify_recovery(browser, args.url, three, args.system_fonts, hero, filename)
                    for hero, filename in [
                        ("sippy", "skeleton-male-mobile.glb"),
                        ("roma", "zanatomy-lats-rectus-mobile-meshopt.glb"),
                    ]
                ],
            }
        finally:
            browser.close()
    if args.report:
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(json.dumps(evidence, indent=2) + "\n")

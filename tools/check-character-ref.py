"""Exercise the live Character Ref sheet with Chromium, and save its full responsive sheets.

Serve docs/ and pass its URL. --mesa, --system-fonts, CHROME and THREE_ROOT
use the same settings as check-characters.py. Optional --screenshots saves
lossless section images after every available panel has actually painted.
"""

import argparse
import json
import os
from pathlib import Path
import runpy

from playwright.sync_api import sync_playwright

stage = runpy.run_path(str(Path(__file__).with_name("check-characters.py")))
SECTION = "section[data-ref]"
PICKER = "[data-ref-hero]"
REFRESH = "[data-ref-refresh]"
PANEL = "figure[data-panel]"
HEROES = ("sippy", "roma", "hummin")


def stats(section):
    return section.evaluate("s => s.characterRef.stats()")


def wait_model(page, hero, tier):
    page.wait_for_function(
        """([hero,tier]) => {
      const s = document.querySelector('section[data-ref]');
      return s?.dataset.ready === hero + '-' + tier && s.characterRef?.stats().hero === hero &&
          s.characterRef.stats().tier === tier && s.characterRef.stats().active && !s.characterRef.stats().busy && s.querySelector('figure[data-panel]');
    }""",
        arg=[hero, tier],
    )
    return page.locator(SECTION)


def open_sheet(page, hero, tier):
    section = page.locator(SECTION)
    section.locator("[data-study-body]").evaluate(
        "e => e.scrollIntoView({block:'start',behavior:'instant'})"
    )
    return wait_model(page, hero, tier)


def select(page, hero, tier):
    page.locator(PICKER).select_option(hero)
    section = wait_model(page, hero, tier)
    assert page.locator(f'[data-pick="{hero}"]').get_attribute("aria-pressed") == "true"
    return section


def paint_all(page, section):
    # The full sheet extends beyond the viewport; its dormant panels must be
    # visited before exporting or inspecting the finished reference sheet.
    figures = section.locator(PANEL)
    count = figures.count()
    assert count >= 24, count
    revision = str(stats(section)["revalidations"])
    for i in range(count):
        item = figures.nth(i)
        state = item.get_attribute("data-status")
        if state == "missing" or (state == "ready" and item.get_attribute("data-validated") == revision):
            continue
        item.evaluate("f => f.scrollIntoView({block:'center', behavior:'instant'})")
        item.locator("canvas").wait_for(state="attached")
        page.wait_for_function(
            """([id,revision]) => {
          const el = Array.from(document.querySelectorAll('section[data-ref] figure[data-panel]'))
              .find(e => e.dataset.panel === id);
          return el && ((el.dataset.status === 'ready' && el.dataset.validated === revision) || el.dataset.status === 'error');
        }""",
            arg=[item.get_attribute("data-panel"), revision],
        )
        assert item.get_attribute("data-status") == "ready", item.inner_text()
    assert (
        section.locator(f'{PANEL}[data-status="ready"]').count()
        + section.locator(f'{PANEL}[data-status="missing"]').count()
        == count
    )


# Small sampling grid for coverage alongside the digest of every native pixel.
# A studio background alone may meet a brightness threshold while containing no hero.
PIXELS = """async s => {
  const records = {};
  for (const f of s.querySelectorAll('figure[data-panel]')) {
    const id = f.dataset.panel;
    const rec = records[id] = {status:f.dataset.status, label:f.textContent.trim()};
    if (rec.status !== 'ready') continue;
    const c = f.querySelector('canvas');
    const bytes = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
    rec.digest = Array.from(hash, v => v.toString(16).padStart(2,'0')).join('');
    const colours = new Set(); let lit = 0, foreground = 0, count = 0, top=c.height, bottom=0;
    const stride = Math.max(1, Math.floor(Math.min(c.width,c.height) / 64));
    for (let y=0; y<c.height; y+=stride) for (let x=0; x<c.width; x+=stride) {
      const i=(y*c.width+x)*4, r=bytes[i],g=bytes[i+1],b=bytes[i+2];
      if (r+g+b > 36 && bytes[i+3] > 16) lit++;
      if (Math.abs(r-bytes[0])+Math.abs(g-bytes[1])+Math.abs(b-bytes[2]) > 30) {
        foreground++;top=Math.min(y,top);bottom=Math.max(y,bottom);
      }
      colours.add((r>>3)*1024+(g>>3)*32+(b>>3));count++;
    }
    Object.assign(rec,{width:c.width,height:c.height,colours:colours.size,
        lit:lit/count,foreground:foreground/count,top:top/c.height,bottom:bottom/c.height});
  }
  return records;
}"""


def read_panels(section):
    records = section.evaluate(PIXELS)
    assert len(records) == section.locator(PANEL).count(), "Panel IDs must be unique"
    for key, record in records.items():
        assert record["label"], key
        if record["status"] == "missing":
            assert "not yet built" in record["label"].lower(), (key, record)
            continue
        assert record["status"] == "ready" and min(record["width"], record["height"]) >= 64, (key, record)
        assert (
            record["lit"] > 0.06
            and record["colours"] >= (2 if key == "mode-wireframe" else 8)
            and record["foreground"] > 0.005
        ), (key, record)
    return records


def fingerprint(records):
    return {key: panel.get("digest") for key, panel in records.items()}


def validate_content(section, records):
    assert section.locator("img, picture, video, object, embed, iframe").count() == 0
    art = section.evaluate("""s => [s,...s.querySelectorAll('*')].flatMap(e =>
        [getComputedStyle(e).backgroundImage, getComputedStyle(e,'::before').backgroundImage,
         getComputedStyle(e,'::after').backgroundImage]).filter(v => v.includes('url('))""")
    assert not art, art
    for label in ("Wireframe", "Solid", "Clay", "Topology"):
        assert any(label.lower() in rec["label"].lower() for rec in records.values()), label
    assert "tri" in section.inner_text().lower()
    assert section.locator(".ref-bio dt").all_text_contents() == ["Age", "Height", "Build", "Personality"]
    assert " ft " in section.locator(".ref-bio dd").nth(1).inner_text()
    assert section.locator(".ref-palette li").count() >= 4
    # Five different views of a single neutral standing pose must retain their
    # common floor line and scale. Every expression is an actual named pose.
    turns = [r for key, r in records.items() if key.startswith("turn-")]
    assert len(turns) == 5 and len({r["digest"] for r in turns}) == 5
    assert max(r["bottom"] for r in turns) - min(r["bottom"] for r in turns) < 0.065, turns
    assert max(r["top"] for r in turns) - min(r["top"] for r in turns) < 0.065, turns
    faces = [r for key, r in records.items() if key.startswith("face-")]
    assert len(faces) == 5 and len({r["digest"] for r in faces}) == 5
    assert records["face-front"]["digest"] != records["turn-front"]["digest"]
    emotions = {k: r for k, r in records.items() if k.startswith("expression-") and r["status"] == "ready"}
    assert len({r["digest"] for r in emotions.values()}) == len(emotions), list(emotions)

    # Different material passes and landmarks must produce genuinely different images.
    modes = [
        next(r for r in records.values() if label in r["label"].lower())
        for label in ("wireframe", "solid", "clay", "topology")
    ]
    assert len({r["digest"] for r in modes}) == 4
    assert section.locator(PANEL + '[data-status="missing"]').count() > 0


def press_refresh(page, section, hero, tier):
    before = stats(section)["revalidations"]
    button = section.locator(REFRESH)
    button.press("Enter")
    page.wait_for_function(
        """n => document.querySelector('section[data-ref]').characterRef.stats().revalidations > n""",
        arg=before,
    )
    wait_model(page, hero, tier)
    paint_all(page, section)


def save_sheet(section, path):
    from io import BytesIO
    from PIL import Image, ImageChops, ImageStat

    # Keep the site's sticky navigation at the actual top of the document.
    # An element screenshot scrolled to a tall sheet can pin it over the faces.
    page = section.page
    scroll = page.evaluate("window.scrollY")
    page.evaluate("window.scrollTo({top:0,behavior:'instant'})")
    rect = section.bounding_box()
    image = Image.open(BytesIO(page.screenshot(full_page=True, animations="disabled")))
    left, top = round(rect["x"]), round(rect["y"])
    width, height = round(rect["width"]), round(rect["height"])
    assert left >= 0 and top >= 0 and left + width <= image.width and top + height <= image.height
    assert height > 600
    # Compare each native thumbnail against its actual pixels within the page
    # screenshot. This catches overlays, unpainted canvases and wrong crops.
    samples = section.evaluate("""s => [...s.querySelectorAll('figure[data-status=ready] canvas')].map(c=>{
      const r=c.getBoundingClientRect(), k=document.createElement('canvas'); k.width=k.height=12;
      const ctx=k.getContext('2d');ctx.imageSmoothingQuality='high';ctx.drawImage(c,0,0,12,12);
      return [c.closest('figure').dataset.panel,[r.x,r.y,r.right,r.bottom],
          Array.from(ctx.getImageData(0,0,12,12).data)];})""")
    for key, box, pixels in samples:
        expected = Image.frombytes("RGBA", (12, 12), bytes(pixels)).convert("RGB")
        actual = (
            image.crop(tuple(round(x) for x in box))
            .convert("RGB")
            .resize((12, 12), Image.Resampling.LANCZOS)
        )
        error = ImageStat.Stat(ImageChops.difference(expected, actual)).mean
        assert max(error) < 12, (key, error)
    image.crop((left, top, left + width, top + height)).save(path)
    page.evaluate("y => scrollTo({top:y,behavior:'instant'})", scroll)


# Only the isolated test browser sees the conditional colour. Refresh must use
# the real constructor, just as a source edit to this named garment would.
def instrument_builder(route):
    response = route.fetch()
    source = response.text()
    marker = "return function animate(f) {"
    assert source.count(marker) == 1
    probe = """
      if (window.refTestHoodie) {
        const finishes = new Set();
        rig.root.traverse(obj => {
          for (const m of [obj.material].flat()) if (m?.userData?.blueprintId === 'hoodie') finishes.add(m);
        });
        for (const m of finishes) m.color.set('#17f243');
        window.refTestChangedMaterials = finishes.size;
      }
    """
    route.fulfill(response=response, body=source.replace(marker, probe + marker))


def check_context_recovery(page, section):
    # The sheet is showing photograph canvases while its one shared WebGL
    # context is deliberately lost. Their already presented pixels must survive.
    before = fingerprint(read_panels(section))
    original = stats(section)
    assert page.evaluate("""() => {
        const c=document.querySelector('.ct-stage canvas');
        const gl=c.getContext('webgl2');
        window.refLoss=gl.getExtension('WEBGL_lose_context');
        return new Promise(resolve=>{
          c.addEventListener('webglcontextlost',event=>{event.preventDefault();resolve(gl.isContextLost())},{once:true});
          refLoss.loseContext();
        });
    }""")
    assert fingerprint(read_panels(section)) == before
    page.evaluate("refLoss.restoreContext()")
    page.wait_for_function(
        """n => {const s=document.querySelector('[data-ref]').characterRef.stats();
        return s.active && s.revalidations > n && !s.busy;}""",
        arg=original["revalidations"],
    )
    paint_all(page, section)
    assert fingerprint(read_panels(section)) == before
    # Change the requested thumbnail size so a warm cache can't conceal a
    # broken restored GPU. A new real photo must be successfully presented.
    viewport = page.viewport_size
    page.set_viewport_size({"width": viewport["width"] - 45, "height": viewport["height"]})
    face = section.locator('[data-panel="face-front"]')
    face.evaluate("e => e.scrollIntoView({block:'center',behavior:'instant'})")
    page.wait_for_function(
        """n=>{const s=document.querySelector('[data-ref]').characterRef.stats();
        return s.renderer.renders>n && !s.busy;}""",
        arg=original["renderer"]["renders"],
    )
    assert face.locator("canvas").evaluate("c=>c.width>0 && c.height>0")
    print(
        "After driver loss every photo retained its pixels; the restored renderer made a fresh photo.",
        flush=True,
    )


def check_missing_module(browser, url, package, system_fonts):
    context = stage["browser_context"](
        browser, package=package, system_fonts=system_fonts, width=600, height=800
    )
    page = context.new_page()
    page.set_default_timeout(60000)
    faults = []
    documents = []
    page.on("request", lambda r: documents.append(r.url) if r.is_navigation_request() else None)

    def first_module(route):
        if route.request.resource_type == "script" and not faults:
            faults.append(route.request.url)
            route.fulfill(
                status=404, body="Simulated stale Character Ref chunk", content_type="text/javascript"
            )
        else:
            route.continue_()

    try:
        context.route("**/characters/ref-renderer.js*", first_module)
        stage["ready"](page, url)
        with page.expect_navigation(wait_until="domcontentloaded"):
            page.locator(SECTION + " [data-study-body]").evaluate("el=>el.scrollIntoView({block:'start'})")
        page.wait_for_function("document.querySelector('#character-test')?.characterTest")
        stage["call"](page, "setManual", True)
        page.locator('[data-setting="tier"]').select_option("mobile")
        # The previous scroll position is restored during this navigation.
        # As Axon View mounts above us its changing layout can move the sheet.
        # Keep the same real header in view until the new layout is stable.
        page.wait_for_function(
            """() => {
            const body=document.querySelector('[data-ref] [data-study-body]');
            if (!body) return false;
            body.scrollIntoView({block:'start',behavior:'instant'});
            const section=body.closest('[data-ref]');
            return section.dataset.ready==='sippy-mobile' && section.characterRef?.stats().active;
        }""",
            polling=150,
        )
        section = wait_model(page, "sippy", "mobile")
        first = section.locator('[data-panel="portrait"]')
        first.scroll_into_view_if_needed()
        page.wait_for_function("document.querySelector('[data-panel=portrait]')?.dataset.status==='ready'")
        assert len(faults) == 1 and len(documents) == 2, (faults, documents)
        assert page.evaluate(
            "Number(sessionStorage.getItem('sip-recovered-at'))>0 && location.hash==='#heros'"
        )
        assert section.locator("[data-ref-refresh]").is_enabled()
        print(
            "One stale Character Ref module caused one recovery reload and a successful live portrait.",
            flush=True,
        )
    finally:
        context.close()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("url")
    parser.add_argument("--system-fonts", action="store_true")
    parser.add_argument("--mesa", action="store_true")
    parser.add_argument("--screenshots", type=Path)
    parser.add_argument("--report", type=Path)
    args = parser.parse_args()
    if args.screenshots:
        args.screenshots.mkdir(exist_ok=True, parents=True)
    package = Path(os.environ["THREE_ROOT"]) if os.getenv("THREE_ROOT") else None
    report = {}
    with sync_playwright() as pw:
        browser = stage["launch"](pw, args.mesa)
        try:
            for tier in ("high", "mobile"):
                phone = tier == "mobile"
                context = stage["browser_context"](
                    browser,
                    package=package,
                    system_fonts=args.system_fonts,
                    width=390 if phone else 1180,
                    height=844 if phone else 830,
                    touch=phone,
                )
                errors = []
                try:
                    if not phone:
                        context.route("**/characters/sippy.js*", instrument_builder)
                    page = context.new_page()
                    page.on("pageerror", lambda error: errors.append(str(error)))
                    page.on("console", lambda msg: errors.append(msg.text) if msg.type == "error" else None)
                    page.set_default_timeout(60000)
                    stage["ready"](page, args.url)
                    stage["call"](page, "setManual", True)
                    page.locator("[data-setting=tier]").select_option(tier)
                    section = open_sheet(page, "sippy", tier)
                    assert section.evaluate(
                        "s => !!(document.querySelector('[data-axon]').compareDocumentPosition(s) & Node.DOCUMENT_POSITION_FOLLOWING)"
                    )
                    assert page.evaluate("matchMedia('(prefers-reduced-motion: reduce)').matches")
                    original = {}
                    for hero in HEROES:
                        select(page, hero, tier)
                        paint_all(page, section)
                        if args.screenshots:
                            save_sheet(section, args.screenshots / f"{hero}-{tier}.png")
                        records = read_panels(section)
                        validate_content(section, records)
                        original[hero] = fingerprint(records)
                        report[hero + "-" + tier] = records
                        print(
                            hero,
                            tier,
                            sum(bool(v) for v in original[hero].values()),
                            "live panels;",
                            sum(v is None for v in original[hero].values()),
                            "labeled missing",
                            flush=True,
                        )
                    # Select from the floor as well as the sheet. Restored canvases must
                    # agree with the independently captured originals for this character.
                    page.locator('[data-pick="sippy"]').click()
                    section = open_sheet(page, "sippy", tier)
                    assert section.locator(PICKER).input_value() == "sippy"
                    paint_all(page, section)
                    assert fingerprint(read_panels(section)) == original["sippy"]
                    prior = stats(section)
                    press_refresh(page, section, "sippy", tier)
                    assert stats(section)["submissions"] == prior["submissions"]
                    assert fingerprint(read_panels(section)) == original["sippy"]
                    print(
                        tier,
                        "unchanged keyboard refresh preserved every native pixel without drawing",
                        flush=True,
                    )
                    if not phone:
                        page.evaluate("window.refTestHoodie = true")
                        press_refresh(page, section, "sippy", tier)
                        assert page.evaluate("window.refTestChangedMaterials") > 0
                        changed = fingerprint(read_panels(section))
                        affected = [k for k, v in changed.items() if v != original["sippy"][k]]
                        reused = [k for k, v in changed.items() if v and v == original["sippy"][k]]
                        assert affected and reused, (affected, reused)
                        assert (
                            "mode-clay" in reused
                            and "mode-wireframe" in reused
                            and "mode-topology" in reused
                        )
                        original_revision = stats(section)["revalidations"]
                        page.evaluate("scrollTo({top:0,behavior:'instant'})")
                        page.wait_for_function(
                            "!document.querySelector('[data-ref]').characterRef.stats().active"
                        )
                        page.evaluate("window.refTestHoodie = false")
                        open_sheet(page, "sippy", tier)
                        page.wait_for_function(
                            "n=>document.querySelector('[data-ref]').characterRef.stats().revalidations>n",
                            arg=original_revision,
                        )
                        paint_all(page, section)
                        assert fingerprint(read_panels(section)) == original["sippy"]
                        print(
                            "Actual Refresh picked up the edited hoodie; scrolling away and back restored the original source. Changed panels",
                            affected,
                            "and preserved",
                            len(reused),
                            "finished panels.",
                            flush=True,
                        )
                    if phone:
                        check_context_recovery(page, section)
                    assert not errors, errors
                finally:
                    context.close()
            check_missing_module(browser, args.url, package, args.system_fonts)
        finally:
            browser.close()
    if args.report:
        args.report.write_text(json.dumps(report, indent=2) + "\n")


if __name__ == "__main__":
    main()

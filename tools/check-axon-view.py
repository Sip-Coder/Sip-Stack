"""Exercise Axon View in Chromium and optionally export its real part inventories.

Serve docs/ and supply the page URL. CHROME, THREE_ROOT, MERMAID_ROOT,
--system-fonts and --mesa have the same meanings as in check-characters.py.
"""
import argparse
import csv
import math
import os
from pathlib import Path
import runpy

from playwright.sync_api import sync_playwright

stage = runpy.run_path(str(Path(__file__).with_name("check-characters.py")))
HEROES = ("sippy", "roma", "hummin")
TIERS = ("mobile", "high")
LAYERS = ("skeleton", "muscles", "skin", "clothes")
SECTION = "[data-axon]"


def animation_frames(page):
    page.evaluate("() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))")


def settle(page):
    animation_frames(page)
    page.wait_for_function("""() => {
        const el = document.querySelector('[data-axon]');
        const stats = el?.axonInspector?.stats();
        const rect = el?.querySelector('[data-axon-canvas]')?.getBoundingClientRect();
        return !stats?.visible || !rect || rect.bottom <= 0 || rect.top >= innerHeight || stats.ready;
    }""")


def open_view(page, hero, tier):
    section = page.locator(SECTION)
    section.locator("[data-study-body]").scroll_into_view_if_needed()
    page.wait_for_function("""([hero, tier]) => {
      const el = document.querySelector('[data-axon]');
      const canvas = el?.querySelector('[data-axon-canvas]');
      return el?.dataset.ready === hero + '-' + tier && el.axonInspector?.inventory().length &&
             el.axonInspector.stats().ready &&
             canvas?.width > 0 && canvas?.height > 0;
    }""", arg=[hero, tier])
    settle(page)
    return section


def select_hero(page, name, tier):
    page.locator("[data-axon-hero]").select_option(name)
    section = open_view(page, name, tier)
    assert page.locator(f'[data-pick="{name}"]').get_attribute("aria-pressed") == "true"
    return section


def set_spread(page, value):
    slider = page.locator("[data-explode]")
    if value == 0 or value == 1:
        slider.press("End" if value else "Home")
    else:
        slider.click()
        steps = round((value - float(slider.input_value())) / .01)
        assert abs(steps) < 3, (value, slider.input_value())
        for _ in range(abs(steps)):
            slider.press("ArrowRight" if steps > 0 else "ArrowLeft")
    assert abs(float(slider.input_value()) - value) < .001
    settle(page)


def inventory(section, name, tier):
    # Both witnesses come from the open UI: the picker and the displayed model.
    parts = section.evaluate("el => el.axonInspector.inventory()")
    choices = section.locator("[data-part] option").evaluate_all(
        "opts => opts.filter(o => o.value !== '').map(o => [Number(o.value), o.textContent, o.parentElement.dataset.key])")
    assert sorted(choices) == [[i, part["name"], part["layer"]] for i, part in enumerate(parts)], (name, tier)
    assert set(r["layer"] for r in parts) == set(LAYERS)
    rows = []
    for index, part in enumerate(parts):
        dims = part["sizeInches"]
        triangles = part["triangles"]
        assert isinstance(triangles, int) and triangles > 0
        assert len(dims) == 3 and all(math.isfinite(n) and n >= 0 for n in dims) and max(dims) > 0
        assert part["name"].strip()
        rows.append((name, tier, index, part["name"], part["layer"], triangles, *dims))
    return rows


def write_inventory(directory, rows):
    directory.mkdir(parents=True, exist_ok=True)
    for hero in HEROES:
        with (directory / f"{hero}-parts.csv").open("w", newline="") as f:
            writer = csv.writer(f, lineterminator="\n")
            writer.writerow(("hero", "tier", "part_index", "part", "layer", "triangles",
                             "width_in", "height_in", "depth_in"))
            writer.writerows(row for row in rows if row[0] == hero)


def check_layer_controls(page, section):
    set_spread(page, 1)
    canvas = section.locator("[data-axon-canvas]")
    complete = stage["frame_digest"](canvas)
    for layer in LAYERS:
        row = section.locator(f'[data-layer="{layer}"]')
        group = section.locator(f'[data-part] optgroup[data-key="{layer}"]')
        check = row.locator("[data-show]")
        check.uncheck()
        settle(page)
        assert group.get_attribute("disabled") is not None
        assert stage["frame_digest"](canvas) != complete, layer
        check.check()
        isolate = row.locator("[data-isolate]")
        isolate.click()
        settle(page)
        assert isolate.get_attribute("aria-pressed") == "true"
        assert section.locator("[data-part] optgroup:disabled").count() == len(LAYERS) - 1
        assert stage["frame_digest"](canvas) != complete, layer
        isolate.click()
        opacity = row.locator("[data-opacity]")
        opacity.press("Home")
        settle(page)
        assert opacity.input_value() == "0" and group.get_attribute("disabled") is not None
        opacity.click()
        assert 0 < int(opacity.input_value()) < 100
        assert group.get_attribute("disabled") is None
        opacity.press("End")
        assert opacity.input_value() == "100"
    settle(page)
    assert stage["frame_digest"](canvas) == complete
    print("Each layer hid, isolated, faded and restored its rendered geometry.", flush=True)


def check_pick(page, section, *, touch=False):
    set_spread(page, 0)
    canvas = section.locator("[data-axon-canvas]")
    picker = section.locator("[data-part]")
    picker.select_option("")
    canvas.scroll_into_view_if_needed()
    settle(page)
    unselected = stage["frame_digest"](canvas)
    rect = canvas.bounding_box()
    for x, y in ((.5,.5), (.5,.37), (.5,.6), (.46,.45), (.54,.48), (.48,.3), (.55,.6)):
        px, py = rect["x"] + rect["width"]*x, rect["y"] + rect["height"]*y
        if touch:
            page.touchscreen.tap(px, py)
        else:
            page.mouse.click(px, py)
        if picker.input_value():
            break
    assert picker.input_value(), ("touch" if touch else "mouse", rect)
    index = int(picker.input_value())
    part = section.evaluate("el => el.axonInspector.inventory()")[index]
    measure = section.locator("[data-measure]")
    assert measure.locator("strong").inner_text() == part["name"]
    description = measure.inner_text()
    assert "triangles" in description and "in (W × H × D)" in description
    assert str(part["triangles"]) in description.replace(",", "")
    assert " × ".join(f"{n:.2f}" for n in part["sizeInches"]) in description
    settle(page)
    assert stage["frame_digest"](canvas) != unselected
    print("Touch" if touch else "Pointer", "picked", part["name"], flush=True)
    picker.select_option("")
    canvas.scroll_into_view_if_needed()
    settle(page)
    assert stage["frame_digest"](canvas) == unselected


def check_camera(page, section):
    canvas = section.locator("[data-axon-canvas]")
    canvas.press("Home")
    settle(page)
    start = stage["frame_digest"](canvas)
    canvas.press("ArrowRight")
    settle(page)
    orbited = stage["frame_digest"](canvas)
    assert orbited != start
    canvas.press("+")
    settle(page)
    assert stage["frame_digest"](canvas) != orbited
    canvas.press("Home")
    settle(page)
    assert stage["frame_digest"](canvas) == start
    print("Keyboard orbit, zoom and camera reset changed and restored the actual picture.", flush=True)
    assert page.evaluate("matchMedia('(prefers-reduced-motion: reduce)').matches")
    before = section.evaluate("s => s.axonInspector.stats().renders")
    page.wait_for_timeout(200)
    assert section.evaluate("s => s.axonInspector.stats().renders") == before
    assert stage["frame_digest"](canvas) == start
    print("The reduced-motion diagram remained still after input stopped.", flush=True)


def check_pinch(page, section):
    canvas = section.locator("[data-axon-canvas]")
    canvas.scroll_into_view_if_needed()
    settle(page)
    rect = canvas.bounding_box()
    x, y = rect["x"] + rect["width"] / 2, rect["y"] + rect["height"] / 2
    cdp = page.context.new_cdp_session(page)
    before = stage["frame_digest"](canvas)

    def fingers(radius):
        return [{"id": 1, "x": x-radius, "y": y}, {"id": 2, "x": x+radius, "y": y}]

    cdp.send("Input.dispatchTouchEvent", {"type": "touchStart", "touchPoints": fingers(20)})
    cdp.send("Input.dispatchTouchEvent", {"type": "touchMove", "touchPoints": fingers(50)})
    cdp.send("Input.dispatchTouchEvent", {"type": "touchEnd", "touchPoints": []})
    settle(page)
    assert stage["frame_digest"](canvas) != before
    section.get_by_role("button", name="Reset view").tap()
    settle(page)
    assert stage["frame_digest"](canvas) == before
    print("A two-finger pinch zoomed and touch reset restored the picture.", flush=True)


def check_context_restore(page, section):
    canvas = section.locator("[data-axon-canvas]")
    before = stage["frame_digest"](canvas)
    original = section.evaluate("s => s.axonInspector.stats()")
    assert page.evaluate("""() => {
      const floor = document.querySelector('.ct-stage canvas');
      const gl = floor.getContext('webgl2');
      window.axonLoss = gl.getExtension('WEBGL_lose_context');
      return new Promise(resolve => {
        floor.addEventListener('webglcontextlost', e => {
          e.preventDefault(); resolve(gl.isContextLost());
        }, {once:true});
        axonLoss.loseContext();
      });
    }""")
    assert stage["frame_digest"](canvas) == before
    page.evaluate("axonLoss.restoreContext()")
    page.wait_for_function("""prior => {
      const s = document.querySelector('[data-axon]').axonInspector.stats();
      return s.ready && s.warms > prior.warms && s.renders > prior.renders;
    }""", arg=original)
    assert stage["frame_digest"](canvas) == before
    print("Visible Axon View retained its pixels during context loss and rewarmed to the same image.", flush=True)


def check_gamepad(page, section, tier):
    page.evaluate("""() => {
      const pad = {connected:true,mapping:'standard',axes:[0,0,0,0],
        buttons:Array.from({length:16},()=>({pressed:false,value:0}))};
      Object.defineProperty(navigator,'getGamepads',{configurable:true,value:()=>[pad]});
      window.axonPad = pad;
      window.dispatchEvent(new Event('gamepadconnected'));
    }""")

    def press(index):
        page.evaluate("i => {axonPad.buttons[i].pressed=true; axonPad.buttons[i].value=1}", index)
        animation_frames(page)
        page.evaluate("i => {axonPad.buttons[i].pressed=false; axonPad.buttons[i].value=0}", index)
        settle(page)

    slider = section.locator("[data-explode]")
    slider.press("Home")
    press(15)
    assert 0 < float(slider.input_value()) < 1
    press(13)
    assert not slider.evaluate("e => e === document.activeElement")
    check = section.locator('[data-layer="skin"] [data-show]')
    check.focus()
    initial = check.is_checked()
    press(0)
    assert check.is_checked() != initial
    press(0)
    hero = section.locator("[data-axon-hero]").input_value()
    press(5)
    open_view(page, HEROES[(HEROES.index(hero)+1) % len(HEROES)], tier)
    press(4)
    open_view(page, hero, tier)
    canvas = section.locator("[data-axon-canvas]")
    canvas.focus()
    before = stage["frame_digest"](canvas)
    page.evaluate("axonPad.axes[2]=.8")
    animation_frames(page)
    page.evaluate("axonPad.axes[2]=0")
    settle(page)
    rotated = stage["frame_digest"](canvas)
    assert rotated != before
    press(7)
    assert stage["frame_digest"](canvas) != rotated
    page.evaluate("delete navigator.getGamepads; delete window.axonPad")
    print("Gamepad D-pad, activation, character bumpers, right stick and trigger zoom passed.", flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("url")
    parser.add_argument("--system-fonts", action="store_true")
    parser.add_argument("--mesa", action="store_true")
    parser.add_argument("--inventory", type=Path, help="write one CSV per character, with both detail tiers")
    args = parser.parse_args()
    package = Path(os.environ["THREE_ROOT"]).resolve() if os.getenv("THREE_ROOT") else None
    with sync_playwright() as pw:
        browser = stage["launch"](pw, args.mesa)
        try:
            context = stage["browser_context"](browser, package=package, system_fonts=args.system_fonts,
                                               width=1140, height=810)
            page = context.new_page()
            errors = []
            page.on("pageerror", lambda err: errors.append(str(err)))
            page.on("console", lambda msg: errors.append(msg.text) if msg.type == "error" else None)
            page.set_default_timeout(50000)
            stage["ready"](page, args.url)
            stage["call"](page, "setManual", True)
            rows = []
            for tier in TIERS:
                page.locator("[data-setting=tier]").select_option(tier)
                current = page.locator("[data-pick][aria-pressed=true]").get_attribute("data-pick")
                open_view(page, current, tier)
                for hero in HEROES:
                    section = select_hero(page, hero, tier)
                    values = inventory(section, hero, tier)
                    rows.extend(values)
                    for setting in (0, .5, 1):
                        set_spread(page, setting)
                    print(tier, hero, len(values), "selectable parts", flush=True)
            check_layer_controls(page, section)
            check_pick(page, section)
            check_camera(page, section)
            check_context_restore(page, section)
            check_gamepad(page, section, "high")
            # Drive the simulator picker as well, confirming the reverse direction of sync.
            page.locator('[data-pick="roma"]').click()
            assert open_view(page, "roma", "high").locator("[data-axon-hero]").input_value() == "roma"
            phone = stage["browser_context"](browser, package=package, system_fonts=args.system_fonts,
                                               width=390, height=844, touch=True)
            try:
                mobile = phone.new_page()
                mobile.on("pageerror", lambda err: errors.append(str(err)))
                mobile.set_default_timeout(50000)
                stage["ready"](mobile, args.url)
                mobile.locator('[data-setting=tier]').select_option("mobile")
                mobile_study = open_view(mobile, "sippy", "mobile")
                check_pick(mobile, mobile_study, touch=True)
                check_pinch(mobile, mobile_study)
            finally:
                phone.close()
            if args.inventory:
                write_inventory(args.inventory, rows)
            assert not errors, errors
            context.close()
        finally:
            browser.close()


if __name__ == "__main__":
    main()

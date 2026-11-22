"""Inspect the groom GLBs and exercise demand loading and self-heal in Chromium.

THREE_ROOT=/path/to/three-0.170.0 python tools/check-hair-loading.py --output /tmp/groom-checks.json
"""

import argparse
from collections import Counter
import gzip
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import struct
import subprocess
import sys
from urllib.parse import urlsplit

from playwright.sync_api import sync_playwright

sys.dont_write_bytecode = True
TOOLS = Path(__file__).resolve().parent
GROOM = "/characters/assets/hair/"
PACK = "EXT_meshopt_compression"


def load_tool(file):
    spec = importlib.util.spec_from_file_location(file.stem, file)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


bench = load_tool(TOOLS / "benchmark-heros.py")
characters = load_tool(TOOLS / "check-characters.py")


def groom_path(hero, tier):
    return GROOM + f"{hero}-{tier}.glb.gz"


def asset_stats(doc_root):
    rows = []
    for hero in ("sippy", "roma"):
        for tier in ("mobile", "high"):
            file = doc_root / groom_path(hero, tier).lstrip("/")
            wire = file.read_bytes()
            payload = gzip.decompress(wire)
            kind, version, size, json_size, json_type = struct.unpack_from("<4sIII4s", payload)
            assert (kind, version, size, json_type) == (b"glTF", 2, len(payload), b"JSON")
            glb = json.loads(payload[20:20 + json_size])
            assert PACK in glb["extensionsRequired"]
            assert any(PACK in view.get("extensions", {}) for view in glb["bufferViews"])
            assert not glb.get("images"), "The solid groom should have no texture download"
            assert all(m.get("alphaMode", "OPAQUE") == "OPAQUE" for m in glb["materials"])
            points = glb["accessors"]
            triangles, vertices, skinned = 0, 0, 0
            for mesh in glb["meshes"]:
                for primitive in mesh["primitives"]:
                    attr = primitive["attributes"]
                    assert {"POSITION", "NORMAL", "TEXCOORD_0", "TANGENT"} <= set(attr), mesh["name"]
                    assert primitive.get("mode", 4) == 4
                    count = points[primitive["indices"]]["count"]
                    assert count % 3 == 0
                    triangles += count // 3
                    vertices += points[attr["POSITION"]]["count"]
                    if "JOINTS_0" in attr:
                        assert "WEIGHTS_0" in attr
                        skinned += count // 3
            joints = {j for skin in glb["skins"] for j in skin["joints"]}
            assert 0 < skinned < triangles and 0 < len(joints) < 45, (file, skinned, len(joints))
            rows.append(dict(hero=hero, tier=tier, wireBytes=len(wire), glbBytes=len(payload), vertices=vertices,
                             triangles=triangles, skinnedTriangles=skinned, rigJoints=len(joints),
                             sha256=hashlib.sha256(wire).hexdigest()))
    return rows


PAINTED = """expected => {
  const canvas = document.querySelector('#character-test .ct-stage canvas');
  const picker = document.querySelector('[data-pick="'+expected+'"]');
  return document.body.dataset.mode === 'heros' && picker?.getAttribute('aria-pressed') === 'true'
      && document.querySelector('.ct-loading').hidden
      && canvas?.checkVisibility({visibilityProperty: true}) && characterChecks.painted(canvas);
}"""


def selected_only(browser, url):
    context = characters.browser_context(browser, width=420, touch=True)
    context.add_init_script(characters.PROBE)
    try:
        page = context.new_page()
        paths, failures = [], []
        page.on("request", lambda request: paths.append(urlsplit(request.url).path))
        page.on("pageerror", lambda error: failures.append(str(error)))
        page.goto(url + "/?review=heros#heros", wait_until="domcontentloaded")
        page.wait_for_function(PAINTED, arg="sippy")
        initial = Counter(p for p in paths if p.startswith(GROOM))
        assert initial == {groom_path("sippy", "mobile"): 1}, initial
        assert not any(p.endswith("/hair-motion.js") for p in paths), paths
        characters.call(page, "setManual", True)
        characters.call(page, "view", "front")
        characters.call(page, "render")
        canvas = page.locator("#character-test .ct-stage canvas")
        original = characters.frame_digest(canvas)
        held = []
        target = "**" + groom_path("roma", "mobile")
        page.route(target, lambda route: held.append(route))
        with page.expect_request(target):
            page.locator("[data-pick=roma]").click()
        page.locator(".ct-loading").wait_for(state="visible")
        assert "roma" not in characters.call(page, "snapshot")["built"]
        characters.call(page, "render")
        assert characters.frame_digest(canvas) == original
        characters.switch(page, "world")
        assert len(held) == 1
        held[0].continue_()
        page.unroute(target)
        assert page.locator("#world.active svg.scene").first.is_visible()
        assert not page.evaluate("sessionStorage.getItem('sip-recovered-at')")
        characters.switch(page, "heros")
        page.wait_for_function(PAINTED, arg="roma")
        assert characters.frame_digest(canvas) != original
        page.locator("[data-pick=hummin]").click()
        page.wait_for_function(PAINTED, arg="hummin")
        assets = Counter(p for p in paths if p.startswith(GROOM))
        assert assets == {groom_path("sippy", "mobile"): 1, groom_path("roma", "mobile"): 1}, assets
        assert len(page.evaluate("Array.from(characterChecks.contexts)")) == 1
        assert not failures, failures
        return dict(files=dict(assets), lateSelectionStayedHidden=True, keptPreviousFrame=True,
                    extraHumminFiles=0, liveContexts=1)
    finally:
        context.close()


def recover_once(browser, url, hero):
    context = characters.browser_context(browser, width=420, touch=True)
    context.add_init_script(characters.PROBE)
    context.add_init_script(f"sessionStorage.setItem('sip-heros-selected', '{hero}')")
    try:
        page = context.new_page()
        navigations, asset_requests = [], []
        page.on("request", lambda r: navigations.append(r.url) if r.is_navigation_request() else None)

        def fail_once(route):
            asset_requests.append(route.request.resource_type)
            if len(asset_requests) == 1:
                route.fulfill(status=404, body="Test missing hair asset")
            else:
                route.continue_()

        page.route("**" + groom_path(hero, "mobile"), fail_once)
        page.goto(url + "/#heros", wait_until="domcontentloaded")
        page.wait_for_function(
            f"hero => Number(sessionStorage.getItem('sip-recovered-at')) > 0 && ({PAINTED})(hero)",
            arg=hero, polling=100, timeout=30000,
        )
        assert len(navigations) == 2 and len(asset_requests) >= 2, (navigations, asset_requests)
        return dict(hero=hero, documents=len(navigations), assetRequestTypes=asset_requests,
                    paintedSelectedHero=True)
    finally:
        context.close()


MOTION_PROBE = """async hero => {
  const imports = JSON.parse(document.querySelector('script[type=importmap]').textContent).imports;
  const T = await import(imports.three);
  const stage = document.querySelector('#character-test');
  const t = stage.characterTest;
  const canvas = stage.querySelector('.ct-stage canvas');
  if (!await t.primeSecondary()) throw new Error('Secondary motion did not load');
  const bones = new Set();
  const original = T.Mesh.prototype.onAfterRender;
  T.Mesh.prototype.onAfterRender = function(renderer, scene, camera, ...args) {
    original.call(this, renderer, scene, camera, ...args);
    if (renderer.domElement !== canvas || !camera.isPerspectiveCamera ||
        !this.isSkinnedMesh || !this.userData.hairChain) return;
    if (hero === 'roma' && this.userData.hairRegion !== 'front') return;
    for (const bone of this.skeleton.bones.slice(1)) bones.add(bone);
  };
  try { t.render(); }
  finally { T.Mesh.prototype.onAfterRender = original; }
  if (!bones.size) throw new Error('Did not draw any selected hair chains');
  window.measureHairSweep = () => {
    t.reset();
    t.tick(40, {z: 1});
    const rotations = [...bones].map(bone => bone.quaternion.clone());
    let angle = 0;
    for (let i=0; i<32; i++) {
      t.tick(3, {z: 1});
      [...bones].forEach((bone, i) => { angle = Math.max(angle, bone.quaternion.angleTo(rotations[i])); });
    }
    return {bones: bones.size, maxAngularChangeDegrees: T.MathUtils.radToDeg(angle),
            speed: t.snapshot().speed, reduced: matchMedia('(prefers-reduced-motion: reduce)').matches};
  };
}"""


def reduced_motion(browser, url):
    context = characters.browser_context(browser, width=420, touch=True)
    context.add_init_script(characters.PROBE)
    try:
        page = context.new_page()
        characters.ready(page, url)
        characters.call(page, "setManual", True)
        rows = []
        for hero in ("sippy", "roma"):
            characters.call(page, "select", hero)
            characters.call(page, "view", "front")
            page.wait_for_function(PAINTED, arg=hero)
            page.emulate_media(reduced_motion="no-preference")
            page.evaluate(MOTION_PROBE, hero)
            active = page.evaluate("measureHairSweep()")
            page.emulate_media(reduced_motion="reduce")
            reduced = page.evaluate("measureHairSweep()")
            assert not active["reduced"] and reduced["reduced"]
            assert active["speed"] > 0.9 and reduced["speed"] > 0.9
            assert active["maxAngularChangeDegrees"] > 0.3, (hero, active)
            assert reduced["maxAngularChangeDegrees"] < 0.2, (hero, reduced)
            rows.append(dict(hero=hero, walking=active, reducedMotionWalking=reduced))
        return rows
    finally:
        context.close()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", type=Path, default=TOOLS.parent)
    parser.add_argument("--three", type=Path, default=os.getenv("THREE_ROOT"))
    parser.add_argument("--output", type=Path, required=True)
    a = parser.parse_args()
    if not a.three:
        parser.error("Provide --three or THREE_ROOT")
    repo = a.repo.resolve()
    revision = subprocess.check_output(
        ["git", "-C", str(repo), "rev-parse", "HEAD"], text=True,
    ).strip()
    report = {"revision": revision, "assets": asset_stats(repo / "docs")}
    server = bench.server(repo, a.three.resolve())
    url = f"http://127.0.0.1:{server.server_port}"
    try:
        with sync_playwright() as pw:
            browser = characters.launch(pw)
            try:
                report["demandLoading"] = selected_only(browser, url)
                report["recovery"] = [recover_once(browser, url, hero) for hero in ("sippy", "roma")]
                report["reducedMotion"] = reduced_motion(browser, url)
            finally:
                browser.close()
    finally:
        server.shutdown()
        server.server_close()
    a.output.parent.mkdir(parents=True, exist_ok=True)
    a.output.write_text(json.dumps(report, indent=2) + "\n")
    print(a.output)


if __name__ == "__main__":
    main()

"""Record the actual Heros stage at phone size and verify the resulting in-tab films.

Serve docs/, then run `python tools/record-characters.py URL`. THREE_ROOT,
MERMAID_ROOT, CHROME, --system-fonts and --mesa behave as in check-characters.py.
Each 20 fps exposure advances the real controller by three 60 Hz ticks. Film
playback speed is independent of how fast the recording computer rasterizes.
"""
import argparse
import base64
import json
import math
import os
from pathlib import Path
import runpy
import subprocess
import tempfile

from playwright.sync_api import sync_playwright


QA = runpy.run_path(str(Path(__file__).with_name("check-characters.py")))
HEROES = ("sippy", "roma", "hummin")
EMOTES = {"sippy": "Check wristwatch", "roma": "Guiding wave", "hummin": "Service bow"}
TOTAL = 240
FPS = 20

EXPOSURES = """async (host, {start, intents, emote, hero}) => {
  const t = host.characterTest, c = host.querySelector('canvas');
  const out = document.createElement('canvas');
  out.width = c.width & ~1; out.height = c.height & ~1;
  const paint = out.getContext('2d'), batch = [];
  for (const [i, input] of intents.entries()) {
    const n = start + i;
    if (n === 14) await t.view('follow');
    if (n === 164) await t.view('front');
    t.tick(3,input); t.render();
    const f = t.snapshot();
    const status = f.emote >= 0 ? emote : f.state[0].toUpperCase()+f.state.slice(1);
    const caption = hero + '   /   ' + status + '   ' + (f.speed * 3600 / 1609.344).toFixed(1) + ' mph';
    paint.drawImage(c,0,0,out.width,out.height);
    paint.save();
    const scale = out.width/402;
    paint.scale(scale,scale);
    paint.font='600 14px system-ui';
    paint.beginPath(); paint.roundRect(12,12,paint.measureText(caption).width+24,33,6);
    paint.fillStyle='rgba(29,48,44,.92)'; paint.fill();
    paint.fillStyle='#fff9ed'; paint.textBaseline='middle'; paint.fillText(caption,24,29);
    paint.restore();
    batch.push([f,out.toDataURL('image/jpeg',.95).split(',')[1]]);
  }
  return batch;
}"""


def intent(n):
    # Cross the clear diagonal of the floor. The stationary ramp stays outside
    # the final front-camera shot of each character's full-body emote.
    start_angle = math.radians(135)
    if 14 <= n < 48:
        return {"x": math.sin(start_angle), "z": math.cos(start_angle)}
    if 48 <= n < 118:
        angle = start_angle + min(2.2, max(0, (n - 57) / FPS)) * 1.55
        return {"x": math.sin(angle), "z": math.cos(angle), "run": True, "roll": n == 100}
    return {"jump": n == 135, "emote": n == 180}


def verify_file(path):
    streams = json.loads(subprocess.check_output(
        ["ffprobe", "-v", "error", "-show_streams", "-of", "json", str(path)]))["streams"]
    assert len(streams) == 1
    stream = streams[0]
    assert stream["codec_name"] == "h264" and stream["pix_fmt"] == "yuv420p", stream
    assert stream["height"] > stream["width"] >= 300, stream
    assert stream["avg_frame_rate"] == "20/1" and int(stream["nb_frames"]) == TOTAL, stream
    assert abs(float(stream["duration"]) - TOTAL / FPS) < .01, stream
    data = path.read_bytes()
    assert 0 <= data.find(b"moov") < data.find(b"mdat")
    # Decode every frame, including the captions, and reject near-total black.
    scan = subprocess.run(["ffmpeg", "-hide_banner", "-nostats", "-v", "info", "-i", str(path),
                           "-vf", "blackdetect=d=0.04:pix_th=0.04:pic_th=0.97", "-f", "null", "-"],
                          check=True, capture_output=True, text=True)
    assert "black_start:" not in scan.stderr
    return {key: stream[key] for key in ("width", "height", "duration", "nb_frames", "codec_name")}


def record(page, hero, destination, samples):
    call = QA["call"]
    call(page, "setManual", True)
    call(page, "tier", "mobile")
    call(page, "select", hero)
    assert page.locator(QA["HOST"]).evaluate("host => host.characterTest.primeSecondary?.() ?? true"), hero
    call(page, "reset")
    call(page, "view", "front")
    page.wait_for_function("""name => {
      const f=document.querySelector('#character-test').characterTest.snapshot();
      return f.visible && f.firstHeroPainted && f.built.includes(name);
    }""", arg=hero)
    host = page.locator(QA["HOST"])
    if samples:
        samples.mkdir(exist_ok=True, parents=True)
    frames = []
    with tempfile.TemporaryDirectory(dir=destination) as temp:
        path = Path(temp) / (hero + ".mp4")
        command = ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-framerate", str(FPS),
                   "-f", "image2pipe", "-vcodec", "mjpeg", "-i", "-", "-an",
                   "-vf", "scale=in_range=pc:out_range=tv:in_color_matrix=bt601:out_color_matrix=bt709",
                   "-color_range", "tv", "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709",
                   "-c:v", "libx264",
                   "-threads", "2", "-crf", "18", "-preset", "fast", "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(path)]
        with subprocess.Popen(command, stdin=subprocess.PIPE) as encoder:
            try:
                for start in range(0, TOTAL, 8):
                    group = host.evaluate(EXPOSURES, {"start":start, "intents":[intent(i) for i in range(start,start+8)],
                                                       "hero":hero.title(), "emote":EMOTES[hero]})
                    for offset, (stats, jpeg) in enumerate(group):
                        assert stats["tier"] == "mobile" and stats["visible"] and stats["name"] == hero, stats
                        frames.append(stats)
                        image = base64.b64decode(jpeg)
                        encoder.stdin.write(image)
                        if samples and start + offset in (5, 37, 63, 86, 106, 142, 192, 202, 213):
                            (samples / f"{hero}-{start + offset:03}.jpg").write_bytes(image)
                    if (start+8) % 40 == 0:
                        print(f"{hero}  {start+8}/{TOTAL}", flush=True)
            finally:
                encoder.stdin.close()
            assert encoder.wait() == 0
        states = {f["state"] for f in frames}
        assert {"idle", "walk", "run", "jump", "land", "roll"} <= states, states
        assert any(f["emote"] >= 0 for f in frames[180:]) and frames[-1]["emote"] < 0
        assert max(f["speed"] for f in frames) > 3.7 and max(f["y"] for f in frames) > .14
        turn = sum(abs(math.remainder(frames[i]["heading"] - frames[i-1]["heading"], math.tau)) for i in range(58,101))
        assert turn > 2, turn
        metadata = verify_file(path)
        os.replace(path, destination / path.name)
    print(hero, json.dumps({**metadata, "turnDegrees":round(math.degrees(turn)),
                            "states":sorted(states), "emote":EMOTES[hero]}), flush=True)


def playback(page, heroes):
    page.locator(".ct-review summary").click()
    for hero in heroes:
        video = page.locator(f'.ct-review video[src$="/{hero}.mp4"]')
        info = video.evaluate("""async v => {
          v.muted=true;
          const progress = new Promise((resolve,reject) => {
            const timeout=setTimeout(() => reject(Error('No decoded video frame')),30000);
            const check=() => { if(v.currentTime>0 && v.videoWidth>0){
              clearTimeout(timeout);v.removeEventListener('timeupdate',check);resolve();
            }};
            v.addEventListener('timeupdate',check);
          });
          await v.play(); await progress; v.pause();
          return [v.videoWidth,v.videoHeight,v.duration,v.currentTime];
        }""")
        assert info[1] > info[0] > 0 and info[2] == TOTAL/FPS and info[3] > 0, (hero, info)
        print(f"{hero} inline playback", info, flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("url")
    parser.add_argument("heroes", nargs="*", metavar="hero")
    parser.add_argument("--system-fonts", action="store_true")
    parser.add_argument("--mesa", action="store_true")
    parser.add_argument("--samples", type=Path, help="write representative native film frames for visual inspection")
    args = parser.parse_args()
    heroes = args.heroes or HEROES
    if any(hero not in HEROES for hero in heroes):
        parser.error("Choose sippy, roma, or hummin.")
    destination = Path(__file__).resolve().parents[1] / "docs/characters/review"
    package = Path(os.environ["THREE_ROOT"]).resolve() if os.getenv("THREE_ROOT") else None
    with sync_playwright() as pw:
        browser = QA["launch"](pw,args.mesa)
        try:
            context = QA["browser_context"](browser, package=package, system_fonts=args.system_fonts,
                                            width=420, height=1032, touch=True)
            page = context.new_page()
            page.set_default_timeout(120000)
            errors = []
            page.on("pageerror", lambda e: errors.append(str(e)))
            page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
            QA["ready"](page, args.url)
            for hero in heroes:
                record(page, hero, destination, args.samples)
            playback(page, heroes)
            assert not errors, errors
        finally:
            browser.close()


if __name__ == "__main__":
    main()

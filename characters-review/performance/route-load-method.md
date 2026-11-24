# Cold Village navigation

The benchmark measures transfer, the first visible scene frame and the first accepted input on `/#village`. It uses a 412 × 915 CSS viewport with DPR 2.6 and touch on Mobile, and 800 × 680 with DPR 1 on High. Both use reduced motion, Chromium SwiftShader and the production quality control. Each visit starts a fresh browser process with caches and service workers disabled.

The first populated frame follows a visible perspective draw of a named Village worker. Timing ends after a trusted ArrowRight key press changes the rendered camera position. The optional audit confirms the compiled ES modules, a populated worker mesh and the directional shadow-map resolution (512 on Mobile and 2048 on High).

The local HTTP/1.1 origin serves the pinned Three.js 0.170.0 package, gzip level 6 for HTML, CSS and scripts, and an empty substitute for Google Fonts. Chrome DevTools applies 9 Mbps download, 1.5 Mbps upload, 60 ms latency and 4× CPU slowdown. The transfer total counts encoded bytes through the first input response, including headers and bytes already received for incomplete responses. The JSON includes individual visits, request ledgers and hashes of served source files.

## Reproduce

Use Python Playwright, Chromium and an unpacked official `three@0.170.0` package. Run the same benchmark from the current checkout against both trees. For the Heros removal comparison, use a detached checkout of `heros-archive-2026-11-23` (`94deb9d`) as the baseline.

```sh
export THREE_ROOT=/path/to/three-0.170.0
python tools/benchmark-route-load.py --audit --repo /path/to/baseline --output /tmp/village-before.json
python tools/benchmark-route-load.py --audit --repo . --output /tmp/village-after.json
```

The earlier two-route study used desktop-sized viewports on both quality tiers. Its [baseline ledger](route-load-before.json) and [revised ledger](route-load-after.json) are retained with the [archived Village and Heros methodology](https://github.com/Sip-Coder/Sip-Stack/blob/heros-archive-2026-11-23/characters-review/performance/route-load-method.md).

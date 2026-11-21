# Cold Village and Heros navigation

The previous speed PR head was `0f46593`. The revised application is `092e67c`. Each cell is the median of five cold navigations. KB uses 1,000 bytes. The input column measures time to interactive by requiring the first keyboard input to change the rendered scene.

| Tier | Route | Revision | Transferred KB | HTTP requests | JS modules | First populated frame (s) | Time to interactive (s) |
|---|---|---|---:|---:|---:|---:|---:|
| Mobile | Village | Before | 547.4 | 58 | 52 | 6.55 | 9.92 |
| Mobile | Heros | Before | 445.0 | 32 | 25 | 6.77 | 7.73 |
| Mobile | Village | After | 501.6 | 57 | 51 | 5.75 | 9.74 |
| Mobile | Heros | After | 383.4 | 26 | 22 | 3.80 | 5.01 |
| High | Village | Before | 547.4 | 58 | 52 | 8.57 | 12.35 |
| High | Heros | Before | 445.0 | 32 | 25 | 6.70 | 8.10 |
| High | Village | After | 501.6 | 57 | 51 | 8.29 | 12.12 |
| High | Heros | After | 383.4 | 26 | 22 | 3.65 | 5.14 |

The shared navigation change also reduced Village's payload. The comparison checks Heros against Village on both revisions, using unrounded values. Each row includes all HTTP traffic started through the first input response, including the secondary-motion module requested by the movement key. Fresh Heros sessions start with Sippy. Reloading the same tab restores the last selected hero. [Baseline visits and resource ledgers](route-load-before.json) · [Revised visits and resource ledgers](route-load-after.json)

## Measurement

Each visit opens a new Chromium process and profile directly at `/#village` or `/#heros`. Both use the same 800 × 680 CSS viewport, device-pixel ratio of one, reduced motion, SwiftShader renderer and explicit production quality selection. The GPU shader disk cache and HTTP cache are disabled. Service workers are blocked to model a first visit with an empty installation. Five pairs run at each tier in alternating route order. The timer starts at document navigation.

**First populated frame** is the browser animation-frame callback after an actual perspective draw of a named worker in Village or Sippy, the selected actor in Heros. The canvas must be visible, in the viewport and clear of its loading indicator. A floor, poster or loading indicator cannot satisfy the check. This browser presentation boundary is a practical estimate of when a viewer can see the image.

**First input response** ends after a trusted key press moves that populated scene. The Chromium input driver sends ArrowRight to Village and W to Heros. A later draw must contain a changed world position for the Village camera or Sippy actor, respectively. Every sample retains the original and changed coordinates, input timestamp, selected quality, canvas dimensions and character names. The separate quality audit checks a real actor or worker mesh with at least 100 positions, the active directional shadow map and the browser's reduced-motion preference.

The Chrome DevTools Protocol applies Fast 4G at 9 Mbps down, 1.5 Mbps up, 60 ms latency and 4× CPU slowdown from before navigation through the response. Document, CSS, scripts and other HTTP responses share one local HTTP/1.1 origin for each experiment. The exact origin appears in each report. The server delivers HTML, CSS and JavaScript with deterministic gzip level 6 and mirrors the pinned Three.js 0.170.0 distribution locally. The external Google Fonts stylesheet uses an empty local substitute on both routes, so rendering uses installed fonts. Public DNS, TLS and font CDN latency are outside these measurements.

The response-byte total uses CDP's encoded transfer length through the input-response timestamp. It includes the document and response headers. For a response still downloading, it includes only the reported header and encoded body data received so far. Requests count HTTP requests started by that cutoff. JavaScript module count is the number of distinct fetched JavaScript module paths. The optional audit inspects Chromium's actual compiled module records *after* the timing boundary. It also verifies real tier-specific directional shadow-map resolution on the rendered scene.

## Reproduce

With Python Playwright, Chromium and the extracted official `three@0.170.0` package installed locally, run the same tools against both checkouts. The detached baseline is `0f46593`. Each check starts its own loopback server and writes the source-file hashes for the resources actually served.

```sh
THREE_ROOT=/path/to/three-0.170.0 python tools/benchmark-route-load.py --audit --repo /path/to/baseline --output /tmp/before.json
THREE_ROOT=/path/to/three-0.170.0 python tools/benchmark-route-load.py --audit --repo . --output /tmp/after.json
python tools/compare-route-load.py /tmp/before.json /tmp/after.json
```

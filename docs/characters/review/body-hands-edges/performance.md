# Mobile load and rendering checks

Tested main at `e8c6ed6` and the revision at `a34b006`. The final lining revision `9017de7` has its own replay rows. Mobile used a 412 × 915 CSS viewport with touch and a display DPR of 2.6. Chromium 155.0.8059.79 rendered through ANGLE SwiftShader. These are software-renderer measurements on the test host.

## Cold phone load

| Mobile route | Transferred KB | HTTP requests | JS modules | First drawn frame, s | First accepted input, s |
| --- | ---: | ---: | ---: | ---: | ---: |
| Main Heros | 459.7 | 34 | 29 | 3.37 | 4.77 |
| New Heros | 466.3 | 35 | 30 | 3.75 | 5.61 |
| Main Village | 516.5 | 62 | 56 | 4.98 | 8.29 |
| New Village | 516.5 | 62 | 56 | 5.03 | 8.18 |

Each row is the median of five visits from a fresh browser profile with the HTTP and shader caches disabled. Network conditions were 60 ms latency and 9 Mbps down, with 4× CPU throttling and reduced motion. The first-frame marker requires the full selected groom and native Sippy draw. Input timing stops on the first frame that actually moves the character or camera. Requests include the document and account for the complete compressed groom. ES module and 512-pixel shadow-map audits ran after each timed endpoint. [Main visits](cold-main.json) · [Candidate visits](cold-candidate.json)

The acceptance cutoff can precede the deferred secondary-motion modules. The most complete Heros Mobile visit transferred 466.3 KB across 35 requests and 30 modules and stayed below Village.

A separate pair of desktop High cold visits at 800 × 680 CSS px and DPR 1 measured 502.1 KB, 34 requests, and 29 JavaScript modules for Heros. Village measured 516.5 KB, 62 requests, and 56 modules. Adding the complete deferred motion responses observed on Mobile brings the High Heros estimate to 508.2 KB. The visits verified native geometry and render tier. [Desktop High smoke](high-candidate.json)


### Final cut review

The final lining revision `9017de7` repeated three audited Mobile Heros visits. Only `/characters/sippy-tailoring.js` changed in the matching served-file digests. The native draw still used the same backing size and active sample count. The median transfer was 466.3 KB over 35 requests and 30 JavaScript modules. The median first frame was 3.97 s and accepted input was 6.02 s. Its desktop High visit transferred 502.1 KB over 34 requests and 29 modules. [Final Mobile visits](final-mobile.json) · [Final High visit](final-high.json)

The final cut repeated floor restoration on both tiers, the rejected Mobile compile and missing-groom recovery for both heroes. [Final browser checks](guardrails.txt) · [Final recovery receipts](final-groom-checks.json)

The final smoke also covered the Sippy study views and one four-tab cycle per tier. The 53 visible frame samples had zero black frames or clears.

## Motion frame time

| Mobile route | Frame interval p50, ms | Frame interval p95, ms | Draw callback p50, ms | Draw callback p95, ms | Frames/s |
| --- | ---: | ---: | ---: | ---: | ---: |
| Main Heros | 83.40 | 146.64 | 2.30 | 7.50 | 11.2 |
| `a34b006` Heros | 250.00 | 449.94 | 2.35 | 3.75 | 4.0 |
| Final Heros | 266.70 | 466.60 | 2.60 | 4.45 | 3.8 |
| Village | 900.00 | 1886.64 | 7.60 | 12.93 | 0.8 |

Each cell is the median from three 30-frame samples at full CPU speed after assets and secondary motion were warm. Heros walks forward using W. Village orbits with ArrowRight. The probe timestamps consecutive requestAnimationFrame callbacks that submitted WebGL draws and measures the draw callback separately. Frame intervals include scheduling and software GPU backpressure. The Village motion samples use main. Its cold-route resources matched the tested revision byte-for-byte.

With the denser multisampled floor, the SwiftShader median submission interval increased from 83.4 ms to 266.7 ms. The median CPU draw callback went from 2.30 ms to 2.60 ms. Both figures remain below Village on this host. [Main samples](frame-main.json) · [Candidate samples](frame-candidate.json) · [Final samples](final-frame.json)

## Mobile pixel and edge budget

The measured Heros canvas is 382 × 522 CSS px. At DPR 1.5 the revision draws 573 × 783 px (448,659), up from 382 × 522 px on main. The canvas remains inside the existing 520,000-pixel Mobile cap. Mobile asks for 2-sample MSAA. This browser reported 4 active samples in the scene target. Main had zero.

On a second 388 × 521 CSS fixture a diagonal edge produced 920 partial-coverage pixels with the revision, compared with zero on main. The fixture produced the same coverage when the HDR multisampling support query was disabled and the scene used RGBA8. Both candidate configurations read `GL_NO_ERROR`. The beauty buffer resolves color for presentation.

## Flicker and recovery

- Ten four-tab cycles across both tiers sampled 278 visible frames with zero black frames or unintended default-framebuffer clears. The floor paused presentation offscreen and resumed draws after scrolling back.
- Forced context loss on Mobile and High repainted the floor and returned `GL_NO_ERROR`. Injecting a rejected `sip-warm` call preserved the render target and recovered the frame.
- While the active Axon was visible it retained its pixels through High context loss and rewarmed to the same image. Character Ref held the portrait across loss and re-rendered on Mobile. Both studies restored for Sippy and Roma without WebGL errors.
- One injected missing groom response per hero triggered a single `sip-recover` reload and repainted the selected hero. The active floor fetched only the selected groom. Its native hair draws stayed fully opaque and depth-writing on both tiers.

[Browser checks](guardrails.txt) · [Missing-asset and native asset checks](groom-checks.json)

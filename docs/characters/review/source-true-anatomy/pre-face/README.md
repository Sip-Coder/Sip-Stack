# Source anatomy before the face pass

These runs record the anatomy and wardrobe milestone at `2fc3102`, before the Sippy and Roma face builds. The timings use Chromium under the same 60 ms latency, 9 Mbps network and 4× CPU slowdown as the comparison runs on merged PR #24 at `80e1cdf`. The cold-route medians use five visits per route and tier. The Axon medians use three visits per hero and tier, and record actual canvas presentation.

| Hero | Tier | PR #24 complete Axon | Source anatomy preview | Source anatomy complete Axon |
|---|---|---:|---:|---:|
| Sippy | Mobile | 4.69 s | — | 5.57 s |
| Sippy | High | 6.34 s | — | 7.20 s |
| Roma | Mobile | 3.67 s | 4.60 s | 15.03 s |
| Roma | High | 5.10 s | 7.64 s | 18.35 s |

Roma’s preview paints the available anatomy as the inspector prepares the download of the original Andreassen lower-limb meshes. That original pack is 7,072,248 bytes on either tier. It takes at least 6.29 seconds at the lab’s configured 9 Mbps. The complete time includes the pack’s download, decode, upload and presentation. [PR #24 Axon visits](../first-open-before.json) · [Source anatomy Axon visits](first-open.json)

| Route | Tier | Transfer, decimal KB | HTTP requests | JS modules | First populated frame | First accepted input |
|---|---|---:|---:|---:|---:|---:|
| Heros | Mobile | 389.8 | 30 | 26 | 3.78 s | 4.92 s |
| Village | Mobile | 516.5 | 62 | 56 | 6.87 s | 10.95 s |
| Heros | High | 389.8 | 30 | 26 | 3.82 s | 5.66 s |
| Village | High | 516.5 | 62 | 56 | 9.10 s | 11.43 s |

Cold Heros beat Village on all five measured metrics at both tiers. The cold visits transfer zero anatomy GLBs or decoder modules. [PR #24 routes](../routes-before.json) · [Source anatomy routes](cold-routes.json)

Character Ref and Hummin opened without scan requests. A held Sippy scan was superseded by Hummin. Injected HTTP 503s of Sippy’s skeleton and Roma’s adapted Z-Anatomy file each caused one recovery reload followed by successful local Retry. All 135 Hummin parts per tier matched PR #24 by a digest of the part transforms, attributes, topology, materials and textures. [Lazy loading and recovery](loading-recovery.json) · [Hummin identity](hummin-identity.json)

Twenty World, Outline, Village and Heros cycles sampled 589 frames across Heros and Village, with zero black frames and zero Heros default-framebuffer clears. Both detail tiers recovered after simulated driver loss and rewarmed their shaders. An injected shader warm-up rejection restored a painted stage. [Tab cycles and recovery](guardrails.txt)

Axon presented 46 native images on the existing WebGL context. During 92 offscreen simulator draws, Axon made zero geometry draws, finishing passes or canvas copies. The 250 ms stall test recorded one geometry pass and one finishing pass for the next picture. [Native renderer measurements](native-render.json)

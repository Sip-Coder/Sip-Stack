# Wine Academy craft pass — comparison with 69ed5cf

The four `*-baseline-69ed5cf.png` captures load the original scene module from that commit through a local browser request override. The current screenshots use the revised module at the same 1440px viewport. Mobile proof is 390px wide.

Compared with 69ed5cf:

- Hat silhouettes are replaced with drawn faces and distinct hair: Sippy's dark crop, Roma's auburn curls, Hummin's bun and glasses. All figures produced by the shared SVG figure renderer are hat-free.
- Academy vessels use continuous highlights and shaded edges instead of hard material bands. World material shading remains unchanged.
- Stop 1 adds the weather station, pruning bundles, soil and water sample bench, and floor hose.
- Stop 5 adds sample jars and berry clusters; its graft dive adds cut scions, binding tape at the graft, and a nursery plant beside the soil profile.
- Stop 6 adds full picking bins, a sampling bench, glass and jar, and a loaded wheelbarrow.
- Stop 11 adds stone joints, a sample shelf, tasting stand, marked cask, bucket and hose. The cutaway gains iron hoops and a fill scale so ullage reads as a measured gap.

These props share the room's isometric coordinates, depth sorting, and cast-shadow system. Beat-specific dioramas and hotspot-driven reconstruction remain intact. No Academy props are inserted into World, Outline, or Village. Lesson wording and Learn / What changed / Why / So far are retained, as is Vine → Pick → Make → Cave → Bottle → Glass.

Validation: JavaScript syntax and whitespace checks; Chromium sweep of all 22 stops and every primary beat; all deep-dive beats at stops 5 and 11; desktop proof at stops 1, 5, 6, 11; graft and ullage at 390px with no horizontal page overflow; no browser JavaScript errors. World, Outline, and Village checked for absence of visible Academy boards.

Visual limit: small SVG labels are still compact at 390px; the adjacent teaching panels carry the full explanation. This pass increases scene density, rather than changing the lesson layout or replacing the existing illustration language.

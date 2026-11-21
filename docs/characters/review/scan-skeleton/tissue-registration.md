# Sippy and Roma muscle registration

The Node audit builds each neutral figure through the production Axon model builder, advances the same twelve fixed simulation steps, and checks the fitted, envelope-adjusted geometry. Across both tiers there are 598 distinct selectable part IDs on Sippy and 595 on Roma. Every index, position, bounding box and shading normal passed the finite-value and range checks. Every muscle resolves to the same named picker entry when changing tiers. [Reproducible audit](../../../../tools/check-muscle-registration.mjs)

| Neutral build | BodyParts3D muscles | Visible Human Female muscles | Fitted muscle vertices pinned to bone | Largest final vertex-to-bone gap |
|---|---:|---:|---:|---:|
| Sippy Mobile | 323 | 0 | 637 | 0.00000218 in |
| Sippy High | 323 | 0 | 640 | 0.00000192 in |
| Roma Mobile | 263 | 76 | 667 | 0.00000218 in |
| Roma High | 263 | 76 | 671 | 0.00000216 in |

The audit resolves every rendered muscle against its input mesh ID and the female-donor correspondence table. For each declared cortical attachment it then measures the distance from the final rendered muscle vertex to the closest triangle on the named, fitted CT bone. The gap measures contact with the bone surface. Its numerical precision does not establish clinical accuracy of the chosen attachment landmark. [Donor mapping](female-muscle-mapping.json)

## Which side of the body carries each muscle?

For each left and right muscle, the audit calculates a triangle-area-weighted center of the actual rendered surface. It measures from that point to the nearest triangle of the corresponding CT bone on each side. Ranges span both sides and both tiers. All 24 checks show the expected sign of the center’s horizontal position and the intended bone as the nearer side.

| Character and tissue | Expected bone | Same-side distance | Opposite-side distance |
|---|---|---:|---:|
| Sippy supraspinatus | Scapula | 0.08–0.23 in | 8.26–8.36 in |
| Roma supraspinatus | Scapula | 0.00–0.06 in | 7.24–7.43 in |
| Sippy gluteus medius | Hip bone | 0.13–0.25 in | 4.65–4.88 in |
| Roma gluteus medius | Hip bone | 0.01–0.33 in | 5.22–5.31 in |
| Sippy adductor magnus | Femur | 1.14–1.33 in | 5.56–5.81 in |
| Roma adductor magnus | Femur | 1.13–1.30 in | 6.36–6.80 in |

On both tiers, 242 Sippy and 258 Roma muscles have at least two explicit cortical attachments, and 28 on each have one. An additional 53 on each follow their registered tissue region, including eye and soft-tissue structures. Shading normals on all muscle vertices incident to a nondegenerate face have nonzero length. A neutral contact test covers the declared anchors. The animated pose tests separately exercise containment through motion.

A separate check counts distinct positions among each muscle’s original vertices after fitting, rounded to 0.00004 inches. The smallest retained fractions were 81.5% and 69.1% on Sippy Mobile and High, and 88.4% and 78.7% on Roma. The minima occur in the thin innermost intercostal groups. Envelope fitting can move several source points onto the same region of the stylized chest. Sippy High’s left vocalis kept 29 of 29 distinct positions and his left digastric kept 35 of 35 in the corrected neck.

The supplied BodyParts3D subset omits major superficial groups, including named deltoid, pectoralis major, rectus abdominis, latissimus dorsi and trapezius elements. The 76 female lower-limb surfaces give Roma the quadriceps, gastrocnemius and biceps femoris heads missing from the supplied subset. The original stylized skin limits how much of an adult reference muscle’s volume fits each character. [Atlas source and scope](../../assets/MUSCLE-SKIN-LICENSE.md)

Run `THREE_ROOT=/path/to/three node tools/check-muscle-registration.mjs` with Node 24 and the unpacked Three.js 0.170.0 npm package. The JSON output includes per-side distances, every surface-check failure and the number of muscle normals on nondegenerate faces that are zero.

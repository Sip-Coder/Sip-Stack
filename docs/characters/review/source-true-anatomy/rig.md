# The source-derived rig

Sippy and Roma use the same pose controls and joint names with separate measured donor proportions. The rest pivots originate in the intact surfaces of the two canonical High BoneHub skeletons. Mobile uses the same pivots and character scale. The measured record preserves both sides independently, the left and right clavicle endpoints, every vertebral center, and the skull, pelvis and rib cage extents. The female scan includes a sixth lumbar vertebra. [Extraction script](../../../../tools/measure-source-rig.mjs) · [Landmark record](../../source-landmarks.js)

The shoulder and hip centers come from sphere regressions on the proximal articular surfaces. The knee and ankle use both sides of the joint. The wrist uses the lunate and scaphoid. The original CT scans have missing elbow slices, so the elbow center is an estimate constrained to the approaches of the two preserved shafts. The lower back pivot is between T12 and L1. The head turns about the atlanto-occipital joint near the superior atlas surface.

The arms rotate into a relaxed, hands-down bind pose. Each leg rotates as a rigid chain at the hip to set a standing stance. Each foot is rotated at the ankle so both heels and toes face the floor. Target heights are measured from the lowest posed foot point to the skull crown. Each original bone follows its joint’s rotation at this same scale. In motion, the anatomical limits of independently sourced parts can leave gaps at the joints.

All measurements below describe the skeletons in inches at the chosen staging height. Arm, forearm, thigh and shank lengths are measured pivot to pivot. The clavicle span for each side is measured between the two ends of that clavicle.

| Measurement | Sippy | Roma |
|---|---:|---:|
| Standing skeleton height | 70.08 | 66.14 |
| Shoulder height, left / right | 58.75 / 58.20 | 55.60 / 55.11 |
| Shoulder joint span | 14.05 | 13.09 |
| Clavicle span, left / right | 5.99 / 5.68 | 5.15 / 5.12 |
| Pelvis width | 10.74 | 11.86 |
| Thorax width × height × depth | 11.36 × 15.14 × 8.48 | 10.90 × 14.62 × 6.56 |
| Upper arm, left / right | 11.42 / 11.72 | 10.59 / 10.52 |
| Forearm, left / right | 10.69 / 10.98 | 9.42 / 9.35 |
| Thigh, left / right | 17.69 / 17.77 | 15.59 / 15.73 |
| Shank, left / right | 15.33 / 15.34 | 13.32 / 13.51 |

The source-to-view scales were 0.98684021 for Sippy and 1.01587548 for Roma. The rig checker verifies every pivot lands on its corresponding reference center and each transform uses the same scale. It repeats length and transform checks over 317 controller frames per hero covering idle, walk, run, jump, land and roll. [Rig verification](../../../../tools/check-source-rig.mjs)

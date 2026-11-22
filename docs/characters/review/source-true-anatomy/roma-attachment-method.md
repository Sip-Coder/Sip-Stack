# Roma’s anatomical registration references

Roma’s calibrated body uses measured bone geometry from the Visible Human Female. The earlier Round 4 requirement for unmodified source meshes still applies to her skeleton and same-donor female sources. Her adapted BodyParts3D and Z-Anatomy meshes use the male sources as anatomical templates. [Rig measurements](rig.md)

## Explicit cortical registration

The donor hints below live in the unadapted BodyParts3D and Z-Anatomy coordinate system. They identify vertices on each named donor muscle and a target bone on the Visible Human Female. The left and right sites are projected independently onto their own cortical triangles. This keeps the CT surfaces available as a separate reference layer. [Donor coordinate and bone map](../../../../tools/roma-attachment-anchors.mjs)

| Muscle family | Bony references |
|---|---|
| Deltoid, all three heads | Lateral clavicle, acromion and scapular spine origins, and humeral deltoid tuberosity |
| Pectoralis major, all three heads | Medial clavicle, sternum and anterior costal roots, and proximal humeral insertion |
| Trapezius, all three parts | Occiput, cervical and thoracic spines, lateral clavicle and scapular spine |
| Biceps, brachialis and triceps | Supraglenoid region, coracoid or humeral shaft, with proximal radial or ulnar insertions |
| Latissimus dorsi and rectus abdominis | Thoracolumbar spine, posterior iliac crest and humerus for the latissimus. Pubic and costal/xiphoid sites for the rectus. |
| Rotator cuff and teres major | Scapular fossae, borders and inferior angle, plus proximal humeral tubercle surfaces |
| Serratus, rhomboids and pectoralis minor | Ribs or upper trunk spines, with scapular border or coracoid sites |
| Forearm pronators, supinator and long flexors/extensors | Distal humerus and the preserved radius and ulna surfaces |
| Hip and lumbar transition | Iliac crest, sacrum, lumbar vertebrae or femoral landmarks where that template is used |

Some atlas surfaces end in a shared tendon or on fascia. The abdominal pectoral slip originates on an aponeurosis, so its nearest costal reference acts as a registration witness. The missing CT elbow slices also mean that a preserved nearby surface may stand in for an absent cortical landmark. The registration coordinates are mesh-based estimates.

## Population measurements and modeling choices

- A whole-body MRI study of 468 adults found a larger sex difference in upper-body muscle mass than in lower-body muscle mass. Imaging and biopsy measurements in a smaller study reported female biceps cross-sectional area around 55% of the comparison group’s. These studies inform the relative upper-body reduction and softer biceps on Roma. The individual changes depend on her bone attachments and the mesh volume measurements. [Janssen et al.](https://pubmed.ncbi.nlm.nih.gov/10904038/) · [Miller et al.](https://pubmed.ncbi.nlm.nih.gov/8477683/)
- A same-height study of young adults reported narrower shoulders, shallower chests and wider hips in women on average. Roma’s shoulder span, pelvis and left/right knee alignment come from her CT skeleton. An approximate 0.70 waist-to-hip ratio is the character-design target. [Tatarczuk et al.](https://pubmed.ncbi.nlm.nih.gov/31939992/) · [Measured skeletal dimensions](rig.md)
- Breast fat and fibroglandular tissue lie superficial to the pectoral fascia. Clinical literature distinguishes subcutaneous abdominal, gluteal and femoral depots, and MRI documents substantial variation in those thicknesses. This provides the anatomical basis for modeling fat and skin separately from muscle. [Breast anatomy](https://www.ncbi.nlm.nih.gov/books/NBK519575/) · [Superficial fascia and breast tissue](https://pmc.ncbi.nlm.nih.gov/articles/PMC7905468/) · [Regional adipose tissue distribution](https://pmc.ncbi.nlm.nih.gov/articles/PMC6795075/) · [Gluteal MRI measurements](https://pubmed.ncbi.nlm.nih.gov/35181990/)

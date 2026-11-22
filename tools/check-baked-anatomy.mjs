// Compare the delivered inspection GLBs with the offline fit and the previous PR.
// THREE_ROOT=/path/to/three node tools/check-baked-anatomy.mjs /path/to/1eab056 [name tier]
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { registerHooks } from 'node:module';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

if (process.env.THREE_ROOT)
  registerHooks({
    resolve(id, context, next) {
      const file =
        id === 'three'
          ? 'build/three.module.js'
          : id.startsWith('three/addons/')
            ? 'examples/jsm/' + id.slice(13)
            : null;
      return file
        ? { url: pathToFileURL(resolve(process.env.THREE_ROOT, file)).href, shortCircuit: true }
        : next(id, context);
    },
  });
const { Vector3, REVISION } = await import('three');
assert.equal(REVISION, '170');
const { raster, depthViews, coverage } = await import('./axon-depth.mjs');
const { buildDiagramModel } = await import('../docs/characters/diagram-fit-model.js');
const { decodeAxonPack } = await import('../docs/characters/diagram-baked-pack.js');
const { names, heights } = await import('../docs/characters/ui.js');
const [baseline, nameFilter, tierFilter] = process.argv.slice(2);
assert.ok(baseline, 'Pass the checkout of main at 1eab056 as the first argument.');
const { buildDiagramModel: buildPrevious } = await import(
  pathToFileURL(resolve(baseline, 'docs/characters/diagram-parts.js'))
);
const surface =
  /^(left|right)_(deltoid_|pectoralis_major_|trapezius_|biceps_brachii_|rectus_femoris|vastus_|gastrocnemius_|latissimus_dorsi|rectus_abdominis)/;
const rectified = (n, digits) => +n.toFixed(digits);
for (const name of nameFilter ? [nameFilter] : ['sippy', 'roma']) {
  for (const tier of tierFilter ? [tierFilter] : ['mobile', 'high']) {
    const height = heights[names.indexOf(name)];
    const previous = await buildPrevious(name, tier);
    const fitted = await buildDiagramModel(name, tier);
    const issues = [],
      packs = [],
      materials = new Map();
    for (const sa of [false, true]) {
      const url = new URL(
        '../docs/characters/assets/axon-' + name + '-' + tier + (sa ? '-sa' : '') + '.glb',
        import.meta.url,
      );
      const bytes = await readFile(url);
      packs.push(
        await decodeAxonPack(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), {
          name,
          tier,
          license: sa ? 'CC BY-SA 4.0' : 'CC BY 4.0',
          materials,
        }),
      );
    }
    const parts = packs.flatMap((pack) => pack.parts).sort((a, b) => a.order - b.order);
    assert.deepEqual(
      parts.map((p) => p.id),
      fitted.parts.map((p) => p.id),
    );
    const anatomy = (ps) => ps.filter((p) => p.layer === 'skeleton' || p.layer === 'muscles');
    const before = anatomy(previous.parts),
      after = anatomy(parts),
      raw = anatomy(fitted.parts);
    const newMuscles = after.filter((p) => surface.test(p.muscleNode));
    assert.equal(newMuscles.length, 38);
    assert.deepEqual(packs[1].parts.map((p) => p.muscleNode).sort(), [
      'left_latissimus_dorsi',
      'left_rectus_abdominis',
      'right_latissimus_dorsi',
      'right_rectus_abdominis',
    ]);
    let maxVertex = 0,
      maxSite = 0,
      minNormalDot = 1,
      maxColor = 0,
      maxUV = 0,
      triangles = 0;
    let corticalSites = 0;
    const lhs = new Vector3(),
      rhs = new Vector3(),
      n1 = new Vector3(),
      n2 = new Vector3();
    for (const [i, p] of after.entries()) {
      const original = raw[i],
        a = p.mesh.geometry,
        b = original.mesh.geometry;
      for (const key of ['id', 'layer', 'muscleNode', 'scanNode', 'source', 'sourcePart'])
        assert.equal(p[key], original[key], p.id + '/' + key);
      assert.equal(a.index.count, b.index.count, p.id);
      assert.equal(a.attributes.position.count, b.attributes.position.count, p.id);
      triangles += a.index.count / 3;
      for (let k = 0; k < a.attributes.position.count; k++) {
        maxVertex = Math.max(
          maxVertex,
          lhs
            .fromBufferAttribute(a.attributes.position, k)
            .distanceTo(rhs.fromBufferAttribute(b.attributes.position, k)) / 0.0254,
        );
        n1.fromBufferAttribute(a.attributes.normal, k);
        n2.fromBufferAttribute(b.attributes.normal, k);
        if (n2.lengthSq() > 0.05) minNormalDot = Math.min(minNormalDot, n1.normalize().dot(n2.normalize()));
        if (p.muscleNode) {
          const u = a.attributes.uv,
            v = b.attributes.uv;
          maxUV = Math.max(maxUV, Math.abs(u.getX(k) - v.getX(k)), Math.abs(u.getY(k) - v.getY(k)));
          maxColor = Math.max(
            maxColor,
            lhs
              .fromBufferAttribute(a.attributes.color, k)
              .sub(rhs.fromBufferAttribute(b.attributes.color, k))
              .length(),
          );
        }
      }
      if (p.muscleNode) {
        // Cortical targets have already been independently verified against actual triangles.
        // Compare the serialized attachment vertex in the shipped GLB with its fitted endpoint.
        for (const anchor of original.attachments) {
          maxSite = Math.max(
            maxSite,
            lhs.fromBufferAttribute(a.attributes.position, anchor.index).distanceTo(anchor.target) / 0.0254,
          );
          corticalSites++;
        }
        assert.equal(p.mesh.material.roughness, 0.3);
        assert.ok(p.mesh.material.vertexColors);
      }
    }
    const centre = new Vector3(0, height * 0.5, 0),
      fixture = 448,
      scale = fixture / (height * 1.09);
    const views = [],
      newToView = new Set();
    const round3Added = new Set(
      newMuscles.filter((p) => !before.some((b) => b.id === p.id)).map((p) => p.id),
    );
    for (const [yaw, pitch] of depthViews) {
      const old = raster(before, centre, scale, fixture, yaw, pitch);
      const next = raster(after, centre, scale, fixture, yaw, pitch);
      const source = raster(raw, centre, scale, fixture, yaw, pitch);
      const superficialPixels = {};
      let union = 0,
        intersection = 0,
        fromBone = 0,
        fromAir = 0,
        added = 0,
        oldBone = 0;
      for (let j = 0; j < next.winners.length; j++) {
        const oldPart = before[old.winners[j]],
          part = after[next.winners[j]];
        if (oldPart?.layer === 'skeleton') oldBone++;
        if (part && source.winners[j] >= 0) intersection++;
        if (part || source.winners[j] >= 0) union++;
        const group = part?.muscleNode?.match(surface)?.[2];
        if (group) {
          const family = /^(rectus_femoris|vastus_)/.test(group) ? 'quadriceps' : group.replace(/_$/, '');
          superficialPixels[family] = (superficialPixels[family] || 0) + 1;
        }
        if (part && round3Added.has(part.id)) {
          newToView.add(part.id);
          added++;
          if (oldPart?.layer === 'skeleton') fromBone++;
          if (!oldPart) fromAir++;
        }
      }
      views.push({
        beforeExposedBonePx: oldBone,
        newSurfacePx: added,
        formerlyBonePx: fromBone,
        formerlyEmptyPx: fromAir,
        superficialPixels,
        rawBakedSilhouetteIoU: rectified(intersection / union, 6),
      });
    }
    const skin = coverage(parts, height);
    if (skin.exposed) issues.push('Baked interior escaped skin: ' + JSON.stringify(skin.parts));
    if (maxVertex > 0.004 || maxSite > 0.01 || minNormalDot < 0.99 || maxUV > 0.002 || maxColor > 0.01)
      issues.push('Anatomical surface or attribute drift');
    if (views.some((v) => v.rawBakedSilhouetteIoU < 0.995 || !v.formerlyBonePx))
      issues.push('Shipped anatomy lost silhouette or provided no counterfactual coverage');
    console.log(
      JSON.stringify({
        name,
        tier,
        interiorTriangles: triangles,
        corticalSites,
        maxVertexDriftIn: rectified(maxVertex, 6),
        maxCorticalSiteDriftIn: rectified(maxSite, 6),
        minNormalCosine: rectified(minNormalDot, 6),
        maxColorDistance: rectified(maxColor, 6),
        maxUVDifference: rectified(maxUV, 6),
        distinctNewSurfacesVisible: newToView.size,
        addedParts: round3Added.size,
        skin,
        views,
        issues,
      }),
    );
    if (issues.length) process.exitCode = 1;
    for (const model of [previous, fitted, ...packs]) model.dispose();
  }
}

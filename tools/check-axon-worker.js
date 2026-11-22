async ({ name, tier, base }) => {
    const { buildDiagramModel } = await import(base + 'characters/diagram-parts.js');
    const { fitInWorker } = await import(base + 'characters/diagram-worker-client.js');
    const baked = await buildDiagramModel(name, tier);
    if (baked.fitPath !== 'baked') throw Error('Expected baked files');
    let previewParts = 0;
    const worker = await fitInWorker(name, tier, undefined, (skeleton) => {
        previewParts = skeleton.parts.length;
        skeleton.dispose();
    });
    // Meshopt can rotate a triangle cyclically. Compare exact corner IDs
    // and winding, including duplicate triangles, across material batches.
    function triangleKey(indices, at) {
        const a = indices[at], b = indices[at + 1], c = indices[at + 2];
        if (a <= b && a < c) return [a, b, c].join('/');
        if (b <= c && b < a) return [b, c, a].join('/');
        return [c, a, b].join('/');
    }
    function verifyCorners(a, b, id) {
        const counts = new Map();
        for (let i = 0; i < a.length; i += 3) {
            const left = triangleKey(a, i), right = triangleKey(b, i);
            if (left === right) continue;
            counts.set(left, (counts.get(left) || 0) + 1);
            counts.set(right, (counts.get(right) || 0) - 1);
        }
        for (const count of counts.values()) if (count) throw Error('Triangle winding or corner mismatch ' + id);
    }
    let vertices = 0, triangles = 0, maxVertexIn = 0, maxMuscleRgbError = 0;
    try {
        if (worker.parts.length !== baked.parts.length) throw Error('Part counts differ');
        let landmarks = 0;
        for (const [i, actual] of worker.parts.entries()) {
            const expected = baked.parts[i];
            for (const key of ['id', 'source', 'sourcePart', 'scanNode', 'muscleNode', 'atlasNode', 'region']) {
                if (actual[key] !== expected[key]) throw Error(key + ' mismatch ' + actual.id);
            }
            if (actual.muscleNode) {
                if (actual.attachments.length !== expected.attachments.length) throw Error('Anchor count ' + actual.id);
                for (const [j, site] of actual.attachments.entries()) {
                    const other = expected.attachments[j];
                    if (site.index !== other.index || site.role !== other.role || site.bone !== other.bone ||
                        site.target.distanceTo(other.target) / 0.0254 > 0.00005) throw Error('Anchor mismatch ' + actual.id);
                    landmarks++;
                }
            }
            const a = actual.mesh.geometry, b = expected.mesh.geometry;
            const av = a.attributes.position.array, bv = b.attributes.position.array;
            if (av.length !== bv.length || a.index.count !== b.index.count)
                throw Error('Topology mismatch ' + actual.id);
            verifyCorners(a.index.array, b.index.array, actual.id);
            if (actual.muscleNode) {
                const wc = a.attributes.color, bc = b.attributes.color;
                if (!wc || !bc || wc.count !== bc.count) throw Error('Missing tissue colors ' + actual.id);
                for (let j = 0; j < wc.count; j++) {
                    const drift = Math.hypot(wc.getX(j) - bc.getX(j), wc.getY(j) - bc.getY(j), wc.getZ(j) - bc.getZ(j));
                    if (!(drift <= 0.01)) throw Error('Muscle RGB mismatch ' + actual.id);
                    maxMuscleRgbError = Math.max(maxMuscleRgbError, drift);
                }
            }
            vertices += av.length / 3;
            triangles += a.index.count / 3;
            for (let v = 0; v < av.length; v += 3) {
                const inches = Math.hypot(av[v] - bv[v], av[v+1] - bv[v+1], av[v+2] - bv[v+2]) / 0.0254;
                if (!(inches <= 0.004)) throw Error(actual.id + ': ' + inches + ' in vertex drift');
                maxVertexIn = Math.max(maxVertexIn, inches);
            }
        }
        return {name, tier, parts: worker.parts.length, previewParts, vertices, triangles, landmarks, maxVertexIn, maxMuscleRgbError};
    } finally {
        baked.dispose();
        worker.dispose();
    }
}

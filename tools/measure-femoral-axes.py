"""Measure scan inclinations and High caliper lengths in a neutral Axon export.

Uses NumPy and SciPy. Optional reference plates use Pillow.
"""

from pathlib import Path
import argparse
import json
import numpy as np
from scipy.spatial import ConvexHull, distance
from scipy.optimize import least_squares
from collections import defaultdict

INCH = 0.0254


def unit(v):
    return v / np.linalg.norm(v)


def angle(a, b):
    return np.degrees(np.arccos(np.clip(unit(a) @ unit(b), -1.0, 1.0)))


def support_chord(vertices):
    hidx = ConvexHull(vertices).vertices
    v = vertices[hidx]
    D = distance.cdist(v, v)
    a, b = np.unravel_index(D.argmax(), D.shape)
    return float(D[a, b] / INCH)


def section(tris, org, n):
    # Connected components of the actual intersection polylines. Each mesh
    # edge shared by two faces creates a common point in both line segments.
    dist = (tris - org) @ n
    keep = (dist.min(axis=1) < 0) & (dist.max(axis=1) > 0)
    cut = tris[keep]
    ds = dist[keep]
    graph = defaultdict(set)
    positions = {}

    def key(p):
        return tuple(np.round(p, 7))

    for t, ds in zip(cut, ds):
        pts = []
        for k, z in [(0, 1), (1, 2), (2, 0)]:
            a, b = ds[k], ds[z]
            if (a < 0) == (b < 0):
                continue
            pos = t[k] + (a / (a - b)) * (t[z] - t[k])
            w = key(pos)
            positions[w] = pos
            pts.append(w)
        if len(pts) == 2 and pts[0] != pts[1]:
            a, b = pts
            graph[a].add(b)
            graph[b].add(a)
    x = np.array([0, 0, 1])
    u = unit(x - n * (n @ x))
    v = np.cross(n, u)
    seen = set()
    loops = []
    for start in graph:
        if start in seen:
            continue
        todo = [start]
        component = []
        while todo:
            m = todo.pop()
            if m in seen:
                continue
            seen.add(m)
            component.append(m)
            todo.extend(graph[m] - seen)
        if len(component) < 4 or any(len(graph[w]) != 2 for w in component):
            continue
        prev = None
        cur = start
        order = []
        while cur not in order:
            order.append(cur)
            prev, cur = cur, next(x for x in graph[cur] if x != prev)
        xyz = np.array([positions[w] for w in order]) - org
        a = xyz @ u
        b = xyz @ v
        cross = a * np.roll(b, -1) - b * np.roll(a, -1)
        twice = cross.sum()
        if abs(twice) < 1e-12:
            continue
        ca = ((a + np.roll(a, -1)) * cross).sum() / (3 * twice)
        cb = ((b + np.roll(b, -1)) * cross).sum() / (3 * twice)
        ctr = org + ca * u + cb * v
        loops.append((abs(twice) / 2, ctr))
    return loops


def femur(v, tris, sg, variant=0):
    # Fit a sphere to the superomedial articular cap. Mask the trochanter
    # laterally, then robustly downweight nonarticular parts of this cap.
    y = v[:, 1]
    hi, lo = y.max(), y.min()
    H = hi - lo
    lat = sg * v[:, 0]
    medial = lat[y > hi - H * 0.105].min()
    end = 0.068
    cap = v[(lat < medial + 0.095 * H) & (y > hi - (end + variant * 0.007) * H)]
    cap = np.unique(np.round(cap, 8), axis=0)
    ctr = cap.mean(0)
    init = np.r_[ctr, 0.05 * H]

    def residual(params):
        return np.linalg.norm(cap - params[:3], axis=1) - params[3]

    fit = least_squares(residual, init, loss="soft_l1", f_scale=0.0012 * H).x
    head, radius = fit[:3], fit[3]
    # Shaft line fits center of area of each closed diaphyseal section.
    shaft = []
    for frac in np.linspace(0.28 + variant * 0.025, 0.59 + variant * 0.02, 9):
        plane = np.array([0, lo + H * frac, 0])
        sec = section(tris, plane, np.array([0, 1.0, 0]))
        shaft.append(max(sec, key=lambda m: m[0])[1])
    shaft = np.array(shaft)
    _, _, V = np.linalg.svd(shaft - shaft.mean(axis=0), full_matrices=False)
    down = V[0] * (-1 if V[0, 1] > 0 else 1)
    # Locate the narrow closed cross-section between head and trochanter.
    # Seed the direction approximately caudolaterally, then orient the cuts
    # to the evolving head-to-isthmus line. The input seed is not the angle.
    n = unit(np.array([sg * 0.76, -0.62, -0.15]))
    fixture = None
    for _ in range(7):
        options = []
        for off in np.linspace(0.68 + variant * 0.05, 1.68 + variant * 0.07, 31):
            org = head + off * radius * n
            loops = section(tris, org, n)
            if not loops:
                continue
            viable = [
                p
                for p in loops
                if np.linalg.norm(p[1] - org) < radius * 0.72
                and p[0] > radius**2 * 0.34
            ]
            if not viable:
                continue
            area, c = min(viable, key=lambda m: np.linalg.norm(m[1] - org))
            options.append((area, off, c))
        if not options:
            raise ValueError("no neck section")
        # Prefer a resolved local minimum (reject the proximal head cap).
        local = [
            o
            for j, o in enumerate(options[1:-1], 1)
            if o[0] <= options[j - 1][0] and o[0] <= options[j + 1][0]
        ]
        if not local:
            raise ValueError("No interior minimum in the neck cross-section area")
        ar, off, c = min(local, key=lambda m: m[0])
        new = unit(c - head)
        fixture = (ar, off, c, len(local), options[0][1], options[-1][1])
        if angle(new, n) < 0.15:
            n = new
            break
        n = unit(0.4 * n + 0.6 * new)
    a = angle(head - fixture[2], down)
    return {
        "angle": float(a),
        "capSamples": len(cap),
        "capRadiusIn": round(radius / INCH, 3),
        "capMedianResidualIn": round(np.median(np.abs(residual(fit))) / INCH, 3),
        "isthmusRadiiFromHead": round(fixture[1], 3),
        "resolvedMinimum": bool(fixture[3]),
        "headIn": (head / INCH).round(4).tolist(),
        "neckIn": (fixture[2] / INCH).round(4).tolist(),
        "diaphysisDown": down.round(5).tolist(),
        "shaftCentreIn": (shaft.mean(0) / INCH).round(4).tolist(),
    }


def load_geometry(path):
    return {
        name: (
            np.asarray(part["vertices"]).reshape(-1, 3),
            np.asarray(part["indices"]).reshape(-1, 3),
        )
        for name, part in json.loads(path.read_text()).items()
    }


def summarize_femur(vertices, indices, side):
    faces = vertices[indices]
    baseline, lower, upper = [
        femur(vertices, faces, side, variant) for variant in (0, -1, 1)
    ]
    baseline["sensitivityDeg"] = [round(lower["angle"], 3), round(upper["angle"], 3)]
    baseline["angle"] = round(baseline["angle"], 3)
    return baseline


def make_plate(directory, rows, output):
    from PIL import Image, ImageDraw, ImageFont

    out = Image.new("RGB", (960, 610), "#faf6ec")
    d = ImageDraw.Draw(out)
    try:
        bold = ImageFont.truetype(
            "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 18
        )
        normal = ImageFont.truetype(
            "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 13
        )
        large = ImageFont.truetype(
            "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 26
        )
    except OSError:
        bold = normal = large = None
    d.text((20, 10), "Femoral neck and shaft axes", font=large, fill="#343a39")
    d.text(
        (20, 48),
        "High • neutral pose • head center to neck isthmus (red) • diaphyseal axis (teal)",
        font=normal,
        fill="#484440",
    )
    for hi, r in enumerate(rows):
        data = load_geometry(directory / (r["name"] + "-high-cortices.json"))
        for si, side in enumerate(["LEFT", "RIGHT"]):
            bone = "FEMUR_" + side
            k = r["data"][bone]
            v, ix = data[bone]
            v = v / INCH
            fit = k["fitted"]
            p1, p2, shaft, dn = map(
                np.array,
                (
                    fit["headIn"],
                    fit["neckIn"],
                    fit["shaftCentreIn"],
                    fit["diaphysisDown"],
                ),
            )
            for view, (ixX, ixDepth) in enumerate([(0, 2), (2, 0)]):
                rx = hi * 480 + si * 235 + view * 115
                box = v[:, [ixX, 1]]
                lo = box.min(0)
                hi0 = box.max(0)
                sy = 400 / (hi0[1] - lo[1])
                sx = sy

                def proj(xyz):
                    return (
                        float(rx + 55 + (xyz[ixX] - (hi0[0] + lo[0]) / 2) * sx),
                        float(115 + (hi0[1] - xyz[1]) * sy),
                    )

                order = np.argsort(v[ix, ixDepth].mean(1))
                coords = np.asarray([proj(xyz) for xyz in v])
                for t in order:
                    a, b, c = v[ix[t]]
                    n = np.cross(b - a, c - a)
                    n = n / max(np.linalg.norm(n), 1e-30)
                    s = 0.3 + 0.7 * abs(n @ np.array([0.25, 0.4, 0.7]))
                    tint = (int(183 + s * 42), int(178 + s * 45), int(163 + s * 47))
                    d.polygon([tuple(z) for z in coords[ix[t]]], fill=tint)
                d.line([proj(p1), proj(p2)], fill="#a93b28", width=3)
                for p in (p1, p2):
                    x, y = proj(p)
                    d.ellipse([x - 3, y - 3, x + 3, y + 3], fill="#a93b28")
                d.line(
                    [proj(shaft + dn * 3), proj(shaft - dn * 6)],
                    fill="#15635d",
                    width=3,
                )
                d.text(
                    (rx + 20, 526),
                    ["Front", "Profile"][view],
                    font=normal,
                    fill="#444444",
                )
            x = hi * 480 + si * 235 + 12
            d.text(
                (x, 82),
                r["name"].title() + " · " + side.title(),
                font=bold,
                fill="#333333",
            )
            d.text(
                (x, 560),
                ("%.1f°" % fit["angle"])
                + "   •   "
                + ("%.2f in" % k["caliperLengthIn"]),
                font=bold,
                fill="#333333",
            )
    out.save(output, quality=93)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "directory", type=Path, help="Directory populated by export-axon-cortices.mjs"
    )
    parser.add_argument(
        "--plate", type=Path, help="Optional front/profile landmark JPEG"
    )
    args = parser.parse_args()
    rows = []
    for hero in ("sippy", "roma"):
        fitted = load_geometry(args.directory / (hero + "-high-cortices.json"))
        donor = load_geometry(
            args.directory / ("source-" + hero + "-high-cortices.json")
        )
        data = {}
        for name, (vertices, indices) in fitted.items():
            row = {"caliperLengthIn": round(support_chord(vertices), 3)}
            if name.startswith("FEMUR_"):
                side = 1 if name.endswith("LEFT") else -1
                row["fitted"] = summarize_femur(vertices, indices, side)
                row["donor"] = summarize_femur(*donor[name], side)
                row["fittingDeltaDeg"] = round(
                    row["fitted"]["angle"] - row["donor"]["angle"], 3
                )
            data[name] = row
        rows.append({"name": hero, "data": data})
    if args.plate:
        make_plate(args.directory, rows, args.plate)
    print(json.dumps(rows, indent=2))


if __name__ == "__main__":
    main()

"""Generate the PR table and fail if Heros misses a Village cold-load budget."""
import argparse
import json
import statistics
from pathlib import Path


METRICS = (
    ("transferBytes", "Transferred KB", 1000, 1),
    ("requests", "HTTP requests", 1, 0),
    ("modules", "JS modules", 1, 0),
    ("presentedMs", "First populated frame (s)", 1000, 2),
    ("interactiveMs", "First input response (s)", 1000, 2),
)


def read_runs(report, tier, route):
    rows = [row for row in report["rows"] if row["tier"] == tier and row["route"] == route]
    rounds = [row["round"] for row in rows]
    if len(rounds) < 5 or len(set(rounds)) != len(rounds):
        raise ValueError(f"Expected at least five distinct cold rounds for {tier} {route}")
    if any(row["interactiveMs"] < row["presentedMs"] for row in rows):
        raise ValueError(f"Input was acknowledged before presentation on {tier} {route}")
    medians = {key: statistics.median(row[key] for row in rows) for key, *_ in METRICS}
    return set(rounds), medians


def compare(before, after):
    for setting in ("browser", "network", "cpu", "viewport", "probeSha256"):
        if before[setting] != after[setting]:
            raise ValueError(f"Incompatible before/after setting: {setting}")
    failed = []
    print("| Tier | Route | Revision | " + " | ".join(metric[1] for metric in METRICS) + " |")
    print("|---|---|---|" + "---:|" * len(METRICS))
    for tier in ("mobile", "high"):
        samples = {}
        matched_rounds = None
        for label, report in (("Before", before), ("After", after)):
            for route in ("village", "heros"):
                rounds, row = read_runs(report, tier, route)
                if matched_rounds is not None and rounds != matched_rounds:
                    raise ValueError(f"Unpaired cold rounds for {tier} {route} ({label})")
                matched_rounds = rounds
                samples[label, route] = row
                values = [f"{row[key] / unit:.{digits}f}" for key, _, unit, digits in METRICS]
                print(f"| {tier.title()} | {route.title()} | {label} | " + " | ".join(values) + " |")
        for key, name, *_ in METRICS:
            for label in ("Before", "After"):
                if samples["After", "heros"][key] >= samples[label, "village"][key]:
                    failed.append(f"{tier} {name} versus Village ({label.lower()})")
    if failed:
        raise SystemExit("Heros must be strictly lower on: " + ", ".join(failed))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("before", type=Path)
    parser.add_argument("after", type=Path)
    args = parser.parse_args()
    compare(json.loads(args.before.read_text()), json.loads(args.after.read_text()))

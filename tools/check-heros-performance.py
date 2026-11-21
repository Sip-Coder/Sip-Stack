"""Compare two benchmark-heros.py JSON reports and check the speed brief's budgets."""
import argparse
import json
from pathlib import Path


HEROES = ('sippy', 'roma', 'hummin', 'lineup')
TIERS = ('mobile', 'high')


def read(path):
    data = json.loads(path.read_text())
    return {(r['tier'], r['hero']): r for r in data['rows']}


def reading(old, new, digits=2):
    return f'{old:,.{digits}f} → {new:,.{digits}f}'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('before', type=Path)
    parser.add_argument('after', type=Path)
    parser.add_argument('--markdown', type=Path)
    args = parser.parse_args()
    before, after = read(args.before), read(args.after)
    lines = ['## Navigation and selection', '',
             'Each tier starts at the normal `/#heros` route in a fresh context. Sippy reports navigation to the first visible hero. Roma and Hummin report their first selections. Lineup enters after the three characters have been seen. Body transfer and module counts are cumulative through each presentation.', '',
             '| Tier | Presented | Time from action (s) | Gzip and binary body (KiB) | Browser transfer (KiB) | JS modules |',
             '|---|---|---:|---:|---:|---:|']
    failures = []
    for tier in TIERS:
        for hero in HEROES:
            a, b = before[tier, hero], after[tier, hero]
            lines.append(f"| {tier.title()} | {hero.title()} | {reading(a['cold']['actionMs']/1000, b['cold']['actionMs']/1000)} | {reading(a['bytes']/1024,b['bytes']/1024,1)} | {reading(a['transferBytes']/1024,b['transferBytes']/1024,1)} | {reading(a['modules'],b['modules'],0)} |")
            if hero == 'sippy':
                for metric in ('bytes', 'modules'):
                    if b[metric] >= a[metric]:
                        failures.append(f'{tier} first hero {metric} did not improve')
                if b['cold']['ms'] >= a['cold']['ms']:
                    failures.append(f'{tier} first hero paint did not improve')
    lines.extend(['', '## Interactive floor', '',
                  '| Tier | Actor | Pose step (ms) | Script/frame (ms) | Draws/frame, mean | Draws/frame, maximum | Rendered FPS |',
                  '|---|---|---:|---:|---:|---:|---:|'])
    for tier in TIERS:
        for hero in HEROES:
            a, b = before[tier, hero], after[tier, hero]
            cells = [reading(a[k], b[k], digits) for k, digits in (
                ('stepMs',2), ('scriptMs',1), ('drawsMean',1), ('drawsMax',0), ('fps',2))]
            lines.append('| ' + ' | '.join([tier.title(), hero.title(), *cells]) + ' |')
            budget = 4 if hero == 'lineup' else 2
            if b['stepMs'] >= budget:
                failures.append(f'{tier} {hero} step {b["stepMs"]:.2f} ms exceeds {budget} ms')
            if b['drawsMax'] >= 300:
                failures.append(f'{tier} {hero} reached {b["drawsMax"]} WebGL submissions')
    table = '\n'.join(lines) + '\n'
    if args.markdown:
        args.markdown.write_text(table)
    else:
        print(table)
    if failures:
        raise SystemExit('\n'.join(failures))


if __name__ == '__main__':
    main()

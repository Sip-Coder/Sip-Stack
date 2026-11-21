// Run directly with Node 22+, CHROME and the same THREE_ROOT as check-people.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

// Published baselines from sections 2–3 of the supplied 411f01d audit. Do not
// infer historical sizes by dividing new mesh dimensions by their fix factors.
const audit = [
  ['village', 'wine glass', 'Cantina stemmed wine glass', 'H .82, Ø .53', 'table|cantina|service'],
  ['village', 'tumbler', 'Cantina water tumbler', 'H .65, Ø .42'],
  ['village', 'carafe', 'Cantina carafe', 'H .67, Ø .50'],
  ['village', 'bottle', 'Cantina wine bottle', 'H 1.00, Ø .35', 'table|cantina|service'],
  ['creek', 'kingfisher', 'Kingfisher', 'Span 1.07, length .61'],
  ['village', 'swallow', 'Swallows', 'Span .96, length .73'],
  ...['village', 'tidelight', 'creek'].map((s) => [
    s,
    'butterfly',
    'Butterflies',
    'Span .26–.33 across scenes',
  ]),
  ['creek', 'firefly', 'Fireflies', 'Body length .087'],
  ['creek', 'dragonfly', 'Dragonflies', 'Span .37–.48'],
  ['tidelight', 'fish', 'Harbour fish', 'Length .94–1.36'],
  ['creek', 'fish', 'Pool trout', 'Length .51–.74'],
  ['village', 'riser', 'Village stair risers', 'Rise .42'],
  ['village', 'tread', 'Village stair treads', 'Run .33'],
  ['tidelight', 'gull', 'Gulls', 'Span 2.62, length 1.17'],
  ['creek', 'barrel', 'Inspection barrel', 'Length 1.82, belly Ø 1.47', 'lying'],
  ['creek', 'barrel', 'Standing barrel', 'H 1.37, belly Ø 1.11', 'standing'],
  ['village', 'café table', 'Café tables', 'H 1.21, Ø 1.40'],
  ['village', 'café chair', 'Café chairs', 'Back top 1.17, seat H .67, square .47'],
  ['village', 'chair seat', 'Chair seats', 'Seat H .67, square .47'],
  ['village', 'umbrella', 'Umbrellas', 'Top 3.6, rim 2.88, canopy Ø 3.17'],
  ['village', 'wine case', 'Quay and boat cases', 'L .68, W .48, H .42', 'quay|boat|static|stack'],
  ['village', 'wine case', 'Porter’s case', 'L .59, W .42, H .36', 'porter|carried'],
  ['village', 'storey', 'House storeys', 'Floor-to-floor 1.75'],
  ['village', 'door', 'House doors', 'H 1.33, W .67', 'house|front'],
  ['village', 'window', 'House windows', 'H .77, W .50'],
  ['village', 'bottle end', 'Rack bottle ends', 'Ø .15'],
  ['village', 'bench', 'Piazza bench', 'Seat H .76, depth .55'],
  ['tidelight', 'bar table', 'Tasting table', 'H 1.01, Ø 1.24'],
  ['tidelight', 'riser', 'Tidelight stair risers', 'Rise .25'],
  ['tidelight', 'tread', 'Tidelight stair treads', 'Run .24'],
  ['tidelight', 'terrace rail', 'Terrace railing', 'H .74'],
  ['tidelight', 'amphora', 'Amphorae', 'H 1.16, Ø .76, sunk .32'],
  ['village', 'flower clump', 'Cantina flower clumps', 'Span .47–.67'],
  ['creek', 'boat', 'Creek skiff', 'Length 2.39, beam .93'],
  ['creek', 'oar', 'Creek oars', 'Length 1.28'],
  ['village', 'handrail height', 'Village stair rail', 'Height varied .42–3.3 above the old treads'],
  ['creek', 'songbird', 'Finches', 'Span .68, length .33'],
  ['village', 'door', 'Lane doors', 'H 2.15, W 1.26', 'lane|cellar'],
  ['village', 'fortified barrel', 'Fortified barrels', 'Length .83, Ø .67'],
  ['village', 'quay barrel', 'Quay barrels', 'H .92, Ø .57'],
  ['village', 'bollard', 'Quay bollards', 'H .67'],
  ['village', 'lamp post', 'Village lamps', 'H 2.5–2.8'],
  ['village', 'basket press', 'Basket press', 'H .83, Ø 1.0'],
  ['village', 'steel tank', 'Steel tank', 'H 1.50–1.67'],
  ['village', 'red vat', 'Open red vat', 'H 1.0, Ø 1.5'],
  ['village', 'workbench', 'Workbench', 'H .77'],
  ['village', 'crate', 'Picking bins', 'L .67, W .58, H .45', 'picking bin'],
  ['village', 'vine post', 'Vine trellis', 'H 1.47'],
  ['village', 'boat', 'Village boats', 'Length 3.67, beam 1.43'],
  ['village', 'oar', 'Village oars', 'Length 1.96'],
  ['village', 'buoy', 'Village buoys', 'H .45'],
  ['village', 'loggia post', 'Loggia posts', 'H 2.4'],
  ['tidelight', 'boat', 'Tidelight cutter', 'Length 4.4, beam 1.7'],
  ['village', 'belfry', 'Belfry to upper cornice', 'H 14.4'],
  ['village', 'olive', 'Olive trees', 'H 2.4–4.7'],
  ['village', 'cypress', 'Cypress trees', 'H 3.3–7.4'],
  ['village', 'lane wall', 'Cellar lane walls', 'H 2.5'],
  ['village', 'terrace rise', 'Masonry terrace rise', 'H 3.33'],
  ['village', 'bottle rack', 'Bottle rack', 'H 1.53'],
  ['village', 'tasting glass', 'Held tasting glass', 'H .187'],
  ['village', 'basket', 'Harvester basket', 'No numerical baseline recorded'],
  ['village', 'umbrella rim', 'Cantina umbrella rim', 'H 2.88'],
  ['tidelight', 'storey', 'Tasting house storey', 'H 3.10'],
  ['tidelight', 'window', 'Glazed arches', 'H 1.30, W .58'],
  ['tidelight', 'awning stanchion', 'Awning stanchions', 'H 2.50'],
  ['tidelight', 'lamp post', 'Pier lamp posts', 'H 1.80'],
  ['tidelight', 'bollard', 'Mooring posts', 'No numerical baseline recorded'],
  ['tidelight', 'lighthouse', 'Harbour lighthouse', 'H 6.80, Ø 2.70'],
  ['tidelight', 'cypress', 'Coast cypress', 'H 4.30'],
  ['tidelight', 'vine trellis', 'Coast vine trellis', 'H 1.36'],
  ['creek', 'lantern', 'Cooper’s lantern', 'H .22'],
  ['creek', 'platform plank', 'Cooper platform planks', 'No numerical baseline recorded'],
  ['creek', 'cask cradle', 'Cooper’s cask cradle', 'No numerical cradle baseline recorded'],
  ['creek', 'lamp post', 'Cooper’s lamp', 'H 2.23'],
];
const display = (n) =>
  n === null || n === undefined || !Number.isFinite(n) ? '—' : Number(n.toFixed(4)).toString();
const shape = (arr) => arr.map(display).join(' × ');
const range = (min, max) => (min === max ? display(min) : display(min) + '–' + display(max));
const escape = (s) => String(s).replaceAll('|', '\\|').replaceAll('\n', ' ');
function selected(rows, kind, pattern) {
  const matching = rows.filter((r) => r.kind === kind);
  if (!pattern) return matching;
  return matching.filter((r) => new RegExp(pattern, 'i').test(r.name));
}
function grouped(rows, field) {
  if (!rows.length) return 'Missing';
  return [0, 1, 2]
    .map((i) => {
      const ns = rows.map((r) => r[field][i]).filter(Number.isFinite);
      return ns.length ? range(Math.min(...ns), Math.max(...ns)) : '—';
    })
    .join(' × ');
}
function worst(rows) {
  const ns = rows.flatMap((r) => r.delta.filter(Number.isFinite)).map(Math.abs);
  return ns.length ? display(100 * Math.max(...ns)) + '%' : '—';
}
export function formatScaleReport(report) {
  const all = Object.values(report.scenes).flatMap((s) => s.dimensions);
  const lines = [
    '# Physical scale in Village, Tidelight Coast and Sip Creek',
    '',
    'All dimensions are metres. The probe applies the production world matrix and each instance transform to render vertices. Width, height and depth use the object’s physical axes, so a yawed chair or pitching hull keeps its dimensions. Bird spans use the outstretched rest pose. Luminous halos are excluded from insect body sizes.',
    '',
    'The production registry yielded ' +
      all.length +
      ' measured objects and instances. ' +
      report.failures.length +
      ' checks failed. Design dimensions allow ±10%. A dash marks an unspecified axis.',
    '',
    '## Audit comparison',
    '',
    'Historical sizes come from the supplied scale audit of main at `411f01d`. Measured and design columns use **height × width × depth**. Ranges span the registered copies of each object.',
    '',
    '| Scene | Item | Main audit | Measured | Design reference | Largest absolute deviation |',
    '|---|---|---|---|---|---:|',
  ];
  for (const [s, kind, label, before, pattern] of audit) {
    const rows = selected(report.scenes[s].dimensions, kind, pattern);
    lines.push(
      '| ' +
        [s, label, before, grouped(rows, 'actual'), grouped(rows, 'reference'), worst(rows)].join(' | ') +
        ' |',
    );
  }
  for (const [s, data] of Object.entries(report.scenes)) {
    lines.push(
      '',
      '## ' + s[0].toUpperCase() + s.slice(1),
      '',
      'Measured ' +
        data.dimensions.length +
        ' objects and instances. The test checks registered counts for ' +
        Object.keys(data.inventory || {}).length +
        ' kinds against the independently specified scene inventory.',
      '',
      '### People and furniture',
      '',
      '| Check | Measured | Accepted interval | Result |',
      '|---|---:|---|---|',
    );
    for (const r of data.ergonomics)
      lines.push(
        '| ' +
          escape(r.name) +
          ' | ' +
          display(r.value) +
          ' ' +
          r.units +
          ' | ' +
          display(r.min) +
          ' to ' +
          (r.max === null ? 'unbounded' : display(r.max)) +
          ' | ' +
          (r.pass ? 'Pass' : 'Fail') +
          ' |',
      );
    if (data.details?.length) {
      lines.push(
        '',
        '### Table service',
        '',
        '| Check | Measured | Accepted interval | Result |',
        '|---|---:|---|---|',
      );
      for (const r of data.details)
        lines.push(
          '| ' +
            [
              r.name,
              display(r.value) + ' m',
              display(r.min) + ' to ' + display(r.max) + ' m',
              r.pass ? 'Pass' : 'Fail',
            ].join(' | ') +
            ' |',
        );
    }
    if (data.treads.length) {
      lines.push(
        '',
        '### Walkable stairs',
        '',
        '| Flight | Treads | Rise | Run | 2R + T | Rail top above nosing | Result |',
        '|---|---:|---:|---:|---:|---:|---|',
      );
      const flights = Map.groupBy(data.treads, (r) => r.flight);
      for (const [id, treads] of flights) {
        const cols = ['rise', 'run', 'twiceRisePlusRun', 'railHeight'].map((k) =>
          range(Math.min(...treads.map((r) => r[k])), Math.max(...treads.map((r) => r[k]))),
        );
        lines.push(
          '| ' +
            [escape(id), treads.length, ...cols, treads.every((r) => r.pass) ? 'Pass' : 'Fail'].join(' | ') +
            ' |',
        );
      }
    }
    lines.push(
      '',
      '<details><summary>All ' + data.dimensions.length + ' measured objects and instances</summary>',
      '',
      '| Kind | Object | Measured H × W × D | Reference H × W × D | Δ H, W, D |',
      '|---|---|---|---|---|',
    );
    for (const r of data.dimensions)
      lines.push(
        '| ' +
          [
            r.kind,
            escape(r.name),
            shape(r.actual),
            shape(r.reference),
            r.delta.map((n) => (n === null ? '—' : display(n * 100) + '%')).join(', '),
          ].join(' | ') +
          ' |',
      );
    lines.push('', '</details>');
  }
  if (report.failures.length) lines.push('', '## Failed checks', '', ...report.failures.map((f) => '- ' + f));
  return lines.join('\n') + '\n';
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = spawnSync(
    process.execPath,
    [
      fileURLToPath(new URL('./check-people.mjs', import.meta.url)),
      '--suite=scale',
      ...process.argv.slice(2),
    ],
    { stdio: 'inherit' },
  );
  process.exitCode = result.status ?? 1;
}

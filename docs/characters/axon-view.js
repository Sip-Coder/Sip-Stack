// Loaded when the inspector reaches the viewport. Measurements use the posed model at rest.
import { buildDiagramModel } from './diagram-parts.js';
import { createDiagramView } from './diagram-view.js';
import { names, labels } from './ui.js';

const layers = [
  { key: 'skeleton', human: 'Skeleton', robot: 'Chassis' },
  { key: 'muscles', human: 'Muscles', robot: 'Actuators' },
  { key: 'skin', human: 'Skin & hair', robot: 'Shell & visor' },
  { key: 'clothes', human: 'Clothes & accessories', robot: 'Clothes & accessories' },
];
const stylesheet = document.createElement('link');
stylesheet.rel = 'stylesheet';
stylesheet.href = new URL('./axon-view.css', import.meta.url);
stylesheet.addEventListener('error', async () => {
  const { recover } = await import('../assets/sip-recover.js');
  await recover('Axon View styles', new Error('Diagram stylesheet could not load.'), [stylesheet.href]);
});
document.head.append(stylesheet);

export function mountStudy(section, stage, chooseHero) {
  const body = section.querySelector('[data-study-body]');
  const open = section.querySelector('[data-open-study]');
  open.hidden = true;
  body.innerHTML = `
    <div class="ax-toolbar"><label>Character <select data-axon-hero>${names.map((n, i) => `<option value="${n}">${labels[i]}</option>`).join('')}</select></label>
      <label class="ax-spread"><span>Explode <output data-spread-value>0%</output></span>
        <input data-explode type="range" min="0" max="1" step="0.01" value="0"></label></div>
    <div class="ax-layout"><div class="ax-figure">
      <canvas data-axon-canvas tabindex="0" aria-label="Character layer diagram. Drag to orbit, pinch or use plus and minus to zoom. Use arrow keys to orbit and Home to reset."></canvas>
      <p class="ax-status" role="status"></p><button type="button" class="ax-reset">Reset view</button>
    </div><aside class="ax-settings" aria-label="Diagram settings">
      <h4>Layers</h4><div class="ax-layers">${layers
        .map(
          (l) => `<div class="ax-layer" data-layer="${l.key}">
        <label><input data-show type="checkbox" checked> <b data-layer-name>${l.human}</b></label>
        <button data-isolate type="button" aria-pressed="false">Isolate</button>
        <label class="ax-opacity">Opacity <input data-opacity type="range" min="0" max="100" value="100"></label></div>`,
        )
        .join('')}</div>
      <label class="ax-part-label">Inspect part <select data-part><option value="">Select a part</option></select></label>
      <div data-measure aria-live="polite"></div>
    </aside></div>
    <details class="ax-help"><summary>Diagram controls</summary><p>Click or tap a part to measure it. Drag to orbit. Pinch or scroll to zoom. On the diagram, use the arrow keys to orbit, + or − to zoom and Home to reset.</p>
    <p>Gamepad: use the D-pad to move between controls and adjust values, A to activate, bumpers to change character, the right stick to orbit and triggers to zoom.</p></details>`;
  const get = (selector) => body.querySelector(selector);
  const canvas = get('canvas'),
    heroPicker = get('[data-axon-hero]'),
    partPicker = get('[data-part]');
  const spread = get('[data-explode]'),
    status = get('.ax-status'),
    measure = get('[data-measure]');
  const rows = layers.map((l) => get('[data-layer="' + l.key + '"]'));
  let hero,
    tier,
    key,
    active = false,
    model,
    records = [],
    isolated,
    generation = 0;
  let padFrame = 0,
    pressed = [];
  const view = createDiagramView(stage, canvas, {
    layerOrder: layers.map((layer) => layer.key),
    onSelect: inspect,
    onPaint(stats) {
      if (!stats.ready) return;
      status.textContent = '';
      section.dataset.ready = key;
    },
    onError: showError,
  });
  async function showError(error) {
    if (
      await import('../assets/sip-recover.js')
        .then((m) => m.recover('Axon View', error))
        .catch(() => false)
    )
      return;
    status.textContent = 'The diagram could not load.';
    open.hidden = false;
    open.textContent = 'Retry';
  }
  function layerName(key) {
    const layer = layers.find((l) => l.key === key);
    return hero === 'hummin' ? layer.robot : layer.human;
  }
  function inspect(part) {
    const i = model?.parts.indexOf(part) ?? -1;
    partPicker.value = i < 0 ? '' : String(i);
    measure.replaceChildren();
    if (i < 0) return;
    const info = records[i],
      heading = document.createElement('strong');
    heading.textContent = info.name;
    const size = info.sizeInches.map((n) => n.toFixed(2)).join(' × ');
    const details = document.createElement('p');
    details.textContent = layerName(info.layer) + ' · ' + info.triangles.toLocaleString() + ' triangles';
    const dimensions = document.createElement('p');
    dimensions.textContent = size + ' in (W × H × D)';
    measure.append(heading, details, dimensions);
  }
  function updateLayers() {
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i],
        name = layers[i].key;
      const visible = row.querySelector('[data-show]').checked && (!isolated || isolated === name);
      row.querySelector('[data-isolate]').setAttribute('aria-pressed', String(isolated === name));
      view.setLayer(name, { visible, opacity: Number(row.querySelector('[data-opacity]').value) / 100 });
      for (const group of partPicker.querySelectorAll('optgroup')) {
        if (group.dataset.key === name)
          group.disabled = !visible || row.querySelector('[data-opacity]').value === '0';
      }
    }
    if (partPicker.selectedOptions[0]?.parentElement.disabled) {
      view.select(null);
      inspect(null);
    }
  }
  function fillParts() {
    partPicker.replaceChildren(new Option('Select a part', ''));
    for (const layer of layers) {
      const group = document.createElement('optgroup');
      group.label = layerName(layer.key);
      group.dataset.key = layer.key;
      for (const [i, record] of records.entries()) {
        if (record.layer === layer.key) group.append(new Option(record.name, String(i)));
      }
      partPicker.append(group);
    }
    updateLayers();
  }
  async function load(id, name, quality) {
    try {
      const next = await buildDiagramModel(name, quality);
      if (id !== generation || !active) {
        next.dispose();
        return;
      }
      model = next;
      records = model.parts.map(({ name, layer, mesh }) => {
        const g = mesh.geometry;
        g.computeBoundingBox();
        const b = g.boundingBox;
        const count = g.index?.count ?? g.attributes.position.count;
        return {
          name,
          layer,
          triangles: count / 3,
          sizeInches: ['x', 'y', 'z'].map((k) => (b.max[k] - b.min[k]) / 0.0254),
        };
      });
      fillParts();
      view.setModel(model, quality);
      updateLayers();
    } catch (error) {
      if (id === generation) showError(error);
    }
  }
  function sync(name, quality, visible) {
    const nextKey = name + '-' + quality;
    const changed = nextKey !== key;
    if (!changed && active === visible) return;
    active = visible;
    hero = name;
    tier = quality;
    if (changed) {
      generation++;
      view.setModel(null, tier);
      model?.dispose();
      model = null;
      records = [];
      delete section.dataset.ready;
      heroPicker.value = name;
      rows.forEach((row, i) => {
        const label = layerName(layers[i].key);
        row.querySelector('[data-layer-name]').textContent = label;
        row.querySelector('[data-isolate]').setAttribute('aria-label', 'Isolate ' + label);
        row.querySelector('[data-opacity]').setAttribute('aria-label', label + ' opacity');
      });
      inspect(null);
      fillParts();
    }
    key = nextKey;
    view.setVisible(active);
    if (!active) {
      generation++;
      cancelAnimationFrame(padFrame);
      padFrame = 0;
      pressed = [];
    } else {
      if (!model) {
        status.textContent = 'Preparing ' + labels[names.indexOf(hero)] + '…';
        load(++generation, hero, tier);
      }
      startPad();
    }
  }
  open.addEventListener('click', () => {
    open.hidden = true;
    if (active) {
      view.setModel(null, tier);
      model?.dispose();
      model = null;
      load(++generation, hero, tier);
    }
  });
  heroPicker.addEventListener('change', () => chooseHero(heroPicker.value));
  spread.addEventListener('input', () => {
    const percent = Math.round(100 * Number(spread.value)) + '%';
    get('[data-spread-value]').textContent = percent;
    spread.setAttribute('aria-valuetext', percent);
    view.setExplode(Number(spread.value));
  });
  for (const row of rows) {
    row.querySelector('[data-isolate]').onclick = () => {
      const name = row.dataset.layer;
      isolated = isolated === name ? null : name;
      if (isolated) row.querySelector('[data-show]').checked = true;
      updateLayers();
    };
    row.querySelector('[data-show]').onchange = () => {
      if (!row.querySelector('[data-show]').checked && isolated === row.dataset.layer) isolated = null;
      updateLayers();
    };
    row.querySelector('[data-opacity]').oninput = updateLayers;
  }
  partPicker.onchange = () => {
    const part = partPicker.value === '' ? null : model?.parts[Number(partPicker.value)];
    view.select(part);
    inspect(part);
  };
  get('.ax-reset').onclick = () => view.resetView();
  canvas.addEventListener('keydown', (e) => {
    const step = 0.12;
    switch (e.key) {
      case 'ArrowLeft':
        view.orbit(-step, 0);
        break;
      case 'ArrowRight':
        view.orbit(step, 0);
        break;
      case 'ArrowUp':
        view.orbit(0, step);
        break;
      case 'ArrowDown':
        view.orbit(0, -step);
        break;
      case '+':
      case '=':
        view.zoom(1.15);
        break;
      case '-':
        view.zoom(1 / 1.15);
        break;
      case 'Home':
        view.resetView();
        break;
      default:
        return;
    }
    e.preventDefault();
  });

  function startPad() {
    if (!padFrame && active && Array.from(navigator.getGamepads?.() ?? []).some((p) => p?.connected))
      padFrame = requestAnimationFrame(pollPad);
  }
  function pollPad() {
    padFrame = 0;
    if (!active) return;
    const pad = Array.from(navigator.getGamepads?.() ?? []).find((p) => p?.connected);
    if (!pad) {
      pressed = [];
      return;
    }
    const on = pad.buttons.map((b) => b.pressed);
    const hit = (i) => on[i] && !pressed[i];
    const focused = document.activeElement;
    // When the floor and diagram overlap in the viewport, focus chooses the recipient.
    const floor = stage.canvas.getBoundingClientRect();
    if (section.contains(focused) || (focused === document.body && floor.bottom <= 0)) {
      const controls = Array.from(body.querySelectorAll('select,input,button,canvas,summary'));
      const at = controls.indexOf(focused);
      if (hit(12) || hit(13))
        controls[(at + (hit(12) ? -1 : 1) + controls.length) % controls.length].focus();
      if (hit(4) || hit(5)) chooseHero(names[(names.indexOf(hero) + (hit(4) ? 2 : 1)) % 3]);
      if (hit(0) && focused.matches('button,input[type=checkbox],summary')) focused.click();
      if (hit(14) || hit(15)) {
        const delta = hit(14) ? -1 : 1;
        if (focused.matches('select')) {
          const options = Array.from(focused.options).filter((o) => !o.parentElement.disabled);
          focused.value =
            options[
              Math.max(
                0,
                Math.min(options.length - 1, options.indexOf(focused.selectedOptions[0]) + delta),
              )
            ].value;
          focused.dispatchEvent(new Event('change'));
        } else {
          const range = focused.matches('input[type=range]') ? focused : spread;
          range.stepUp(delta * (range === spread ? 5 : 10));
          range.dispatchEvent(new Event('input'));
        }
      }
      const x = pad.axes[2] || 0,
        y = pad.axes[3] || 0;
      if (Math.abs(x) > 0.15 || Math.abs(y) > 0.15) view.orbit(x * 0.035, -y * 0.025);
      const scale = (pad.buttons[7]?.value ?? 0) - (pad.buttons[6]?.value ?? 0);
      if (Math.abs(scale) > 0.1) view.zoom(Math.exp(0.035 * scale));
    }
    pressed = on;
    startPad();
  }
  window.addEventListener('gamepadconnected', startPad);
  section.axonInspector = { inventory: () => records, stats: () => view.stats };
  return { sync };
}

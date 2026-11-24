// Loaded when the inspector reaches the viewport. Measurements use the posed model at rest.
import { buildDiagramModel } from './diagram-parts.js';
import { createDiagramView } from './diagram-view.js';
import { names, labels } from './ui.js';

const layers = [
  { key: 'skeleton', human: 'Skeleton', robot: 'Chassis' },
  { key: 'muscles', human: 'Muscles', robot: 'Actuators' },
  { key: 'breast', human: 'Breast tissue and fat pad', only: 'roma' },
  { key: 'gluteal-fat', human: 'Gluteal fat', only: 'roma' },
  { key: 'hip-fat', human: 'Hip and thigh fat', only: 'roma' },
  { key: 'face-fat', human: 'Facial fat', humanOnly: true, optIn: true },
  { key: 'skin', human: 'Skin & hair', robot: 'Shell & visor' },
  { key: 'clothes', human: 'Clothes & accessories', robot: 'Clothes & accessories' },
];
const ghostCovers = ['clothes', ...layers.filter((layer) => layer.only === 'roma').map((layer) => layer.key)];
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
      <label data-human-setting>Layout <select data-axon-layout><option value="axial">Axial</option><option value="side">Side by side</option></select></label>
      <label data-human-setting>Skin fit <select data-skin-fit disabled><option value="off">Off</option><option value="heatmap">Gap heatmap</option><option value="overlay">Skin over muscle</option><option value="face-heatmap">Face gap heatmap</option><option value="face-overlay">Face layer overlay</option></select></label>
      <label class="ax-spread"><span>Explode <output data-spread-value>0%</output></span>
        <input data-explode type="range" min="0" max="1" step="0.01" value="0"></label></div>
    <div class="ax-layout"><div class="ax-figure">
      <canvas data-axon-canvas style="visibility:hidden" tabindex="0" aria-label="Character layer diagram. Drag to orbit, pinch or use plus and minus to zoom. Use arrow keys to orbit and Home to reset."></canvas>
      <p class="ax-status" role="status"></p><button type="button" class="ax-reset">Reset view</button>
    </div><aside class="ax-settings" aria-label="Diagram settings">
      <h4>Layers</h4><div class="ax-layers">${layers
        .map(
          (l) => `<div class="ax-layer" data-layer="${l.key}"${l.only || l.humanOnly ? ' hidden' : ''}>
        <label><input data-show type="checkbox"${l.optIn ? '' : ' checked'}> <b data-layer-name>${l.human}</b></label>
        <button data-isolate type="button" aria-pressed="false">Isolate</button>
        <label class="ax-opacity">Opacity <input data-opacity type="range" min="0" max="100" value="100"></label></div>`,
        )
        .join('')}</div>
      <label data-human-setting class="ax-ghost"><input data-ghost type="checkbox"> Ghost skin</label>
      <label class="ax-part-label">Inspect part <select data-part><option value="">Select a part</option></select></label>
      <div data-measure aria-live="polite"></div>
      <div class="ax-fit-results" data-skin-fit-state="off" aria-live="polite" hidden></div>
    </aside></div>
    <details class="ax-help" data-human-setting data-scan-credit><summary>Skeleton and muscle credits · BoneHub, BodyParts3D, Visible Human Female and Z-Anatomy</summary></details>
    <details class="ax-help"><summary>Diagram controls</summary><p>Click or tap a part to measure it. Ghost skin reveals the anatomy below the skin, fat and clothes. Drag to orbit. Pinch or scroll to zoom. On the diagram, use the arrow keys to orbit, + or − to zoom and Home to reset.</p>
    <p>Gamepad: use the D-pad to move between controls and adjust values, A to activate, bumpers to change character, the right stick to orbit and triggers to zoom.</p></details>`;
  const get = (selector) => body.querySelector(selector);
  for (const id of ['human-skeleton-credit', 'human-muscle-credit', 'human-z-anatomy-credit']) {
    const credit = document.getElementById(id).cloneNode(true);
    credit.removeAttribute('id');
    get('[data-scan-credit]').append(credit);
  }
  const canvas = get('canvas'),
    heroPicker = get('[data-axon-hero]'),
    partPicker = get('[data-part]');
  const spread = get('[data-explode]'),
    status = get('.ax-status'),
    measure = get('[data-measure]');
  const fitPicker = get('[data-skin-fit]'), fitOutput = get('[data-skin-fit-state]');
  const fitLockedControls = body.querySelectorAll(
    '[data-axon-layout], [data-explode], .ax-layers input, .ax-layers button, [data-ghost], [data-part]',
  );
  const rows = layers.map((l) => get('[data-layer="' + l.key + '"]'));
  const fatRow = get('[data-layer="face-fat"]'), showFat = fatRow.querySelector('[data-show]');
  let hero,
    tier,
    key,
    active = false,
    model,
    records = [],
    isolated,
    loading,
    previewPaint,
    generation = 0;
  let fitRequest, fitResult, faceView, outerSelection, fatRequest;
  let ghostOpen = false;
  const restoreLayers = new Set();
  function applyGhost(enabled) {
    if (enabled && !ghostOpen) {
      for (const key of ghostCovers) {
        const control = get('[data-layer="' + key + '"] [data-show]');
        if (control.checked) restoreLayers.add(key);
        control.checked = false;
      }
      get('[data-layer="skin"] [data-show]').checked = true;
      isolated = null;
    } else if (!enabled && ghostOpen) {
      for (const key of restoreLayers) get('[data-layer="' + key + '"] [data-show]').checked = true;
      restoreLayers.clear();
    }
    ghostOpen = enabled;
    view.setGhost(enabled);
    updateLayers();
  }
  let padFrame = 0,
    pressed = [];
  const view = createDiagramView(stage, canvas, {
    layerOrder: layers.map((layer) => layer.key),
    onSelect: inspect,
    onHover(part) {
      const selected = partPicker.value === '' ? null : model?.parts[Number(partPicker.value)];
      describePart(part ?? selected);
    },
    onPaint(stats) {
      // An opaque 2D context starts black. Reveal only after the first readback
      // has been copied, then keep that photograph through later replacements.
      if (canvas.style.visibility) canvas.style.visibility = '';
      if (!model || stats.parts !== (faceView ?? model).parts.length || !stats.ready) return;
      if (model.partial) {
        section.dataset.progress = 'available-layers';
        status.textContent = 'Loading original female lower-limb muscles…';
        previewPaint?.();
        return;
      }
      delete section.dataset.progress;
      status.textContent = '';
      section.dataset.ready = key;
      fitPicker.disabled = hero === 'hummin';
      if (stats.skinFit === fitPicker.value && stats.skinFit !== 'off' && fitResult) {
        fitOutput.dataset.skinFitState = 'ready';
      } else if (fitPicker.value !== 'off' && fitOutput.dataset.skinFitState !== 'error') {
        refreshSkinFit();
      } else if (fitPicker.value === 'off') refreshFaceFat();
    },
    onError: showError,
  });
  function switchFaceView(next) {
    if (faceView === next) return;
    if (next) outerSelection = model.parts[Number.parseInt(partPicker.value, 10)];
    view.setSkinFit('off');
    faceView = next;
    view.setModel(faceView ?? model, tier);
    if (next) inspect(null);
    else {
      view.select(outerSelection);
      inspect(outerSelection);
      outerSelection = undefined;
    }
  }
  function resetSkinFit(clear = false) {
    fitRequest?.controller.abort();
    fitRequest = undefined;
    view.setSkinFit('off');
    if (clear) {
      fitResult = undefined;
      faceView = undefined;
      outerSelection = undefined;
    } else switchFaceView();
    for (const control of fitLockedControls) control.disabled = false;
    fitOutput.hidden = true;
    fitOutput.dataset.skinFitState = 'off';
  }
  const gapText = (gap) => gap.meanIn.toFixed(3) + ' / ' + gap.maxIn.toFixed(3);
  function faceRegionTable(regions) {
    const table = document.createElement('table');
    table.className = 'ax-fit-regions';
    const header = table.createTHead().insertRow();
    const columns = ['Muscle', 'Support', ...(regions[0]?.bone ? ['Bone'] : [])];
    for (const text of ['Region', ...columns]) {
      const th = document.createElement('th');
      th.scope = 'col';
      th.textContent = text;
      header.append(th);
    }
    const body = table.createTBody();
    for (const region of regions) {
      const row = body.insertRow();
      const name = document.createElement('th');
      name.textContent = region.label;
      name.scope = 'row';
      row.append(name);
      for (const metric of columns) row.insertCell().textContent = gapText(region[metric.toLowerCase()]);
    }
    return table;
  }
  function showSkinFit(result, mode) {
    const face = mode.startsWith('face-');
    const data = face ? result.data.face : result.data;
    const next = face ? result.face : undefined;
    switchFaceView(next?.model);
    fitOutput.hidden = false;
    fitOutput.dataset.skinFitState = 'rendering';
    const labels = [
      'Muscle gap · Mean ' + data.muscle.meanIn.toFixed(3) + ' in · Max ' + data.muscle.maxIn.toFixed(3) + ' in',
      'Nearest support · Mean ' + data.support.meanIn.toFixed(3) + ' in · Max ' + data.support.maxIn.toFixed(3) + ' in',
    ];
    if (face && data.bone)
      labels.push('Bone gap · Mean ' + data.bone.meanIn.toFixed(3) + ' in · Max ' + data.bone.maxIn.toFixed(3) + ' in');
    const entries = labels.map((text) => {
      const line = document.createElement('p');
      line.textContent = text;
      return line;
    });
    const legend = document.createElement('div');
    legend.className = 'ax-fit-scale';
    if (mode.endsWith('heatmap')) result.module.fitScale.forEach(({ color }, i) => {
      const swatch = document.createElement('span');
      swatch.style.borderColor = color;
      swatch.textContent = ['0', '1/16', '3/8', '3/4', '1½+ in'][i];
      legend.append(swatch);
    });
    const detail = document.createElement('details');
    const summary = document.createElement('summary');
    summary.textContent = 'How the gap is measured';
    const method = document.createElement('p');
    if (face) {
      summary.textContent = 'Region gaps · mean / max in';
      method.textContent = 'Unsigned distances to the nearest neutral muscle and skull triangles. Support also includes facial fat pads and upper neck bones. The means are area-weighted. Areas with sparse muscle coverage may show larger muscle gaps.';
      detail.append(summary, faceRegionTable(data.regions), method);
    } else {
      method.textContent = 'Nearest triangles in the neutral pose, with an area-weighted mean and largest sampled gap. Support includes bone, muscle and Roma’s soft-tissue pads. This map covers the body. Gaps are unsigned.';
      const exposure = document.createElement('p');
      const count = data.projectedExposure;
      exposure.textContent = 'Six-view depth check · ' + count.exposedPixels.toLocaleString() +
        ' of ' + count.overlappingPixels.toLocaleString() + ' overlapping samples show support outside the skin by more than ' + count.toleranceIn + ' in.';
      detail.append(summary, method, exposure);
    }
    fitOutput.replaceChildren(...entries, legend, detail);
    for (const control of fitLockedControls) control.disabled = true;
    view.setSkinFit(mode, result.module, next?.distances ?? result.distances);
  }
  async function refreshSkinFit() {
    const mode = fitPicker.value;
    if (mode === 'off') {
      resetSkinFit();
      refreshFaceFat();
      return;
    }
    cancelFaceFat();
    if (!active || hero === 'hummin' || !model || model.partial || section.dataset.ready !== key) return;
    const face = mode.startsWith('face-');
    if (fitRequest && fitRequest.face !== face) {
      fitRequest.controller.abort();
      fitRequest = undefined;
    }
    if (fitResult?.model === model && (!face || fitResult.face)) {
      showSkinFit(fitResult, mode);
      return;
    }
    if (fitRequest) return;
    const controller = new AbortController();
    const { signal } = controller;
    const request = { controller, face };
    fitRequest = request;
    const seen = model, quality = tier;
    fitOutput.hidden = false;
    fitOutput.dataset.skinFitState = 'loading';
    fitOutput.textContent = face ? 'Loading face anatomy and measurements…' : 'Loading skin fit measurements…';
    try {
      const module = await import('./diagram-skin-fit.js');
      const result = fitResult?.model === seen ? fitResult : {
        ...await module.loadSkinFit(seen, quality, signal), module, model: seen,
      };
      if (signal.aborted || model !== seen || !active) return;
      fitResult = result;
      if (face && !result.face) result.face = await module.loadFaceFit(seen, result.data, signal);
      if (signal.aborted || model !== seen || !active) return;
      showSkinFit(result, fitPicker.value);
    } catch (error) {
      if (signal.aborted || model !== seen || !active) return;
      fitOutput.dataset.skinFitState = 'error';
      fitOutput.textContent = 'Skin fit measurements could not load.';
      // The optional measurements use the same stale-deployment recovery as
      // the rest of Axon View while leaving its successful photograph visible.
      const recovery = await import('../assets/sip-recover.js').catch(() => null);
      if (!signal.aborted && fitRequest === request && active && model === seen)
        await recovery?.recover('Axon skin fit', error, error.assetURL ? [error.assetURL] : []).catch(() => {});
    } finally {
      if (fitRequest === request) fitRequest = undefined;
    }
  }
  function cancelFaceFat() {
    fatRequest?.abort();
    fatRequest = undefined;
    fatRow.removeAttribute('aria-busy');
  }
  async function refreshFaceFat() {
    if (!showFat.checked || !active || fitPicker.value !== 'off') {
      cancelFaceFat();
      return;
    }
    if (!model?.loadFaceFat || model.partial || fatRequest || model.parts.some(p => p.layer === 'face-fat')) return;
    const seen = model, request = new AbortController();
    fatRequest = request;
    fatRow.setAttribute('aria-busy', 'true');
    try {
      const fat = await seen.loadFaceFat(request.signal);
      if (request.signal.aborted || model !== seen || !active) return;
      const selected = seen.parts[Number.parseInt(partPicker.value, 10)];
      model = { ...seen, parts: [...seen.parts, ...fat] };
      records = model.parts.map(partRecord);
      fillParts();
      view.setModel(model, tier);
      view.select(selected);
      inspect(selected);
    } catch (error) {
      if (request.signal.aborted || model !== seen || !active) return;
      const recovery = await import('../assets/sip-recover.js').catch(() => null);
      if (request.signal.aborted || model !== seen || !active) return;
      if (await recovery?.recover('Axon facial fat', error, error.assetURL ? [error.assetURL] : []).catch(() => {})) return;
      showFat.checked = false;
      if (isolated === 'face-fat') isolated = null;
      updateLayers();
      status.textContent = 'Facial fat could not load.';
    } finally {
      if (fatRequest === request) cancelFaceFat();
    }
  }
  async function showError(error) {
    const id = generation;
    previewPaint?.();
    if (
      await import('../assets/sip-recover.js')
        .then((m) => id === generation && active ? m.recover('Axon View', error, error.assetURL ? [error.assetURL] : []) : false)
        .catch(() => false)
    )
      return;
    if (id !== generation || !active) return;
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
    describePart(part);
  }
  function partRecord(part) {
    let bounds = part.bounds, triangles = part.triangles;
    if (!bounds || triangles === undefined) {
      const geometry = part.mesh.geometry;
      if (!geometry.boundingBox) geometry.computeBoundingBox();
      bounds = geometry.boundingBox;
      triangles = (geometry.index?.count ?? geometry.attributes.position.count) / 3;
    }
    return {
      name: part.name, layer: part.layer, triangles,
      sizeInches: ['x', 'y', 'z'].map((k) => (bounds.max[k] - bounds.min[k]) / 0.0254),
    };
  }
  function describePart(part) {
    const i = model?.parts.indexOf(part) ?? -1;
    measure.replaceChildren();
    if (!part || (i < 0 && !faceView?.parts.includes(part))) return;
    const info = records[i] ?? partRecord(part);
    const heading = document.createElement('strong');
    heading.textContent = info.name;
    const size = info.sizeInches.map((n) => n.toFixed(2)).join(' × ');
    const details = document.createElement('p');
    details.textContent = layerName(info.layer) + ' · ' + info.triangles.toLocaleString() + ' triangles';
    const dimensions = document.createElement('p');
    dimensions.textContent = size + ' in (W × H × D)';
    measure.append(heading, details, dimensions);
    if (hero !== 'hummin' && ['skeleton', 'muscles', 'face-fat'].includes(info.layer)) {
      const source = document.createElement('p');
      source.textContent = part.source;
      measure.append(source);
    }
  }
  function updateLayers() {
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i],
        name = layers[i].key;
      const visible = !row.hidden && row.querySelector('[data-show]').checked && (!isolated || isolated === name);
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
      if ((layer.only && layer.only !== hero) || (layer.humanOnly && hero === 'hummin')) continue;
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
    loading?.abort();
    const request = new AbortController();
    loading = request;
    // Fetch the studio during the GLB transfer. setModel handles import errors
    // along its normal retry path when it actually needs to light a human.
    if (name !== 'hummin') import('./diagram-studio.js').catch(() => {});
    function present(next) {
      if (id !== generation || !active || request.signal.aborted) {
        next.dispose();
        return;
      }
      const previous = model;
      const selected = partPicker.value === '' ? null : previous?.parts[Number(partPicker.value)]?.id;
      model = next;
      records = model.parts.map(partRecord);
      fillParts();
      view.setModel(model, quality);
      if (previous?.dispose !== next.dispose) previous?.dispose();
      updateLayers();
      if (selected) {
        const part = model.parts.find((p) => p.id === selected);
        view.select(part);
        inspect(part);
      }
    }
    function presentAvailableLayers(next) {
      if (request.signal.aborted) { next.dispose(); return; }
      // Keep the real, selectable preview through its first successful paint
      // before loading the much larger original lower-limb surfaces.
      return new Promise((resolve) => {
        function painted() {
          request.signal.removeEventListener('abort', painted);
          if (previewPaint === painted) previewPaint = undefined;
          resolve();
        }
        previewPaint = painted;
        request.signal.addEventListener('abort', painted, { once: true });
        present(next);
      });
    }
    try {
      present(await buildDiagramModel(name, quality, request.signal, presentAvailableLayers));
    } catch (error) {
      if (!request.signal.aborted && id === generation) showError(error);
    } finally {
      if (loading === request) loading = undefined;
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
      cancelFaceFat();
      resetSkinFit(true);
      view.setModel(null, tier);
      model?.dispose();
      model = null;
      records = [];
      delete section.dataset.ready;
      delete section.dataset.progress;
      open.hidden = true;
      heroPicker.value = name;
      const human = name !== 'hummin';
      if (!human) fitPicker.value = 'off';
      fitPicker.disabled = true;
      for (const setting of body.querySelectorAll('[data-human-setting]')) setting.hidden = !human;
      view.setLayout(human ? get('[data-axon-layout]').value : 'side');
      rows.forEach((row, i) => {
        const layer = layers[i];
        row.hidden = (!!layer.only && layer.only !== hero) || (layer.humanOnly && !human);
        if (row.hidden && isolated === layer.key) isolated = null;
        const label = row.hidden ? layer.human : layerName(layer.key);
        row.querySelector('[data-layer-name]').textContent = label;
        row.querySelector('[data-isolate]').setAttribute('aria-label', 'Isolate ' + label);
        row.querySelector('[data-opacity]').setAttribute('aria-label', label + ' opacity');
      });
      applyGhost(human && get('[data-ghost]').checked);
      inspect(null);
      fillParts();
    }
    key = nextKey;
    view.setVisible(active);
    if (!active) {
      loading?.abort();
      cancelFaceFat();
      resetSkinFit();
      generation++;
      cancelAnimationFrame(padFrame);
      padFrame = 0;
      pressed = [];
    } else {
      if (!model || model.partial) {
        open.hidden = true;
        status.textContent = 'Preparing ' + labels[names.indexOf(hero)] + '…';
        load(++generation, hero, tier);
      } else if (fitPicker.value !== 'off') refreshSkinFit();
      else refreshFaceFat();
      startPad();
    }
  }
  open.addEventListener('click', () => {
    open.hidden = true;
    if (active) {
      cancelFaceFat();
      resetSkinFit(true);
      view.setModel(null, tier);
      model?.dispose();
      model = null;
      load(++generation, hero, tier);
    }
  });
  heroPicker.addEventListener('change', () => chooseHero(heroPicker.value));
  get('[data-axon-layout]').onchange = (e) => view.setLayout(e.target.value);
  get('[data-ghost]').onchange = (e) => applyGhost(e.target.checked);
  fitPicker.onchange = refreshSkinFit;
  spread.addEventListener('input', () => {
    const percent = Math.round(100 * Number(spread.value)) + '%';
    get('[data-spread-value]').textContent = percent;
    spread.setAttribute('aria-valuetext', percent);
    view.setExplode(Number(spread.value));
  });
  for (const row of rows) {
    row.querySelector('[data-isolate]').onclick = () => {
      const name = row.dataset.layer;
      if (ghostOpen) restoreLayers.delete(name);
      isolated = isolated === name ? null : name;
      if (isolated) row.querySelector('[data-show]').checked = true;
      updateLayers();
      if (name === 'face-fat') refreshFaceFat();
    };
    row.querySelector('[data-show]').onchange = () => {
      if (ghostOpen) restoreLayers.delete(row.dataset.layer);
      if (!row.querySelector('[data-show]').checked && isolated === row.dataset.layer) isolated = null;
      updateLayers();
      if (row.dataset.layer === 'face-fat') refreshFaceFat();
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
      const controls = Array.from(body.querySelectorAll('select,input,button,canvas,summary')).filter(
        (control) => control.getClientRects().length,
      );
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
  section.axonInspector = {
    inventory: () => records,
    stats: () => ({ ...view.stats, fitPath: model?.fitPath ?? (model ? 'procedural' : null), partial: !!model?.partial }),
    skinFit: () => {
      if (!fitResult) return null;
      const { parts, face, ...summary } = fitResult.data;
      return { ...summary, face: face ? { ...face, parts: undefined } : undefined, mode: fitPicker.value };
    },
  };
  return { sync };
}

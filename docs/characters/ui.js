export const names = ['sippy', 'roma', 'hummin'];
export const labels = ['Sippy', 'Roma', 'Hummin'];
export const heights = [1.78, 1.68, 1.85];

export function createUI(host) {
  host.innerHTML = `
    <header class="ct-head"><div><p class="ct-kicker">Sip Studios / Movement studies</p>
      <h2>Characters</h2></div><span>Third-person controller test</span></header>
    <div class="ct-layout">
      <div class="ct-stage">
        <div class="ct-hud"><strong data-state>Idle</strong><span data-speed>0.00 m/s</span><span data-rate>60 Hz physics</span></div>
    <details class="ct-guide"><summary>Controls</summary>
    <dl><div><dt>Move</dt><dd>WASD · left stick</dd></div><div><dt>Run</dt><dd>Shift · full stick</dd></div>
    <div><dt>Jump / roll</dt><dd>Space / Ctrl · A / B</dd></div><div><dt>Look</dt><dd>Click to capture mouse · drag on touch · right stick</dd></div>
    <div><dt>Slow / restart</dt><dd>Tab on floor / R · left shoulder / Start</dd></div><div><dt>Emote / switch</dt><dd>E / 1–3 · X / right shoulder</dd></div>
    <div><dt>Release camera</dt><dd>Esc</dd></div></dl></details>
        <div class="ct-loading" role="status">Preparing the characters…</div>
        <div class="ct-touch"><div class="ct-stick" aria-label="Movement stick"><span></span></div>
          <div class="ct-touch-actions"><button type="button" data-touch="run">Run</button>
          <button type="button" data-touch="roll">Roll</button><button type="button" data-touch="jump">Jump</button></div></div>
      </div>
      <aside class="ct-panel" aria-label="Character test settings">
        <h3>Cast</h3>
        <div class="ct-picker" role="group" aria-label="Select character">
          ${names
            .map(
              (name, i) => `<button type="button" data-pick="${name}" aria-pressed="${!i}">
            <i class="ct-swatch ct-${name}"></i><span><b>${labels[i]}</b><small>${['Sommelier', 'Vineyard guide', 'Cellar robot'][i]}</small></span><kbd>${i + 1}</kbd></button>`,
            )
            .join('')}
        </div>
        <h3>Movement</h3>
        <div class="ct-modes"><button type="button" data-action="lineup" aria-pressed="false">Lineup</button>
        <button type="button" data-action="group" aria-pressed="false">Walk together</button></div>
        <div class="ct-modes"><button type="button" data-action="emote">Emote</button><button type="button" data-action="reset">Restart</button></div>
        <div class="ct-settings"><label>Lighting <select data-setting="light"><option>Studio</option><option>Golden hour</option></select></label>
        <label>Quality <select data-setting="tier"><option value="auto">Auto</option><option value="high">High</option><option value="mobile">Mobile</option></select></label></div>
        <label class="ct-slow"><input type="checkbox" data-setting="slow"> Slow motion</label>
      </aside>
    </div>

    <details class="ct-review"><summary>Movement films</summary><div>
    ${names.map((name, i) => `<figure><video controls playsinline preload="none" aria-label="${labels[i]} movement film" src="characters/review/${name}.mp4"></video><figcaption>${labels[i]}</figcaption></figure>`).join('')}
    </div></details>`;
  return host.querySelector('.ct-stage');
}

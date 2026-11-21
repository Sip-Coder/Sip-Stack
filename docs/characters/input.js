// Collect input events between fixed ticks. Edge actions are consumed exactly once.
export function createInput(host, canvas, command, orbit) {
  const held = new Set();
  const buttons = new Uint8Array(16);
  const intent = { x: 0, z: 0, run: false, jump: false, roll: false, emote: false };
  let enabled = false,
    jump = false,
    roll = false,
    emote = false,
    run = false,
    sx = 0,
    sy = 0;
  let lookPointer = null,
    lastX = 0,
    lastY = 0,
    stickPointer = null;
  const stick = host.querySelector('.ct-stick'),
    knob = stick.firstElementChild;
  function clear() {
    held.clear();
    buttons.fill(0);
    jump = roll = emote = run = false;
    sx = sy = 0;
    lookPointer = stickPointer = null;
    knob.style.transform = '';
  }
  function release() {
    if (document.pointerLockElement === canvas) document.exitPointerLock();
    canvas.blur();
    clear();
  }
  const keys = [
    'KeyW',
    'KeyA',
    'KeyS',
    'KeyD',
    'ArrowUp',
    'ArrowLeft',
    'ArrowDown',
    'ArrowRight',
    'ShiftLeft',
    'ShiftRight',
    'Space',
    'ControlLeft',
    'ControlRight',
    'KeyE',
    'KeyR',
    'Tab',
    'Digit1',
    'Digit2',
    'Digit3',
  ];
  window.addEventListener('keydown', (e) => {
    if (!enabled || e.altKey || e.metaKey || e.target.matches?.('input,select,textarea,video')) return;
    if (e.code === 'Escape') {
      release();
      return;
    }
    if (!keys.includes(e.code) || ((e.ctrlKey || e.shiftKey) && e.code === 'Tab')) return;
    if (e.code === 'Tab' && document.activeElement !== canvas) return;
    if (e.code === 'Space' && e.target.closest?.('button,summary,a')) return;
    e.preventDefault();
    held.add(e.code);
    if (e.repeat) return;
    if (e.code === 'Space') jump = true;
    else if (e.code.startsWith('Control')) roll = true;
    else if (e.code === 'KeyE') emote = true;
    else if (e.code === 'KeyR') command('reset');
    else if (e.code === 'Tab') command('slow');
    else if (e.code.startsWith('Digit')) command('select', Number(e.code.at(-1)) - 1);
  });
  window.addEventListener('keyup', (e) => held.delete(e.code));
  window.addEventListener('blur', clear);
  canvas.addEventListener('pointerdown', (e) => {
    if (!enabled || e.button !== 0) return;
    canvas.focus({ preventScroll: true });
    if (e.pointerType === 'mouse' && canvas.requestPointerLock && document.pointerLockElement !== canvas) {
      const lock = canvas.requestPointerLock();
      lock?.catch(() => {});
    }
    lookPointer = e.pointerId;
    lastX = e.clientX;
    lastY = e.clientY;
    canvas.setPointerCapture(e.pointerId);
  });
  document.addEventListener('pointermove', (e) => {
    if (!enabled) return;
    if (document.pointerLockElement === canvas) orbit(-e.movementX * 0.004, e.movementY * 0.003);
    else if (lookPointer === e.pointerId) {
      orbit(-(e.clientX - lastX) * 0.006, (e.clientY - lastY) * 0.004);
      lastX = e.clientX;
      lastY = e.clientY;
    }
  });
  canvas.addEventListener('lostpointercapture', () => {
    lookPointer = null;
  });
  stick.addEventListener('pointerdown', (e) => {
    if (stickPointer !== null) return;
    stickPointer = e.pointerId;
    stick.setPointerCapture(e.pointerId);
    moveStick(e);
  });
  function moveStick(e) {
    if (e.pointerId !== stickPointer) return;
    const r = stick.getBoundingClientRect(),
      x = (e.clientX - r.left - r.width / 2) / (r.width * 0.4),
      y = (e.clientY - r.top - r.height / 2) / (r.height * 0.4);
    const n = Math.max(1, Math.hypot(x, y));
    sx = x / n;
    sy = -y / n;
    knob.style.transform = 'translate(' + sx * 23 + 'px,' + -sy * 23 + 'px)';
  }
  stick.addEventListener('pointermove', moveStick);
  stick.addEventListener('lostpointercapture', () => {
    stickPointer = null;
    sx = sy = 0;
    knob.style.transform = '';
  });
  for (const b of host.querySelectorAll('[data-touch]')) {
    b.addEventListener('pointerdown', (e) => {
      b.setPointerCapture(e.pointerId);
      if (b.dataset.touch === 'run') run = true;
      else if (b.dataset.touch === 'jump') jump = true;
      else roll = true;
    });
    b.addEventListener('lostpointercapture', () => {
      if (b.dataset.touch === 'run') run = false;
    });
  }
  function sample(yaw, dt) {
    let x = sx,
      y = sy,
      full = false;
    if (held.has('KeyD') || held.has('ArrowRight')) x++;
    if (held.has('KeyA') || held.has('ArrowLeft')) x--;
    if (held.has('KeyW') || held.has('ArrowUp')) y++;
    if (held.has('KeyS') || held.has('ArrowDown')) y--;
    const pads = navigator.getGamepads?.();
    let pad;
    if (pads)
      for (let i = 0; i < pads.length; i++) {
        if (pads[i]?.connected) {
          pad = pads[i];
          break;
        }
      }
    if (pad) {
      const ax = pad.axes[0] || 0,
        ay = pad.axes[1] || 0,
        n = Math.hypot(ax, ay);
      if (n > 0.17) {
        const gain = Math.min(1, (n - 0.17) / 0.83) / n;
        x += ax * gain;
        y -= ay * gain;
        full = n > 0.89;
      }
      const rx = pad.axes[2] || 0,
        ry = pad.axes[3] || 0;
      if (Math.abs(rx) > 0.1 || Math.abs(ry) > 0.1) orbit(-rx * dt * 2.4, ry * dt * 1.6);
      for (let i = 0; i < buttons.length; i++) {
        const down = !!pad.buttons[i]?.pressed;
        if (down && !buttons[i]) {
          if (i === 0) jump = true;
          if (i === 1) roll = true;
          if (i === 2) emote = true;
          if (i === 4) command('slow');
          if (i === 5) command('next');
          if (i === 9) command('reset');
        }
        buttons[i] = Number(down);
      }
    } else buttons.fill(0);
    const n = Math.max(1, Math.hypot(x, y)),
      c = Math.cos(yaw),
      s = Math.sin(yaw);
    intent.x = (x * c - y * s) / n;
    intent.z = (-x * s - y * c) / n;
    intent.run = run || full || held.has('ShiftLeft') || held.has('ShiftRight');
    intent.jump = jump;
    intent.roll = roll;
    intent.emote = emote;
    jump = roll = emote = false;
    return intent;
  }
  return {
    sample,
    setEnabled(v) {
      enabled = v;
      if (!v) release();
    },
    emote() {
      emote = true;
    },
    clear,
  };
}

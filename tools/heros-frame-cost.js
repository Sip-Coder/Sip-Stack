// Count physical WebGL submissions across every render target. Three's default
// per-pass info counter resets in the composer, which hides shadow/output work.
(() => {
  let capturing = false,
    draws = 0,
    collecting = false;
  const probe = (window.heroFrameCost = { frames: [] });
  for (const method of ['drawElements', 'drawArrays', 'drawElementsInstanced', 'drawArraysInstanced']) {
    const original = WebGL2RenderingContext.prototype[method];
    WebGL2RenderingContext.prototype[method] = function (...args) {
      if (collecting && this.canvas.parentElement?.classList.contains('ct-stage')) draws++;
      return original.apply(this, args);
    };
  }
  const raf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (callback) =>
    raf((now) => {
      if (!capturing) return callback(now);
      collecting = true;
      draws = 0;
      const start = performance.now();
      try {
        return callback(now);
      } finally {
        if (draws) probe.frames.push({ now, ms: performance.now() - start, draws });
        collecting = false;
      }
    });
  probe.start = () => {
    probe.frames.length = 0;
    capturing = true;
  };
  probe.stop = () => {
    capturing = false;
    return probe.frames;
  };
  probe.count = (callback) => {
    collecting = true;
    draws = 0;
    try {
      callback();
      return draws;
    } finally {
      collecting = false;
    }
  };
})();

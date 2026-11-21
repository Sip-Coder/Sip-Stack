// Loaded only for explicit review and skeleton-debug requests.
export function reviewControls(floor) {
  return {
    select: name => floor.choose(floor.names.indexOf(name)),
    view: floor.setView,
    tier(q) {
      floor.tierSelect.value = q;
      floor.quality();
    },
    reset: floor.reset,
    setManual: floor.manualMode,
    primeSecondary: floor.primeSecondary,
    tick(n, intent = floor.neutral) {
      if (!floor.canTick()) return;
      const request = { ...floor.neutral, ...intent };
      for (let i = 0; i < n; i++) {
        floor.simulate(request);
        request.jump = request.roll = request.emote = false;
      }
      floor.updateHUD();
    },
    render: floor.render,
    snapshot: floor.snapshot,
  };
}

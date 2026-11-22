// Loaded only for explicit review and skeleton-debug requests.
export function reviewControls(floor) {
  return {
    select: name => floor.choose(floor.names.indexOf(name)),
    view: floor.setView,
    tier(q) {
      floor.tierSelect.value = q;
      return floor.quality();
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
    hairPose(n, [pitch = 0, yaw = 0, roll = 0] = []) {
      if (!floor.canTick()) return;
      const actor = floor.actor();
      if (!actor?.rig.groom) return;
      const head = actor.rig.head.rotation;
      for (let i = 0; i < n; i++) {
        const frame = actor.ctrl.step(floor.dt, floor.neutral);
        head.set(head.x + pitch, head.y + yaw, head.z + roll);
        actor.pose(frame);
        actor.ctrl.finishPose();
      }
    },
    render: floor.render,
    snapshot: floor.snapshot,
  };
}

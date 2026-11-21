// The authored rest pose is immediately playable. Only an actor who actually
// moves, jumps, rolls or gestures needs its secondary-motion implementation.
export function secondaryMotion(rig, file, parts) {
  let pending, advance;
  function load() {
    if (!pending) {
      const url = new URL(file, import.meta.url).href;
      pending = import(url).then(({ createSecondary }) => {
        advance = createSecondary(rig, parts);
        return true;
      }).catch(async error => {
        if (typeof window !== 'undefined') {
          try {
            const { recover } = await import('../assets/sip-recover.js');
            await recover('Heros secondary motion', error, [url]);
          } catch {
            // Retain the playable base pose if the recovery helper is offline.
          }
        }
        return false;
      });
    }
    return pending;
  }
  rig.loadSecondary = load;
  return frame => {
    if (advance) advance(frame);
    else if (!pending && (frame.state !== 'idle' || frame.emote >= 0 || frame.speed > 0.015)) load();
  };
}

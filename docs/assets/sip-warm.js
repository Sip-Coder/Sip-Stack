// Compile a diorama's shaders before its first frame. With
// KHR_parallel_shader_compile the driver links them off the main thread, so a
// phone keeps scrolling instead of freezing inside the first render.
// Each job is [scene, camera, target]; the target decides tone mapping and
// output encoding, so it must match the one the scene is drawn into.
export function warmShaders(renderer, jobs) {
  const previous = renderer.getRenderTarget();
  const started = performance.now();
  const waits = [];
  try {
    for (const [scene, camera, target = null, lightingScene = scene] of jobs) {
      renderer.setRenderTarget(target);
      waits.push(renderer.compileAsync(scene, camera, lightingScene));
    }
  } catch (error) {
    waits.push(Promise.reject(error));
  } finally {
    renderer.setRenderTarget(previous);
  }
  return Promise.all(waits).then(
    () => performance.now() - started,
    (error) => { console.warn('Shader warm-up skipped:', error); return performance.now() - started; },
  );
}

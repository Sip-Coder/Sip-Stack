import * as T from 'three';

export const duration = 20;
const spline = (points) => new T.CatmullRomCurve3(points.map((p) => new T.Vector3(...p)));
const flight = spline([
  [2.6, 1.65, 16.4],
  [0.6, 2.85, 10.5],
  [5.2, 5.3, 3.8],
  [8.65, 8.1, -3.6],
  [5.4, 10.7, -9.3],
  [5.6, 11.0, -13.1],
  [6.4, 15.3, -5.0],
  [17.8, 17.3, 26.5],
]);
const gaze = spline([
  [-4.4, 4.18, -3.25],
  [-4.9, 4.15, -2.3],
  [-1.4, 5.5, -5.2],
  [2.3, 7.1, -8.6],
  [-4.4, 10.68, -12.8],
  [-5.6, 11.85, -13.5],
  [-4.4, 9.7, -10.7],
  [-0.4, 4.9, -3.3],
]);
export const chapters = ['Harbor approach', 'Vineyard terraces', 'Piazza del campanile', 'The wine coast'];
export function chapter(t) {
  return t < 6 ? 0 : t < 11.7 ? 1 : t < 16.3 ? 2 : 3;
}
export function pose(seconds, camera, target) {
  const u = seconds / duration,
    t = u * 0.67 + 0.33 * u * u * (3 - 2 * u);
  flight.getPoint(t, camera.position);
  gaze.getPoint(t, target);
  const narrow = T.MathUtils.clamp(1 / camera.aspect - 1, 0, 1.5);
  camera.position
    .sub(target)
    .multiplyScalar(1 + narrow * (0.16 + 0.65 * T.MathUtils.smoothstep(u, 0.77, 1)))
    .add(target);
  camera.lookAt(target);
}

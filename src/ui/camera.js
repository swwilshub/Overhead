// The floor's camera. A scene point (sx, sy), in the scene's own pixels, is drawn at (sx * zoom - cam.x, sy * zoom - cam.y)
// in CSS pixels on the surface. Pure functions, so the maths can be tested without a browser.
export const ZOOM_MIN = 0.25, ZOOM_MAX = 4;
export const clampZoom = z => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z));

// How far the camera may go on one axis. A scene smaller than the view sits in the middle; a larger one can be panned
// until `slack` of the view (as a fraction) is empty beside it, so what is under a floating panel can be brought out.
function axis(sceneSize, zoom, view, slack) {
  const size = sceneSize * zoom;
  if (size <= view) { const c = -(view - size) / 2; return [c, c]; }
  const m = view * slack; return [-m, size - view + m];
}
export function clampCam(cam, zoom, scene, vp, slack = 0.35) {
  const [x0, x1] = axis(scene.W, zoom, vp.w, slack), [y0, y1] = axis(scene.H, zoom, vp.h, slack);
  return { x: Math.min(x1, Math.max(x0, cam.x)), y: Math.min(y1, Math.max(y0, cam.y)) };
}
// Change the zoom while the scene point under screen point (ax, ay) stays where it is.
export function zoomAbout(cam, zoom0, zoom1, ax, ay) {
  const sx = (cam.x + ax) / zoom0, sy = (cam.y + ay) / zoom0;
  return { x: sx * zoom1 - ax, y: sy * zoom1 - ay };
}
export const toScene = (cam, zoom, px, py) => [(cam.x + px) / zoom, (cam.y + py) / zoom];
export const toScreen = (cam, zoom, sx, sy) => [sx * zoom - cam.x, sy * zoom - cam.y];
// The zoom and camera that show the whole scene inside the view, leaving `pad` pixels and, if given, `insets` of room
// for controls floating over an edge.
export function fitCam(scene, vp, pad = 16, insets = {}) {
  const l = pad + (insets.left || 0), r = pad + (insets.right || 0), t = pad + (insets.top || 0), b = pad + (insets.bottom || 0);
  const aw = Math.max(1, vp.w - l - r), ah = Math.max(1, vp.h - t - b);
  const zoom = clampZoom(Math.min(aw / scene.W, ah / scene.H));
  return { zoom, x: -(l + (aw - scene.W * zoom) / 2), y: -(t + (ah - scene.H * zoom) / 2) };
}
// Move the camera as little as needed to bring the scene point (sx, sy) inside the view with `margin` pixels to spare.
export function reveal(cam, zoom, vp, sx, sy, margin = 48) {
  const px = sx * zoom - cam.x, py = sy * zoom - cam.y; let { x, y } = cam;
  if (px < margin) x += px - margin * 2; else if (px > vp.w - margin) x += px - vp.w + margin * 2;
  if (py < margin) y += py - margin * 2; else if (py > vp.h - margin) y += py - vp.h + margin * 2;
  return { x, y };
}
// The part of the scene on screen, in scene pixels, clipped to the scene: [sx, sy, sw, sh]
export function visible(cam, zoom, scene, vp) {
  const sx = Math.max(0, Math.floor(cam.x / zoom)), sy = Math.max(0, Math.floor(cam.y / zoom));
  const ex = Math.min(scene.W, Math.ceil((cam.x + vp.w) / zoom)), ey = Math.min(scene.H, Math.ceil((cam.y + vp.h) / zoom));
  return [sx, sy, Math.max(0, ex - sx), Math.max(0, ey - sy)];
}
// A flick: velocity in pixels per millisecond from recent samples [{x, y, t}], and the decay of a glide.
export function velocity(samples, now, window = 90) {
  const s = samples.filter(p => now - p.t <= window); if (s.length < 2) return { x: 0, y: 0 };
  const a = s[0], b = s[s.length - 1], dt = Math.max(1, b.t - a.t); return { x: (b.x - a.x) / dt, y: (b.y - a.y) / dt };
}
export const glide = (vel, dt, friction = 0.0042) => { const k = Math.exp(-friction * dt); return { x: vel.x * k, y: vel.y * k }; };

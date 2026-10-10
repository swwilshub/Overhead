// The floor camera: zoom about a point, clamping, centring, fit, reveal, visible region, flick.
import { ok, done } from './lib.mjs';
import { ZOOM_MIN, ZOOM_MAX, clampZoom, clampCam, zoomAbout, toScene, toScreen, fitCam, reveal, visible, velocity, glide } from '../src/ui/camera.js';

const scene = { W: 800, H: 600 }, vp = { w: 400, h: 300 };
const near = (a, b, e = 1e-6) => Math.abs(a - b) <= e;

ok(clampZoom(0.01) === ZOOM_MIN && clampZoom(99) === ZOOM_MAX && clampZoom(1.5) === 1.5, 'zoom stays between a quarter and four');
{ // the point under the pointer stays under it
  const cam = { x: 120, y: 80 }, ax = 150, ay = 90, p0 = toScene(cam, 1, ax, ay), c1 = zoomAbout(cam, 1, 2.5, ax, ay), p1 = toScene(c1, 2.5, ax, ay);
  ok(near(p0[0], p1[0]) && near(p0[1], p1[1]), `zooming about a point keeps the scene point under it (${p0.map(Math.round)})`);
  const back = zoomAbout(c1, 2.5, 1, ax, ay); ok(near(back.x, cam.x) && near(back.y, cam.y), 'zooming in and out again returns to the start');
}
{ // clamping: a large scene can go slightly past its edges, never far; a small one is centred
  const c = clampCam({ x: -9999, y: -9999 }, 1, scene, vp); ok(near(c.x, -400 * 0.35) && near(c.y, -300 * 0.35), `panning stops with a margin showing (${c.x}, ${c.y})`);
  const d = clampCam({ x: 9999, y: 9999 }, 1, scene, vp); ok(near(d.x, 800 - 400 + 140) && near(d.y, 600 - 300 + 105), 'and at the far edge too');
  const s = clampCam({ x: 50, y: 50 }, 0.25, scene, vp); ok(near(s.x, -(400 - 200) / 2) && near(s.y, -(300 - 150) / 2), 'a scene smaller than the view is centred');
  const inside = clampCam({ x: 100, y: 100 }, 1, scene, vp); ok(inside.x === 100 && inside.y === 100, 'a camera already inside the limits is untouched');
}
{ // fit
  const f = fitCam(scene, vp, 10); const [x0, y0] = toScreen(f, f.zoom, 0, 0), [x1, y1] = toScreen(f, f.zoom, scene.W, scene.H);
  ok(near(f.zoom, Math.min(380 / 800, 280 / 600)) && x0 >= 10 - 1e-6 && y0 >= 10 - 1e-6 && x1 <= 390 + 1e-6 && y1 <= 290 + 1e-6, `fit shows the whole scene inside the view at ${f.zoom.toFixed(3)}×`);
  const g = fitCam(scene, vp, 10, { top: 60 }); const [, gy0] = toScreen(g, g.zoom, 0, 0); ok(gy0 >= 70 - 1e-6, 'fit leaves room for floating controls along an edge');
  ok(fitCam({ W: 8, H: 6 }, vp, 0).zoom === ZOOM_MAX, 'a tiny scene fits at the top zoom, no more');
}
{ // reveal
  const cam = { x: 0, y: 0 }; const r = reveal(cam, 1, vp, 700, 100, 40); const [px] = toScreen(r, 1, 700, 100);
  ok(px <= vp.w - 40 && px >= 40, `revealing a point off the right edge brings it in (${px})`);
  const same = reveal(cam, 1, vp, 200, 150, 40); ok(same.x === 0 && same.y === 0, 'a point already in view does not move the camera');
}
{ // the visible part of the scene
  const [sx, sy, sw, sh] = visible({ x: 100, y: 50 }, 2, scene, vp); ok(sx === 50 && sy === 25 && sw === 200 && sh === 150, `the visible rectangle in scene pixels (${[sx, sy, sw, sh]})`);
  const [a, b, c, d] = visible({ x: -50, y: -50 }, 1, scene, vp); ok(a === 0 && b === 0 && c === 350 && d === 250, 'clipped to the scene at the top left');
  const e = visible({ x: 5000, y: 5000 }, 1, scene, vp); ok(e[2] === 0 && e[3] === 0, 'nothing visible when the camera is far away');
}
{ // a flick
  const s = [{ x: 0, y: 0, t: 0 }, { x: 20, y: 0, t: 40 }, { x: 60, y: 0, t: 80 }]; const v = velocity(s, 80);
  ok(near(v.x, 60 / 80) && v.y === 0, `velocity over the last 90 ms (${v.x.toFixed(2)} px/ms)`);
  ok(velocity([{ x: 0, y: 0, t: 0 }], 10).x === 0, 'one sample is no flick');
  ok(velocity([{ x: 0, y: 0, t: 0 }, { x: 99, y: 0, t: 10 }], 1000).x === 0, 'an old drag is no flick');
  const g1 = glide({ x: 1, y: 0 }, 16), g2 = glide(g1, 16); ok(g1.x < 1 && g2.x < g1.x && g2.x > 0, 'a glide slows down and never reverses');
}
done('camera');

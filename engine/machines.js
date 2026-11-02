/* engine/machines.js（生成物。直接編集しない）
 * 中身: iso-glow 3D gallery の core.js（MIT, April Zhu / Tolga Cohce）をそのまま連結し、
 * カメラ・電話・プロジェクターの3機械と scene を足したもの。three.js は MIT。
 * 出所: UKIYO-4s/creative-learning-system の 0f0763e（2026-10-13）時点。ライセンス:
 * MIT License
 * 
 * Copyright (c) 2026 April Zhu (iso-glow: lighting, palettes, gallery shell, examples)
 * Copyright (c) 2026 Tolga Cohce (iso-figure, on which iso-glow is based)
 * 
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 * 
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 * 
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */
/* isoglow-3d: isoglow.dev /demo/3d の Desk computer（pc）を three.js で frame 決定論に描く。
 * 原作: iso-glow 3D gallery（MIT, Copyright (c) 2026 April Zhu）。材料・線の 3 層・箱の押し出し・折り目線・画面の canvas・halo の点・haze と影・camera の view は原作の構成と数値をそのまま流用（LICENSE-iso-glow.txt）。
 * 違い: requestAnimationFrame / performance.now / setTimeout / AudioContext / localStorage / OrbitControls を使わず、frame から時刻を決めて tick する。後処理（EffectComposer: HalfFloat MSAA 4 + OutputPass + ディザ）は原作どおり。文言・ロゴは自前。
 * 部品: core（renderer・scene・light・material・helpers）/ figures.pc（geometry + state）/ camera（view・orbit・zoom・iso）/ runtime（台本と予定表）。
 */
import * as THREE from 'three';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

const G3 = (window.ISOGLOW3D = window.ISOGLOW3D || {});
G3.figures = G3.figures || {};
const TS = 0.01;
const W = (x, y, z) => new THREE.Vector3(x * TS, z * TS, y * TS);   // iso 単位（cm）: x→X, z→Y(上), y→Z(手前)
const NOISE = `float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }`;
const THEMES = {
  dark:  { bg: 0x121314, body: 0x1b1c1f, lamp: 0x1a1d22, line: 0x4f5357, major: 0x393c3f, edge: 0x27292c, sky: 0xdde4ff, ground: 0x080808, hemi: 0.7, amb: 0, sun: 0.7, fill: 0.2, shadow: 0.7, fadeMin: 0.45 },
  light: { bg: 0xe9eaea, body: 0xf1f1f0, lamp: 0xd8dadb, line: 0x5d6266, major: 0x8a8f93, edge: 0xb9bcbf, sky: 0xffffff, ground: 0xe6e6e6, hemi: 0.9, amb: 1.6, sun: 0.35, fill: 0.15, shadow: 0.16, fadeMin: 0.8 },
};
const pal3 = theme => theme === 'light'
  ? { line: '#8e9397', detail: '#c3c6c8', recess: '#dcdddd', ink: '#6a6f73', inkHi: '#16181a', glassOff: '#e4e5e5', glassOn: '#f6ece2', hi: '#7a3a00', bg: '#f6f6f5' }
  : { line: '#4f5357', detail: '#2b2e30', recess: '#0f1011', ink: '#868b8f', inkHi: '#e6e8e9', glassOff: '#141516', glassOn: '#22170f', hi: '#ffd9a8', bg: '#121314' };

/* ---------- core ---------- */
function createCore(canvas, width, height, theme, accentHex, fontFamily) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(1); renderer.setSize(width, height, false);
  const scene = new THREE.Scene(); const T = THEMES[theme]; scene.background = new THREE.Color(T.bg);
  const accent = new THREE.Color(accentHex);
  const res = new THREE.Vector2(width, height);
  const bodyMat = new THREE.MeshStandardMaterial({ color: T.body, roughness: 0.9, metalness: 0.05, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
  const recessMat = new THREE.MeshStandardMaterial({ color: 0x0f1011, roughness: 0.95, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  const LINE_COL = new THREE.Color(T.line), MAJOR_COL = new THREE.Color(T.major), EDGE_COL = new THREE.Color(T.edge), BG_COL = new THREE.Color(T.bg);
  const lineOpts = { linewidth: 1, resolution: res, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -6 };
  const lineMat = new LineMaterial({ color: EDGE_COL, ...lineOpts }), majorMat = new LineMaterial({ color: MAJOR_COL, ...lineOpts });
  const accentLineMat = new LineMaterial({ color: accent.clone(), linewidth: 1, resolution: res, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -8 });
  const outlineMat = new THREE.ShaderMaterial({
    uniforms: { color: { value: LINE_COL.clone() }, thickness: { value: 0.5 }, res: { value: res } },
    vertexShader: `uniform float thickness; uniform vec2 res; void main() { vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); vec4 n = projectionMatrix * vec4(normalize(normalMatrix * normal), 0.0); vec2 d = length(n.xy) > 1e-5 ? normalize(n.xy) : vec2(0.0); p.xy += d * thickness * 2.0 / res * p.w; gl_Position = p; }`,
    fragmentShader: `uniform vec3 color; void main() { gl_FragColor = vec4(color, 1.0); }`, side: THREE.BackSide, polygonOffset: true, polygonOffsetFactor: 6, polygonOffsetUnits: 24 });
  const accentMats = [], glowMats = [], softGlows = [], meshes = [], caps = [], flashes = [], themeHooks = [];
  const capMat = () => { const m = new THREE.MeshStandardMaterial({ color: T.body, roughness: 0.9, side: THREE.DoubleSide, emissive: accent.clone(), emissiveIntensity: 0, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 }); caps.push(m); return m; };
  const fat = (arr, mat = lineMat) => new LineSegments2(new LineSegmentsGeometry().setPositions(arr), mat);
  const loopL = (pts, mat = majorMat) => { const out = []; for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; out.push(a.x, a.y, a.z, b.x, b.y, b.z); } return fat(out, mat); };
  function addOutline(m) { const o = new THREE.Mesh(m.geometry, outlineMat); o.userData.outline = true; m.add(o); }
  function glowPoints(positions, size) {
    const g = new THREE.BufferGeometry().setFromPoints(positions);
    const m = new THREE.ShaderMaterial({ uniforms: { color: { value: accent.clone() }, intensity: { value: 0 }, size: { value: size }, scale: { value: 1 }, light: { value: theme === 'light' ? 1 : 0 }, ortho: { value: 0 } },
      transparent: true, depthWrite: false, blending: theme === 'light' ? THREE.NormalBlending : THREE.AdditiveBlending, toneMapped: false,
      vertexShader: `uniform float size, scale, ortho; void main() { vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = ortho > 0.5 ? size * scale : size * scale / -mv.z; mv.xyz -= normalize(mv.xyz) * size * 0.5; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform vec3 color; uniform float intensity, light; ${NOISE} void main() { float d = length(gl_PointCoord - 0.5) * 2.0; if (d > 1.0) discard; float halo = exp(-d * d * 9.0) * (1.0 - d); float core = 1.0 - smoothstep(0.05, 0.12, d); float a = (halo * 0.7 + core * 0.9) * intensity + (hash(gl_FragCoord.xy) - 0.5) / 255.0; vec3 c = mix(color, vec3(1.0), core * 0.6 * (1.0 - light)); gl_FragColor = light > 0.5 ? vec4(c, clamp(a, 0.0, 1.0)) : vec4(c * max(a, 0.0), 1.0); }` });
    glowMats.push(m); return new THREE.Points(g, m);
  }
  function softMat(color, additive) {
    const m = new THREE.ShaderMaterial({ uniforms: { color: { value: new THREE.Color(color) }, opacity: { value: 0 } }, transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, toneMapped: false,
      vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `uniform vec3 color; uniform float opacity; varying vec2 vUv; ${NOISE} void main() { float d = length(vUv - 0.5) * 2.0; float a = smoothstep(1.0, 0.0, d); a *= a; a = a * opacity + (hash(gl_FragCoord.xy) - 0.5) / 255.0; gl_FragColor = vec4(color, max(a, 0.0)); }` });
    if (additive) softGlows.push(m); return m;
  }
  function roundRect(sh, x, y, w, h, r) { sh.moveTo(x + r, y); sh.lineTo(x + w - r, y); sh.quadraticCurveTo(x + w, y, x + w, y + r); sh.lineTo(x + w, y + h - r); sh.quadraticCurveTo(x + w, y + h, x + w - r, y + h); sh.lineTo(x + r, y + h); sh.quadraticCurveTo(x, y + h, x, y + h - r); sh.lineTo(x, y + r); sh.quadraticCurveTo(x, y, x + r, y); }
  function rbox(x, y, z, w, d, h, r = 0, mat = bodyMat, parent, { lines = true } = {}) {
    r = Math.max(0.01, Math.min(r, w / 2 - 0.01, d / 2 - 0.01));
    const sh = new THREE.Shape(); roundRect(sh, x, -(y + d), w, d, r);
    const g = new THREE.ExtrudeGeometry(sh, { depth: h, bevelEnabled: false, curveSegments: 10 }); g.rotateX(-Math.PI / 2); g.translate(0, z, 0); g.scale(TS, TS, TS);
    const m = new THREE.Mesh(g, mat); if (lines) { addOutline(m); meshes.push(m); } parent.add(m); return m;
  }
  function inset(x, y, z, w, d, r, parent) {
    const sh = new THREE.Shape(); roundRect(sh, x, -(y + d), w, d, Math.min(r, w / 2, d / 2));
    const g = new THREE.ShapeGeometry(sh, 12); g.rotateX(-Math.PI / 2); g.translate(0, z + 0.05, 0); g.scale(TS, TS, TS);
    const m = new THREE.Mesh(g, recessMat); parent.add(m); parent.add(loopL(sh.getPoints(12).map(p => W(p.x, -p.y, z + 0.06)), lineMat)); return m;
  }
  const seg = (arr, parent, mat = lineMat) => parent.add(fat(arr.flatMap(([a, b]) => [...W(...a).toArray(), ...W(...b).toArray()]), mat));
  function faceCanvas(kind, x, y, z, w, h, P, parent, transparent = false) {
    const c = document.createElement('canvas'); c.width = Math.round(w * P); c.height = Math.round(h * P);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w * TS, h * TS), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, transparent, depthWrite: !transparent, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -12 }));
    if (kind === 'top') { m.rotation.x = -Math.PI / 2; m.position.copy(W(x + w / 2, y + h / 2, z + 0.15)); } else { m.position.copy(W(x + w / 2, y + 0.3, z - h / 2)); }
    parent.add(m); return { c, x: c.getContext('2d'), tex, P, mesh: m };
  }
  function frontInset(parent, x, y, ztop, w, h, r) { const sh = new THREE.Shape(); roundRect(sh, 0, 0, w, h, Math.min(r, w / 2, h / 2)); const g = new THREE.ShapeGeometry(sh, 12); g.scale(TS, TS, TS); const m = new THREE.Mesh(g, recessMat); m.position.copy(W(x, y + 0.06, ztop - h)); parent.add(m); parent.add(loopL(sh.getPoints(12).map(p => W(x + p.x, y + 0.07, ztop - h + p.y)), lineMat)); return m; }
  function sideInset(parent, x, yRight, ztop, w, h, r) { const sh = new THREE.Shape(); roundRect(sh, 0, 0, w, h, Math.min(r, w / 2, h / 2)); const g = new THREE.ShapeGeometry(sh, 12); g.scale(TS, TS, TS); const m = new THREE.Mesh(g, recessMat); m.rotation.y = Math.PI / 2; m.position.copy(W(x + 0.06, yRight, ztop - h)); parent.add(m); parent.add(loopL(sh.getPoints(12).map(p => W(x + 0.07, yRight - p.x, ztop - h + p.y)), lineMat)); return m; }
  const polyLine = (pts, mat, parent) => { const out = []; for (let i = 0; i < pts.length - 1; i++) out.push(...W(...pts[i]).toArray(), ...W(...pts[i + 1]).toArray()); const l = fat(out, mat); parent.add(l); return l; };
  const plateWith = (g, w, d, screws, slot) => {
    rbox(0, 0, 0, w, d, 7, 14, bodyMat, g);
    { const sh = new THREE.Shape(); roundRect(sh, 9, -(9 + d - 18), w - 18, d - 18, 10); g.add(loopL(sh.getPoints(12).map(p => W(p.x, -p.y, 7.06)), lineMat)); }
    screws.forEach(([x, y]) => { const s = new THREE.Mesh(new THREE.CircleGeometry(3 * TS, 24), recessMat); s.rotation.x = -Math.PI / 2; s.position.copy(W(x, y, 7.05)); g.add(s); seg([[[x - 1.8, y, 7.2], [x + 1.8, y, 7.2]]], g); });
    if (slot) inset(slot[0], slot[1], 7, slot[2], 5, 2.5, g);
  };
  const hazeAndShadow = (g, cx, cy, w, d) => {
    const haze = softMat(0xffffff, true), shadow = softMat(0x000000, false);
    { const h = new THREE.Mesh(new THREE.PlaneGeometry(w * 1.2, d * 1.2), haze); h.rotation.x = -Math.PI / 2; h.position.copy(W(cx, cy, -0.5)); g.add(h); }
    { const h = new THREE.Mesh(new THREE.PlaneGeometry(w, d), shadow); h.rotation.x = -Math.PI / 2; h.position.copy(W(cx, cy + 4, -0.8)); g.add(h); }
    haze.uniforms.color.value.copy(accent); shadow.uniforms.opacity.value = theme === 'light' ? 0.12 : 0.5;   // 原作の図ごとの themeHook の値（T.shadow 0.7 はヘリ用）
    if (theme === 'light') { haze.blending = THREE.NormalBlending; haze.needsUpdate = true; }
    return haze;
  };
  // 折り目の線（原作 creaseInfo / creaseLines）
  function creaseInfo(geo) {
    if (geo.userData.crease) return geo.userData.crease;
    const src = new THREE.BufferGeometry().setAttribute('position', geo.attributes.position); if (geo.index) src.setIndex(geo.index);
    const g = mergeVertices(src, 1e-4); const p = g.attributes.position, ix = g.index.array, nV = p.count; const P = i => new THREE.Vector3().fromBufferAttribute(p, i);
    const faceN = [], edgeFaces = new Map();
    for (let f = 0; f < ix.length / 3; f++) { const a = ix[3 * f], b = ix[3 * f + 1], c = ix[3 * f + 2]; const n = new THREE.Vector3().crossVectors(P(b).sub(P(a)), P(c).sub(P(a))); faceN.push(n.lengthSq() > 1e-14 ? n.normalize() : null);
      for (const [u, v] of [[a, b], [b, c], [c, a]]) { if (u === v) continue; const k = Math.min(u, v) * nV + Math.max(u, v); (edgeFaces.get(k) || edgeFaces.set(k, []).get(k)).push(f); } }
    const edges = [];
    for (const [k, fs] of edgeFaces) { const a = Math.floor(k / nV), b = k % nV; const ns = fs.map(f => faceN[f]).filter(Boolean); let ang = 180; if (ns.length >= 2) { ang = 0; for (let i = 1; i < ns.length; i++) ang = Math.max(ang, THREE.MathUtils.radToDeg(ns[0].angleTo(ns[i]))); } else if (ns.length === 0) continue; const dir = P(b).sub(P(a)), len = dir.length(); if (len > 0) edges.push({ a, b, ang, dir: dir.divideScalar(len), len }); }
    const byVert = new Map(); edges.forEach((e, i) => { for (const v of [e.a, e.b]) (byVert.get(v) || byVert.set(v, []).get(v)).push(i); });
    return (geo.userData.crease = { p, edges, byVert });
  }
  function creaseLines(geo, thr) {
    const { p, edges, byVert } = creaseInfo(geo), low = thr * 0.55; const on = new Uint8Array(edges.length), queue = [];
    edges.forEach((e, i) => { if (e.ang >= thr) { on[i] = 1; queue.push(i); } });
    while (queue.length) { const i = queue.pop(), e = edges[i]; for (const [v, out] of [[e.a, -1], [e.b, 1]]) for (const j of byVert.get(v)) { if (on[j]) continue; const f = edges[j]; if (f.ang < low) continue; const d = f.dir.dot(e.dir) * (f.a === v ? 1 : -1) * out; if (d > 0.9) { on[j] = 1; queue.push(j); } } }
    const parent = new Map(), find = x => { while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x))); x = parent.get(x); } return x; };
    edges.forEach((e, i) => { if (!on[i]) return; for (const v of [e.a, e.b]) if (!parent.has(v)) parent.set(v, v); parent.set(find(e.a), find(e.b)); });
    const total = new Map(); edges.forEach((e, i) => { if (on[i]) { const r = find(e.a); total.set(r, (total.get(r) || 0) + e.len); } });
    const out = []; edges.forEach((e, i) => { if (on[i] && total.get(find(e.a)) >= 0.06) out.push(p.getX(e.a), p.getY(e.a), p.getZ(e.a), p.getX(e.b), p.getY(e.b), p.getZ(e.b)); }); return out;
  }
  const creases = first => { for (const m of meshes.slice(first)) { m.add(fat(creaseLines(m.geometry, 30), lineMat)); const mj = fat(creaseLines(m.geometry, 60), majorMat); mj.renderOrder = 1; m.add(mj); } };
  // 押しの沈みと余光（原作 flash / tickFlashes）。時刻は frame から
  function flash(g, nowMs, ms = 110) { const mats = []; g.traverse(o => { if (o.isMesh && o.material.emissive && caps.includes(o.material)) mats.push(o.material); }); flashes.push({ g, mats, t0: nowMs, ms }); }
  // 原作どおり userData.pressAxis（'y' = 上のボタンが沈む / 'z' = 前面のボタンが奥へ）と pressDepth を見る
  function tickFlashes(now) { for (let i = flashes.length - 1; i >= 0; i--) { const f = flashes[i], t = now - f.t0, down = t < f.ms, k = Math.max(0, 1 - t / (f.ms + 260)); const ax = f.g.userData.pressAxis || 'y'; f.g.position[ax] = down ? -(f.g.userData.pressDepth || 3) * TS : 0; f.mats.forEach(m => m.emissiveIntensity = Math.max(m.userData.base || 0, 1.4 * k)); if (t > f.ms + 260) { f.g.position[ax] = 0; f.mats.forEach(m => m.emissiveIntensity = m.userData.base || 0); flashes.splice(i, 1); } } }
  // 照明（原作と同じ 4 灯）
  const hemi = new THREE.HemisphereLight(T.sky, T.ground, T.hemi), ambient = new THREE.AmbientLight(0xffffff, T.amb), sun = new THREE.DirectionalLight(0xffffff, T.sun), fill = new THREE.DirectionalLight(0x8899bb, T.fill);
  sun.position.set(6, 14, 10); fill.position.set(-10, 4, -8); scene.add(hemi, ambient, sun, fill);
  // camera
  const persp = new THREE.PerspectiveCamera(28, width / height, 0.1, 400), ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 400);
  const fovK = () => 2 * Math.tan(THREE.MathUtils.degToRad(persp.fov / 2));
  // 線の太さと色の濃さは画面上の大きさで変える（原作 applyWeight）
  function applyWeight(camera, dist, orthoH) {
    const ppm = camera === ortho ? height * ortho.zoom / orthoH : height / (dist * fovK()); const k = THREE.MathUtils.clamp((ppm / 40 - 0.35) / 0.65, 0, 1); const fm = T.fadeMin, fade = fm + (1 - fm) * k;
    lineMat.linewidth = majorMat.linewidth = 1; accentLineMat.linewidth = 1.4; lineMat.color.copy(BG_COL).lerp(EDGE_COL, fade); majorMat.color.copy(BG_COL).lerp(MAJOR_COL, fade); outlineMat.uniforms.thickness.value = 0.5; outlineMat.uniforms.color.value.copy(BG_COL).lerp(LINE_COL, fade);
  }

  // ---- 追加 helper（原作の共通部より。他の図が使う） ----
  const labels = [];
  function label(text, w, h, size, place, parent, { spacing = 0, align = 'center' } = {}) {
    const P = 24, c = document.createElement('canvas'); c.width = Math.ceil(w * P); c.height = Math.ceil(h * P);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w * TS, h * TS), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false }));
    const draw = col => { const x = c.getContext('2d'); x.clearRect(0, 0, c.width, c.height); x.fillStyle = col; x.font = `${size * P}px ${fontFamily}`; x.textAlign = align; x.textBaseline = 'middle'; if (spacing) x.letterSpacing = `${spacing * P}px`; x.fillText(text, align === 'left' ? 0 : c.width / 2, c.height / 2 + size * P * 0.06); tex.needsUpdate = true; };
    draw(pal3(theme).ink); labels.push(draw); place(m); parent.add(m); return m;
  }
  const onTop = (cx, cy, z) => m => { m.rotation.x = -Math.PI / 2; m.position.copy(W(cx, cy, z + 0.12)); };
  const onFront = (cx, y, cz) => m => { m.position.copy(W(cx, y + 0.12, cz)); };
  function sideCanvas(x, yRight, ztop, w, h, P, parent, transparent = false) {
    const c = document.createElement('canvas'); c.width = Math.round(w * P); c.height = Math.round(h * P);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w * TS, h * TS), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, transparent, depthWrite: !transparent, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -12 }));
    m.rotation.y = Math.PI / 2; m.position.copy(W(x + 0.3, yRight - w / 2, ztop - h / 2)); parent.add(m); return { c, x: c.getContext('2d'), tex, P, mesh: m };
  }
  const frontUV = (x0, y, ztop) => (u, v, d = 0.08) => [x0 + u, y + d, ztop - v];
  const sideUV = (x, yRight, ztop) => (u, v, d = 0.08) => [x + d, yRight - u, ztop - v];
  const topUV = (x0, y0, z) => (u, v, d = 0.08) => [x0 + u, y0 + v, z + d];
  const slitsUV = (f, u0, u1, step, v0, v1, parent, vertical = true, skip = () => false) => { const s = []; for (let k = u0; k <= u1 + 1e-6; k += step) { if (skip(k)) continue; s.push(vertical ? [f(k, v0), f(k, v1)] : [f(v0, k), f(v1, k)]); } if (s.length) seg(s, parent); };
  const slitsFront = (x0, x1, step, y, z0, z1, parent) => { const s = []; for (let x = x0; x <= x1 + 1e-6; x += step) s.push([[x, y + 0.08, z0], [x, y + 0.08, z1]]); seg(s, parent); };
  const slitsFrontH = (z0, z1, step, y, x0, x1, parent) => { const s = []; for (let z = z0; z >= z1 - 1e-6; z -= step) s.push([[x0, y + 0.08, z], [x1, y + 0.08, z]]); seg(s, parent); };
  const slitsSide = (y0, y1, step, x, z0, z1, parent) => { const s = []; for (let y = y0; y >= y1 - 1e-6; y -= step) s.push([[x + 0.08, y, z0], [x + 0.08, y, z1]]); seg(s, parent); };
  const slitsTop = (y0, y1, step, z, x0, x1, parent) => { const s = []; for (let y = y0; y <= y1 + 1e-6; y += step) s.push([[x0, y, z + 0.08], [x1, y, z + 0.08]]); seg(s, parent); };
  const ledOffMat = new THREE.MeshBasicMaterial({ color: theme === 'light' ? 0xc3c6c8 : 0x2b2e30, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -12 });
  const dotFront = (x, y, z, r, parent, mat = ledOffMat) => { const m = new THREE.Mesh(new THREE.CircleGeometry(r * TS, 16), mat); m.position.copy(W(x, y + 0.15, z)); parent.add(m); return m; };
  const loopPts = (sh, map, n = 8) => sh.getPoints(n).map(p => W(...map(p.x, p.y)));
  const bezier = (P0, P1, P2, P3, n = 40) => Array.from({ length: n + 1 }, (_, i) => { const t = i / n; return P0.map((_, j) => (1 - t) ** 3 * P0[j] + 3 * (1 - t) ** 2 * t * P1[j] + 3 * (1 - t) * t * t * P2[j] + t ** 3 * P3[j]); });
  const cumLen = pts => pts.reduce((a, p, i) => (a.push(i ? a[i - 1] + Math.hypot(...p.map((v, j) => v - pts[i - 1][j])) : 0), a), []);
  const alongPts = (pts, cum, t) => { const d = t * cum[cum.length - 1]; let i = 1; while (i < cum.length - 1 && cum[i] < d) i++; const f = (d - cum[i - 1]) / (cum[i] - cum[i - 1] || 1); return pts[i - 1].map((v, j) => v + (pts[i][j] - v) * f); };
  const moveGlow = (gp, p, k) => { gp.geometry.attributes.position.setXYZ(0, ...W(...p).toArray()); gp.geometry.attributes.position.needsUpdate = true; gp.material.uniforms.intensity.value = k; };
  const screenBg = (cv, on, r = 2.5) => { const { x, P } = cv, Cp = pal3(theme), A_ = '#' + accent.getHexString(); x.clearRect(0, 0, cv.c.width, cv.c.height); x.fillStyle = on ? Cp.glassOn : Cp.glassOff; x.beginPath(); x.roundRect(0, 0, cv.c.width, cv.c.height, r * P); x.fill(); x.lineWidth = 0.25 * P; x.strokeStyle = on ? A_ : Cp.detail; x.stroke(); return { C: Cp, A_ }; };
  // ---- 時間（frame から）: 予定表と乱数、音の stub ----
  const timers = []; let tid = 0;
  const after = (ms, fn, now) => { const id = ++tid; timers.push({ id, at: (now || 0) + ms, fn, every: null }); return id; };
  const every = (ms, fn, now) => { const id = ++tid; timers.push({ id, at: (now || 0) + ms, fn, every: ms }); return id; };
  const clear = id => { const i = timers.findIndex(t => t.id === id); if (i >= 0) timers.splice(i, 1); };
  const runTimers = now => { for (let guard = 0; guard < 1000; guard++) { const due = timers.filter(t => t.at <= now + 1e-6).sort((a, b) => a.at - b.at)[0]; if (!due) break; if (due.every) due.at += due.every; else timers.splice(timers.indexOf(due), 1); due.fn(now); } };
  const resetTimers = () => { timers.length = 0; flashes.length = 0; };
  let seed = 20261012 >>> 0; const rng = () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const resetRng = s => { seed = (s >>> 0) || 1; };
  const stub = () => new Proxy(function () {}, { get: (_, k) => (k === 'then' ? undefined : (k === 'currentTime' ? 0 : (k === 'value' ? 0 : stub()))), set: () => true, apply: () => stub() });
  const SFX = stub(), ac = () => stub();

  // ---- 後処理（原作と同じ: 線形の HalfFloat MSAA 4 target → OutputPass（sRGB）→ ディザ）。無いと自作 shader（外形線・halo・haze・影）が線形値のまま暗く出る（Opus の指摘） ----
  // 作れなければ黙って旧経路に戻らず、例外にする（page が data-error になり撮影が止まる。Opus 再確認の指摘）。HalfFloat の render target が使えるかも先に確かめる
  const ext = renderer.extensions; if (!renderer.capabilities.isWebGL2 && !ext.has('OES_texture_half_float')) throw new Error('postfx: HalfFloat render target が使えない環境');
  const target = new THREE.WebGLRenderTarget(width, height, { samples: 4, type: THREE.HalfFloatType });
  const composer = new EffectComposer(renderer, target), renderPass = new RenderPass(scene, persp); composer.addPass(renderPass); composer.addPass(new OutputPass());
  composer.addPass(new ShaderPass({ uniforms: { tDiffuse: { value: null } }, vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform sampler2D tDiffuse; varying vec2 vUv; ${NOISE} void main() { vec4 c = texture2D(tDiffuse, vUv); c.rgb += (hash(gl_FragCoord.xy) - 0.5) / 255.0; gl_FragColor = c; }` }));
  composer.setSize(width, height);
  document.body.dataset.postfx = 'composer:halffloat-msaa4+output+dither';   // 撮影側（render.json / dump-dom）から後処理の有無が分かるように
  function render(cam) { renderPass.camera = cam; composer.render(); if (renderer.info.render.calls === 0) throw new Error('postfx: 描画が行われなかった'); }
  // ---- light theme（原作 setTheme）: glow・haze・pool を全部消し、accent で光る材料は accentFill で色を置く ----
  const accentFillU = { value: theme === 'light' ? 1 : 0 }, accentFilled = new WeakSet();
  function accentFill(root) {
    root.traverse(o => { const m = o.material; if (!m || !m.isMeshStandardMaterial || accentFilled.has(m) || m.emissive.getHex() === 0) return; accentFilled.add(m);
      m.onBeforeCompile = sh => { sh.uniforms.uAccentFill = accentFillU; sh.uniforms.uAccentC = { value: accent };
        sh.fragmentShader = 'uniform float uAccentFill; uniform vec3 uAccentC;\n' + sh.fragmentShader.replace('#include <opaque_fragment>', 'if ( uAccentFill > 0.5 ) { float am = max( uAccentC.r, max( uAccentC.g, uAccentC.b ) ); outgoingLight = mix( outgoingLight, uAccentC, clamp( max( emissive.r, max( emissive.g, emissive.b ) ) / ( 0.5 * am ), 0.0, 1.0 ) ); }\n#include <opaque_fragment>'); };
      m.needsUpdate = true; });
  }
  function finishBuild() {   // 図を組み終えた後に 1 回（scene が呼ぶ）: light theme の非表示と accentFill
    if (theme === 'light') { [...glowMats, ...softGlows].forEach(m => { m.visible = false; }); scene.traverse(o => { if (o.material && (glowMats.includes(o.material) || softGlows.includes(o.material))) o.visible = false; }); }
    accentFill(scene);
  }
  return { renderer, scene, accent, theme, T, bodyMat, recessMat, lineMat, majorMat, accentLineMat, capMat, fat, loopL, glowPoints, softMat, roundRect, rbox, inset, seg, faceCanvas, frontInset, sideInset, polyLine, plateWith, hazeAndShadow, creases, flash, tickFlashes, meshes, glowMats, persp, ortho, fovK, applyWeight, width, height, fontFamily, pal: pal3(theme),
    label, labels, onTop, onFront, sideCanvas, frontUV, sideUV, topUV, slitsUV, slitsFront, slitsFrontH, slitsSide, slitsTop, ledOffMat, dotFront, loopPts, bezier, cumLen, alongPts, moveGlow, screenBg, after, every, clear, runTimers, resetTimers, rng, resetRng, SFX, ac, flashes, caps, W, TS, THREE, roundRectShape: roundRect, render, finishBuild, composer: () => composer, addOutline };
}


G3.machines = G3.machines || {};

/* ---- machines: _shots ---- */
/* ---------- machines/_shots.js: camera の shot 列（外観 → 操作部へ寄り → 作動 → 全景）。studio/camera.js の poseAt と同じ契約 ----------
 * shots: [{ from, move, target: [x, y, z]（iso-cm）, zoom, orbit?（度）}]。from は昇順、最初の from は 0。move > 0 なら前の shot から ease で移動し、残りは hold。
 * standard() は雛形。各機械は寄りの先・倍率・移動コマ数・作動の shot を変えて、一律の反復にしない（読み取る間と速い移動・収束を使う）。 */
G3.Shots = (() => {
  const mid = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
  function poseAt(frame, list, ease) {
    let i = 0; for (let k = 0; k < list.length; k++) if (list[k].from <= frame) i = k;
    const cur = list[i], prev = list[Math.max(0, i - 1)], p = cur.move > 0 ? ease(Math.min(1, Math.max(0, frame - cur.from) / cur.move)) : 1;
    return { target: mid(prev.target, cur.target, p), zoom: prev.zoom + (cur.zoom - prev.zoom) * p, orbit: (prev.orbit || 0) + ((cur.orbit || 0) - (prev.orbit || 0)) * p, shot: cur };
  }
  // over: 全景の target、focus: 操作部の target。n: 総コマ数。action: 作動を見せる shot（任意 {from, move, target, zoom}）
  function standard(over, focus, { zoom = 1.6, t1 = 24, m1 = 28, action = null, m2 = 36, hold = 24, n = 240 } = {}) {
    const list = [{ id: 'overview', from: 0, move: 0, target: over, zoom: 1 }, { id: 'controls', from: t1, move: m1, target: focus, zoom }];
    if (action) list.push(Object.assign({ id: 'action' }, action));
    list.push({ id: 'wide', from: Math.max(t1 + m1 + 1, n - hold - m2), move: m2, target: over, zoom: 1 });
    return list;
  }
  return { poseAt, standard };
})();


/* ---- machines: _touch3d ---- */
/* ---------- machines/_touch3d.js: 3D の「触る」演出（原作に無い自作の提案演出。2D の isoglow-figures/touch.js と同じ契約を 3D に移す） ----------
 * 契約: G3.Touch3D.plan(script, fig, fps) → gestures[{ frame_onset, frame_contact, frame_press_end, frame_release, kind, target, pos(frame) → THREE.Vector3（world）}]
 *       G3.Touch3D.render(svg, gestures, frame, cam, width, height, accent) → overlay（SVG）を更新し { gesture, phase, px, py } を返す。frame と camera だけから決まる（実時間なし）
 *       G3.Touch3D.pick(ndcX, ndcY, cam, targets) → 対象の名前（Web の殻がクリックを台本 event にする入口）
 * 触る位置は world の anchor を camera で投影する（画面固定の座標は使わない。camera が動いても対象に追従する）。
 * 装置の反応は scene が同じ台本 event を同じ frame で dispatch する。指は event の frame に接触し、装置が先に動くことはない。
 * 図の側: targets（名前 → Object3D）を返す。既定の anchor は対象の bbox の上面中央。anchors[name](ev) が iso-cm の点を返せば優先。
 *         回す・引く・挿す・滑らせる は gestureOf(ev, fps) → { kind, press_frames, approach_frames, release_frames, pos(frame) → [x,y,z] iso-cm | Vector3 } で path を返す。
 * 見た目: 細い半透明の指先 silhouette + 接触点、接触の瞬間だけ短い ring（scene の accent）。巨大な手や中央の cursor で図形を隠さない。 */
G3.Touch3D = (() => {
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v)), easeOut = t => 1 - (1 - t) * (1 - t);
  const KINDS = ['tap', 'press', 'type', 'switch', 'lever', 'knob', 'rotate', 'drag', 'insert', 'hold'];
  function topOf(obj) { obj.updateWorldMatrix(true, true); const b = new THREE.Box3().setFromObject(obj); const c = b.getCenter(new THREE.Vector3()); return new THREE.Vector3(c.x, b.max.y, c.z); }
  const toV = p => (p && p.isVector3 ? p : W(...p));
  function plan(script, fig, fps) {
    const evs = (script || []).filter(e => e && e.type && e.type !== 'demo' && e.target).slice().sort((a, b) => a.frame - b.frame); const g = [];
    const APPROACH = Math.round(fps * 0.33), PRESS = Math.round(fps * 0.12), RELEASE = Math.round(fps * 0.25);
    evs.forEach(ev => {
      const name = ev.target; const custom = fig.gestureOf ? fig.gestureOf(ev, fps) : null;
      let kind, pos, press = PRESS, approach = APPROACH, release = RELEASE;
      if (custom) { kind = custom.kind || 'drag'; if (custom.press_frames != null) press = custom.press_frames; if (custom.approach_frames != null) approach = custom.approach_frames; if (custom.release_frames != null) release = custom.release_frames; pos = f => toV(custom.pos(f)); }
      else {
        const anchorFn = fig.anchors && fig.anchors[name], obj = fig.targets && fig.targets[name]; if (!anchorFn && !obj) return;
        kind = ev.kind || (fig.kinds && fig.kinds[name]) || 'tap'; if (kind === 'press' || kind === 'hold') press = Math.round(fps * 0.4);
        pos = () => (anchorFn ? toV(anchorFn(ev)) : topOf(obj));
      }
      if (!KINDS.includes(kind)) kind = 'tap';
      g.push({ frame_contact: ev.frame, frame_onset: ev.frame - approach, frame_press_end: ev.frame + press, frame_release: ev.frame + press + release, kind, target: name, pos, event_type: ev.type, side: (fig.touchSide && fig.touchSide[name]) || 'right' });
    });
    // 続けて触るときは、前の押し込みが終わってから次へ滑る（前の離れは次の接近に譲る）
    g.forEach((x, i) => { x.chain_prev = i > 0 && x.frame_onset <= g[i - 1].frame_release; if (x.chain_prev) { const pv = g[i - 1]; x.frame_onset = Math.max(x.frame_onset, pv.frame_press_end); pv.frame_release = Math.min(pv.frame_release, x.frame_onset); } });
    return g;
  }
  function project(p, cam, width, height) { const v = p.clone().project(cam); return { x: (v.x + 1) / 2 * width, y: (1 - v.y) / 2 * height, z: v.z }; }
  function render(svg, gestures, frame, cam, width, height, accent) {
    let active = null;
    gestures.forEach((x, i) => { if (frame >= x.frame_onset && frame <= x.frame_release) { const d = Math.abs(frame - x.frame_contact) - (frame >= x.frame_contact && frame <= x.frame_press_end ? 1000 : 0); if (!active || d < active.d) active = { x, i, d }; } });
    if (!active) { svg.innerHTML = ''; return null; }
    const { x, i } = active; const R = height * 0.012, dx = width * 0.07, dy = height * 0.09, sideK = x.side === 'left' ? -1 : 1;
    const pt = clamp((frame - x.frame_contact) / Math.max(1, x.frame_press_end - x.frame_contact), 0, 1);
    const at = f => project(x.pos(f), cam, width, height);
    let px, py, op = 0.85, press = 0;
    const fromOf = a0 => {
      if (x.chain_prev && gestures[i - 1]) { const pv = gestures[i - 1]; return at.call(null, pv.frame_press_end) && project(pv.pos(pv.frame_press_end), cam, width, height); }
      if (x.kind === 'type') return { x: a0.x, y: a0.y - height * 0.05 };
      if (x.kind === 'switch' || x.kind === 'lever') return { x: a0.x - R * 4 * sideK, y: a0.y + height * 0.03 };
      return { x: a0.x + dx * sideK, y: a0.y + dy };
    };
    if (frame < x.frame_contact) { const t = easeOut(clamp((frame - x.frame_onset) / Math.max(1, x.frame_contact - x.frame_onset), 0, 1)); const a0 = at(x.frame_contact), from = fromOf(a0); px = from.x + (a0.x - from.x) * t; py = from.y + (a0.y - from.y) * t; op = x.chain_prev ? 0.85 : 0.2 + 0.65 * t; }
    else if (frame <= x.frame_press_end) { press = 1; const a = at(frame); px = a.x; py = a.y; if (x.kind === 'type') py += R * 0.6 * (1 - Math.abs(2 * pt - 1)); }
    else { const t = clamp((frame - x.frame_press_end) / Math.max(1, x.frame_release - x.frame_press_end), 0, 1); const a1 = at(x.frame_press_end); const back = x.kind === 'type' ? { x: 0, y: -height * 0.03 } : { x: dx * 0.3 * sideK, y: dy * 0.3 }; px = a1.x + back.x * t; py = a1.y + back.y * t; op = 0.85 * (1 - t); }
    const since = frame - x.frame_contact, ring = since >= 0 && since < 8 ? since / 8 : null, k = press ? 0.92 : 1;
    const ang = (x.kind === 'type' ? -8 : (x.kind === 'switch' || x.kind === 'lever' ? -70 : -35)) * sideK, len = R * 7;
    svg.innerHTML = `<g transform="translate(${px.toFixed(2)} ${py.toFixed(2)})" opacity="${op.toFixed(3)}">
      <g transform="rotate(${ang}) scale(${k})"><path d="M0 0 m ${-R} 0 a ${R} ${R} 0 1 1 ${2 * R} 0 l ${R * 0.35} ${len} a ${R * 1.35} ${R * 0.6} 0 0 1 ${-2.7 * R} 0 z" fill="#ffffff" fill-opacity="0.16" stroke="${accent}" stroke-opacity="0.55" stroke-width="1"/></g>
      <circle r="${(R * 0.42).toFixed(2)}" fill="${accent}" fill-opacity="${press ? 0.5 : 0.3}"/>
      ${ring !== null ? `<circle r="${(R * (0.6 + 2.2 * ring)).toFixed(2)}" fill="none" stroke="${accent}" stroke-opacity="${(0.8 * (1 - ring)).toFixed(2)}" stroke-width="1.2"/>` : ''}
    </g>`;
    return { gesture: i, phase: frame < x.frame_contact ? 'approach' : (press ? 'press' : 'release'), kind: x.kind, target: x.target, px: Math.round(px), py: Math.round(py) };
  }
  function pick(nx, ny, cam, targets) {
    const rc = new THREE.Raycaster(); rc.camera = cam; rc.setFromCamera(new THREE.Vector2(nx, ny), cam); rc.params.Line2 = { threshold: 0 };
    const names = Object.keys(targets || {}); const hits = rc.intersectObjects(names.map(n => targets[n]), true); if (!hits.length) return null;
    let o = hits[0].object; while (o) { const n = names.find(k => targets[k] === o); if (n) return n; o = o.parent; } return null;
  }
  return { plan, render, pick, KINDS };
})();


/* ---- machines: camera ---- */
/* ---------- machines.camera: デジタルカメラ（暫定実機 FUJIFILM X100VI 系のレンズ一体型・固定焦点。reports/references/real-machines/camera.json）----------
 * 形: 横長ボディ（金属の天板・底板 + 貼り革の胴）、前面やや右寄りの固定鏡筒（繰り出し・ズーム無し。根元の絞りリング + 前方のコントロールリング + 前枠 + 前玉のガラス）、
 *     上面の シャッター速度ダイヤル・露出補正ダイヤル・シャッターボタン（同軸の ON/OFF カラー）・ホットシュー、前面左上のファインダー窓、背面の LCD（canvas）。
 * 機構（実機に存在する動作だけ）: 電源 ON（カラーが回り LCD が点く）/ 絞りリング（1/3 EV のクリック刻みに比例した角度で回り、前玉の奥の開口が変わる）/
 *     シャッター半押し（AF 枠）→ 全押し（レンズシャッターが瞬間閉じ、LCD が黒くなって戻る）。
 * 寸法・位置は MM 表（実寸 mm）に集約し、K 倍で iso-cm にする。ユーザー所有機が判明したら MM を差し替える（provisional_slot）。推定の値は MM のコメントに「推定」と書く。
 * 文言・ロゴは自前（メーカー名・型番を描かない）。 */
G3.machines.camera = function (C, opts) {
  const { rbox, seg, faceCanvas, softMat, glowPoints, hazeAndShadow, creases, loopL, lineMat, majorMat, accentLineMat, bodyMat, recessMat, capMat, accent, scene, plateWith, frontInset } = C;
  const PHOTO = opts && opts.material === 'photo';
  // ---- 定数表（mm。資料の値と推定を分ける） ----
  const MM = {
    W: 128.0, H: 74.8, D: 33.2,          // 公式: 幅・高さ・最薄部の奥行
    LENS_OUT: 22.1,                       // 公式の差分 55.3 − 33.2（鏡筒先端が最厚部とは限らない）
    R_AP: 21.0, R_CTRL: 18.5, R_FRONT: 16.0, BORE: 13.0, // 鏡筒の半径（絞りリング・コントロールリング・前枠・前枠の内径）: 推定
    L_FLANGE: 3.0, L_AP: 7.0, L_CTRL: 6.0, L_FRONT: 6.1, // 鏡筒の各段の長さ（合計 = LENS_OUT）: 推定
    LENS_CX: 0.44, LENS_CZ: 0.47,         // 鏡筒中心（幅・高さに対する比。正面視でやや左 = 撮影者の右寄り）: 推定
    TOP_H: 14.0, BOT_H: 8.0,              // 天板・底板の高さ: 推定
    SS_CX: 0.34, SS_R: 10.5, SS_H: 4.0,   // シャッター速度ダイヤル（位置比・半径・高さ。x は正面視で左 = 撮影者の右手側）: 推定
    EV_CX: 0.07, EV_R: 7.0, EV_H: 3.2, EV_DY: -6.0, // 露出補正ダイヤル: 推定
    SH_CX: 0.19, SH_R: 4.6, SH_H: 2.6, COLLAR_R: 7.6, COLLAR_H: 2.2, SH_DY: 3.0, // シャッターボタンと ON/OFF カラー: 推定
    SHOE_W: 21.0, SHOE_D: 19.0, SHOE_H: 2.4, // ホットシュー: 推定
    VF_X: 9.0, VF_TOP: 6.0, VF_W: 10.5, VF_H: 8.0, // ファインダー窓（右端からの距離。正面視で右上 = 撮影者の左上、接眼部と同じ側）: 推定
    EYE_X: 8.0, EYE_W: 16.0, EYE_H: 10.0, EYE_TOP: 3.0, // 背面の接眼部（右端からの距離 = 撮影者の左）: 推定
    LCD_X: 4.0, LCD_BOT: 7.0, LCD_W: 64.0, LCD_H: 43.0, // 3.0 型 3:2（公式。右端からの距離 = 撮影者の左寄り。位置は推定）
    FCD_CX: 0.10, FCD_R: 4.0, FCD_OUT: 1.6, FCD_TOP: 9.0, // フロントコマンドダイヤル: 推定
    FOCAL: 23.0,                          // 公式: 23 mm F2
  };
  const K = 1.1;                          // 倍率（実寸 mm → iso-cm = mm × 1.1 / 10 × 10。板 300×268 に合わせた見やすさ）
  const u = mm => mm * K;
  const F_STOPS = [2, 2.2, 2.5, 2.8, 3.2, 3.5, 4, 4.5, 5, 5.6, 6.3, 7.1, 8, 9, 10, 11, 13, 14, 16];   // 1/3 EV 刻み（公式の値域 F2〜F16）
  const CLICK_MS = 55, STEP_DEG = 8, AP_BLADES = 9;   // 1 クリックの時間・角度・羽根の枚数: 推定（資料なし）
  const SHUTTER_CLOSE_MS = 130, LCD_BLACK_MS = 250, REVIEW_MS = 700, AF_HOLD_MS = 2400;   // 推定（X100F の第三者実測 0.246 s を参考）
  const SS_TEXT = '1/250', ISO_TEXT = 'ISO 125';    // 機能語のみ

  // ---- 材料（line: 原作テイストの暗い色 / photo: 黒ボディ・シルバー天板に寄せる） ----
  const std = o => new THREE.MeshStandardMaterial(Object.assign({ side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 }, o));
  const metalMat = PHOTO ? std({ color: 0xb9bcc0, metalness: 0.85, roughness: 0.3 }) : std({ color: 0x30333a, metalness: 0.65, roughness: 0.35 });
  const leatherMat = PHOTO ? std({ color: 0x111214, metalness: 0.0, roughness: 0.95 }) : std({ color: 0x1c1d21, metalness: 0.0, roughness: 0.95 });
  const rubberMat = std({ color: 0x0c0d0e, metalness: 0.0, roughness: 1.0 });
  const barrelMat = PHOTO ? std({ color: 0x1a1b1e, metalness: 0.7, roughness: 0.3 }) : std({ color: 0x24262b, metalness: 0.6, roughness: 0.4 });
  const glassMat = new THREE.MeshStandardMaterial({ color: PHOTO ? 0x6fa0c0 : 0x7fb4cc, metalness: 0.1, roughness: 0.05, transparent: true, opacity: PHOTO ? 0.3 : 0.24, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
  const LINES = !PHOTO;
  const box = (x, y, z, w, d, h, r, mat, parent) => rbox(x, y, z, w, d, h, r, mat, parent, { lines: LINES });
  const outline = m => { if (LINES) C.addOutline(m); return m; };
  const circlePts = (cx, cy, cz, r, axis, n = 48) => Array.from({ length: n }, (_, i) => { const a = i / n * Math.PI * 2; return axis === 'y' ? W(cx + r * Math.cos(a), cy, cz + r * Math.sin(a)) : W(cx + r * Math.cos(a), cy + r * Math.sin(a), cz); });
  const rim = (parent, cx, cy, cz, r, axis, mat = lineMat) => { if (LINES) parent.add(loopL(circlePts(cx, cy, cz, r, axis), mat)); };

  const g0 = new THREE.Group(); scene.add(g0); const first = C.meshes.length;
  plateWith(g0, 230, 180, [[16, 16], [214, 16], [16, 164], [214, 164]], null);   // 板は機械に合わせて小さめ（全景で機械が読める大きさに）
  // ---- ボディ ----
  const PZ = 7, BW = u(MM.W), BH = u(MM.H), BD = u(MM.D), X0 = 115 - BW / 2, Y0 = 66, YF = Y0 + BD, ZT = PZ + BH;
  const body = new THREE.Group(); g0.add(body);
  box(X0, Y0, PZ, BW, BD, u(MM.BOT_H), 5, metalMat, body);                                   // 底板（金属）
  box(X0 + 0.3, Y0 + 0.7, PZ + u(MM.BOT_H), BW - 0.6, BD - 1.4, BH - u(MM.BOT_H) - u(MM.TOP_H), 4.5, leatherMat, body);   // 胴（貼り革。前後に 0.7 の段差）
  box(X0, Y0, ZT - u(MM.TOP_H), BW, BD, u(MM.TOP_H), 5, metalMat, body);                      // 天板（金属）
  if (LINES) { // 貼り革の縦の継目（左右のパネル境）と前面の細い線
    const zl = PZ + u(MM.BOT_H) + 1, zh = ZT - u(MM.TOP_H) - 1;
    seg([[[X0 + BW * 0.72, YF - 0.7 + 0.08, zl], [X0 + BW * 0.72, YF - 0.7 + 0.08, zh]], [[X0 + BW * 0.72, Y0 + 0.7 - 0.08, zl], [X0 + BW * 0.72, Y0 + 0.7 - 0.08, zh]]], body);
  }
  // ホットシュー（天板中央）
  { const sw = u(MM.SHOE_W), sd = u(MM.SHOE_D), sx = X0 + BW / 2 - sw / 2, sy = Y0 + BD / 2 - sd / 2;
    box(sx, sy, ZT, sw, sd, u(MM.SHOE_H), 0.8, metalMat, body);
    if (LINES) seg([[[sx + 2, sy + 1, ZT + u(MM.SHOE_H) + 0.08], [sx + 2, sy + sd - 1, ZT + u(MM.SHOE_H) + 0.08]], [[sx + sw - 2, sy + 1, ZT + u(MM.SHOE_H) + 0.08], [sx + sw - 2, sy + sd - 1, ZT + u(MM.SHOE_H) + 0.08]]], body); }
  // ファインダー窓（前面左上。暗い窪み + 半透明のガラス）
  { const vx = X0 + BW - u(MM.VF_X) - u(MM.VF_W), vt = ZT - u(MM.VF_TOP), vw = u(MM.VF_W), vh = u(MM.VF_H);
    frontInset(body, vx, YF, vt, vw, vh, 1.2);
    const gl = new THREE.Mesh(new THREE.PlaneGeometry(vw * TS * 0.9, vh * TS * 0.9), glassMat); gl.position.copy(W(vx + vw / 2, YF + 0.2, vt - vh / 2)); body.add(gl); }
  // 背面: 接眼部（ゴム）と LCD
  const lcdCx = X0 + BW - u(MM.LCD_X) - u(MM.LCD_W) / 2, lcdCz = PZ + u(MM.LCD_BOT) + u(MM.LCD_H) / 2, lcdW = u(MM.LCD_W), lcdH = u(MM.LCD_H);
  { const ex = X0 + BW - u(MM.EYE_X) - u(MM.EYE_W), ew = u(MM.EYE_W), eh = u(MM.EYE_H); box(ex, Y0 - 2.0, ZT - u(MM.EYE_TOP) - eh, ew, 2.0, eh, 1.5, rubberMat, body);
    // LCD の枠（背面から 0.6 浮く板）
    box(lcdCx - lcdW / 2 - 1.5, Y0 - 0.6, lcdCz - lcdH / 2 - 1.5, lcdW + 3, 0.6, lcdH + 3, 1.2, barrelMat, body); }
  const lcd = faceCanvas('front', lcdCx - lcdW / 2, Y0, lcdCz + lcdH / 2, lcdW, lcdH, 8, body);
  lcd.mesh.rotation.y = Math.PI; lcd.mesh.position.copy(W(lcdCx, Y0 - 0.95, lcdCz));          // 背面向き（−y）に置き直す
  const lcdHalo = softMat(0xffffff, true); lcdHalo.uniforms.color.value.copy(accent);
  { const h = new THREE.Mesh(new THREE.PlaneGeometry(lcdW * TS * 1.3, lcdH * TS * 1.3), lcdHalo); h.rotation.y = Math.PI; h.position.copy(W(lcdCx, Y0 - 1.6, lcdCz)); body.add(h); }
  // ---- 鏡筒（前面から外へ: フランジ → 絞りリング → コントロールリング → 前枠。軸は iso y） ----
  const LX = X0 + BW * MM.LENS_CX, LZ = PZ + BH * MM.LENS_CZ;
  const cylZ = (r, len, mat, open = false, n = 56) => { const g = new THREE.CylinderGeometry(r * TS, r * TS, len * TS, n, 1, open); g.rotateX(Math.PI / 2); return new THREE.Mesh(g, mat); };
  const ringZ = (rIn, rOut, mat, n = 56) => new THREE.Mesh(new THREE.RingGeometry(rIn * TS, rOut * TS, n), mat);
  const knurl = (parent, r, len, n, mat = lineMat) => { if (!LINES) return; const a = []; for (let i = 0; i < n; i++) { const t = i / n * Math.PI * 2, x = r * Math.cos(t), z = r * Math.sin(t); a.push(...W(x, -len / 2 + 0.6, z).toArray(), ...W(x, len / 2 - 0.6, z).toArray()); } parent.add(C.fat(a, mat)); };
  let y = YF;
  { const m = cylZ(u(MM.R_AP) + 1.2, u(MM.L_FLANGE), barrelMat); m.position.copy(W(LX, y + u(MM.L_FLANGE) / 2, LZ)); body.add(outline(m)); rim(body, LX, y + u(MM.L_FLANGE), LZ, u(MM.R_AP) + 1.2, 'y');
    if (LINES) seg([[[LX, y + u(MM.L_FLANGE) + 0.1, LZ + u(MM.R_AP) + 1.3], [LX, y + u(MM.L_FLANGE) + 0.1, LZ + u(MM.R_AP) - 0.6]]], body, accentLineMat);   // 絞りの指標（固定）
    y += u(MM.L_FLANGE); }
  const apRing = new THREE.Group(); apRing.position.copy(W(LX, y + u(MM.L_AP) / 2, LZ)); body.add(apRing);   // 絞りリング（回る）
  { const m = cylZ(u(MM.R_AP), u(MM.L_AP), barrelMat); apRing.add(outline(m)); knurl(apRing, u(MM.R_AP) + 0.05, u(MM.L_AP), 40);
    if (LINES) { apRing.add(loopL(circlePts(0, u(MM.L_AP) / 2, 0, u(MM.R_AP), 'y'), lineMat)); apRing.add(loopL(circlePts(0, -u(MM.L_AP) / 2, 0, u(MM.R_AP), 'y'), lineMat)); }
    // リングの指標（accent の短い線。回転が見える）
    const a = [...W(0, u(MM.L_AP) / 2 + 0.12, u(MM.R_AP) + 0.1).toArray(), ...W(0, u(MM.L_AP) / 2 + 0.12, u(MM.R_AP) - 2.4).toArray()]; apRing.add(C.fat(a, accentLineMat));
    y += u(MM.L_AP); }
  const apRingY = y - u(MM.L_AP) / 2;
  { const m = cylZ(u(MM.R_CTRL), u(MM.L_CTRL), barrelMat); m.position.copy(W(LX, y + u(MM.L_CTRL) / 2, LZ)); body.add(outline(m)); knurl(m, u(MM.R_CTRL) + 0.05, u(MM.L_CTRL), 48, majorMat);
    rim(body, LX, y + u(MM.L_CTRL), LZ, u(MM.R_CTRL), 'y'); y += u(MM.L_CTRL); }
  const yFront = y + u(MM.L_FRONT);
  { const side = cylZ(u(MM.R_FRONT), u(MM.L_FRONT), barrelMat, true); side.position.copy(W(LX, y + u(MM.L_FRONT) / 2, LZ)); body.add(outline(side));
    const face = ringZ(u(MM.BORE), u(MM.R_FRONT), barrelMat); face.position.copy(W(LX, yFront, LZ)); body.add(face);
    const bore = cylZ(u(MM.BORE), u(MM.L_FRONT) + 4.0, recessMat, true); bore.position.copy(W(LX, yFront - (u(MM.L_FRONT) + 4.0) / 2, LZ)); body.add(bore);
    rim(body, LX, yFront, LZ, u(MM.R_FRONT), 'y'); rim(body, LX, yFront, LZ, u(MM.BORE), 'y', majorMat); rim(body, LX, y, LZ, u(MM.R_FRONT), 'y'); }
  // 前玉（半透明のガラス）と、その奥の絞り（canvas: 多角形の開口 = 推定）
  const glass = ringZ(0.001, u(MM.BORE) - 0.3, glassMat); glass.position.copy(W(LX, yFront - 1.5, LZ)); body.add(glass);
  const apSize = (u(MM.BORE) - 0.6) * 2;
  const apCv = faceCanvas('front', LX - apSize / 2, yFront - 6.0, LZ + apSize / 2, apSize, apSize, 10, body, true);
  // ---- 天板の操作部 ----
  const cylY = (r, h, mat, n = 56) => new THREE.Mesh(new THREE.CylinderGeometry(r * TS, r * TS, h * TS, n), mat);
  const dialAt = (cx, cy, r, h, nk, withTicks) => {
    const g = new THREE.Group(); g.position.copy(W(cx, cy, ZT + h / 2)); body.add(g);
    const m = cylY(r, h, metalMat); g.add(outline(m));   // ローレットは縦軸なので下で描く
    if (LINES) { g.add(loopL(circlePts(0, 0, h / 2, r, 'z'), lineMat)); g.add(loopL(circlePts(0, 0, -h / 2, r, 'z'), lineMat));
      const a = []; for (let i = 0; i < nk; i++) { const t = i / nk * Math.PI * 2, x = r * Math.cos(t), yy = r * Math.sin(t); a.push(...W(x, yy, -h / 2 + 0.5).toArray(), ...W(x, yy, h / 2 - 0.5).toArray()); } g.add(C.fat(a, lineMat));
      if (withTicks) { const t2 = []; for (let i = 0; i < 12; i++) { const t = i / 12 * Math.PI * 2, c = Math.cos(t), s = Math.sin(t); t2.push(...W((r - 3.2) * c, (r - 3.2) * s, h / 2 + 0.1).toArray(), ...W((r - 1.4) * c, (r - 1.4) * s, h / 2 + 0.1).toArray()); } g.add(C.fat(t2, majorMat)); } }
    return g;
  };
  const ssDial = dialAt(X0 + BW * MM.SS_CX, Y0 + BD / 2, u(MM.SS_R), u(MM.SS_H), 36, true);          // シャッター速度ダイヤル
  { const a = [...W(0, u(MM.SS_R) - 1.2, u(MM.SS_H) / 2 + 0.12).toArray(), ...W(0, u(MM.SS_R) - 3.6, u(MM.SS_H) / 2 + 0.12).toArray()]; ssDial.add(C.fat(a, accentLineMat)); }
  const evDial = dialAt(X0 + BW * MM.EV_CX, Y0 + BD / 2 + u(MM.EV_DY), u(MM.EV_R), u(MM.EV_H), 28, true);   // 露出補正ダイヤル
  // シャッターボタン（同軸の ON/OFF カラー）
  const shX = X0 + BW * MM.SH_CX, shY = Y0 + BD / 2 + u(MM.SH_DY);
  const collar = new THREE.Group(); collar.position.copy(W(shX, shY, ZT)); body.add(collar);
  { const m = cylY(u(MM.COLLAR_R), u(MM.COLLAR_H), metalMat); m.position.y = u(MM.COLLAR_H) / 2 * TS; collar.add(outline(m));
    if (LINES) collar.add(loopL(circlePts(0, 0, u(MM.COLLAR_H), u(MM.COLLAR_R), 'z'), lineMat));
    box(-1.3, u(MM.COLLAR_R) - 1.0, 0, 2.6, 4.2, u(MM.COLLAR_H) + 0.6, 0.6, metalMat, collar);     // レバー（手前へ出る。ON で回る: 形は推定）
    if (LINES) seg([[[-3.5, 0, u(MM.COLLAR_H) + 0.1], [3.5, 0, u(MM.COLLAR_H) + 0.1]]], collar, majorMat); }
  const btnPivot = new THREE.Group(); btnPivot.position.copy(W(shX, shY, ZT + u(MM.COLLAR_H))); body.add(btnPivot);
  const btn = new THREE.Group(); btnPivot.add(btn);   // 沈みは btn.position.y（pivot は動かさない）
  const btnMat = capMat(); btnMat.metalness = PHOTO ? 0.8 : 0.5; btnMat.roughness = 0.35; if (PHOTO) btnMat.color.setHex(0xb9bcc0);
  { const m = cylY(u(MM.SH_R), u(MM.SH_H), btnMat); m.position.y = u(MM.SH_H) / 2 * TS; btn.add(outline(m)); if (LINES) btn.add(loopL(circlePts(0, 0, u(MM.SH_H), u(MM.SH_R), 'z'), lineMat)); }
  // フロントコマンドダイヤル（前面右上。回す演出は無し）
  { const m = cylZ(u(MM.FCD_R), u(MM.FCD_OUT) * 2, metalMat); m.position.copy(W(X0 + BW * MM.FCD_CX, YF, ZT - u(MM.FCD_TOP))); body.add(outline(m)); rim(body, X0 + BW * MM.FCD_CX, YF + u(MM.FCD_OUT), ZT - u(MM.FCD_TOP), u(MM.FCD_R), 'y'); }
  const haze = hazeAndShadow(g0, 115, 86, 1.8, 1.2); if (LINES) creases(first);

  // ---- 状態（frame から決まる。実時間を持たない） ----
  const st = { on: false, ap: 0, apFrom: 0, apTo: 0, apT0: -1, af: false, afT0: -1, shotT0: -1, half: false, lastLcd: '', lastAp: '' };
  const smooth = f => f * f * (3 - 2 * f);
  // 絞りリングの角度（度）: クリック刻みに比例。t = dispatch からの ms。finger の gestureOf も同じ式を使う
  function apAngleAt(from, to, t) { const clicks = Math.abs(to - from); if (clicks === 0) return from * STEP_DEG; const k = Math.max(0, t) / CLICK_MS, i = Math.floor(k), f = k - i; const prog = Math.min(clicks, i + smooth(Math.min(1, f))); return (from + Math.sign(to - from) * prog) * STEP_DEG; }
  function apIndexNow(now) { if (st.apT0 < 0) return st.ap; const t = now - st.apT0, clicks = Math.abs(st.apTo - st.apFrom); const done = Math.min(clicks, Math.floor(t / CLICK_MS + 1e-9)); return st.apFrom + Math.sign(st.apTo - st.apFrom) * done; }
  function idxOf(F) { let best = 0, bd = 1e9; F_STOPS.forEach((f, i) => { const d = Math.abs(f - F); if (d < bd) { bd = d; best = i; } }); return best; }
  function fnum(i) { const v = F_STOPS[Math.max(0, Math.min(F_STOPS.length - 1, i))]; return 'F' + (Number.isInteger(v) ? v.toFixed(1) : String(v)); }
  function drawAperture(idx, closed) {
    const key = idx + ':' + (closed ? 1 : 0); if (key === st.lastAp) return; st.lastAp = key;
    const { x, P, c } = apCv, S = c.width, cx = S / 2, cy = S / 2; x.clearRect(0, 0, S, S);
    const rBore = (u(MM.BORE) - 0.6) * P;                                      // 開口の半径 = 入射瞳 23/F の半分（mm）を K 倍
    const rHole = closed ? 0 : (MM.FOCAL / F_STOPS[idx] / 2) * K * P;
    x.fillStyle = '#0a0b0c'; x.beginPath(); x.arc(cx, cy, rBore, 0, Math.PI * 2); x.fill();   // 羽根の面（暗い）
    // 羽根の面: 多角形の各辺から外周へ伸びる暗い面（各頂点から外周へ、接線寄りの角度で羽根の縁の線を引く）
    const rot = THREE.MathUtils.degToRad(idx * STEP_DEG * 0.5), verts = [];
    for (let i = 0; i < AP_BLADES; i++) { const a = i / AP_BLADES * Math.PI * 2 - Math.PI / 2 + rot; verts.push([cx + rHole * Math.cos(a), cy + rHole * Math.sin(a), a]); }
    x.fillStyle = '#131517'; x.beginPath(); x.arc(cx, cy, rBore, 0, Math.PI * 2); x.fill();
    x.strokeStyle = 'rgba(150,165,175,0.3)'; x.lineWidth = 0.1 * P;
    verts.forEach(([vx, vy, a]) => { const b = a + 0.75; x.beginPath(); x.moveTo(vx, vy); x.lineTo(cx + rBore * Math.cos(b), cy + rBore * Math.sin(b)); x.stroke(); });
    if (rHole > 0.5) { x.fillStyle = PHOTO ? '#2a4150' : '#223844'; x.beginPath(); verts.forEach(([vx, vy], i) => i ? x.lineTo(vx, vy) : x.moveTo(vx, vy)); x.closePath(); x.fill();
      x.strokeStyle = 'rgba(190,210,220,0.5)'; x.lineWidth = 0.14 * P; x.stroke();
      // 奥のガラスの反射（小さな弧）
      x.strokeStyle = 'rgba(255,255,255,0.18)'; x.lineWidth = 0.1 * P; x.beginPath(); x.arc(cx, cy, rHole * 0.6, Math.PI * 1.15, Math.PI * 1.45); x.stroke(); }
    apCv.tex.needsUpdate = true;
  }
  function drawLcd(now) {
    const on = st.on, black = st.shotT0 >= 0 && now - st.shotT0 < LCD_BLACK_MS, review = st.shotT0 >= 0 && !black && now - st.shotT0 < REVIEW_MS, idx = apIndexNow(now);
    const key = [on, black, review, st.af, idx].join(':'); if (key === st.lastLcd) return; st.lastLcd = key;
    const { x, P, c } = lcd, Wd = c.width, Hd = c.height, Cp = C.pal, A_ = '#' + accent.getHexString(); x.clearRect(0, 0, Wd, Hd);
    x.fillStyle = on && !black ? '#0d1317' : Cp.glassOff; x.beginPath(); x.roundRect(0, 0, Wd, Hd, 1.2 * P); x.fill(); x.lineWidth = 0.25 * P; x.strokeStyle = on ? A_ : Cp.detail; x.stroke();
    if (!on || black) { lcd.tex.needsUpdate = true; return; }
    // ライブビュー: 地平線と簡素な被写体（自前の図形。写真を写さない）
    const g = x.createLinearGradient(0, 0, 0, Hd * 0.62); g.addColorStop(0, '#1b2a33'); g.addColorStop(1, '#101a20'); x.fillStyle = g; x.fillRect(0.04 * Wd, 0.06 * Hd, 0.92 * Wd, 0.56 * Hd);
    x.fillStyle = '#0c1114'; x.fillRect(0.04 * Wd, 0.62 * Hd, 0.92 * Wd, 0.22 * Hd);
    x.fillStyle = '#243540'; x.fillRect(0.30 * Wd, 0.34 * Hd, 0.14 * Wd, 0.28 * Hd); x.fillRect(0.48 * Wd, 0.26 * Hd, 0.10 * Wd, 0.36 * Hd); x.fillRect(0.62 * Wd, 0.40 * Hd, 0.18 * Wd, 0.22 * Hd);
    x.strokeStyle = 'rgba(230,232,233,0.35)'; x.lineWidth = 0.08 * P; x.beginPath(); x.moveTo(0.04 * Wd, 0.62 * Hd); x.lineTo(0.96 * Wd, 0.62 * Hd); x.stroke();
    // AF 枠（半押しで accent。待機中は細い中立の枠）
    const fw = 0.16 * Wd, fh = 0.2 * Hd; x.lineWidth = (st.af ? 0.3 : 0.15) * P; x.strokeStyle = st.af ? A_ : 'rgba(230,232,233,0.45)'; x.strokeRect(0.5 * Wd - fw / 2, 0.44 * Hd - fh / 2, fw, fh);
    if (review) { x.lineWidth = 0.35 * P; x.strokeStyle = '#e6e8e9'; x.strokeRect(0.04 * Wd, 0.06 * Hd, 0.92 * Wd, 0.78 * Hd); }
    // 下段の情報（機能語のみ）
    x.fillStyle = Cp.inkHi; x.font = `${3.6 * P}px ${C.fontFamily}`; x.textBaseline = 'middle';
    x.fillText(fnum(idx), 0.06 * Wd, 0.92 * Hd); x.fillText(SS_TEXT, 0.40 * Wd, 0.92 * Hd); x.fillText(ISO_TEXT, 0.68 * Wd, 0.92 * Hd);
    if (st.af) { x.fillStyle = A_; x.fillRect(0.90 * Wd, 0.89 * Hd, 0.05 * Wd, 0.06 * Hd); }
    lcd.tex.needsUpdate = true;
  }
  function renderStatic(now) { collar.rotation.y = st.on ? -THREE.MathUtils.degToRad(32) : 0; drawLcd(now); }
  function reset() {
    Object.assign(st, { on: false, ap: 0, apFrom: 0, apTo: 0, apT0: -1, af: false, afT0: -1, shotT0: -1, half: false, lastLcd: '', lastAp: '' });
    haze.uniforms.opacity.value = 0; lcdHalo.uniforms.opacity.value = 0; apRing.rotation.z = 0; btn.position.y = 0; btnMat.emissiveIntensity = 0; renderStatic(0); drawAperture(0, false);
  }
  function tick(now, dt) {
    // 絞りリング: 回転角（クリック刻み）と開口
    if (st.apT0 >= 0) { const t = now - st.apT0; apRing.rotation.z = -THREE.MathUtils.degToRad(apAngleAt(st.apFrom, st.apTo, t)); if (t >= Math.abs(st.apTo - st.apFrom) * CLICK_MS) { st.ap = st.apTo; st.apT0 = -1; apRing.rotation.z = -THREE.MathUtils.degToRad(st.ap * STEP_DEG); } }
    const idx = apIndexNow(now), closed = st.shotT0 >= 0 && now - st.shotT0 < SHUTTER_CLOSE_MS; drawAperture(idx, closed);
    // AF の保持と撮影後の復帰
    if (st.af && st.afT0 >= 0 && now - st.afT0 > AF_HOLD_MS) { st.af = false; st.half = false; }
    if (st.shotT0 >= 0 && now - st.shotT0 >= REVIEW_MS) { st.shotT0 = -1; st.af = false; st.half = false; }
    // ボタンの沈み: 半押し 1.1 / 全押し 2.3（SHUTTER_CLOSE_MS の間）
    const full = st.shotT0 >= 0 && now - st.shotT0 < SHUTTER_CLOSE_MS; btn.position.y = -(full ? 2.3 : (st.half ? 1.1 : 0)) * TS;
    btnMat.emissiveIntensity = full ? 0.5 : (st.half ? 0.2 : 0);   // 発光は「触った手応え」のデフォルメ（実機は光らない）。沈み込みが主
    haze.uniforms.opacity.value += ((st.on ? 0.14 : 0) - haze.uniforms.opacity.value) * Math.min(1, dt * 4);
    lcdHalo.uniforms.opacity.value = st.on && !(st.shotT0 >= 0 && now - st.shotT0 < LCD_BLACK_MS) ? 0.14 : 0;   // LCD の発光（黒転び中は消す）
    drawLcd(now); C.tickFlashes(now);
  }
  function dispatch(ev, now) {
    if (ev.type === 'switch' && ev.target === 'power') { st.on = ev.value != null ? !!ev.value : !st.on; if (!st.on) { st.af = false; st.half = false; st.shotT0 = -1; } renderStatic(now); return true; }
    if (ev.type === 'knob' && ev.target === 'aperture') {
      const cur = apIndexNow(now); let to = cur;
      if (typeof ev.value === 'number') to = idxOf(ev.value);
      else if (typeof ev.steps === 'number') to = Math.max(0, Math.min(F_STOPS.length - 1, cur + ev.steps));
      st.ap = cur; st.apFrom = cur; st.apTo = to; st.apT0 = now; return true;
    }
    if (ev.type === 'click' && ev.target === 'shutter') {
      if (!st.on) return false;
      if (ev.stage === 'full') { st.shotT0 = now; st.half = true; st.af = true; st.lastLcd = ''; return true; }
      st.half = true; st.af = true; st.afT0 = now; return true;                       // 半押し（AF 枠）
    }
    return false;
  }
  function readout() { if (!st.on) return 'off'; const p = ['on', fnum(st.apT0 >= 0 ? st.apTo : st.ap)]; if (st.shotT0 >= 0) p.push('shot'); else if (st.af) p.push('af'); return p.join(' · '); }
  reset();

  // ---- camera（shots）と触る演出 ----
  const over = [115, 84, 42];
  const deckFocus = [X0 + BW * 0.30, Y0 + 10, ZT - 6];           // 天板の操作部（撮影者の右手側）と LCD が両方見える後ろ上の角度
  const lensFocus = [LX, YF + u(MM.LENS_OUT) * 0.5, LZ];
  const shutterFocus = [shX + 12, Y0 + 8, ZT - 10];   // ボタンと背面 LCD が両方入る（半押しの AF 枠）
  const releaseFocus = [LX + 10, YF + 6, ZT - 14];    // 鏡筒とボタンが両方入る前面左上（全押しでレンズシャッターが閉じるのを見せる）
  const shots = [
    { id: 'overview', from: 0, move: 0, target: over, zoom: 1, orbit: 0 },
    { id: 'deck-rear', from: 24, move: 28, target: deckFocus, zoom: 2.0, orbit: 160 },    // 電源 ON と LCD の点灯（左後ろ上から。LCD が正対に近い）
    { id: 'lens', from: 82, move: 26, target: lensFocus, zoom: 2.7, orbit: 0 },          // 絞りリング
    { id: 'shutter', from: 150, move: 24, target: shutterFocus, zoom: 2.0, orbit: 160 }, // 半押し（LCD の AF 枠とボタンの沈み）
    { id: 'release', from: 186, move: 12, target: releaseFocus, zoom: 2.2, orbit: -30 }, // 全押し（鏡筒のシャッターが閉じる・ボタンが底まで沈む）
    { id: 'wide', from: 216, move: 24, target: over, zoom: 1, orbit: 20 },
  ];
  const FPS_DEFAULT = 30;
  const defaultScript = [
    { frame: 60, type: 'switch', target: 'power', value: 1 },
    { frame: 112, type: 'knob', target: 'aperture', from: 2, value: 8 },
    { frame: 178, type: 'click', target: 'shutter', stage: 'half' },
    { frame: 200, type: 'click', target: 'shutter', stage: 'full' },
  ];
  const ringRim = (angDeg, yy) => { const a = THREE.MathUtils.degToRad(angDeg); return [LX + (u(MM.R_AP) + 0.4) * Math.cos(a), yy, LZ + (u(MM.R_AP) + 0.4) * Math.sin(a)]; };
  function gestureOf(ev, fps) {
    if (ev.type !== 'knob' || ev.target !== 'aperture') return null;
    // plan は任意の frame の後に作られるので st を見ない: 回し始めの値は ev.from（F 値。無ければ初期値 F2）
    const from = idxOf(typeof ev.from === 'number' ? ev.from : F_STOPS[0]); let to = from;
    if (typeof ev.value === 'number') to = idxOf(ev.value); else if (typeof ev.steps === 'number') to = Math.max(0, Math.min(F_STOPS.length - 1, from + ev.steps));
    const clicks = Math.abs(to - from), ms = clicks * CLICK_MS, press = Math.max(2, Math.round(ms / 1000 * fps));
    const theta0 = 118;   // 指はリングの上やや左に触れ、リングと一緒に（正面視で時計回り = 角度が減る方向）回る
    return { kind: 'rotate', press_frames: press, pos: f => { const t = (f - ev.frame) * 1000 / fps; const ang = apAngleAt(from, to, t) - from * STEP_DEG; return ringRim(theta0 - ang, apRingY + 0.6); } };
  }
  const anchors = {
    power: () => [shX, shY + u(MM.COLLAR_R) + 2.6, ZT + u(MM.COLLAR_H) + 0.8],   // レバーの先（OFF の位置）
    shutter: () => [shX, shY, ZT + u(MM.COLLAR_H) + u(MM.SH_H) + 0.2],
  };
  return {
    group: g0, name: 'DIGITAL CAMERA', reset, tick, dispatch, readout, gestureOf, anchors,
    view: { target: over, dist: 5 },
    targets: { power: collar, aperture: apRing, shutter: btn, lcd: lcd.mesh, speed: ssDial, exposure: evDial },
    kinds: { power: 'switch', aperture: 'rotate', shutter: 'press', speed: 'rotate', exposure: 'rotate' },
    touchSide: { power: 'right', shutter: 'right', aperture: 'left' },
    shots, defaultScript, frames: 240, fps: FPS_DEFAULT,
    hint: 'power on · turn the aperture ring · half press · shoot',
  };
};


/* ---- machines: phone ---- */
/* ---------- machines.phone: ダイヤル式電話（根拠: reports/references/real-machines/phone.json = Western Electric 500 形。geometry・機構・台本・camera・触る演出は自作。文言・ロゴは自前） ----------
 * 単位は iso-cm（実寸 mm / 10 × 2.5）。筐体 51 × 56 × 22.5（受話器込み 35）。ダイヤル外径 20.4（実寸 78 mm × 2.5 / 10 = 19.5 に縁 0.9）。
 * 機構: 指で数字 n の穴を時計回りにフィンガーストップ（4 時 = 120°）まで回す（回転角 = 60° + 30° × (n - 1)、0 は 330°）→ 離す → ガバナーで一定速度 300°/s（10 pps × 30°）で反時計回りに戻る。
 *       受話器を上げると左右のプランジャが 1.7 浮く（フック閉）。カールコードは受話器の送話口から筐体左側面へ（受話器の位置で毎回計算）。
 * 時間は now（ms）から決める（実時間 API は使わない）。seek のたびに reset() で初期値へ戻す。 */
G3.machines.phone = function (C, opts) {
  const { rbox, seg, loopL, lineMat, majorMat, bodyMat, plateWith, hazeAndShadow, creases, scene, accent, addOutline, meshes, TS } = C;
  const g0 = new THREE.Group(); scene.add(g0); const first = meshes.length;
  const light = C.theme === 'light';
  const iso = v => [v.x / TS, v.z / TS, v.y / TS];                      // world（three）→ iso-cm
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const easeIO = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const D2R = Math.PI / 180;
  // ---- 材料: plastic（成形プラスチック、やや艶）/ metal（フィンガーホイール・フィンガーストップ・数字盤の縁）/ rubber（底・ストレインリリーフ）/ 薄い accent の線（コード）
  const plastic = bodyMat.clone(); plastic.roughness = 0.65; plastic.metalness = 0.08;
  const rubber = bodyMat.clone(); rubber.roughness = 1.0; rubber.color.multiplyScalar(light ? 0.92 : 0.8);
  const metal = new THREE.MeshStandardMaterial({ color: light ? 0xd6d9dc : 0xb3b8bd, roughness: 0.42, metalness: 0.55, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
    const dotMat = new THREE.MeshBasicMaterial({ color: light ? 0x6a6f73 : 0x868b8f, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -12 });
  const reg = m => { addOutline(m); meshes.push(m); return m; };             // 自作 geometry に外形線と折り目線を付ける（rbox と同じ扱い）
  const cyl = (rt, rb, h, n, mat, parent, pos, rot) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(rt * TS, rb * TS, h * TS, n), mat); if (pos) m.position.copy(pos); if (rot) m.rotation.set(rot[0], rot[1], rot[2]); parent.add(m); return m; };
  // ---- 板と筐体の置き場（板 150 × 140 の中央）
  plateWith(g0, 118, 110, [[11, 11], [107, 11], [11, 99], [107, 99]], null);
  const PX = 33.5, PY = 27, PZ = 7, BW = 51, BD = 56;                       // 筐体の原点（板の上）と幅・奥行
  const ph = new THREE.Group(); ph.position.copy(W(PX, PY, PZ)); g0.add(ph);
  // 底のゴム（博物館記録の Rubber）: 薄い暗い段
  rbox(0.6, 0.6, 0, BW - 1.2, BD - 1.2, 1.4, 7, rubber, ph);
  // 筐体: 側面の断面（y 手前・z 上）を x 方向に押し出し、bevel で左右の角を丸める。断面: 前面が低く、斜めの deck（ダイヤル面）が後方の高いクレードル台へ続く
  const PROF = [[56, 1.4, 0], [56, 8, 5.5], [26, 22.5, 6.5], [0, 22.5, 7], [0, 1.4, 0]];   // [y, z, 角の丸み]。丸みは bevel（BV）より大きく（小さい丸みを内側へオフセットするとループしてヒレが出る）。底の角は鋭角のまま。隣り合う丸みの合計は辺より短く
  function roundedShape(pts) { const sh = new THREE.Shape(); const n = pts.length, P = i => pts[(i + n) % n]; const cut = (a, b, r) => { const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy); return [a[0] + dx / L * r, a[1] + dy / L * r]; };
    for (let i = 0; i < n; i++) { const p = P(i), r = p[2] || 0, s = r > 0 ? cut(p, P(i - 1), r) : p, e = r > 0 ? cut(p, P(i + 1), r) : p; if (i === 0) sh.moveTo(s[0], s[1]); else sh.lineTo(s[0], s[1]); if (r > 0) sh.quadraticCurveTo(p[0], p[1], e[0], e[1]); } sh.closePath(); return sh; }
  { const sh = roundedShape(PROF.map(([y, z, r]) => [-y, z, r]));         // shape x = -iso y（rotateY(π/2) で world z = -shape x になるため）
    const BV = 3.5, g = new THREE.ExtrudeGeometry(sh, { depth: BW - 2 * BV, bevelEnabled: true, bevelThickness: BV, bevelSize: BV, bevelOffset: -BV, bevelSegments: 8, curveSegments: 12 });
    g.rotateY(Math.PI / 2); g.translate(BV, 0, 0); g.scale(TS, TS, TS); const m = new THREE.Mesh(g, plastic); reg(m); ph.add(m); }
  // deck の傾き（断面 (56,8)→(26,22.5) から: 法線 = (14.5, 30) → 鉛直から 25.8°）。ダイヤルの中心は斜面の中点を法線方向へ 0.8 出した点
  const TILT = Math.atan2(14.5, 30), DIAL_C = [25.5, 41 + 0.8 * Math.sin(TILT), 15.25 + 0.8 * Math.cos(TILT)];
  // ---- クレードル: 左右の U 字受け（台 + 前後の縁）とフックスイッチのプランジャ 2 本
  const CUPX = [7, 44], CUPY = 13;
  CUPX.forEach(xc => { rbox(xc - 6, 4, 22.5, 12, 18, 2.5, 2, plastic, ph); rbox(xc - 6, 4, 25, 12, 2.2, 3.2, 1, plastic, ph); rbox(xc - 6, 19.8, 25, 12, 2.2, 3.2, 1, plastic, ph); });
  const plg = new THREE.Group(); ph.add(plg); const PLG_UP = 1.7;
  [18.5, 32.5].forEach(x => { reg(cyl(1.6, 1.6, 5.5, 20, plastic, plg, W(x, CUPY, 22.5 + 2.75))); });
  // ---- 受話器（G 形）: 受話・送話の円筒カップ（下向き）と、ゆるく弧を描く握り。pivot は載せたときの中心（25.5, 13, 27.5）
  const HS0 = [25.5, CUPY, 27.5], hs = new THREE.Group(); ph.add(hs);
  [-18.5, 18.5].forEach(x => { reg(cyl(6.2, 5.4, 5, 28, plastic, hs, W(x, 0, 0))); reg(cyl(2.8, 2.8, 1.2, 20, plastic, hs, W(x, 0, 2.9))); });
  { const pts = [[-18.5, 0, 2.6], [-11, 0, 3.4], [0, 0, 3.9], [11, 0, 3.4], [18.5, 0, 2.6]].map(p => W(...p)); const curve = new THREE.CatmullRomCurve3(pts); const m = new THREE.Mesh(new THREE.TubeGeometry(curve, 28, 2.2 * TS, 14, false), plastic); reg(m); hs.add(m); }
  const hsProxy = new THREE.Object3D(); ph.add(hsProxy);                   // 受話器の姿勢を計算だけする代役（指とコードの位置に使う。描画の状態を汚さない）
  const HS_LIFT = { dpos: [-18, 6, 17], rotZ: 40 * D2R };                  // 上げた受話器: 左（人の左耳）へ・手前へ・上へ、右端（受話口）を上げる
  function setPose(o, t) { const k = t; o.position.copy(W(HS0[0] + HS_LIFT.dpos[0] * k, HS0[1] + HS_LIFT.dpos[1] * k, HS0[2] + HS_LIFT.dpos[2] * k)); o.rotation.set(0, 0, HS_LIFT.rotZ * k); }
  function hsWorld(t, local) { setPose(hsProxy, t); hsProxy.updateWorldMatrix(true, false); return hsProxy.localToWorld(W(...local)); }
  // ---- コード: 筐体左側面（x = 0, y = 38, z = 8）のストレインリリーフから受話器の送話カップ下へ。pc の coil の式（接線枠のらせん）を再利用
  reg(cyl(1.5, 1.8, 5.5, 16, rubber, ph, W(-2.5, 38, 8), [0, 0, Math.PI / 2]));   // ストレインリリーフ（側面 x = 0 の穴から 5 突き出す）
  const CORD_N = 420, CORD_TURNS = 22, CORD_R = 1.7, cordPts = [];
  function cordPath(t) {
    const P3 = iso(ph.worldToLocal(hsWorld(t, [-23.4, 0, -1.6]))); const P0 = [-5.2, 38, 8], P1 = [-22, 42, 2], P2 = [P3[0] - 14, P3[1] + 6, Math.max(2, P3[2] - 10)];
    const bez = u => P0.map((_, i) => (1 - u) ** 3 * P0[i] + 3 * (1 - u) ** 2 * u * P1[i] + 3 * (1 - u) * u * u * P2[i] + u ** 3 * P3[i]);
    cordPts.length = 0;
    for (let i = 0; i <= CORD_N; i++) { const u = i / CORD_N, p = bez(u), a = bez(Math.max(0, u - 1e-3)), b = bez(Math.min(1, u + 1e-3)); let Tn = b.map((v, j) => v - a[j]); const tl = Math.hypot(...Tn) || 1; Tn = Tn.map(v => v / tl); let N1 = [Tn[1], -Tn[0], 0]; const nl = Math.hypot(...N1) || 1; N1 = N1.map(v => v / nl); const N2 = [Tn[1] * N1[2] - Tn[2] * N1[1], Tn[2] * N1[0] - Tn[0] * N1[2], Tn[0] * N1[1] - Tn[1] * N1[0]]; const env = clamp((u - .06) / .06, 0, 1) * clamp((.92 - u) / .06, 0, 1), ang = u * CORD_TURNS * 2 * Math.PI; cordPts.push(p.map((v, j) => v + env * CORD_R * (Math.cos(ang) * N1[j] + Math.sin(ang) * N2[j]))); }
    return cordPts;
  }
  const cordFlat = () => { const out = []; for (let i = 0; i < cordPts.length - 1; i++) out.push(...W(...cordPts[i]).toArray(), ...W(...cordPts[i + 1]).toArray()); return out; };
  cordPath(0); const cord = C.polyLine(cordPts, majorMat, ph); cord.frustumCulled = false;
  function updateCord(t) { cordPath(t); const buf = cord.geometry.attributes.instanceStart.data; buf.array.set(cordFlat()); buf.needsUpdate = true; }
  // ---- ダイヤル（deck の上、法線まわり）。local: x 右・y 法線・z 6 時の向き。時計角 φ（12 時から時計回り）の点 = (R sin φ, y, -R cos φ)
  const dial = new THREE.Group(); dial.position.copy(W(...DIAL_C)); dial.rotation.x = TILT; ph.add(dial);
  const R_PLATE = 10.2, R_WHEEL = 9.3, R_HOLE = 7.25, HOLE_R = 1.375, R_CAP = 3.3, STOP_DEG = 120;
  const clockPos = (phiDeg, r, y) => new THREE.Vector3(r * Math.sin(phiDeg * D2R) * TS, y * TS, -r * Math.cos(phiDeg * D2R) * TS);
  const holeDeg = n => (n === 0 ? 150 : 60 - 30 * (n - 1));              // 穴の静止位置: 1 = 2 時（60°）、以後反時計回りに 30° ずつ、0 = 5 時（150°）
  const pullDeg = n => ((STOP_DEG - holeDeg(n)) % 360 + 360) % 360;       // 回す角度 = 1: 60°, 2: 90°, ..., 9: 300°, 0: 330°
  reg(cyl(R_PLATE, R_PLATE, 0.8, 48, plastic, dial, new THREE.Vector3(0, 0.4 * TS, 0)));           // 数字盤
  { const m = new THREE.Mesh(new THREE.TorusGeometry(R_PLATE * TS, 0.35 * TS, 8, 56), metal); m.rotation.x = Math.PI / 2; m.position.y = 0.8 * TS; dial.add(m); }   // 数字盤の金属の縁
  for (let n = 1; n <= 10; n++) { const d = n % 10, phi = holeDeg(d);    // 数字（穴の静止位置の真下、穴から見える）と照準の点（縁の内側）
    C.label(String(d), 3, 3, 2.0, m => { m.rotation.x = -Math.PI / 2; m.position.copy(clockPos(phi, R_HOLE, 0.9)); }, dial);
    const dot = new THREE.Mesh(new THREE.CircleGeometry(0.3 * TS, 12), dotMat); dot.rotation.x = -Math.PI / 2; dot.position.copy(clockPos(phi, 9.75, 0.9)); dial.add(dot); }
  const wheel = new THREE.Group(); wheel.position.y = 1.1 * TS; dial.add(wheel);
  { const sh = new THREE.Shape(); sh.absarc(0, 0, R_WHEEL, 0, Math.PI * 2, false);
    for (let n = 0; n <= 9; n++) { const phi = holeDeg(n) * D2R, h = new THREE.Path(); h.absarc(R_HOLE * Math.sin(phi), R_HOLE * Math.cos(phi), HOLE_R, 0, Math.PI * 2, true); sh.holes.push(h); }
    { const h = new THREE.Path(); h.absarc(0, 0, R_CAP + 0.25, 0, Math.PI * 2, true); sh.holes.push(h); }
    const g = new THREE.ExtrudeGeometry(sh, { depth: 0.6, bevelEnabled: false, curveSegments: 14 }); g.rotateX(-Math.PI / 2); g.scale(TS, TS, TS); const m = new THREE.Mesh(g, metal); reg(m); wheel.add(m); }   // フィンガーホイール（10 穴の貫通）
  reg(cyl(R_CAP, R_CAP, 1.4, 32, plastic, dial, new THREE.Vector3(0, (1.1 + 0.7) * TS, 0)));
  dial.add(loopL(Array.from({ length: 32 }, (_, i) => clockPos(i * 360 / 32, R_CAP - 0.6, 2.56)), lineMat));   // キャップ上面の縁の線（番号カード窓の枠。装飾は描かない）        // 中心の丸いキャップ（番号カード窓。装飾は描かない）
  { const arc = 22, m = new THREE.Mesh(new THREE.TorusGeometry(8.6 * TS, 0.5 * TS, 8, 12, arc * D2R), metal); m.geometry.rotateX(-Math.PI / 2); m.rotation.y = (90 - STOP_DEG - arc / 2) * D2R; m.position.y = 2.5 * TS; dial.add(m);   // フィンガーストップ（4 時、湾曲した金属）
    const stem = cyl(0.5, 0.5, 1.7, 10, metal, dial, clockPos(STOP_DEG, 10.0, 1.65)); stem.renderOrder = 0;
    const bar = cyl(0.45, 0.45, 1.6, 10, metal, dial, clockPos(STOP_DEG, 9.3, 2.5), [0, (90 - STOP_DEG) * D2R, Math.PI / 2]); bar.renderOrder = 0; }
  hazeAndShadow(g0, PX + BW / 2, PY + BD / 2, 0.9, 0.9); creases(first);
  // ---- 状態（frame から決める。実時間を持たない）
  const RET_DPS = 300, LIFT_MS = 600;                                      // 戻り 300°/s（10 pps × 30°）。受話器の上げ下げ 0.6 s
  const pullMs = deg => 350 + 300 * deg / 330;                             // 人の指: 60° で 0.40 s、330° で 0.65 s（推定）
  const pullRot = (deg, ms, el) => deg * easeIO(clamp(el / ms, 0, 1));
  const st = { hook: 0, hsT: 0, hsAnim: null, dial: null, rot: 0, dialed: [], pulses: 0 };
  function applyHandset(t) { st.hsT = t; setPose(hs, t); plg.position.y = PLG_UP * clamp(t * 3, 0, 1) * TS; updateCord(t); }
  function reset() { st.hook = 0; st.hsAnim = null; st.dial = null; st.rot = 0; st.dialed = []; st.pulses = 0; wheel.rotation.y = 0; applyHandset(0); }
  function tick(now, dt) {
    if (st.hsAnim) { const a = st.hsAnim, u = clamp((now - a.t0) / LIFT_MS, 0, 1); applyHandset(a.from + (a.to - a.from) * easeIO(u)); if (u >= 1) st.hsAnim = null; }
    const d = st.dial;
    if (d) { const el = now - d.t0;
      if (el < d.pullMs) { st.rot = pullRot(d.deg, d.pullMs, el); d.phase = 'pull'; st.pulses = 0; }
      else { st.rot = Math.max(0, d.deg - RET_DPS * (el - d.pullMs) / 1000); d.phase = 'return'; st.pulses = clamp(Math.ceil((d.deg - st.rot - 30) / 30), 0, d.n); if (st.rot <= 0) { st.dialed.push(d.digit); st.dial = null; } }
      wheel.rotation.y = -st.rot * D2R; }
    C.tickFlashes(now);
  }
  function dispatch(ev, now) {
    if (ev.type === 'dial' && ev.digit != null) { if (st.dial) return false; const digit = Number(ev.digit) % 10, deg = pullDeg(digit); st.dial = { digit, n: digit === 0 ? 10 : digit, deg, pullMs: pullMs(deg), t0: now, phase: 'pull' }; return true; }
    if (ev.type === 'click' && ev.target === 'handset') { const to = ev.lift != null ? (ev.lift ? 1 : 0) : (st.hook ? 0 : 1); st.hook = to; st.hsAnim = { t0: now, from: st.hsT, to }; return true; }
    return false;
  }
  function readout() { const p = [st.hook ? 'off hook' : 'on hook']; if (st.dialed.length) p.push(st.dialed.join(' ')); const d = st.dial; if (d) p.push(d.phase === 'pull' ? 'pull ' + d.digit : 'pulses ' + st.pulses + '/' + d.n); return p.join(' · '); }
  // ---- 触る演出: ダイヤルは指穴の位置を装置と同じ回転の式で frame ごとに返す（接触 = 穴に入る frame、回し終えるまで押し、離した後は装置だけが戻る）。受話器は握りを drag
  function gestureOf(ev, fps) {
    if (ev.type === 'dial' && ev.digit != null) { const digit = Number(ev.digit) % 10, deg = pullDeg(digit), ms = pullMs(deg), press = Math.round(ms / 1000 * fps);
      return { kind: 'rotate', press_frames: press, approach_frames: Math.round(fps * 0.4), release_frames: Math.round(fps * 0.25), pos: f => { const el = Math.max(0, f - ev.frame) * 1000 / fps; dial.updateWorldMatrix(true, false); return dial.localToWorld(clockPos(holeDeg(digit) + pullRot(deg, ms, el), R_HOLE, 2.0)); } }; }
    if (ev.type === 'click' && ev.target === 'handset') { const to = ev.lift != null ? (ev.lift ? 1 : 0) : 1, from = 1 - to;
      return { kind: 'drag', press_frames: Math.round(LIFT_MS / 1000 * fps), pos: f => { const u = clamp(Math.max(0, f - ev.frame) * 1000 / fps / LIFT_MS, 0, 1); return hsWorld(from + (to - from) * easeIO(u), [0, 0, 6.1]); } }; }
    return null;
  }
  reset();
  const over = [PX + BW / 2, PY + BD / 2, PZ + 22], focus = [PX + DIAL_C[0], PY + DIAL_C[1], PZ + DIAL_C[2]];
  return {
    group: g0, name: 'ROTARY PHONE', reset, tick, dispatch, readout,
    view: { target: over, dist: 3.4 },
    targets: { dial: wheel, handset: hs, plunger: plg }, kinds: { dial: 'rotate', handset: 'drag', plunger: 'press' }, gestureOf, touchSide: { dial: 'right', handset: 'left' },
    // camera: 外観 → ダイヤルへ寄り（36〜62）→ 0 の長い戻りを読む寄り（112〜、フィンガーストップ側へ少し）→ 全景（222〜254、hold 16）
    shots: [{ id: 'overview', from: 0, move: 0, target: over, zoom: 1 }, { id: 'dial', from: 36, move: 26, target: focus, zoom: 1.9 }, { id: 'return', from: 112, move: 18, target: [focus[0] + 2, focus[1] + 1.5, focus[2] - 1.5], zoom: 2.3 }, { id: 'wide', from: 222, move: 32, target: over, zoom: 1 }],
    // 台本（270 コマ = 9 s）: 受話器を上げる（24〜42）→ 3（70: 回し 14 コマ・戻り 12）→ 0（114: 回し 20・戻り 33）→ 7（185: 回し 17・戻り 24）→ 受話器を置く（238〜256）。桁間は 0.6 s 以上
    defaultScript: [{ frame: 24, type: 'click', target: 'handset', lift: true }, { frame: 70, type: 'dial', target: 'dial', digit: 3 }, { frame: 114, type: 'dial', target: 'dial', digit: 0 }, { frame: 185, type: 'dial', target: 'dial', digit: 7 }, { frame: 238, type: 'click', target: 'handset', lift: false }],
    hint: 'lift · dial · hang up',
  };
};


/* ---- machines: projector ---- */
/* ---------- machines.projector: 8mm 映写機（Super 8 サウンド映写機。根拠 reports/references/real-machines/projector.json、Elmo ST-1200D 級） ----------
 * 単位 iso-cm = 実寸 mm × 0.25（1/10 cm × 2.5 倍）。リール 2 枚とフィルム経路は右側面の平面（x = 157.5、供給が前方の張り出した腕・巻取りが後方）、光軸はその面の中で y 方向（ランプハウス → ゲート → レンズ → 前）。前面（+y）に操作パネル。
 * 機構: フィルム速度 v = 4.234 mm × 18 fps = 76.2 mm/s（iso 19.05 cm/s）。スプロケットとリールの角速度 = v / 半径。供給は巻き半径が減って速く、巻取りは増えて遅く、回転方向は同じ（右側面から見て、後ろから前へフィルムが上を通る向き）。
 *       巻き厚の変化は 8 秒では見えないので時間を圧縮して見せる（notes の assumed）。間欠送りは 18 Hz の爪で、上下のループが脈動する。
 * 文言は機能語のみ（OFF / MOTOR / LAMP / 18 / 24 / FWD / STILL）。メーカー名・型番・ロゴは描かない。 */
G3.machines.projector = function (C, opts) {
  const { rbox, seg, sideInset, loopL, softMat, glowPoints, hazeAndShadow, creases, plateWith, lineMat, majorMat, recessMat, capMat, accent, scene, label } = C;
  const g0 = new THREE.Group(); scene.add(g0); const first = C.meshes.length; const TS = C.TS;
  const K = 0.25, mm = v => v * K;
  // ---- 寸法（iso-cm）。軸: x 右、y 手前（前 = レンズ側）、z 上。資料の 180 × 340 × 360 を w(x)=180・d(y)=340・h=300（アーム折畳時）と割り付ける（assumed） ----
  const BX = 110, BY = 70, BW = mm(180), BD = mm(340), BZ = 9, BH = mm(300), BF = BY + BD, BR = BX + BW, BT = BZ + BH;   // シャーシ 45 × 85 × 75、前面 y=155、右端 x=155、上面 z=84
  const CX1 = 150, CF = BF - 1.2;                      // 上段外装の右壁 x=150・前面 y=153.8（右側に 5 のフィルム台の段）
  const FX = BR + 2.5;                                 // フィルムとリールの面（右側面の外側 x=157.5）。光軸はこの面の中（y 方向）にある
  const GY = 143.4, LZ = 57;                           // ゲートの y（フィルムが縦に通る線）、光軸の高さ
  const REEL_R = mm(105), HUB_R = 6;                   // リールのフランジ半径 26.25（直径 210 mm 級。付属最大 360 m リールの径は未確認: 推定）
  const S = [190, 114], T = [92, 114];                 // 供給（前方。前面より前に張り出す腕）・巻取り（後方）の中心（y, z）。戻りのフィルムがランプハウスの後ろで光軸の高さを通るための配置（assumed）
  const SPR_R = 3.5, U = [137, 88], D = [84, 28];      // 上スプロケット（ゲートの後上）・下スプロケット（後方の下: 下ループはランプハウスの下を通り、戻りはその後ろを上る）
  const G1 = [GY, 71.5], G2 = [GY, 46];              // ゲートの上端・下端（フィルムが直線で通る）
  const V_FILM = mm(4.234 * 18);                       // 19.05 iso-cm/s
  const RS0 = 23, RT0 = 10;                            // 巻き半径の初期値（供給は太く・巻取りは細く）
  const AREA = (RS0 * RS0 - HUB_R * HUB_R) + (RT0 * RT0 - HUB_R * HUB_R);   // フィルムの断面積の総和（保存量）
  const WIND_K = 36 * 0.045;                           // 巻き厚の変化の時間圧縮（見せるため）。回転の角速度は実速度 / 現在の半径
  const KX = 128, KZ = 38, KNOB_STEP = 45;             // 主スイッチ（前面パネル）の位置と 1 段の角度

  // ---- 材料（metal / plastic / glass / rubber を描き分ける）----
  const plasticMat = new THREE.MeshStandardMaterial({ color: 0x24272b, roughness: 0.65, metalness: 0.08, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
  const metalMat = new THREE.MeshStandardMaterial({ color: 0x3a3e43, roughness: 0.35, metalness: 0.75, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
  const rubberMat = new THREE.MeshStandardMaterial({ color: 0x111213, roughness: 1.0, metalness: 0.0, side: THREE.DoubleSide });
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x0b1420, roughness: 0.12, metalness: 0.65, transparent: true, opacity: 0.92 });
  const filmMat = new THREE.MeshStandardMaterial({ color: 0x15161a, roughness: 0.5, metalness: 0.1 });   // 巻かれたフィルムの束
  const filmLineMat = new LineMaterial({ color: 0xb4b9be, linewidth: 1, resolution: C.lineMat.resolution, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -8 });
  const beamLineMat = new LineMaterial({ color: accent.clone(), linewidth: 1, resolution: C.lineMat.resolution, transparent: true, opacity: 0, depthWrite: false });
  // 円筒（軸の向き: 'x' | 'y'(iso, 手前) | 'z'(上)）。meshes に入れて折り目線（縁の円）を付ける
  function cyl(cx, cy, cz, r, len, axis, mat, parent, { lines = true } = {}) {
    const g = new THREE.CylinderGeometry(r, r, len, 36, 1); g.scale(TS, TS, TS);
    const m = new THREE.Mesh(g, mat); if (axis === 'x') m.rotation.z = Math.PI / 2; else if (axis === 'y') m.rotation.x = Math.PI / 2;
    m.position.copy(W(cx, cy, cz)); if (lines) C.meshes.push(m); parent.add(m); return m;
  }
  const ring2d = (cx, cz, y, r, n, mat) => loopL(Array.from({ length: n }, (_, i) => { const a = i / n * Math.PI * 2; return W(cx + r * Math.cos(a), y, cz + r * Math.sin(a)); }), mat);
  const onFront = (x, z) => C.onFront(x, CF + 0.45, z);   // パネルの凹み（recessMat は polygonOffset で手前に出る）より前に出す

  // ---- 台座・脚・本体 ----
  plateWith(g0, 300, 268, [[18, 18], [282, 18], [18, 250], [282, 250]], null);
  [[BX + 7, BY + 7], [BR - 7, BY + 7], [BX + 7, BF - 7], [BR - 7, BF - 7]].forEach(([x, y]) => cyl(x, y, 8, 2.6, 2, 'z', rubberMat, g0));
  const body = new THREE.Group(); g0.add(body);
  rbox(BX, BY, BZ, BW, BD, 16, 3, metalMat, body);                                   // 下段のシャーシ（金属。右側に 5 のフィルム台の段が残る）
  rbox(BX + 1.2, BY + 1.2, BZ + 16, CX1 - BX - 1.2, BD - 2.4, BH - 16, 4, plasticMat, body);   // 上段の外装（樹脂）x 111.2..150、y 71.2..153.8
  { const sh = new THREE.Shape(); C.roundRect(sh, 0, 0, 34, 66, 4); body.add(loopL(sh.getPoints(10).map(p => W(BX + 4 + p.x, CF + 0.08, 12 + p.y)), lineMat)); }   // 前面パネルの継目
  // ランプハウス（右側面の張り出し。ゲートの後ろで光軸 y 方向の上に乗る）。上面に排気スリット
  rbox(148, 100, 45, 16, 40, 30, 4, plasticMat, body);
  { const s = []; for (let y = 104; y <= 136 + 1e-6; y += 2.6) s.push([[151, y, 75.1], [161, y, 75.1]]); seg(s, body); }
  const slitGlow = softMat(0xffffff, true); slitGlow.uniforms.color.value.copy(accent); slitGlow.side = THREE.DoubleSide;
  { const h = new THREE.Mesh(new THREE.PlaneGeometry(12 * TS, 34 * TS), slitGlow); h.rotation.x = -Math.PI / 2; h.position.copy(W(156, 120, 75.4)); body.add(h); }
  C.frontInset(body, 150, 140, 64, 15, 14, 2);                                        // ランプハウス前面のコンデンサ窓（フィルムの後ろ）
  // 前面の操作パネル（配置は未確認: 推定）
  C.frontInset(body, 113, CF, 54, 26, 34, 2);                                         // パネルの凹み: x 113..139、z 20..54
  // 主スイッチ（回転式 3 段: OFF → MOTOR → LAMP、軸 y）。pivot に位置、knob は原点（flash が position を触るため）
  const knobPivot = new THREE.Group(); knobPivot.position.copy(W(KX, CF + 0.1, KZ)); body.add(knobPivot);
  const knob = new THREE.Group(); knob.userData = { pressAxis: 'z', pressDepth: 0.8 }; knobPivot.add(knob);
  { const m = new THREE.Mesh(new THREE.CylinderGeometry(3.6 * TS, 3.8 * TS, 3 * TS, 36, 1), capMat()); m.rotation.x = Math.PI / 2; m.position.set(0, 0, 1.5 * TS); C.meshes.push(m); knob.add(m);
    knob.add(C.fat([0, 0.6 * TS, 3.05 * TS, 0, 3.0 * TS, 3.05 * TS], majorMat)); }       // 指標の線（上向きが OFF）
  [['OFF', 0], ['MOTOR', 1], ['LAMP', 2]].forEach(([t, i]) => { const a = THREE.MathUtils.degToRad(i * KNOB_STEP); label(t, 18, 5, 3.4, onFront(KX + 10.5 * Math.sin(a), KZ + 10.5 * Math.cos(a)), body); });
  // 前進 / 静止のレバーと 18 / 24 の切替（描くだけ。台本では触らない）
  const lever = new THREE.Group(); lever.position.copy(W(116, CF, 44)); body.add(lever);
  rbox(-1.2, 0, -1.5, 2.4, 2.6, 3, 0.6, metalMat, lever);
  { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.7 * TS, 0.7 * TS, 6 * TS, 16, 1), metalMat); m.position.set(0, 4 * TS, 1.6 * TS); lever.add(m); const k = new THREE.Mesh(new THREE.SphereGeometry(1.2 * TS, 16, 12), rubberMat); k.position.set(0, 7.2 * TS, 1.6 * TS); lever.add(k); }
  label('FWD', 7, 2.8, 1.6, onFront(116, 52.5), body); label('STILL', 8, 2.8, 1.6, onFront(116, 39.5), body);
  rbox(126, CF, 24, 7, 2, 3, 0.6, recessMat, body); rbox(127, CF + 0.2, 24.6, 2.4, 1.8, 1.8, 0.5, capMat(), body);   // 速度切替のスライド
  label('18', 4, 2.6, 1.6, onFront(136, 25.5), body); label('24', 4, 2.6, 1.6, onFront(123, 25.5), body);

  // ---- リールアーム（展開済み。巻取りは上面後方の支柱、供給は前方へ張り出す腕の先の支柱）とスピンドル（軸 x）----
  rbox(143, 89, BT, 6, 6, 28, 1.5, metalMat, body); rbox(143, 89, 108, 14, 6, 6, 1.5, metalMat, body); cyl(154, S[0], S[1], 1.3, 16, 'x', metalMat, body, { lines: false });
  rbox(143, 126, BT, 6, 70, 5, 1.5, metalMat, body); rbox(143, 187, BT + 5, 6, 6, 23, 1.5, metalMat, body); rbox(143, 187, 108, 14, 6, 6, 1.5, metalMat, body); cyl(154, T[0], T[1], 1.3, 16, 'x', metalMat, body, { lines: false });
  // ---- リール（窓 6 つのフランジ 2 枚 + ハブ + 巻かれたフィルムの束。束の半径を scale で表す）。group を y 軸に 90° 回して円盤の法線を x に ----
  function reel(cy, cz, r0) {
    const g = new THREE.Group(); g.position.copy(W(FX, cy, cz)); g.rotation.y = Math.PI / 2; g0.add(g);
    const flange = () => { const sh = new THREE.Shape(); sh.absarc(0, 0, REEL_R, 0, Math.PI * 2, false);
      for (let i = 0; i < 6; i++) { const h = new THREE.Path(); const a0 = i / 6 * Math.PI * 2 + 0.22, a1 = (i + 1) / 6 * Math.PI * 2 - 0.22, ri = HUB_R + 3.5, ro = REEL_R - 3.5;
        h.moveTo(ri * Math.cos(a0), ri * Math.sin(a0)); h.absarc(0, 0, ro, a0, a1, false); h.lineTo(ri * Math.cos(a1), ri * Math.sin(a1)); h.absarc(0, 0, ri, a1, a0, true); sh.holes.push(h); }
      const geo = new THREE.ExtrudeGeometry(sh, { depth: 0.6, bevelEnabled: false, curveSegments: 40 }); geo.scale(TS, TS, TS); const m = new THREE.Mesh(geo, plasticMat); C.meshes.push(m); return m; };
    const back = flange(); back.position.z = -1.8 * TS; g.add(back); const front = flange(); front.position.z = 1.2 * TS; g.add(front);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(HUB_R * TS, HUB_R * TS, 3.6 * TS, 32, 1), metalMat); hub.rotation.x = Math.PI / 2; C.meshes.push(hub); g.add(hub);
    const pack = new THREE.Mesh(new THREE.CylinderGeometry(TS, TS, 2.4 * TS, 48, 1), filmMat); pack.rotation.x = Math.PI / 2; g.add(pack);
    const packEdge = loopL(Array.from({ length: 48 }, (_, i) => { const a = i / 48 * Math.PI * 2; return new THREE.Vector3(Math.cos(a) * TS, Math.sin(a) * TS, 1.19 * TS); }), majorMat); g.add(packEdge);
    g.add(C.fat([0, 0, 1.85 * TS, 0, HUB_R * 0.8 * TS, 1.85 * TS], majorMat));   // ハブの指標（回転が見える）
    return { g, pack, packEdge, r: r0 };
  }
  const supply = reel(S[0], S[1], RS0), takeup = reel(T[0], T[1], RT0);
  // ---- スプロケット（歯 12。軸 x、受けの金具）----
  function sprocket(cy, cz) {
    const g = new THREE.Group(); g.position.copy(W(FX, cy, cz)); g.rotation.y = Math.PI / 2; g0.add(g);
    const m = new THREE.Mesh(new THREE.CylinderGeometry(SPR_R * TS, SPR_R * TS, 5 * TS, 24, 1), metalMat); m.rotation.x = Math.PI / 2; C.meshes.push(m); g.add(m);
    const pts = []; for (let i = 0; i < 24; i++) { const a = i / 24 * Math.PI * 2, r = i % 2 ? SPR_R + 0.7 : SPR_R + 0.1; pts.push(new THREE.Vector3(Math.cos(a) * r * TS, Math.sin(a) * r * TS, 2.55 * TS)); } g.add(loopL(pts, lineMat));
    g.add(C.fat([0, 0, 2.6 * TS, 0, SPR_R * 0.7 * TS, 2.6 * TS], majorMat));
    return g;
  }
  const sprU = sprocket(U[0], U[1]), sprD = sprocket(D[0], D[1]);
  rbox(146, 133, BT, 5, 8, 8, 1, metalMat, body); rbox(150, 80, BZ + 16, 6, 8, 6, 1, metalMat, body);   // 上の受け（上面）・下の受け（シャーシ右側面）
  cyl(FX - 3, U[0], U[1], 1.2, 6, 'x', metalMat, body, { lines: false }); cyl(FX - 3, D[0], D[1], 1.2, 6, 'x', metalMat, body, { lines: false });
  // ---- ゲート（ランプハウス前のアパーチャ板 + 圧板）、送り爪、レンズ鏡筒（軸 y、フィルムの面の中）----
  rbox(152, 140.5, 47, 11, 2.5, 24, 1, metalMat, body);                   // アパーチャ板（フィルムの後ろ、ランプハウス前面に接する）
  rbox(154, 144.2, 50, 7, 1.4, 16, 0.8, metalMat, body);                  // 圧板（フィルムの前）。上下にフィルムが見える
  const claw = new THREE.Group(); body.add(claw); rbox(FX - 0.8, GY - 0.6, 47.8, 1.6, 1.2, 1.4, 0.3, metalMat, claw);   // 送り爪（18 Hz で 1 コマ分下がり、退いて戻る）
  const lens = new THREE.Group(); body.add(lens);
  rbox(FX - 6, 144.2, 46, 12, 5.8, 4, 1, metalMat, lens);                   // レンズの受け（下。フィルム y=143.4 に入り込まない）
  const LY = 146;                                                             // 鏡筒の後端 y
  cyl(FX, LY + 11.2, LZ, 6.0, 22.4, 'y', metalMat, lens);                    // 鏡筒（90 mm）
  const focus = new THREE.Group(); lens.add(focus); focus.position.copy(W(FX, LY + 5.6, LZ));
  { const m = new THREE.Mesh(new THREE.CylinderGeometry(7.0 * TS, 7.0 * TS, 5 * TS, 36, 1), rubberMat); m.rotation.x = Math.PI / 2; C.meshes.push(m); focus.add(m);
    const s = []; for (let i = 0; i < 24; i++) { const a = i / 24 * Math.PI * 2; s.push(Math.cos(a) * 7.05 * TS, Math.sin(a) * 7.05 * TS, -2.3 * TS, Math.cos(a) * 7.05 * TS, Math.sin(a) * 7.05 * TS, 2.3 * TS); } focus.add(C.fat(s, lineMat));   // フォーカスリングの刻み
    focus.add(C.fat([0, 7.1 * TS, -2.4 * TS, 0, 7.1 * TS, 2.4 * TS], majorMat)); }
  cyl(FX, LY + 23.5, LZ, 6.4, 2.4, 'y', metalMat, lens);                    // 前枠
  const inner = new THREE.Group(); lens.add(inner);                          // フォーカスで前後する内筒とガラス
  cyl(FX, LY + 26.6, LZ, 5.2, 4.4, 'y', metalMat, inner);
  { const gl = new THREE.Mesh(new THREE.CircleGeometry(4.8 * TS, 36), glassMat); gl.position.copy(W(FX, LY + 28.85, LZ)); inner.add(gl); inner.add(ring2d(FX, LZ, LY + 28.9, 4.8, 36, majorMat)); }
  const LENS_FRONT = LY + 28.9;
  // ---- 光束（レンズの先から +y のスクリーン側へ。softMat の板 2 枚 + 4 本の縁の線 + 光源の点）----
  const beamMat = softMat(0xffffff, true); beamMat.uniforms.color.value.copy(accent); beamMat.side = THREE.DoubleSide;
  function quad(p, parent, mat) { const g = new THREE.BufferGeometry(); const v = []; p.forEach(q => v.push(...W(...q).toArray())); g.setAttribute('position', new THREE.Float32BufferAttribute([...v.slice(0, 9), ...v.slice(6, 12), ...v.slice(0, 3)], 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 1, 1, 0, 1, 0, 0], 2)); const m = new THREE.Mesh(g, mat); m.frustumCulled = false; parent.add(m); return m; }
  const BEAM_END = 258, BW2 = 22, BH2 = 16;
  quad([[FX - 4.8, LENS_FRONT, LZ], [FX + 4.8, LENS_FRONT, LZ], [FX + BW2, BEAM_END, LZ], [FX - BW2, BEAM_END, LZ]], g0, beamMat);
  quad([[FX, LENS_FRONT, LZ - 4.8], [FX, LENS_FRONT, LZ + 4.8], [FX, BEAM_END, LZ + BH2], [FX, BEAM_END, LZ - BH2]], g0, beamMat);
  const beamEdges = C.fat([[-1, -1], [1, -1], [1, 1], [-1, 1]].flatMap(([sx, sz]) => [...W(FX + sx * 4.4, LENS_FRONT, LZ + sz * 3.4).toArray(), ...W(FX + sx * BW2, BEAM_END, LZ + sz * BH2).toArray()]), beamLineMat); g0.add(beamEdges);
  const lensGlow = glowPoints([W(FX, LENS_FRONT + 0.3, LZ)], 0.3); g0.add(lensGlow);
  const gateGlow = glowPoints([W(FX + 0.6, GY, 71.8), W(FX + 0.6, GY, 45.8)], 0.12); g0.add(gateGlow);   // ゲートの小窓の漏れ光（上下）
  // ---- フィルムの経路（側面の平面 x = FX 上の 2D (y, z) で毎 tick に計算し、固定本数の線のバッファを in place で更新）----
  const NSEG = 120; const film = C.fat(new Array(NSEG * 6).fill(0), filmLineMat); film.frustumCulled = false; g0.add(film);
  // 2 円（または点: r=0）の接線。s = +1 なら円は進行方向の左、-1 なら右（(y, z) の数学座標で、時計回りに巻く円は右、反時計回りは左）。戻り値 [P1, P2]
  function tangent(c1, r1, s1, c2, r2, s2) {
    const dx = c2[0] - c1[0], dz = c2[1] - c1[1], L = Math.hypot(dx, dz), k = (s1 * r1 - s2 * r2) / L, phi = Math.acos(Math.max(-1, Math.min(1, k)));
    const base = Math.atan2(-dz, -dx);
    let best = null;
    for (const sg of [1, -1]) { const a = base + sg * phi, n = [Math.cos(a), Math.sin(a)], u = [n[1], -n[0]]; const fwd = u[0] * dx + u[1] * dz; if (!best || fwd > best.fwd) best = { n, fwd }; }
    const n = best.n; return [[c1[0] - s1 * r1 * n[0], c1[1] - s1 * r1 * n[1]], [c2[0] - s2 * r2 * n[0], c2[1] - s2 * r2 * n[1]]];
  }
  const ang = (c, p) => Math.atan2(p[1] - c[1], p[0] - c[0]);
  function arc(c, r, a0, a1, cw, out) { let d = a1 - a0; if (cw) { while (d > 0) d -= Math.PI * 2; } else { while (d < 0) d += Math.PI * 2; } const n = Math.max(2, Math.ceil(Math.abs(d) / 0.25)); for (let i = 1; i <= n; i++) { const a = a0 + d * i / n; out.push([c[0] + r * Math.cos(a), c[1] + r * Math.sin(a)]); } }
  function bow(p, q, amp, side, out) { const mx = (p[0] + q[0]) / 2, mz = (p[1] + q[1]) / 2, dx = q[0] - p[0], dz = q[1] - p[1], L = Math.hypot(dx, dz) || 1; const nx = -dz / L * side, nz = dx / L * side; const cx = mx + nx * amp * 2, cz = mz + nz * amp * 2; for (let i = 1; i <= 10; i++) { const t = i / 10; out.push([(1 - t) ** 2 * p[0] + 2 * (1 - t) * t * cx + t * t * q[0], (1 - t) ** 2 * p[1] + 2 * (1 - t) * t * cz + t * t * q[1]]); } }
  function filmPath(rS, rT, pulse) {
    const pts = [];
    const [a1, a2] = tangent(S, rS, +1, U, SPR_R, +1); pts.push(a1, a2);                            // 供給（後側から下へ）→ 上スプロケットの上を後ろへ（反時計回り）
    const [b1] = tangent(U, SPR_R, +1, G1, 0, 0); arc(U, SPR_R, ang(U, a2), ang(U, b1), false, pts);  // 上スプロケットを巻いて前下のゲートへ
    bow(b1, G1, 2.2 - 0.8 * pulse, -1, pts);                                                        // 上ループ（送りで縮む）
    pts.push(G2);                                                                                   // ゲート（直線）
    const [, c2] = tangent(G2, 0, 0, D, SPR_R, -1); bow(G2, c2, 2.2 + 0.8 * pulse, -1, pts);        // 下ループ（送りで膨らむ）→ ランプハウスの下を後ろへ → 下スプロケットの前側
    const [d1, d2] = tangent(D, SPR_R, -1, T, rT, +1); arc(D, SPR_R, ang(D, c2), ang(D, d1), true, pts);   // 下スプロケットを巻く（時計回り）
    pts.push(d2);                                                                                   // → ランプハウスの後ろを上り、巻取りの後側へ（光軸を横切らない）
    return pts;
  }
  function syncFilm() {
    const raw = filmPath(st.rS, st.rT, st.pulse), cum = C.cumLen(raw), pts = Array.from({ length: NSEG + 1 }, (_, i) => C.alongPts(raw, cum, i / NSEG));   // 等間隔に再標本化
    const buf = film.geometry.attributes.instanceStart.data, a = buf.array;
    for (let i = 0; i < NSEG; i++) { const p = W(FX, pts[i][0], pts[i][1]), q = W(FX, pts[i + 1][0], pts[i + 1][1]); a[i * 6] = p.x; a[i * 6 + 1] = p.y; a[i * 6 + 2] = p.z; a[i * 6 + 3] = q.x; a[i * 6 + 4] = q.y; a[i * 6 + 5] = q.z; }
    buf.needsUpdate = true;
  }
  // 注意: three は onBeforeRender より前（projectObject）にバッファを GPU へ送るので、線の更新は tick / reset の中で行う（onBeforeRender で書くと前のコマの線が残り、seek が一致しない）
  const haze = hazeAndShadow(g0, (BX + BR) / 2, (BY + BF) / 2 + 4, 3.0, 2.4); creases(first);

  // ---- 状態（frame から決める。実時間を持たない）----
  const st = { motor: false, lamp: false, speed: 0, rS: RS0, rT: RT0, angS: 0, angT: 0, angU: 0, angD: 0, pulse: 0, lampK: 0, focusT: -1, focusK: 0, focused: false, knobPos: 0, t: 0 };
  function pulldown(ph) { return ph < 0.3 ? Math.sin(Math.PI * ph / 0.3) : 0; }   // 爪が 1 コマ引き下げる区間（周期の 30%）。その後退いて戻る
  function render() {
    supply.g.rotation.z = -st.angS; takeup.g.rotation.z = -st.angT; sprU.rotation.z = -st.angU; sprD.rotation.z = st.angD;   // (y, z) 座標で時計回り = 局所 z の正（group は y 軸に 90° 回してある）
    supply.pack.scale.set(st.rS, 1, st.rS); supply.packEdge.scale.set(st.rS, st.rS, 1); takeup.pack.scale.set(st.rT, 1, st.rT); takeup.packEdge.scale.set(st.rT, st.rT, 1);
    const ph = st.motor ? (st.t * 18) % 1 : 0, pd = pulldown(ph); st.pulse = st.motor ? pd : 0;
    claw.position.set(ph >= 0.3 && ph < 0.6 ? -0.7 * TS : 0, -mm(4.234) * pd * TS, 0);     // 下がる（三次元 y = 上下）・退く（三次元 x: フィルムの面から本体側へ）
    beamMat.uniforms.opacity.value = (0.14 + 0.12 * st.focusK) * st.lampK; beamLineMat.opacity = st.lampK * (0.12 + 0.88 * st.focusK); lensGlow.material.uniforms.intensity.value = 1.0 * st.lampK; gateGlow.material.uniforms.intensity.value = 0.6 * st.lampK; slitGlow.uniforms.opacity.value = 0.12 * st.lampK;
    inner.position.z = st.focusK * 2.4 * TS; focus.rotation.z = -st.focusK * 1.4;
    knobPivot.rotation.z = -THREE.MathUtils.degToRad(st.knobPos * KNOB_STEP);          // 指標が OFF（上）→ MOTOR → LAMP（+x 側）へ回る
  }
  function reset() {
    Object.assign(st, { motor: false, lamp: false, speed: 0, rS: RS0, rT: RT0, angS: 0, angT: 0, angU: 0, angD: 0, pulse: 0, lampK: 0, focusT: -1, focusK: 0, focused: false, knobPos: 0, t: 0 });
    haze.uniforms.opacity.value = 0; knob.position.set(0, 0, 0); claw.position.set(0, 0, 0);
    g0.traverse(o => { if (o.isMesh && o.material && o.material.emissive && C.caps.includes(o.material)) o.material.emissiveIntensity = 0; });
    render(); syncFilm();
  }
  function tick(now, dt) {
    st.t = now / 1000;
    st.speed += ((st.motor ? 1 : 0) - st.speed) * Math.min(1, dt * 3.0);          // モーターの立ち上がり・惰性
    if (st.speed > 1e-3) {
      const v = V_FILM * st.speed;                                                   // フィルム速度（iso-cm/s）
      st.angS += v / st.rS * dt; st.angT += v / st.rT * dt; st.angU += v / SPR_R * dt; st.angD += v / SPR_R * dt;
      const dA = v * WIND_K * dt;                                                    // 断面積の移動（供給 → 巻取り。時間圧縮）
      const aS = Math.max(0.5, st.rS * st.rS - HUB_R * HUB_R - dA); st.rS = Math.sqrt(aS + HUB_R * HUB_R); st.rT = Math.sqrt(Math.max(0, AREA - aS) + HUB_R * HUB_R);
    }
    st.lampK += ((st.lamp ? 1 : 0) - st.lampK) * Math.min(1, dt * 5);              // ランプの立ち上がり
    if (st.focusT >= 0) { const t = Math.min(1, (now - st.focusT) / 650); st.focusK = t < 0.5 ? 2 * t * t : 1 - 2 * (1 - t) * (1 - t); }
    haze.uniforms.opacity.value += ((st.lamp ? 0.16 : (st.motor ? 0.05 : 0)) - haze.uniforms.opacity.value) * Math.min(1, dt * 4);
    render(); syncFilm(); C.tickFlashes(now);
  }
  function dispatch(ev, now) {
    if (ev.type !== 'click') return false;
    if (ev.target === 'power') { st.motor = !st.motor; if (!st.motor) st.lamp = false; st.knobPos = st.motor ? (st.lamp ? 2 : 1) : 0; C.flash(knob, now, 120); render(); return true; }
    if (ev.target === 'lamp') { st.motor = true; st.lamp = !st.lamp; st.knobPos = st.lamp ? 2 : 1; C.flash(knob, now, 120); render(); return true; }
    if (ev.target === 'focus') { st.focusT = now; st.focused = true; render(); return true; }
    return false;
  }
  function readout() { const p = [st.motor ? 'motor · 18 fps' : 'off']; if (st.lamp) p.push('lamp'); if (st.focused) p.push('focus'); return p.join(' · '); }
  render();
  const over = [145, 150, 62], ctl = [KX, CF + 2, KZ], gate = [FX, 138, 62], proj = [FX, 188, 60];
  return {
    group: g0, name: 'FILM PROJECTOR', reset, tick, dispatch, readout,
    view: { target: over, dist: 7.5 },
    targets: { power: knobPivot, lamp: knobPivot, focus },
    anchors: { power: () => [KX, CF + 3.2, KZ], lamp: () => [KX, CF + 3.2, KZ], focus: () => [FX, LY + 5.6, LZ + 7.2] },
    kinds: { power: 'switch', lamp: 'switch', focus: 'knob' },
    touchSide: { power: 'left', lamp: 'left', focus: 'left' },
    // camera: 外観 → 前面の操作部へ寄り（orbit -24 で前面を正面寄りに）→ 右側面のゲートとフィルム経路へ（orbit +30 で側面を正面寄りに）→ 投影の hold（光束とリールが同時に見える）→ 全景。power 52・lamp 64 は controls の hold（44〜74）内、focus 172 は projection の hold（164〜200）内
    shots: [
      { id: 'overview', from: 0, move: 0, target: over, zoom: 1 },
      { id: 'controls', from: 18, move: 26, target: ctl, zoom: 1.9, orbit: -24 },
      { id: 'gate', from: 74, move: 30, target: gate, zoom: 1.6, orbit: 30 },
      { id: 'projection', from: 132, move: 32, target: proj, zoom: 1.2, orbit: 8 },
      { id: 'wide', from: 200, move: 36, target: over, zoom: 1, orbit: 0 },
    ],
    defaultScript: [
      { frame: 52, type: 'click', target: 'power' },    // 主スイッチ → MOTOR: スプロケットと両リールが回り、ループが脈動する
      { frame: 64, type: 'click', target: 'lamp' },     // 主スイッチ → LAMP: 光束が伸び、ゲートの小窓が光る
      { frame: 172, type: 'click', target: 'focus' },   // フォーカスリングを回す: 内筒が前へ出て光束の縁が締まる
    ],
    hint: 'switch to MOTOR · then LAMP · turn the focus ring',
  };
};


/* ---------- scene（engine との接続。isoglow-3d/scene.js を手本に、machine・shots・触る演出を足す） ----------
 * 機械 = 図の契約（reset / tick / dispatch / readout / view / targets / shots / defaultScript / name）を持つ 1 つの object。seek(N) = reset → 0..N の tick（台本 event は同じ frame で dispatch）。
 * camera: parameters.camera = shots（図の shot 列: 外観 → 操作部 → 作動 → 全景）/ overview（全景の固定）/ iso（直交投影の全景）。orbit / zoom の parameter はその上に掛ける。
 * 触る演出: touch=on で台本 event の対象を world で追い、camera で投影して DOM の SVG に描く（G3.Touch3D）。 */
CS.registerScene({
  id: 'real-machines', version: '0.1.0',
  prepare(cs) {
    const canvas = cs.canvas || document.getElementById('stage'); const Wd = cs.manifest.width, Hd = cs.manifest.height;
    this.C = createCore(canvas, Wd, Hd, cs.param('theme'), cs.brand('color_accent'), cs.brand('font_family'));
    const mid = cs.param('machine'); const make = G3.machines[mid]; if (!make) throw new Error('unknown machine: ' + mid);
    this.fig = make(this.C, { material: cs.param('material'), label: String(('label' in cs.manifest.slots ? cs.slot('label') : '') || '') });
    if (!this.fig.view || !this.fig.reset || !this.fig.tick || !this.fig.dispatch) throw new Error('machine contract: view / reset / tick / dispatch が要る: ' + mid);
    this.C.finishBuild();
    const script = String(cs.slot('script')).trim(); this.setScript(script === 'auto' ? (this.fig.defaultScript || []) : JSON.parse(script));
    this.fps = cs.manifest.fps.numerator / cs.manifest.fps.denominator;
    this.prm = {}; ['camera', 'orbit_deg', 'orbit_frames', 'zoom_start', 'zoom_end', 'zoom_frames', 'move_from'].forEach(k => { this.prm[k] = cs.param(k); }); this.ease = cs.ease[cs.param('easing')];
    this.touch = cs.param('touch') === 'on'; this.accent = cs.brand('color_accent');
    const root = cs.domRoot || document.getElementById('dom-stage'); root.textContent = '';
    this.svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); this.svg.setAttribute('id', 'ig3-touch'); this.svg.setAttribute('viewBox', `0 0 ${Wd} ${Hd}`); this.svg.setAttribute('preserveAspectRatio', 'none'); root.appendChild(this.svg);
    const cap = document.createElement('div'); cap.className = 'ig3-cap'; cap.style.display = cs.param('caption') === 'on' ? 'flex' : 'none';
    const hint = document.createElement('span'); hint.textContent = String(('label' in cs.manifest.slots ? cs.slot('label') : '') || '').trim() || this.fig.name || mid; this.ro = document.createElement('span'); this.ro.className = 'ro'; cap.appendChild(hint); cap.appendChild(this.ro); root.appendChild(cap);
  },
  setScript(list) { this.script = (list || []).slice().sort((a, b) => a.frame - b.frame); this.touchPlan = null; },
  renderFrame(cs, frame) {
    const C = this.C, F = this.fig, fps = this.fps, dt = 1 / fps; C.resetTimers(); C.resetRng(cs.manifest.seed); F.reset();
    for (let f = 0; f <= frame; f++) { const now = f * 1000 / fps; this.script.filter(e => e.frame === f).forEach(e => F.dispatch(e, now)); C.runTimers(now); F.tick(now, dt); }
    // camera: 全景の view（target・方向 (1,1,1)・距離 dist × max(1, 1.45/aspect)）に shot の target / zoom / orbit を重ね、parameter の orbit / zoom を掛ける
    const aspect = C.width / C.height, dist0 = F.view.dist * Math.max(1, 1.45 / aspect), mode = this.prm.camera;
    const pose = mode === 'shots' && F.shots && F.shots.length ? G3.Shots.poseAt(frame, F.shots, this.ease) : { target: F.view.target, zoom: 1, orbit: 0 };
    const tz = this.ease(Math.min(1, Math.max(0, frame - this.prm.move_from) / Math.max(1, this.prm.zoom_frames))), zoom = pose.zoom * (this.prm.zoom_start + (this.prm.zoom_end - this.prm.zoom_start) * tz);
    const to = this.ease(Math.min(1, Math.max(0, frame - this.prm.move_from) / Math.max(1, this.prm.orbit_frames))), ang = THREE.MathUtils.degToRad(this.prm.orbit_deg * to + (pose.orbit || 0));
    const dir = new THREE.Vector3(1, 1, 1).normalize().applyAxisAngle(new THREE.Vector3(0, 1, 0), ang);
    const target = pose.target.isVector3 ? pose.target.clone() : W(...pose.target);
    const cam = mode === 'iso' ? C.ortho : C.persp, dist = dist0 / zoom; cam.position.copy(target).addScaledVector(dir, dist); cam.lookAt(target);
    let orthoH = 0;
    if (cam === C.ortho) { orthoH = dist0 * C.fovK(); C.ortho.zoom = zoom; C.ortho.top = orthoH / 2; C.ortho.bottom = -orthoH / 2; C.ortho.left = -orthoH * aspect / 2; C.ortho.right = orthoH * aspect / 2; C.ortho.updateProjectionMatrix(); }
    else { C.persp.aspect = aspect; C.persp.updateProjectionMatrix(); }
    C.applyWeight(cam, dist, orthoH);
    const pxScale = cam === C.ortho ? C.height * C.ortho.zoom / orthoH : C.height / C.fovK(); C.glowMats.forEach(m => { m.uniforms.scale.value = pxScale; m.uniforms.ortho.value = cam === C.ortho ? 1 : 0; });
    C.render(cam); this.cam = cam;
    if (this.touch) {
      if (!this.touchPlan) this.touchPlan = G3.Touch3D.plan(this.script, F, fps);
      const st = G3.Touch3D.render(this.svg, this.touchPlan, frame, cam, C.width, C.height, this.accent);
      document.body.dataset.touch = JSON.stringify({ gestures: this.touchPlan.map(g => ({ frame: g.frame_contact, kind: g.kind, target: g.target })), now: st });
    } else { this.svg.innerHTML = ''; }
    document.body.dataset.shot = JSON.stringify({ frame, zoom: +zoom.toFixed(3), target: target.toArray().map(v => +v.toFixed(3)), shot: pose.shot ? pose.shot.id : mode });
    this.ro.textContent = F.readout();
  },
});

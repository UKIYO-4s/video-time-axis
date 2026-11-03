// 部品キット: 新しい機械を「箱の積み重ね」にせず作るための道具。my-machines のファイルから C.kit で使う。
// 座標はすべて x（右）・y（手前）・z（上）。カメラから見えるのは +x・+y・+z の面。
export function makeKit(C) {
  const { THREE, W, TS, rbox, seg, plateWith, hazeAndShadow, creases, scene, bodyMat, recessMat, capMat, softMat, glowPoints, meshes, accent, addOutline } = C;
  const root = new THREE.Group(); scene.add(root); const first = meshes.length;
  const AXIS = { x: new THREE.Vector3(1, 0, 0), y: new THREE.Vector3(0, 0, 1), z: new THREE.Vector3(0, 1, 0) };
  const dirOf = s => { const m = /^([+-])([xyz])$/.exec(s); if (!m) throw new Error(`向きは '+x' や '-y' の形で書いてください（いまは "${s}"）`); return AXIS[m[2]].clone().multiplyScalar(m[1] === '-' ? -1 : 1); };
  const reg = m => { addOutline(m); meshes.push(m); return m; };
  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const ease = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

  // ---- 材料 ----
  const std = o => new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, ...o });
  const mats = {
    paint(k = 1.9) { const m = bodyMat.clone(); m.roughness = 0.42; m.metalness = 0.25; m.color.multiplyScalar(k); return m; },
    metal() { return std({ color: 0x8f959a, roughness: 0.35, metalness: 0.7 }); },
    rubber() { return std({ color: 0x08090a, roughness: 0.95 }); },
    dark() { return recessMat; },
    glass() { return std({ color: 0x0b0d10, roughness: 0.2, metalness: 0.4, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 }); },
    // 光る材料。m.set(0〜1.6) で明るさを変える。色は settings.js の accent
    light() { const m = capMat(); m.set = v => { m.emissiveIntensity = v; }; return m; },
  };

  // ---- 輪郭: [[x, z], [x, z, 角の丸み], { arc: [cx, cz, r, 開始rad, 終了rad] }] ----
  function outline(items) {
    const sh = new THREE.Shape(); const n = items.length; let started = false;
    const go = (x, y) => { if (started) sh.lineTo(x, y); else { sh.moveTo(x, y); started = true; } };
    const cut = (a, b, r) => { const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1; return [a[0] + dx / L * r, a[1] + dy / L * r]; };
    items.forEach((p, i) => {
      if (p.arc) { const [cx, cz, r, a0, a1] = p.arc; sh.absarc(cx, cz, r, a0, a1, a1 < a0); started = true; return; }
      const prev = items[(i + n - 1) % n], next = items[(i + 1) % n], r = p[2] || 0;
      if (r > 0 && !prev.arc && !next.arc) { const s = cut(p, prev, r), e = cut(p, next, r); go(s[0], s[1]); sh.quadraticCurveTo(p[0], p[1], e[0], e[1]); } else go(p[0], p[1]);
    });
    sh.closePath(); return sh;
  }
  // 側面の輪郭を y の範囲へ押し出す（車体・筐体の基本）
  function extrude(shape, { y, mat = bodyMat, parent = root, bevel = 0, lines = true }) {
    const sh = Array.isArray(shape) ? outline(shape) : shape, [y0, y1] = y;
    const g = new THREE.ExtrudeGeometry(sh, { depth: y1 - y0 - 2 * bevel, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelOffset: -bevel, bevelSegments: 4, curveSegments: 24 });
    g.translate(0, 0, y0 + bevel); g.scale(TS, TS, TS);
    const m = new THREE.Mesh(g, mat); parent.add(m); if (lines) reg(m); return m;
  }
  const box = (x, y, z, w, d, h, { r = 0.5, mat = bodyMat, parent = root, lines = true } = {}) => rbox(x, y, z, w, d, h, r, mat, parent, { lines });
  // 円柱。axis は 'x' / 'y' / 'z'。at は中心
  function cyl({ at, r, len, axis = 'z', mat = bodyMat, parent = root, lines = true, seg: n = 40 }) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r * TS, r * TS, len * TS, n), mat);
    if (axis === 'x') m.rotation.z = Math.PI / 2; if (axis === 'y') m.rotation.x = Math.PI / 2;
    m.position.copy(W(...at)); parent.add(m); if (lines) reg(m); return m;
  }
  // 回転体: 断面 [[半径, 高さ], ...] を軸のまわりに回す（ボトル、レンズ、ランプの笠、花瓶など）。at は底の中心
  function lathe(profile, { at, axis = 'z', mat = bodyMat, parent = root, lines = true, seg: n = 48 }) {
    const g = new THREE.LatheGeometry(profile.map(([r, h]) => new THREE.Vector2(r * TS, h * TS)), n); const m = new THREE.Mesh(g, mat);
    if (axis === 'x') m.rotation.z = -Math.PI / 2; if (axis === 'y') m.rotation.x = Math.PI / 2;
    m.position.copy(W(...at)); parent.add(m); if (lines) reg(m); return m;
  }
  // 管: 点を通る滑らかな管（ケーブル、ホース、パイプ、動物の胴や手足など）
  function tube(points, { r, mat = bodyMat, parent = root, lines = true, seg: n = 64 }) {
    const curve = new THREE.CatmullRomCurve3(points.map(p => W(...p))); const m = new THREE.Mesh(new THREE.TubeGeometry(curve, n, r * TS, 16, false), mat); parent.add(m); if (lines) reg(m); return m;
  }
  // 球: scale で楕円にできる（頭、果物、ドーム、照明など）
  function ball({ at, r, scale = [1, 1, 1], mat = bodyMat, parent = root, lines = true }) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(r * TS, 32, 24), mat); m.scale.set(scale[0], scale[2], scale[1]); m.position.copy(W(...at)); parent.add(m); if (lines) reg(m); return m;
  }
  // 4点で作る板（斜めの窓など）
  function pane(pts, { mat, parent = root }) {
    const [a, b, c, d] = pts.map(p => W(...p)); const g = new THREE.BufferGeometry().setFromPoints([a, b, c, a, c, d]);
    g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1], 2)); g.computeVertexNormals();
    const m = new THREE.Mesh(g, mat); parent.add(m); return m;
  }
  const lines = (arr, { parent = root, strong = false } = {}) => seg(arr, parent, strong ? C.majorMat : C.lineMat);
  function group(at = [0, 0, 0], parent = root) { const g = new THREE.Group(); g.position.copy(W(...at)); parent.add(g); return g; }

  // ---- 動く部品 ----
  // 開閉する部品。at は蝶番の位置、extends は蝶番から部品が伸びる向き、opens は開いていく向き。
  // set(度) で開く。回転の向きは自動で決まるので、開いて隠れる失敗が起きない
  function hinge({ at, extends: ex, opens, axis = 'z', parent = root }) {
    const g = group(at, parent), ax = AXIS[axis]; const sign = Math.sign(ax.clone().cross(dirOf(ex)).dot(dirOf(opens))) || 1;
    g.set = deg => g.setRotationFromAxisAngle(ax, sign * deg * Math.PI / 180); return g;
  }
  // 回る部品（ダイヤル、リール、タイヤなど）。set(度)
  function rotor({ at, axis = 'y', parent = root }) { const g = group(at, parent), ax = AXIS[axis]; g.set = deg => g.setRotationFromAxisAngle(ax, deg * Math.PI / 180); return g; }
  // 滑る部品。to は動く量 [x, y, z]。set(0〜1)
  function slider({ at = [0, 0, 0], to, parent = root }) { const g = group(at, parent), p0 = g.position.clone(), d = W(...to); g.set = t => g.position.copy(p0).addScaledVector(d, t); return g; }
  // タイヤ: ゴム・ホイール・スポーク。side は外側の向き（+1 / -1）。spin(距離)で転がる
  function wheel({ at, r, width, side = 1, spokes = 5, parent = root }) {
    const g = rotor({ at, axis: 'y', parent }); const rub = mats.rubber(), met = mats.metal(), hub = mats.light(), o = side * width / 2;
    cyl({ at: [0, 0, 0], r, len: width, axis: 'y', mat: rub, parent: g });
    cyl({ at: [0, o + side * 0.05, 0], r: r * 0.61, len: 0.5, axis: 'y', mat: met, parent: g, lines: false });
    cyl({ at: [0, o + side * 0.1, 0], r: r * 0.5, len: 0.55, axis: 'y', mat: recessMat, parent: g, lines: false });
    cyl({ at: [0, o + side * 0.2, 0], r: r * 0.16, len: 0.7, axis: 'y', mat: hub, parent: g, lines: false });
    for (let i = 0; i < spokes; i++) { const a = i * Math.PI * 2 / spokes, sp = new THREE.Mesh(new THREE.BoxGeometry(r * 0.5 * TS, r * 0.12 * TS, 0.7 * TS), met); sp.position.set(Math.cos(a) * r * 0.3 * TS, Math.sin(a) * r * 0.3 * TS, (o + side * 0.2) * TS); sp.rotation.z = a; g.add(sp); }
    g.hub = hub; g.spin = d => g.set(-d / r * 180 / Math.PI); return g;
  }

  // ---- 光 ----
  // 地面や面に落ちる光（前を照らすライトなど）。set(0〜1)
  function beam({ at, dir = '+x', length, width, parent = root }) {
    const m = softMat(0xffffff, true); m.uniforms.color.value.copy(accent); m.side = THREE.DoubleSide;
    const d = dirOf(dir); const p = new THREE.Mesh(new THREE.PlaneGeometry((Math.abs(d.x) ? length : width) * TS, (Math.abs(d.x) ? width : length) * TS), m);
    p.rotation.x = -Math.PI / 2; p.position.copy(W(...at)).addScaledVector(d, length / 2 * TS); parent.add(p);
    p.set = k => { m.uniforms.opacity.value = 0.5 * k; }; return p;
  }
  // 床に落ちる丸い光（スタンドの光だまりなど）。at は床の中心。set(0〜1)
  function pool({ at, r, parent = root }) {
    const m = softMat(0xffffff, true); m.uniforms.color.value.copy(accent); m.side = THREE.DoubleSide;
    const p = new THREE.Mesh(new THREE.PlaneGeometry(2 * r * TS, 2 * r * TS), m); p.rotation.x = -Math.PI / 2; p.position.copy(W(...at)); parent.add(p);
    p.set = k => { m.uniforms.opacity.value = 0.6 * k; }; return p;
  }
  // 光源の点のにじみ。set(0〜1.2)
  function glow(points, size = 0.3, parent = root) { const g = glowPoints(points.map(p => W(...p)), size); parent.add(g); g.set = k => { g.material.uniforms.intensity.value = k; }; return g; }

  // ---- 台と仕上げ ----
  // 台を置く。上面の高さは kit.TOP（7）。部品はその上に置く
  function stage(w, d) { plateWith(root, w, d, [[11, 11], [w - 11, 11], [11, d - 11], [w - 11, d - 11]], null); return { w, d, top: 7 }; }
  // 全部品を置いたあとで1回呼ぶ。cx, cy は機械の中心、wk, dk は影の大きさ（1.0 が標準）
  function finish(cx, cy, wk = 1, dk = 1) { hazeAndShadow(root, cx, cy, wk, dk); creases(first); }

  // ---- 台本の時刻管理 ----
  // const ev = kit.events(['lights', 'door']); dispatch で ev.dispatch(e, now)、tick で ev.ramp('door', now, 1000) が 0〜1 を返す
  function events(names) {
    const t = {}; const reset = () => names.forEach(n => { t[n] = null; }); reset();
    return { reset, dispatch(e, now) { if (!names.includes(e.type)) return false; t[e.type] = now; return true; }, at: n => t[n], on: n => t[n] !== null,
      since: (n, now) => (t[n] === null ? null : now - t[n]), ramp: (n, now, ms) => (t[n] === null ? 0 : clamp((now - t[n]) / ms)), eased: (n, now, ms) => (t[n] === null ? 0 : ease(clamp((now - t[n]) / ms))) };
  }

  return { THREE, W, TS, root, TOP: 7, mats, outline, extrude, box, cyl, lathe, tube, ball, pane, lines, group, hinge, rotor, slider, wheel, beam, pool, glow, stage, finish, events, clamp, ease };
}

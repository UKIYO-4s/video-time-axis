/* 見本の機械: オフィスビル（高層ビルの3D）。新しい機械を作るときの土台にしてください。
 * 考え方は reference/iso-glow/assets/examples/office-tower.js（iso-glow、MIT）の「階ごとに灯りが点く」を参考にし、
 * 3Dの形と動きをこのリポジトリの形式で書き直しています。
 *
 * ルール
 * - 動きは now（ミリ秒）と台本の event だけで決めます。Math.random・Date・setTimeout は使いません
 * - 寸法は x（右）・y（手前）・z（上）で書きます。C.W(x, y, z) で3Dの位置になります
 * - 光らせる部品は C.capMat() を使い、emissiveIntensity で明るさを変えます（色は settings.js の accent）
 */
window.addMachine('tower', function (C) {
  const { THREE, W, rbox, seg, plateWith, hazeAndShadow, creases, scene, bodyMat, recessMat, capMat, glowPoints, meshes } = C;
  const g0 = new THREE.Group(); scene.add(g0); const first = meshes.length;

  // ---- 寸法の表（まずここを決めます） ----
  const FLOORS = 18, FH = 6, BW = 40, BD = 40;             // 階数・1階の高さ・幅・奥行
  const X = 45, Y = 45, Z = 7;                             // 建物の置き場
  const TOP = Z + 8 + FLOORS * FH;                         // 屋上の高さ

  // ---- 形 ----
  plateWith(g0, 130, 130, [[11, 11], [119, 11], [11, 119], [119, 119]], null);
  rbox(X - 5, Y - 5, Z, BW + 10, BD + 10, 8, 1.5, bodyMat, g0);                 // 低層部
  const door = rbox(X + BW / 2 - 6, Y + BD + 4.6, Z, 12, 0.8, 5, 0.3, capMat(), g0);   // 入口（指で押す場所）
  const floors = [];
  for (let i = 0; i < FLOORS; i++) {
    const z = Z + 8 + i * FH;
    rbox(X, Y, z, BW, BD, FH - 1.6, 0.5, bodyMat, g0);                          // 床と柱
    rbox(X + 0.8, Y + 0.8, z + FH - 1.6, BW - 1.6, BD - 1.6, 1.6, 0.3, recessMat, g0, { lines: false });
    // 窓の帯（手前と右の2面）。階ごとに1つのマテリアルを持ち、明るさを変えます
    const mat = capMat();
    for (let k = 0; k < 8; k++) {
      rbox(X + 1.4 + k * 4.8, Y + BD - 0.2, z + 0.9, 4, 0.5, FH - 3.4, 0.1, mat, g0, { lines: false });
      rbox(X + BW - 0.2, Y + 1.4 + k * 4.8, z + 0.9, 0.5, 4, FH - 3.4, 0.1, mat, g0, { lines: false });
    }
    floors.push(mat);
  }
  rbox(X + 6, Y + 6, TOP - 1.6, BW - 12, BD - 12, 5, 0.5, bodyMat, g0);         // 屋上の機械室
  const mast = rbox(X + BW / 2 - 0.5, Y + BD / 2 - 0.5, TOP + 3.4, 1, 1, 16, 0.2, bodyMat, g0);   // 尖塔
  const beacon = glowPoints([W(X + BW / 2, Y + BD / 2, TOP + 20)], 0.28); g0.add(beacon);
  seg([[[X, Y + BD, Z + 8], [X, Y + BD, TOP]], [[X + BW, Y + BD, Z + 8], [X + BW, Y + BD, TOP]], [[X + BW, Y, Z + 8], [X + BW, Y, TOP]]], g0);
  hazeAndShadow(g0, X + BW / 2, Y + BD / 2, 1.0, 1.0); creases(first);

  // ---- 状態（reset で初期値に戻し、tick で now から計算します） ----
  const st = { rise: null, fall: null, beacon: false };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const STEP = 90;                                         // 1階あたりの点灯の間隔（ミリ秒）
  function reset() { st.rise = st.fall = null; st.beacon = false; floors.forEach(m => { m.emissiveIntensity = 0; }); beacon.material.uniforms.intensity.value = 0; }
  function litCount(now) {
    if (st.fall != null) return FLOORS - (now - st.fall) / STEP;
    if (st.rise != null) return (now - st.rise) / STEP;
    return 0;
  }
  function tick(now) {
    const n = litCount(now);
    floors.forEach((m, i) => { m.emissiveIntensity = clamp(n - i, 0, 1) * (i % 5 === 3 ? 0.55 : 1); });
    beacon.material.uniforms.intensity.value = st.beacon ? (Math.floor(now / 500) % 2 === 0 ? 1.1 : 0.15) : 0;
  }
  function dispatch(ev, now) {
    if (ev.type === 'lights' && ev.on) { st.rise = now; st.fall = null; return true; }
    if (ev.type === 'lights' && !ev.on) { st.fall = now; return true; }
    if (ev.type === 'beacon') { st.beacon = !!ev.on; return true; }
    return false;
  }
  function readout() { return `lights ${st.rise != null && st.fall == null ? 'on' : 'off'} · beacon ${st.beacon ? 'on' : 'off'}`; }

  reset();
  const over = [X + BW / 2, Y + BD / 2, Z + 50], low = [X + BW / 2, Y + BD, Z + 16], high = [X + BW / 2, Y + BD / 2, TOP + 6];
  return {
    group: g0, name: 'OFFICE TOWER', reset, tick, dispatch, readout,
    view: { target: over, dist: 6.0 },                     // 全景の見る場所と距離
    targets: { door }, kinds: { door: 'press' }, touchSide: { door: 'right' },
    frames: 240,                                           // この機械の長さ（30コマ = 1秒）
    // カット割り: 入口へ寄る → 全景へ引きながら回り込む → 屋上へ寄る → 全景
    shots: [
      { id: 'door', from: 0, move: 0, target: low, zoom: 2.4 },
      { id: 'wide', from: 62, move: 50, target: over, zoom: 1, orbit: -18 },
      { id: 'top', from: 138, move: 36, target: high, zoom: 2.2, orbit: -6 },
      { id: 'end', from: 200, move: 36, target: over, zoom: 1, orbit: 12 },
    ],
    // 台本: 入口を押す（36）→ 下から順に灯りが点く → 尖塔が点滅（120）
    defaultScript: [
      { frame: 36, type: 'lights', target: 'door', on: true },
      { frame: 120, type: 'beacon', on: true },
    ],
    hint: 'press the door · floors light up · beacon',
  };
});

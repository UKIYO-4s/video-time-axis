/* 手本: 乗用車。この粒度を基準にしてください。
 * 作る順番: 寸法 → 大きな形（輪郭の押し出し）→ 動く部品 → 細部 → 光 → 台 → 台本とカメラ
 * 前が +x、カメラから見える側面が +y。 */
window.addMachine('car', function (C) {
  const kit = C.kit, { W, lines, box, cyl, extrude, pane, group, hinge, wheel, beam, glow, mats, stage, finish, events, clamp } = kit;

  // ---- 1. 寸法の表（まずここを決める） ----
  const LEN = 122, WID = 52, PX = 42, PY = 40, PZ = kit.TOP;
  const AX = [24, 96], AZ = 11, R_ARCH = 12.5, R_T = 10.8;   // 車軸の位置・タイヤの切り欠きと半径
  const car = group([PX, PY, PZ]);

  // ---- 2. 材料 ----
  const paint = mats.paint(), glassDark = mats.glass(), rubber = mats.rubber(), metal = mats.metal(), dark = mats.dark();
  const lamp = mats.light(), cabin = mats.light(), strip = mats.light();

  // ---- 3. 大きな形: 側面の輪郭を押し出す。箱を重ねない ----
  extrude([
    [2, 7], [AX[0] - R_ARCH, 7], { arc: [AX[0], AZ, R_ARCH, Math.PI + 0.33, -0.33] },
    [AX[1] - R_ARCH, 7], { arc: [AX[1], AZ, R_ARCH, Math.PI + 0.33, -0.33] },
    [119, 7], [122, 15, 2], [121, 23], [112, 28, 3], [82, 31], [26, 31.5], [8, 30], [0, 22, 3], [0, 11], [2, 7],
  ], { y: [0, WID], mat: paint, parent: car, bevel: 2.5 });
  extrude([[18, 31], [30, 47], [34, 48], [66, 48], [71, 47], [88, 31]], { y: [4, WID - 4], mat: paint, parent: car, bevel: 2 });   // 客室

  // ---- 4. 窓: 光る面。傾いた窓は pane で作る ----
  const yOut = WID - 3.85, wy = [yOut, yOut + 0.2];
  extrude([[25, 33], [33, 45.5], [50, 45.5], [50, 33]], { y: wy, mat: cabin, parent: car, lines: false });
  extrude([[53, 33], [53, 45.5], [69.5, 45.5], [81, 33]], { y: wy, mat: cabin, parent: car, lines: false });
  pane([[72.5, 8, 46.2], [86.1, 8, 33.4], [86.1, WID - 8, 33.4], [72.5, WID - 8, 46.2]], { mat: cabin, parent: car });   // フロントガラス
  box(38, 10, 48, 26, WID - 20, 0.25, { r: 2, mat: glassDark, parent: car, lines: false });                               // 屋根のガラス

  // ---- 5. 動く部品: ドア。開いたときに見える車内も作る ----
  extrude([[54, 11], [54, 31], [81, 31], [81, 11]], { y: [WID - 0.2, WID + 0.02], mat: dark, parent: car, lines: false });
  extrude([[56, 13], [56, 29], [79, 29], [79, 13]], { y: [WID + 0.02, WID + 0.08], mat: cabin, parent: car, lines: false });
  box(58, WID - 11, 10, 15, 11.3, 11, { r: 2.5, mat: rubber, parent: car, lines: false });   // 座面
  box(57, WID - 11, 21, 5, 11.3, 10, { r: 2, mat: rubber, parent: car, lines: false });      // 背もたれ
  const HX = 81.5, door = hinge({ at: [HX, WID, 0], extends: '-x', opens: '+y', parent: car });
  const X0 = 54 - HX, Xf = 81 - HX;
  extrude([[X0, 11], [X0, 31.2], [Xf, 31.2], [Xf, 11]], { y: [-0.1, 1.4], mat: paint, parent: door });
  extrude([[X0, 31.2], [X0, 46], [69.8 - HX, 46], [81.6 - HX, 31.2]], { y: [-3.2, -2.2], mat: paint, parent: door });
  extrude([[X0 + 1.2, 32.2], [X0 + 1.2, 44.6], [69.2 - HX, 44.6], [79.2 - HX, 32.2]], { y: [-2.15, -2.05], mat: cabin, parent: door, lines: false });
  box(X0 + 3, 1.4, 25, 6, 0.8, 1.4, { r: 0.3, mat: metal, parent: door, lines: false });     // ドアハンドル
  lines([[[X0, 1.45, 12], [Xf, 1.45, 12]], [[X0, 1.45, 29], [Xf, 1.45, 29]]], { parent: door });

  // ---- 6. 細部: 継ぎ目・グリル・バンパー・ミラー・ナンバー。実物にあるものを足す ----
  const yS = WID + 0.1;
  lines([[[28, yS, 11], [28, yS, 31]], [[54, yS, 31], [28, yS, 31]], [[38, yS, 9], [82, yS, 9]], [[100, yS, 30], [100, yS, 25]]], { parent: car });
  lines([[[90, 6, 29.5], [116, 6, 28]], [[90, WID - 6, 29.5], [116, WID - 6, 28]]], { parent: car, strong: true });   // ボンネット
  box(38, yS - 0.3, 24, 6, 0.8, 1.4, { r: 0.3, mat: metal, parent: car, lines: false });     // 後ドアのハンドル
  box(120.5, 9, 13, 2.4, WID - 18, 8, { r: 1, mat: dark, parent: car, lines: false });       // グリル
  lines([0, 1, 2, 3].map(i => [[123, 10.5, 14.5 + i * 1.7], [123, WID - 10.5, 14.5 + i * 1.7]]), { parent: car, strong: true });
  box(121, 3, 7, 3, WID - 6, 4.5, { r: 1.5, mat: rubber, parent: car });                     // 前バンパー
  box(-1.5, 3, 7, 3, WID - 6, 4.5, { r: 1.5, mat: rubber, parent: car });                    // 後バンパー
  box(123.2, WID / 2 - 7, 11.5, 0.4, 14, 3, { r: 0.2, mat: metal, parent: car, lines: false });   // ナンバープレート
  box(79, WID - 1, 32, 5, 4.5, 3, { r: 1, mat: paint, parent: car });                        // ミラー
  box(79, -3.5, 32, 5, 4.5, 3, { r: 1, mat: paint, parent: car });

  // ---- 7. 光: ヘッドライト・帯・路面に落ちる光 ----
  const lampY = [[4, 13], [WID - 13, WID - 4]];
  lampY.forEach(([a, b]) => box(120.4, a, 20.5, 2.4, b - a, 4, { r: 1, mat: lamp, parent: car, lines: false }));
  box(6, yS - 0.05, 18, 44, 0.3, 0.8, { r: 0.1, mat: strip, parent: car, lines: false });
  box(84, yS - 0.05, 18, 12, 0.3, 0.8, { r: 0.1, mat: strip, parent: car, lines: false });
  box(-0.6, 4, 21, 1.2, WID - 8, 2, { r: 0.5, mat: lamp, parent: car, lines: false });
  const flare = glow(lampY.map(([a, b]) => [PX + 123.4, PY + (a + b) / 2, PZ + 22.5]));
  const beams = lampY.map(([a, b]) => beam({ at: [PX + 123, PY + (a + b) / 2, PZ + 0.35], dir: '+x', length: 84, width: 30 }));

  // ---- 8. タイヤ ----
  const wheels = [];
  AX.forEach(x => [[5, -1], [WID - 5, 1]].forEach(([y, side]) => wheels.push(wheel({ at: [x, y, AZ], r: R_T, width: 7, side, parent: car }))));

  // ---- 9. 台: 道路。走行中は白線が流れて、動きが分かる ----
  const PW = 250, PD = 132; stage(PW, PD);
  lines([[[8, 22, PZ + 0.1], [PW - 8, 22, PZ + 0.1]], [[8, PD - 22, PZ + 0.1], [PW - 8, PD - 22, PZ + 0.1]]], { strong: true });
  const dashes = group(), DASH = 44;
  for (let i = 1; i <= 5; i++) box(i * DASH, PD - 30, PZ + 0.02, 22, 2, 0.1, { r: 0.2, mat: C.ledOffMat, parent: dashes, lines: false });
  finish(PX + LEN / 2, PY + WID / 2, 1.5, 0.9);

  // ---- 10. 状態: 台本の時刻から毎コマ計算する ----
  const ev = events(['lights', 'roll', 'stop', 'door', 'cabin']), SPEED = 0.09, BRAKE = 700;
  function distance(now) {
    if (!ev.on('roll')) return 0; if (!ev.on('stop')) return (now - ev.at('roll')) * SPEED;
    const u = clamp((now - ev.at('stop')) / BRAKE); return (ev.at('stop') - ev.at('roll')) * SPEED + SPEED * BRAKE * (u - u * u / 2);
  }
  function reset() { ev.reset(); tick(0); }
  function tick(now) {
    const d = distance(now); wheels.forEach(w => w.spin(d)); dashes.position.x = -(d % DASH) * kit.TS;
    const L = ev.ramp('lights', now, 350), K = ev.ramp('cabin', now, 500);
    lamp.set(1.6 * L); strip.set(1.3 * L); flare.set(1.2 * L); beams.forEach(b => b.set(L)); wheels.forEach(w => w.hub.set(1.4 * L)); cabin.set(0.12 * L + 1.15 * K);
    door.set(ev.eased('door', now, 1000) * 60);
    C.tickFlashes(now);
  }
  const dispatch = (e, now) => ev.dispatch(e, now);
  const readout = () => `lights ${ev.on('lights') ? 'on' : 'off'} · ${!ev.on('roll') ? 'parked' : ev.on('stop') ? 'stopped' : 'driving'} · door ${ev.on('door') ? 'open' : 'closed'}`;
  reset();

  // ---- 11. カメラと台本: 見せ場へ寄る → 全体 → 別の見せ場 → 全体 ----
  const over = [PX + LEN / 2 + 14, PY + WID / 2, PZ + 16], side = [PX + 68, PY + WID, PZ + 22], front = [PX + 118, PY + WID / 2, PZ + 18];
  return {
    group: kit.root, name: 'PASSENGER CAR', reset, tick, dispatch, readout, frames: 240,
    view: { target: over, dist: 6.6 },
    shots: [
      { id: 'front', from: 0, move: 0, target: front, zoom: 1.9, orbit: 6 },
      { id: 'wide', from: 50, move: 45, target: over, zoom: 1.45 },
      { id: 'door', from: 126, move: 44, target: side, zoom: 1.9, orbit: -48 },
      { id: 'end', from: 208, move: 30, target: over, zoom: 1.45, orbit: 6 },
    ],
    defaultScript: [{ frame: 12, type: 'lights' }, { frame: 36, type: 'roll' }, { frame: 118, type: 'stop' }, { frame: 142, type: 'door' }, { frame: 168, type: 'cabin' }],
    hint: 'lights · drive · stop · door · cabin light',
  };
});

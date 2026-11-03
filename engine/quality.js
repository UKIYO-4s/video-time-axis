// 品質チェック: 自作の機械を、描いた画素と部品の数で測る。乱数なし。結果は「どこを直すか」まで書く。
const W = 200, H = 150;
function sample(ctx, screen, small, bg) {
  small.drawImage(screen, 0, 0, W, H);
  const d = small.getImageData(0, 0, W, Math.floor(H * 0.93)).data;   // 下の字幕は除く
  return d;
}
function measure(d, accent) {
  const rows = d.length / 4 / W; let obj = 0, lit = 0, x0 = W, x1 = -1, y0 = rows, y1 = -1;
  for (let i = 0, p = 0; i < d.length; i += 4, p++) {
    const r = d[i], g = d[i + 1], b = d[i + 2]; const dist = Math.abs(r - 18) + Math.abs(g - 19) + Math.abs(b - 20);
    if (dist < 14) continue; obj++; const x = p % W, y = Math.floor(p / W); if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    const max = Math.max(r, g, b), min = Math.min(r, g, b); if (max > 70 && max - min > 40) { const n = Math.hypot(r, g, b) * Math.hypot(...accent) || 1; if ((r * accent[0] + g * accent[1] + b * accent[2]) / n > 0.85) lit++; }
  }
  return { obj, lit, fillW: x1 < 0 ? 0 : (x1 - x0 + 1) / W, fillH: y1 < 0 ? 0 : (y1 - y0 + 1) / rows, area: x1 < 0 ? 0 : (x1 - x0 + 1) * (y1 - y0 + 1) / (W * rows), edge: x0 === 0 || x1 === W - 1 || y0 === 0 };
}
function diff(a, b) { let n = 0; for (let i = 0; i < a.length; i += 4) if (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]) > 18) n++; return n / (a.length / 4); }
const hex = s => [1, 3, 5].map(i => parseInt(s.slice(i, i + 2), 16));

// 合格ラインは実測で決めた（良い例の車 112部品・44種類・75%、箱だけの車 33部品・14種類・10%）
export const LIMITS = { parts: 60, kinds: 20, moving: 3, area: 0.25, lastArea: 0.2, litArea: 0.01, still: 2.0, cuts: 2 };

export async function measureScene({ sc, range, renderGlobal, screen, S, source }) {
  const c = document.createElement('canvas'); c.width = W; c.height = H; const small = c.getContext('2d', { willReadFrequently: true });
  const C = sc.inst.C, meshes = []; C.scene.traverse(o => { if (o.isMesh || o.isLineSegments2) meshes.push(o); });
  const solid = meshes.filter(m => m.isMesh && !m.userData.outline && m.geometry);
  const kinds = new Set(solid.map(m => { m.geometry.computeBoundingBox(); const s = m.geometry.boundingBox.getSize(new C.THREE.Vector3()); return `${m.geometry.attributes.position.count}:${s.toArray().map(v => (v / (Math.max(s.x, s.y, s.z) || 1)).toFixed(1)).join()}`; }));
  const n = Math.max(2, Math.min(17, range.len)), accent = hex(sc.sc.accent), rows = []; let prev = null, stillRun = 0, stillMax = 0, firstPose = null, lastPose = null;
  const pose = () => { C.scene.updateMatrixWorld(true); return solid.map(m => m.matrixWorld.elements.join()); };
  const emis = () => solid.map(m => (m.material && m.material.emissiveIntensity) || 0);
  let lastEm = null, litChanged = false, ms = 0; const litSeen = new Set(); const step = (range.len - 1) / (n - 1);
  for (let i = 0; i < n; i++) {
    const g = range.start + Math.round(i * step); await renderGlobal(g);
    const d = sample(null, screen, small).slice(), m = measure(d, accent); rows.push(m);
    const p = pose(), e = emis(); if (!firstPose) firstPose = p; lastPose = p; if (lastEm) e.forEach((v, k) => { if (Math.abs(v - lastEm[k]) > 0.05) { litChanged = true; litSeen.add(k); } }); lastEm = e;
    if (prev) { const f = diff(prev, d); if (f < 0.0015) { stillRun += step; stillMax = Math.max(stillMax, stillRun); } else stillRun = 0; ms = Math.max(ms, f); } prev = d;
  }
  // 動いた部品の数（親の違いで数える）: 最初と最後の位置が違う部品を調べる
  const movedParents = new Set(); solid.forEach((m, k) => { if (firstPose[k] !== lastPose[k]) movedParents.add(m.parent ? m.parent.uuid : m.uuid); else if (litSeen.has(k)) movedParents.add(m.material.uuid); });
  await renderGlobal(range.start + Math.floor(range.len / 2)); const h1 = sample(null, screen, small).slice(); await renderGlobal(range.start); await renderGlobal(range.start + Math.floor(range.len / 2)); const h2 = sample(null, screen, small).slice();
  const best = rows.reduce((a, b) => (b.area > a.area ? b : a)), litMax = rows.reduce((a, b) => Math.max(a, b.lit / (W * H * 0.93)), 0), last = rows[rows.length - 1];
  const src = source ? source(sc.sc.machine) : '';
  const banned = ['Math.random', 'Date.now', 'new Date', 'performance.now', 'setTimeout', 'setInterval', 'requestAnimationFrame'].filter(w => src.includes(w));
  const fixedColor = /['"]#[0-9a-fA-F]{6}['"]/.test(src);
  return { machine: sc.sc.machine, parts: solid.length, kinds: kinds.size, moving: movedParents.size, litChanged, area: +best.area.toFixed(3), lastArea: +last.area.toFixed(3), lastEdge: last.edge, litArea: +litMax.toFixed(4), stillSec: +(stillMax / S.fps).toFixed(2), maxChange: +ms.toFixed(4), cuts: (sc.inst.fig.shots || []).length, camera: sc.sc.camera || 'shots', orbit: sc.sc.orbit || 0, zoom: sc.sc.zoom || null, repeat: diff(h1, h2) === 0, banned, fixedColor };
}

export async function runQuality({ list, ranges, renderGlobal, screen, S, source }) {
  const results = [];
  for (const { sc, i } of list) { const m = await measureScene({ sc, range: ranges[i], renderGlobal, screen, S, source }); results.push({ m, items: judge(m) }); }
  return { results, ok: results.every(r => r.items.every(x => x.ok)) };
}

export function judge(m) {
  const L = LIMITS, moved = m.camera === 'shots' ? m.cuts >= L.cuts : (m.orbit !== 0 || m.zoom);
  return [
    { name: '部品の数', ok: m.parts >= L.parts, val: `${m.parts} 個（目安 ${L.parts} 個以上）`, fix: '箱を増やすのではなく、継ぎ目、取っ手、ねじ、窓枠、ボタンなど実物にある部品を足してください' },
    { name: '形の種類', ok: m.kinds >= L.kinds, val: `${m.kinds} 種類（目安 ${L.kinds} 種類以上）`, fix: 'kit.extrude の輪郭、kit.cyl の円柱、kit.pane の斜めの板を使い、箱以外の形を増やしてください' },
    { name: '動く・点灯する部品', ok: m.moving >= L.moving, val: `${m.moving} 組（目安 ${L.moving} 組以上）`, fix: 'kit.hinge・kit.rotor・kit.slider・kit.wheel で動く部品を増やし、defaultScript で動かしてください' },
    { name: '画面での大きさ', ok: m.area >= L.area, val: `画面の ${Math.round(m.area * 100)}%（目安 ${Math.round(L.area * 100)}%以上）`, fix: 'view の dist を小さくするか、shots の zoom を上げてください' },
    { name: '最後の構図', ok: !m.lastEdge && m.lastArea >= L.lastArea, val: m.lastEdge ? '画面の端で切れています' : `画面の ${Math.round(m.lastArea * 100)}%（目安 ${Math.round(L.lastArea * 100)}%以上）`, fix: '最後のカットの target を機械の中心にして、機械が小さければ zoom を上げ、切れていれば下げてください' },
    { name: '光', ok: m.litArea >= L.litArea, val: `光る面積 ${(m.litArea * 100).toFixed(1)}%（目安 ${(L.litArea * 100).toFixed(1)}%以上）`, fix: '実物で光る部品（ランプ、表示、ラベルなど）の面を kit.mats.light() にしてください。kit.beam や kit.pool も使えます。実物にない面を足したり、点の glow だけで増やしたりしないでください' },
    { name: '止まっている時間', ok: m.stillSec <= L.still, val: `最長 ${m.stillSec} 秒（目安 ${L.still} 秒以内）`, fix: '台本の間隔を詰めるか、カメラの動きを足してください' },
    { name: 'カメラ', ok: !!moved, val: m.camera === 'shots' ? `カット ${m.cuts} 個` : `${m.camera}`, fix: 'shots に2カット以上入れて、全景と見せ場への寄りを作ってください（カメラなしの指定なら、この項目は無視して構いません）' },
    { name: '同じ絵になるか', ok: m.repeat && m.banned.length === 0, val: m.banned.length ? `使えないものがあります: ${m.banned.join(', ')}` : (m.repeat ? '同じコマは同じ絵です' : '同じコマで絵が変わります'), fix: '動きは now と台本だけで決め、乱数は C.rng() を使ってください' },
    { name: '色の指定', ok: !m.fixedColor, val: m.fixedColor ? 'ファイルに色コードが直接書かれています' : '問題ありません', fix: '光る色は settings.js の accent で決まります。ファイルから色コードを消してください' },
  ];
}

export function formatQuality(r) {
  const out = [];
  r.results.forEach(({ m, items }) => {
    const ng = items.filter(x => !x.ok);
    out.push(`【${m.machine}】${ng.length ? `要修正 ${ng.length} 件` : '合格'}`);
    items.forEach(x => out.push(`${x.ok ? '○' : '×'} ${x.name}: ${x.val}`));
    if (ng.length) { out.push('直し方:'); ng.forEach(x => out.push(`- ${x.name}: ${x.fix}`)); }
  });
  out.push(r.ok ? '見た目は最後に人の目で確かめてください。' : '上の結果をそのままChatGPTに貼ると、直してもらえます。');
  return out.join('\n');
}

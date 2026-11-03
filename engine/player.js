// 再生と書き出し。settings.js の場面を順につなぎ、通しのコマ番号 g から1枚の絵を描く。
// 描き方は「コマ番号 → 絵」の決まった計算だけ。乱数や現在時刻は使わない。
import { Muxer, ArrayBufferTarget } from '../vendor/mp4-muxer/mp4-muxer.mjs';
import { makeKit } from './kit.js';
import { runQuality, formatQuality } from './quality.js';

const FONT = "ui-monospace, 'SF Mono', Menlo, Consolas, monospace";
const BUILT_IN = ['camera', 'phone', 'projector'];
const CAMERAS = ['shots', 'overview', 'iso'];
const EASE = {
  linear: t => t,
  ease_in_quad: t => t * t,
  ease_out_quad: t => 1 - (1 - t) * (1 - t),
  ease_in_out_cubic: t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
};

const $ = id => document.getElementById(id);
const screen = $('screen');
const ctx = screen.getContext('2d');

// ---- エラー表示: どこで失敗したかを必ず添える ----
class StepError extends Error {
  constructor(step, cause) {
    super(`${step}で失敗しました: ${cause && cause.message ? cause.message : cause}`);
    this.step = step; this.cause = cause;
  }
}
function showStatus(text, isError = false) {
  const el = $('status'); el.textContent = text; el.classList.toggle('error', isError);
  if (isError) console.error('[video-time-axis]', text);
}

// ---- 設定の確認（想定内のエラー: 読者が書き換えた値の誤り） ----
function checkSettings(S) {
  const problems = [];
  if (!S || !Array.isArray(S.scenes) || S.scenes.length === 0) problems.push('scenes が空です');
  if (!(S.fps > 0)) problems.push('fps は1以上の数にしてください');
  if (!(S.width > 0 && S.width % 2 === 0 && S.height > 0 && S.height % 2 === 0)) problems.push('width と height は偶数にしてください');
  (S.scenes || []).forEach((sc, i) => {
    const n = `scenes の ${i + 1} 番目`;
    if (typeof sc.machine !== 'string' || !sc.machine) problems.push(`${n}: machine に機械の名前を書いてください`);
    if (!(Number.isInteger(sc.from) && Number.isInteger(sc.to) && sc.from >= 0 && sc.to > sc.from)) problems.push(`${n}: from と to は整数で、to を from より大きくしてください`);
    if (!/^#[0-9a-fA-F]{6}$/.test(sc.accent || '')) problems.push(`${n}: accent は #22d3ee のような6桁の色コードにしてください`);
    // カメラと演出（書かなければ、機械の標準の動きになる）
    if (sc.camera != null && !CAMERAS.includes(sc.camera)) problems.push(`${n}: camera は ${CAMERAS.join(' / ')} のどれかにしてください（いまは "${sc.camera}"）`);
    if (sc.orbit != null && !Number.isFinite(sc.orbit)) problems.push(`${n}: orbit は回り込む角度を数字で書いてください（例: 45）`);
    if (sc.zoom != null && !(Array.isArray(sc.zoom) && sc.zoom.length === 2 && sc.zoom.every(v => v > 0))) problems.push(`${n}: zoom は [始まりの倍率, 終わりの倍率] で書いてください（例: [1, 1.8]）`);
    if (sc.easing != null && !EASE[sc.easing]) problems.push(`${n}: easing は ${Object.keys(EASE).join(' / ')} のどれかにしてください`);
    if (sc.theme != null && !['dark', 'light'].includes(sc.theme)) problems.push(`${n}: theme は dark / light のどちらかにしてください`);
    if (sc.touch != null && typeof sc.touch !== 'boolean') problems.push(`${n}: touch は true / false で書いてください`);
    if (sc.caption != null && typeof sc.caption !== 'boolean') problems.push(`${n}: caption は true / false で書いてください`);
    if (sc.script != null && !Array.isArray(sc.script)) problems.push(`${n}: script は [{ frame: 30, type: 'click', target: '名前' }] のような並びで書いてください`);
    if (sc.shots != null) {
      if (!Array.isArray(sc.shots) || !sc.shots.length) problems.push(`${n}: shots は1つ以上のカットの並びで書いてください`);
      else sc.shots.forEach((sh, j) => {
        if (!(Number.isInteger(sh.from) && sh.from >= 0) || (j === 0 && sh.from !== 0) || (j > 0 && sh.from <= sc.shots[j - 1].from)) problems.push(`${n}: shots の ${j + 1} 番目: from は0から始まる昇順の整数にしてください`);
        if (!(Array.isArray(sh.target) && sh.target.length === 3 && sh.target.every(Number.isFinite))) problems.push(`${n}: shots の ${j + 1} 番目: target は [x, y, z] で書いてください`);
        if (!(sh.zoom > 0)) problems.push(`${n}: shots の ${j + 1} 番目: zoom は0より大きい数にしてください`);
      });
    }
  });
  if (problems.length) throw new StepError('settings.js の確認', problems.join('\n'));
}

// ---- 場面ごとに、機械の描画を1つずつ用意する ----
function makeScene(proto, S, sc, box) {
  const canvas = document.createElement('canvas'); canvas.width = S.width; canvas.height = S.height;
  const dom = document.createElement('div');
  box.append(canvas, dom);
  const zoom = sc.zoom || [1, 1];
  const cfg = {
    slots: { script: sc.script ? JSON.stringify(sc.script) : 'auto', label: sc.label || sc.machine.toUpperCase() },
    brand: { color_bg: '#121314', color_accent: sc.accent, color_text: '#e6e8e9', color_muted: '#4f5357', font_family: FONT },
    parameters: { machine: sc.machine, theme: sc.theme || 'dark', camera: sc.camera || 'shots', material: 'line', touch: sc.touch === false ? 'off' : 'on',
      orbit_deg: sc.orbit || 0, orbit_frames: sc.orbit ? sc.to - sc.from : 1,
      zoom_start: zoom[0], zoom_end: zoom[1], zoom_frames: sc.zoom ? sc.to - sc.from : 1, move_from: sc.from,
      easing: sc.easing || 'ease_in_out_cubic', caption: sc.caption === false ? 'off' : 'on' },
    manifest: { fps: { numerator: S.fps, denominator: 1 }, seed: 20261013, width: S.width, height: S.height, slots: { script: 'auto', label: sc.label || '' } },
  };
  const cs = { canvas, domRoot: dom, manifest: cfg.manifest, ease: EASE,
    slot: n => cfg.slots[n], brand: n => cfg.brand[n], param: n => cfg.parameters[n] };
  const inst = Object.create(proto);
  inst.prepare(cs);
  if (sc.shots) inst.fig.shots = sc.shots;
  const total = inst.fig.frames || null;
  if (total && sc.to > total) throw new StepError('settings.js の確認', `${sc.machine} は ${total} コマまでです（to=${sc.to}）`);
  return { sc, cs, inst, canvas, dom };
}

// ---- 読者が作った機械（my-machines/ のファイル）を順に読み込む ----
let addCalls = 0; const userMade = new Set();
function loadMyMachine(file) {
  return new Promise((resolve, reject) => {
    if (!/^[A-Za-z0-9_-]+\.js$/.test(file)) { reject(new StepError('settings.js の確認', `myMachines の "${file}" は tower.js のようなファイル名だけを書いてください`)); return; }
    // ファイルを直接開くと、Chromeは文法エラーの詳細を隠すことがある。そのため「登録されたか」でも確かめる
    const src = `./my-machines/${file}`; let scriptError = null; const before = addCalls;
    const onError = e => { scriptError = e.lineno && !/^Script error/.test(e.message) ? `${e.lineno} 行目: ${e.message}` : '文法の誤りがあります'; };
    window.addEventListener('error', onError);
    const el = document.createElement('script'); el.src = src;
    const hint = 'ファイルの書き方に誤りがあります。Chromeで ⌥⌘J を押すと、赤い行に場所が出ます';
    el.onload = () => {
      window.removeEventListener('error', onError);
      if (scriptError || addCalls === before) reject(new StepError(`my-machines/${file} の読み込み`, `${scriptError ? scriptError + '。' : ''}${hint}`));
      else resolve();
    };
    el.onerror = () => { window.removeEventListener('error', onError); reject(new StepError(`my-machines/${file} の読み込み`, 'ファイルが見つかりません')); };
    document.head.appendChild(el);
  });
}

// ---- 字幕と指の演出を、絵の上に重ねる（書き出しにも同じものが入る） ----
async function drawOverlay(scene, W, H) {
  const svg = scene.dom.querySelector('svg');
  if (svg && svg.childNodes.length) {
    const copy = svg.cloneNode(true);
    copy.setAttribute('xmlns', 'http://www.w3.org/2000/svg'); copy.setAttribute('width', W); copy.setAttribute('height', H);
    const img = new Image();
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(new XMLSerializer().serializeToString(copy));
    await img.decode();
    ctx.drawImage(img, 0, 0, W, H);
  }
  const cap = scene.dom.querySelector('.ig3-cap');
  if (cap && cap.style.display !== 'none') {
    const hint = (cap.firstChild && cap.firstChild.textContent || '').toUpperCase();
    const ro = scene.inst.ro ? scene.inst.ro.textContent : '';
    const y = H - H * 0.024 - 1, left = W * 0.022, right = W - W * 0.022;
    ctx.save();
    ctx.font = `12px ${FONT}`; ctx.textBaseline = 'bottom';
    ctx.letterSpacing = '1.68px'; ctx.fillStyle = '#868b8f'; ctx.textAlign = 'left'; ctx.fillText(hint, left, y);
    ctx.letterSpacing = '0.6px'; ctx.fillStyle = '#e6e8e9'; ctx.textAlign = 'right'; ctx.fillText(ro, right, y);
    ctx.restore();
  }
}

async function main() {
  const S = window.SETTINGS;
  try { checkSettings(S); } catch (e) { showStatus(e.message, true); return; }
  screen.width = S.width; screen.height = S.height;
  screen.style.aspectRatio = `${S.width} / ${S.height}`;

  // 機械の描画部品を読み込む（machines.js は CS.registerScene で自分を登録する）
  window.CS = { scene: null, registerScene(s) { this.scene = s; } };
  try { await import('./machines.js'); } catch (e) {
    showStatus(new StepError('描画部品（engine/machines.js）の読み込み', e).message, true); return;
  }

  // 読者の機械を読み込み、settings.js が指定した機械がそろっているか確かめる
  const G3 = window.ISOGLOW3D;
  window.addMachine = (id, make) => { addCalls++; G3.machines[id] = (C, opts) => { Object.defineProperty(C, 'kit', { configurable: true, get() { const k = makeKit(C); Object.defineProperty(C, 'kit', { value: k }); return k; } }); return make(C, opts); }; G3.machines[id].source = String(make); userMade.add(id); };
  try {
    for (const file of S.myMachines || []) await loadMyMachine(file);
    const known = Object.keys(G3.machines);
    const missing = S.scenes.map((sc, i) => (known.includes(sc.machine) ? null : `scenes の ${i + 1} 番目: machine "${sc.machine}" がありません。使えるのは ${known.join(' / ')} です`)).filter(Boolean);
    if (missing.length) throw new StepError('settings.js の確認', missing.join('\n'));
  } catch (e) { showStatus(e instanceof StepError ? e.message : new StepError('自作の機械の読み込み', e).message, true); return; }

  let scenes;
  try { scenes = S.scenes.map((sc, i) => { try { return makeScene(window.CS.scene, S, sc, $('hidden')); } catch (e) { if (e instanceof StepError) throw e; throw new StepError(`scenes の ${i + 1} 番目（${sc.machine}）の準備`, e); } }); }
  catch (e) { showStatus(e instanceof StepError ? e.message : new StepError('機械の準備', e).message, true); return; }

  // 通しのコマ番号 g → どの場面の何コマ目か
  const ranges = []; let total = 0;
  scenes.forEach((s, i) => { const len = s.sc.to - s.sc.from; ranges.push({ i, start: total, len }); total += len; });
  const locate = g => { const r = ranges.find(r => g < r.start + r.len) || ranges[ranges.length - 1]; return { scene: scenes[r.i], local: scenes[r.i].sc.from + (g - r.start), index: r.i }; };

  let busy = false;
  async function renderGlobal(g) {
    const { scene, local } = locate(g);
    try { scene.inst.renderFrame(scene.cs, local); } catch (e) { throw new StepError(`${scene.sc.machine} の ${local} コマ目の描画`, e); }
    ctx.drawImage(scene.canvas, 0, 0, S.width, S.height);
    await drawOverlay(scene, S.width, S.height);
  }

  const seek = $('seek'), counter = $('counter'), playBtn = $('play'), exportBtn = $('export');
  seek.max = String(total - 1);
  let frame = 0;
  async function show(g) {
    frame = g; busy = true; let ok = true;
    try { await renderGlobal(g); } catch (e) { showStatus(e.message, true); playing = false; ok = false; }
    busy = false;
    const { scene, local } = locate(g);
    seek.value = String(g);
    counter.textContent = `コマ ${g + 1} / ${total}（${(g / S.fps).toFixed(2)} 秒）${scene.sc.machine} ${local}`;
    return ok;
  }

  // 再生: 1秒に fps コマずつ進める。描画が間に合わないときはコマを飛ばさず遅れる
  let playing = false, startTs = 0, startFrame = 0;
  function tick(ts) {
    if (!playing) return;
    if (!busy) {
      const g = startFrame + Math.floor((ts - startTs) * S.fps / 1000);
      if (g >= total) { playing = false; playBtn.textContent = '再生'; show(total - 1); return; }
      if (g !== frame) show(g);
    }
    requestAnimationFrame(tick);
  }
  playBtn.onclick = () => {
    playing = !playing; playBtn.textContent = playing ? '一時停止' : '再生';
    if (playing) { startFrame = frame >= total - 1 ? 0 : frame; startTs = performance.now(); requestAnimationFrame(tick); }
  };
  seek.oninput = () => { playing = false; playBtn.textContent = '再生'; if (!busy) show(Number(seek.value)); };

  // 書き出し: 全コマを順に描いて、ブラウザの中で MP4 にする
  async function exportMp4(onProgress) {
    if (typeof VideoEncoder === 'undefined') throw new StepError('書き出しの準備', 'このブラウザは動画の書き出し（WebCodecs）に対応していません。Google Chrome で開いてください');
    let config = null;
    for (const codec of ['avc1.640028', 'avc1.4d0028', 'avc1.42e028']) {
      const c = { codec, width: S.width, height: S.height, bitrate: 8_000_000, framerate: S.fps, avc: { format: 'avc' } };
      try { if ((await VideoEncoder.isConfigSupported(c)).supported) { config = c; break; } } catch (_) { /* 次の候補へ */ }
    }
    if (!config) throw new StepError('書き出しの準備', 'H.264 の書き出しに対応していません');
    const muxer = new Muxer({ target: new ArrayBufferTarget(), video: { codec: 'avc', width: S.width, height: S.height, frameRate: S.fps }, fastStart: 'in-memory' });
    let encodeError = null;
    const enc = new VideoEncoder({ output: (chunk, meta) => muxer.addVideoChunk(chunk, meta), error: e => { encodeError = e; } });
    enc.configure(config);
    const us = 1e6 / S.fps;
    for (let g = 0; g < total; g++) {
      await renderGlobal(g);
      if (encodeError) throw new StepError(`${g} コマ目のエンコード`, encodeError);
      const vf = new VideoFrame(screen, { timestamp: Math.round(g * us), duration: Math.round(us) });
      enc.encode(vf, { keyFrame: g % S.fps === 0 }); vf.close();
      while (enc.encodeQueueSize > 4) await new Promise(r => setTimeout(r, 5));
      if (onProgress) onProgress(g + 1, total);
    }
    try { await enc.flush(); } catch (e) { throw new StepError('エンコードの仕上げ', e); }
    if (encodeError) throw new StepError('エンコード', encodeError);
    muxer.finalize();
    return new Blob([muxer.target.buffer], { type: 'video/mp4' });
  }

  exportBtn.onclick = async () => {
    playing = false; playBtn.textContent = '再生';
    exportBtn.disabled = playBtn.disabled = seek.disabled = true;
    try {
      const blob = await exportMp4((n, t) => showStatus(`書き出し中… ${n} / ${t} コマ`));
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = S.fileName || 'video.mp4';
      document.body.appendChild(a); a.click(); a.remove();
      showStatus(`書き出しました: ${a.download}（${total} コマ・${(total / S.fps).toFixed(2)} 秒・${(blob.size / 1024).toFixed(0)} KB）。ダウンロードフォルダを確認してください。`);
    } catch (e) {
      showStatus(e instanceof StepError ? e.message : new StepError('書き出し', e).message, true);
    } finally {
      exportBtn.disabled = playBtn.disabled = seek.disabled = false; show(frame);
    }
  };

  // 品質チェック: 自作の機械がある場面だけ自動で測る。結果はページに表示し、コピーしてChatGPTに渡せる
  const quality = async () => {
    const list = scenes.map((sc, i) => ({ sc, i })).filter(x => userMade.has(x.sc.sc.machine));
    return runQuality({ list, ranges, renderGlobal, ctx, screen, S, source: id => G3.machines[id].source });
  };
  window.__vta = { total, renderGlobal, exportMp4, screen, quality, scenes, ranges };

  const firstOk = await show(0);
  playBtn.disabled = seek.disabled = false;
  if (!firstOk) return;   // 最初のコマで失敗したら、赤いメッセージを残す
  exportBtn.disabled = false;
  showStatus(`準備ができました。${scenes.length} 場面・${total} コマ・${(total / S.fps).toFixed(2)} 秒`);
  if (S.scenes.some(sc => userMade.has(sc.machine))) {
    const box = $('quality'), out = $('quality-text'), copy = $('quality-copy');
    box.hidden = false; out.textContent = '品質チェック中…';
    playBtn.disabled = seek.disabled = exportBtn.disabled = true;
    try { const r = await quality(); out.textContent = formatQuality(r); box.classList.toggle('ng', !r.ok); }
    catch (e) { out.textContent = new StepError('品質チェック', e).message; box.classList.add('ng'); }
    playBtn.disabled = seek.disabled = exportBtn.disabled = false;
    copy.onclick = async () => { try { await navigator.clipboard.writeText(out.textContent); copy.textContent = 'コピーしました'; } catch (_) { const r = document.createRange(); r.selectNodeContents(out); getSelection().removeAllRanges(); getSelection().addRange(r); copy.textContent = '選択しました。⌘Cでコピー'; } };
    await show(0);
  }
}

main().catch(e => showStatus(new StepError('ページの準備', e).message, true));

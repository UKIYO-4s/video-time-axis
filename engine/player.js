// 再生と書き出し。settings.js の場面を順につなぎ、通しのコマ番号 g から1枚の絵を描く。
// 描き方は「コマ番号 → 絵」の決まった計算だけ。乱数や現在時刻は使わない。
import { Muxer, ArrayBufferTarget } from '../vendor/mp4-muxer/mp4-muxer.mjs';

const FONT = "ui-monospace, 'SF Mono', Menlo, Consolas, monospace";
const MACHINES = ['camera', 'phone', 'projector'];
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
    if (!MACHINES.includes(sc.machine)) problems.push(`${n}: machine は ${MACHINES.join(' / ')} のどれかにしてください（いまは "${sc.machine}"）`);
    if (!(Number.isInteger(sc.from) && Number.isInteger(sc.to) && sc.from >= 0 && sc.to > sc.from)) problems.push(`${n}: from と to は整数で、to を from より大きくしてください`);
    if (!/^#[0-9a-fA-F]{6}$/.test(sc.accent || '')) problems.push(`${n}: accent は #22d3ee のような6桁の色コードにしてください`);
  });
  if (problems.length) throw new StepError('settings.js の確認', problems.join('\n'));
}

// ---- 場面ごとに、機械の描画を1つずつ用意する ----
function makeScene(proto, S, sc, box) {
  const canvas = document.createElement('canvas'); canvas.width = S.width; canvas.height = S.height;
  const dom = document.createElement('div');
  box.append(canvas, dom);
  const cfg = {
    slots: { script: 'auto', label: sc.label || sc.machine.toUpperCase() },
    brand: { color_bg: '#121314', color_accent: sc.accent, color_text: '#e6e8e9', color_muted: '#4f5357', font_family: FONT },
    parameters: { machine: sc.machine, theme: 'dark', camera: 'shots', material: 'line', touch: 'on', orbit_deg: 0, orbit_frames: 1,
      zoom_start: 1, zoom_end: 1, zoom_frames: 1, easing: 'ease_in_out_cubic', caption: 'on' },
    manifest: { fps: { numerator: S.fps, denominator: 1 }, seed: 20261013, width: S.width, height: S.height, slots: { script: 'auto', label: sc.label || '' } },
  };
  const cs = { canvas, domRoot: dom, manifest: cfg.manifest, ease: EASE,
    slot: n => cfg.slots[n], brand: n => cfg.brand[n], param: n => cfg.parameters[n] };
  const inst = Object.create(proto);
  inst.prepare(cs);
  const total = inst.fig.frames || null;
  if (total && sc.to > total) throw new StepError('settings.js の確認', `${sc.machine} は ${total} コマまでです（to=${sc.to}）`);
  return { sc, cs, inst, canvas, dom };
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

  // 機械の描画部品を読み込む（machines.js は CS.registerScene で自分を登録する）
  window.CS = { scene: null, registerScene(s) { this.scene = s; } };
  try { await import('./machines.js'); } catch (e) {
    showStatus(new StepError('描画部品（engine/machines.js）の読み込み', e).message, true); return;
  }

  let scenes;
  try { scenes = S.scenes.map(sc => makeScene(window.CS.scene, S, sc, $('hidden'))); }
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
    frame = g; busy = true;
    try { await renderGlobal(g); } catch (e) { showStatus(e.message, true); playing = false; }
    busy = false;
    const { scene, local } = locate(g);
    seek.value = String(g);
    counter.textContent = `コマ ${g + 1} / ${total}（${(g / S.fps).toFixed(2)} 秒）${scene.sc.machine} ${local}`;
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

  // 検証用の入口（ページの見た目には影響しない）
  window.__vta = { total, renderGlobal, exportMp4, screen };

  await show(0);
  playBtn.disabled = seek.disabled = exportBtn.disabled = false;
  showStatus(`準備ができました。${scenes.length} 場面・${total} コマ・${(total / S.fps).toFixed(2)} 秒`);
}

main().catch(e => showStatus(new StepError('ページの準備', e).message, true));

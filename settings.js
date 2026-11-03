// 動画の設定。機械の順番・色・長さ・カメラは、ここで変えます。
// 新しい機械（車など）を増やすときは、my-machines/ にファイルを足して myMachines に書きます。
// 動画は「場面」を上から順につないだものです。1場面 = 1台の機械。
//
// machine : 機械の種類（camera / phone / projector、または my-machines/ で作った機械）
// from    : その機械の動きの、何コマ目から使うか（30コマ = 1秒）
// to      : 何コマ目の手前まで使うか（from=150, to=210 なら 60コマ = 2秒）
// accent  : 光る色（#から始まる6桁の色コード）
// label   : 左下に出る名前
//
// 機械ごとの長さ: camera 240コマ（8秒）/ phone 270コマ（9秒）/ projector 240コマ（8秒）
//
// カメラと演出（各場面に足せます。書かなければ、機械の標準の動きになります）
// camera  : 'shots'（カット割りで動く）/ 'overview'（全景で固定）/ 'iso'（遠近のない図面のような見え方）
// orbit   : 場面の間に回り込む角度（例: 45 / -90）
// zoom    : 場面の間のズーム [始まり, 終わり]（例: [1, 1.8] で寄る）
// easing  : 動きの速さの配り方 linear / ease_in_quad / ease_out_quad / ease_in_out_cubic
// shots   : カット割りを自分で書く [{ from: 0, move: 0, target: [x, y, z], zoom: 1, orbit: 0 }, ...]
//           from は動き始めるコマ、move は移動にかけるコマ数、target は見る場所、zoom は倍率、orbit は回り込みの角度
// script  : 動きの台本を自分で書く（書ける内容は機械ごとに違います。START_HERE.md の表を参照）
// theme   : 'dark'（黒地）/ 'light'（白地）
// touch   : false で指の演出を消す
// caption : false で下の文字を消す
// 同じ設定なら、何度書き出しても同じ動画になります。

window.SETTINGS = {
  fps: 30,        // 1秒あたりのコマ数
  width: 1200,    // 横のピクセル数（偶数）
  height: 900,    // 縦のピクセル数（偶数）。縦動画なら width: 1080, height: 1920
  fileName: 'video-time-axis.mp4',
  myMachines: [],   // my-machines/ から読み込む自作の機械
  scenes: [
    { machine: 'camera',    from: 150, to: 210, accent: '#22d3ee', label: 'DIGITAL CAMERA' },
    { machine: 'phone',     from: 105, to: 165, accent: '#ff9a2e', label: 'ROTARY PHONE' },
    { machine: 'projector', from: 75,  to: 135, accent: '#fb7185', label: '8MM PROJECTOR' },
  ],
};

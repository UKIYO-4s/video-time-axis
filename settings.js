// 動画の設定。変えてよいのはこのファイルだけです。
// 動画は「場面」を上から順につないだものです。1場面 = 1台の機械。
//
// machine : 機械の種類（camera / phone / projector の3つから選ぶ）
// from    : その機械の動きの、何コマ目から使うか（30コマ = 1秒）
// to      : 何コマ目の手前まで使うか（from=150, to=210 なら 60コマ = 2秒）
// accent  : 光る色（#から始まる6桁の色コード）
// label   : 左下に出る名前
//
// 機械ごとの長さ: camera 240コマ（8秒）/ phone 270コマ（9秒）/ projector 240コマ（8秒）
// 同じ設定なら、何度書き出しても同じ動画になります。

window.SETTINGS = {
  fps: 30,        // 1秒あたりのコマ数
  width: 1200,    // 横のピクセル数
  height: 900,    // 縦のピクセル数
  fileName: 'video-time-axis.mp4',
  scenes: [
    { machine: 'camera',    from: 150, to: 210, accent: '#22d3ee', label: 'DIGITAL CAMERA' },
    { machine: 'phone',     from: 105, to: 165, accent: '#ff9a2e', label: 'ROTARY PHONE' },
    { machine: 'projector', from: 75,  to: 135, accent: '#fb7185', label: '8MM PROJECTOR' },
  ],
};

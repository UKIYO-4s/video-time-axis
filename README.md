# video-time-axis

動画は、1枚ずつ描いた絵を時間の順に並べたもの。
その考え方を、自分のMacで確かめるためのフォルダです。

カメラ・電話・プロジェクターの3台が動く6秒の動画を、ブラウザの中で1コマずつ描き、そのままMP4に書き出せます。
動画生成AIは使っていません。コマ番号から絵を計算して描くので、同じ設定なら何度書き出しても同じ動画になります。

## 使い方（ChatGPTのMacアプリを使う場合）

1. このページの緑の「Code」ボタン →「Download ZIP」でダウンロードし、解凍したフォルダを `video-time-axis` という名前でデスクトップに置く
2. ChatGPTのMacアプリに、次のように頼む

> デスクトップの video-time-axis フォルダにある START_HERE.md を読んで、書いてあるとおりに進めて

あとは、ChatGPTが Chrome でページを開き、書き出しと設定の変更を手伝います。手順の中身は [START_HERE.md](START_HERE.md) にあります。

## 必要なもの

- Mac
- Google Chrome
- ChatGPT のMacアプリ（設定を変えるときに使う。開いて書き出すだけなら、START_HERE.md の「1. 動画を開く」のコマンドを自分で実行しても同じ）

ffmpeg・Node.js などのインストールはいりません。

## フォルダの中身

| ファイル | 役割 |
|---|---|
| `index.html` | 再生・コマ送り・MP4書き出しのページ |
| `settings.js` | 機械の順番・色・長さの設定。**変えてよいのはこのファイルだけ** |
| `START_HERE.md` | ChatGPTアプリへの手順書 |
| `engine/player.js` | 場面をつないで描き、MP4にする処理 |
| `engine/machines.js` | 3台の機械の形と動き（下の出典を参照） |
| `vendor/` | 外部のライブラリ（three.js・mp4-muxer）。中身は変更していません |
| `licenses/` | 外部のライブラリのライセンス文 |

## 出典とライセンス

- 描画の土台 `engine/machines.js` の前半は、[iso-glow](https://iso-glow.vercel.app)（April Zhu）の 3D gallery の core.js をそのまま使っています。iso-glow は [iso-figure](https://github.com/MrBongoC/ai-iso-skill)（Tolga Cohce）をもとにしています。どちらも MIT ライセンスです（`licenses/iso-glow-LICENSE.txt`）。
- 3D表示は [three.js](https://threejs.org/) r160（MIT、`licenses/three.js-LICENSE.txt`）。
- MP4の書き出しは [mp4-muxer](https://github.com/Vanilagy/mp4-muxer) 5.2.2（Vanilagy、MIT、`licenses/mp4-muxer-LICENSE.txt`）。npm の公開物をそのまま同梱しています（integrity `sha512-dhozjTywI0h2qFzeShagt8YYw811fh1XlwiDCE2f6Aeqf6xG2CyuShoSa5E0AZDO8pPF0JOZ3wOmWBNWIGdSpQ==`）。
- 機械の形・動き・台本・カメラワーク・このページは、クリエイターズジャパンの Shoei が作成しました。実在の機種の写真やロゴは使っていません。

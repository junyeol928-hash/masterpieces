# 名画の部屋

有名な作品だけ、有名な画家だけを集めた読み物サイト。
1点ずつに「何が描かれているか」「なぜ有名になったか」「ここを見る」を書いている。

姉妹サイト『[世界美術史](https://junyeol928-hash.github.io/History-of-art/)』が
38章で美術史を通して語るのに対して、こちらは**知られている面だけ**を集める。

現在 **作品250点 ／ 画家159人 ／ 流派59** ── 目標の250点に到達した。本文は約16.7万字。

古いほうはラスコー洞窟壁画（前17000年ごろ）、新しいほうはリキテンスタイン（1963年）まで。
西洋を中心に、中国・イスラーム・インド・朝鮮・日本と、彫刻・建築も入れている。

## 仕組み

ページは書かない。**`data/*.json` から組み立てる。**

```
data/works.json      作品。基礎データと解説文
data/artists.json    画家
data/movements.json  流派
        ↓  tools/build.mjs
index.html works.html artists.html movements.html timeline.html
works/<id>.html  artists/<id>.html  movements/<id>.html
```

作品ページは最終的に250枚になる。手で書けば、体裁を一つ直すたびに250枚を直すことになる。
文章はデータに置き、体裁は `tools/build.mjs` に一箇所だけ置く。

**生成物はコミットしない。** 公開時に GitHub Actions が組む。

## 手元で動かす

```bash
node tools/fetch-artworks.mjs   # 図版を Wikimedia から落とす（初回のみ・数分）
python tools/shrink.py          # 幅と画質をそろえ、一覧用の縮小版を作る
node tools/build.mjs            # ページを組む
node tools/check.mjs            # 検算する
python -m http.server 8765      # http://127.0.0.1:8765/
```

`fetch-artworks.mjs` は Wikimedia のレート制限（429）に当たると待って三度まで試す。
取れなかったものは名指しで一覧に出す。

## 図版

三段構えで解決する（`assets/js/plate.js`）。

1. `assets/artworks/<id>.jpg` ── 焼き込み済み。ふだんはこれが出る
2. Wikimedia Commons の API ── 焼き込みそこねた分の保険
3. `assets/figures/<id>.svg` ── 構図を抽象化した自作図

**どの段で失敗しても、解説文は読める。**

## 著作権が生きている作品

ピカソ、ダリ、ウォーホルなどは、写真も**忠実な複製も**載せられない。
手で描いてもコードで描いても、複製は複製である。

そこに置くのは、面の分割と重心だけを取り出した**構図の図解**とする。
`data/works.json` で `"copyright": true` を立てると、
外に画像を探しにいかず（`noPhoto`）、`assets/figures/<id>.svg` を使い、
札に「構図図」と明示し、ページに「これは作品そのものではない」と書く。
かならず所蔵館の公式ページへリンクする。

## 決めごと

`docs/SPEC.md` に書いてある。とくに次の五つを守る。

1. 装飾を作品の事実と混同させない
2. 出典に必ず戻れる
3. 画像が出なくても文章は読める
4. 虫の写真・図版は載せない
5. 暗い地でも文字が読める

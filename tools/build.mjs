/* =========================================================================
   data/*.json から、サイトの全ページを組み立てる。

   なぜ生成するのか。
   作品ページは最終的に250枚になる。手で書けば、デザインを一つ直すたびに
   250枚を直すことになる。文章はデータに置き、体裁はここに一箇所だけ置く。

   生成物はコミットしない。公開時に GitHub Actions がこれを走らせる。
   ========================================================================= */
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => JSON.parse(readFileSync(join(ROOT, p), 'utf8'));

const works = read('data/works.json');
const artists = read('data/artists.json');
const movements = read('data/movements.json');

/* ---------- 検算 ────────────────────────────────────────
   壊れた参照は、生成してから気づくと探すのが難しい。ここで止める。 */
const artistById = new Map(artists.map((a) => [a.id, a]));
const movementById = new Map(movements.map((m) => [m.id, m]));
const problems = [];

const seen = new Set();
for (const w of works) {
  if (seen.has(w.id)) problems.push(`作品IDが重複: ${w.id}`);
  seen.add(w.id);
  if (w.artistId && !artistById.has(w.artistId)) problems.push(`${w.id}: 画家 ${w.artistId} がいない`);
  if (!movementById.has(w.movement)) problems.push(`${w.id}: 流派 ${w.movement} がない`);
  for (const k of ['lead', 'what', 'why', 'after']) if (!w[k]) problems.push(`${w.id}: ${k} が空`);
  if (!Array.isArray(w.look) || w.look.length < 1) problems.push(`${w.id}: look が空`);
  if (w.copyright && !w.figure) problems.push(`${w.id}: 著作権作品だが figure がない`);
  if (typeof w.yearSort !== 'number') problems.push(`${w.id}: yearSort が数値でない`);
}
for (const a of artists) {
  if (!works.some((w) => w.artistId === a.id)) problems.push(`画家 ${a.id} に作品がひとつもない`);
}
if (problems.length) {
  console.error('データに問題があります:\n' + problems.map((p) => '  - ' + p).join('\n'));
  process.exit(1);
}

/* ---------- 下ごしらえ ──────────────────────────────────── */
const byYear = [...works].sort((a, b) => a.yearSort - b.yearSort || a.id.localeCompare(b.id));
const worksOfArtist = (id) => byYear.filter((w) => w.artistId === id);
const worksOfMovement = (id) => byYear.filter((w) => w.movement === id);

/* CSS と JS にはバージョンを付ける。
   付けないと、体裁を直しても閲覧者の手元では古い版が使われ続ける。
   直したはずのものが直っていない、という取り違えがここで起きる。
   中身のハッシュを使うので、変えていないファイルの版は変わらない。 */
function assetVersion(rel) {
  try {
    return createHash('sha1').update(readFileSync(join(ROOT, rel))).digest('hex').slice(0, 8);
  } catch (e) {
    return '0';
  }
}
const V = {
  css:    assetVersion('assets/css/gallery.css'),
  plate:  assetVersion('assets/js/plate.js'),
  nav:    assetVersion('assets/js/nav.js'),
  filter: assetVersion('assets/js/filter.js'),
};

const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

const up = (depth) => '../'.repeat(depth);

/* ---------- 図版 ────────────────────────────────────────
   著作権が生きている作品には、抽象化した構図図を置く。
   これは作品の代わりではない。かならずその旨を添える。 */
function figureSvg(w) {
  const p = join(ROOT, 'assets/figures', `${w.figure}.svg`);
  if (!existsSync(p)) return '<div class="fallback-missing"></div>';
  return readFileSync(p, 'utf8').replace(/<\?xml[^>]*\?>\s*/, '').replace('<svg', '<svg class="fallback"');
}

function plate(w, { depth, card = false }) {
  const cls = ['plate', card ? '-card' : '', w.copyright ? '-drawn' : ''].filter(Boolean).join(' ');
  const alt = w.copyright
    ? `${w.title}の構図を抽象化した図`
    : `${w.title} ／ ${w.artist}`;
  const inner = w.copyright ? figureSvg(w) : '';
  return `<figure class="${cls}" data-art="${esc(w.id)}" data-alt="${esc(alt)}">
        <div class="mount">${inner}</div>
      </figure>`;
}

/* ---------- 枠 ──────────────────────────────────────────── */
function layout({ title, desc, body, depth = 0, nav = '', accent = null, cls = '' }) {
  const u = up(depth);
  const style = accent ? ` style="--accent:${accent};--accent-soft:${accent}28"` : '';
  const link = (href, label, key) =>
    `<a href="${u}${href}"${nav === key ? ' aria-current="page"' : ''}>${label}</a>`;
  return `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;500&family=Noto+Serif+JP:wght@400;600&display=swap">
<link rel="stylesheet" href="${u}assets/css/gallery.css?v=${V.css}">
</head>
<body class="${cls}"${style}>
<header class="site-head">
  <a class="brand" href="${u}index.html">名画の部屋</a>
  <nav>
    ${link('works.html', '作品', 'works')}
    ${link('artists.html', '画家', 'artists')}
    ${link('movements.html', '流派', 'movements')}
    ${link('timeline.html', '年表', 'timeline')}
  </nav>
</header>
<main>
${body}
</main>
<footer class="site-foot">
  <div class="wrap">
    <p>図版はウィキメディア・コモンズおよび各所蔵館の公開画像による。特記のないものはパブリックドメイン。</p>
    <p>著作権が存続している作品には、構図を抽象化した自作の図を置いている。作品そのものではない。所蔵館の公式ページで原作を確認できる。</p>
    <p><a href="${u}index.html">名画の部屋</a> ／ 姉妹サイト <a href="https://junyeol928-hash.github.io/History-of-art/">世界美術史</a></p>
  </div>
</footer>
<script src="${u}assets/js/plate.js?v=${V.plate}"></script>
<script src="${u}assets/js/nav.js?v=${V.nav}"></script>
</body>
</html>
`;
}

/* ---------- 戻る ────────────────────────────────────────
   href は「直接開かれたとき」の行き先。サイトの中から来た場合は
   nav.js が履歴を一つ戻す方に差し替える。 */
function backLink(href, label) {
  return `<a class="back" href="${href}"><span class="label">${esc(label)}</span></a>`;
}

/* ---------- 札 ──────────────────────────────────────────── */
function card(w, depth) {
  const u = up(depth);
  const badge = w.copyright ? '<span class="badge">構図図</span>' : '';
  return `<li>
      <a class="card" href="${u}works/${esc(w.id)}.html">
        ${plate(w, { depth, card: true })}
        <span class="label"><span class="t">${esc(w.title)}</span><span class="a">${esc(w.artist)}　${esc(w.year)}</span>${badge}</span>
      </a>
    </li>`;
}

/* ---------- 出力 ────────────────────────────────────────── */
const out = (rel, html) => {
  const p = join(ROOT, rel);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, html, 'utf8');
};

for (const d of ['works', 'artists', 'movements']) {
  rmSync(join(ROOT, d), { recursive: true, force: true });
}

/* ---------- 1. 入口 ─────────────────────────────────────── */
{
  const featured = works.find((w) => w.id === 'vermeer-girl-pearl') || byYear[0];
  const picks = ['leonardo-mona-lisa', 'hokusai-great-wave', 'van-gogh-starry-night', 'klimt-kiss',
                 'velazquez-las-meninas', 'munch-scream', 'picasso-guernica', 'botticelli-birth-of-venus']
    .map((id) => works.find((w) => w.id === id)).filter(Boolean);

  const body = `<div class="wrap">
  <section class="hero">
    <div>
      <p class="eyebrow">Masterpieces</p>
      <h1>名前を知っている絵の、<em>見かたを知る</em>。</h1>
      <p>有名な作品だけ、有名な画家だけを集めました。いま${works.length}点。
         1点ずつに、何が描かれているか、なぜ有名になったのか、そして画面のどこを見ればいいのかを書いています。</p>
      <a class="enter" href="works.html">展示室に入る →</a>
    </div>
    ${plate(featured, { depth: 0 })}
  </section>

  <section style="margin-top:2rem">
    <p class="eyebrow">まずこの八点</p>
    <ul class="grid">
      ${picks.map((w) => card(w, 0)).join('\n      ')}
    </ul>
  </section>

  <section style="margin-top:7rem">
    <p class="eyebrow">流派から入る</p>
    <ul class="bands">
      ${movements.map((m) => `<li><a href="movements/${esc(m.id)}.html" style="--band:${m.accent}">
        <span><span class="n">${esc(m.name)}</span><span class="y">${fmtSpan(m)}</span></span>
        <span class="l">${esc(m.lead)}</span></a></li>`).join('\n      ')}
    </ul>
  </section>
</div>`;
  out('index.html', layout({
    title: '名画の部屋 ── 有名な絵と、その見かた',
    desc: `有名な作品だけを集めた美術の読み物。${works.length}点それぞれに解説と「ここを見る」三点をつけています。`,
    body, depth: 0,
  }));
}

function fmtSpan(m) {
  const f = (n) => (n < 0 ? `前${-n}` : `${n}`);
  return `${f(m.from)} — ${f(m.to)}`;
}

/* ---------- 2. 作品一覧 ─────────────────────────────────── */
{
  const body = `<div class="wrap" style="padding-top:clamp(2.6rem,7vh,5rem)">
  <p class="eyebrow">Works</p>
  <h1 class="page-title">作品</h1>
  <p class="page-lead">時代順に並んでいます。流派や画家で絞り込めます。</p>

  <div class="filters">
    <div class="set">
      <span>流派</span>
      <button class="chip" aria-pressed="true" data-filter="movement" data-value="">すべて</button>
      ${movements.map((m) => `<button class="chip" aria-pressed="false" data-filter="movement" data-value="${esc(m.id)}">${esc(m.name)}</button>`).join('\n      ')}
    </div>
    <div class="set">
      <label><span class="visually-hidden"></span>
        <input class="search" type="search" placeholder="作品名・画家名で探す" aria-label="作品名・画家名で探す">
      </label>
    </div>
  </div>

  <p class="count"><span id="count">${works.length}</span> 点</p>
  <ul class="grid" id="grid">
    ${byYear.map((w) => cardFilterable(w)).join('\n    ')}
  </ul>
</div>
<script src="assets/js/filter.js?v=${V.filter}"></script>`;
  out('works.html', layout({
    title: '作品 ── 名画の部屋', desc: '有名な絵を時代順に並べ、流派と画家で絞り込めます。',
    body, depth: 0, nav: 'works',
  }));
}

function cardFilterable(w) {
  const key = [w.title, w.titleOriginal, w.artist, w.collection].filter(Boolean).join(' ').toLowerCase();
  return card(w, 0).replace('<li>', `<li data-movement="${esc(w.movement)}" data-key="${esc(key)}">`);
}

/* ---------- 3. 作品ページ ───────────────────────────────── */
byYear.forEach((w, i) => {
  const m = movementById.get(w.movement);
  const a = w.artistId ? artistById.get(w.artistId) : null;
  const prev = byYear[i - 1];
  const next = byYear[i + 1];

  const by = a
    ? `<a href="../artists/${esc(a.id)}.html">${esc(w.artist)}</a>`
    : esc(w.artist);

  const drawnNote = w.copyright
    ? `<p class="source" style="margin-top:1.6rem">
        <strong>この図版について。</strong>
        この作品は著作権が存続しているため、写真も複製も掲載できません。
        ここに置いているのは、面の分割と重心だけを取り出した<strong>構図の図解</strong>であり、
        作品そのものではありません。原作は
        ${w.collectionUrl ? `<a href="${esc(w.collectionUrl)}" rel="noopener">${esc(w.collection)}</a>` : esc(w.collection)}
        で見ることができます。</p>`
    : '';

  const wikiUrl = w.wiki
    ? `https://${w.wikiLang || 'ja'}.wikipedia.org/wiki/${encodeURIComponent(String(w.wiki).replace(/ /g, '_'))}`
    : null;

  const body = `<section class="stage">
  ${backLink('../works.html', '作品一覧へ')}
  ${plate(w, { depth: 1 })}
</section>

<div class="wrap">
  <div class="narrow work-head">
    <p class="eyebrow"><a href="../movements/${esc(m.id)}.html" style="color:inherit">${esc(m.name)}</a></p>
    <h1>${esc(w.title)}</h1>
    <p class="by">${by}　${esc(w.year)}</p>
    <p class="work-lead">${esc(w.lead)}</p>

    <dl class="facts">
      <div><dt>作者</dt><dd>${esc(w.artist)}</dd></div>
      <div><dt>制作</dt><dd>${esc(w.year)}</dd></div>
      <div><dt>技法・寸法</dt><dd>${esc(w.medium)}${w.size ? '　' + esc(w.size) : ''}</dd></div>
      <div><dt>所蔵</dt><dd>${w.collectionUrl ? `<a href="${esc(w.collectionUrl)}" rel="noopener">${esc(w.collection)}</a>` : esc(w.collection)}</dd></div>
    </dl>

    <section class="section">
      <h2>何が描かれているか</h2>
      <p>${esc(w.what)}</p>
    </section>

    <section class="section">
      <h2>なぜ有名になったか</h2>
      <p>${esc(w.why)}</p>
    </section>

    <section class="section">
      <h2>その後</h2>
      <p>${esc(w.after)}</p>
    </section>

    <section class="section">
      <h2>ここを見る</h2>
      <ol class="look">
        ${w.look.map((l) => `<li><span class="where">${esc(l.where)}</span><span class="text">${esc(l.text)}</span></li>`).join('\n        ')}
      </ol>
    </section>

    ${drawnNote}

    <p class="source">
      <strong>出典。</strong>
      ${w.commons ? `図版はウィキメディア・コモンズ（${esc(w.commons)}）による。` : ''}
      ライセンス：${esc(w.license)}。
      ${wikiUrl ? `<br><a href="${esc(wikiUrl)}" rel="noopener">ウィキペディアの記事</a>` : ''}
      ${w.collectionUrl ? ` ／ <a href="${esc(w.collectionUrl)}" rel="noopener">所蔵館</a>` : ''}
    </p>
  </div>

  <nav class="nextprev">
    ${prev ? `<a href="${esc(prev.id)}.html"><span class="dir">← 前の一点</span><span class="t">${esc(prev.title)}</span></a>` : '<span></span>'}
    ${next ? `<a class="-next" href="${esc(next.id)}.html"><span class="dir">次の一点 →</span><span class="t">${esc(next.title)}</span></a>` : '<span></span>'}
  </nav>
</div>`;

  out(`works/${w.id}.html`, layout({
    title: `${w.title} ── ${w.artist} ｜ 名画の部屋`,
    desc: w.lead,
    body, depth: 1, accent: m.accent,
  }));
});

/* 顔を出せない画家（存命作家など）には、空の円ではなく頭文字を置く。
   読み込みに失敗した円と、はじめから写真が無い円を、見た目で区別する。 */
function face(a, depth) {
  if (a.noPhoto) {
    return `<span class="monogram" aria-hidden="true">${esc(a.name.trim().charAt(0))}</span>`;
  }
  return `<figure class="plate -card" data-art="artist-${esc(a.id)}" data-alt="${esc(a.name)}"><div class="mount"></div></figure>`;
}

/* ---------- 4. 画家 ─────────────────────────────────────── */
{
  const sorted = [...artists].sort((x, y) => x.born - y.born);
  const body = `<div class="wrap" style="padding-top:clamp(2.6rem,7vh,5rem)">
  <p class="eyebrow">Artists</p>
  <h1 class="page-title">画家</h1>
  <p class="page-lead">生まれた順に並んでいます。いま${artists.length}人。</p>
  <ul class="people">
    ${sorted.map((a) => `<li><a href="artists/${esc(a.id)}.html">
      ${face(a, 0)}
      <span><span class="n">${esc(a.name)}</span><span class="y">${a.born} — ${a.died}</span><span class="l">${esc(a.lead)}</span></span>
    </a></li>`).join('\n    ')}
  </ul>
</div>`;
  out('artists.html', layout({ title: '画家 ── 名画の部屋', desc: '有名な画家を生年順に並べています。', body, depth: 0, nav: 'artists' }));
}

artists.forEach((a) => {
  const list = worksOfArtist(a.id);
  const m = movementById.get(a.movements[0]);
  const body = `<div class="wrap" style="padding-top:clamp(2.6rem,7vh,5rem)">
  <div class="narrow">
    ${backLink('../artists.html', '画家一覧へ')}
    <p class="eyebrow">${a.movements.map((id) => esc(movementById.get(id).name)).join(' ／ ')}</p>
    <h1 class="page-title">${esc(a.name)}</h1>
    <p class="by" style="color:var(--ink-2);margin:0 0 2rem">${esc(a.nameOriginal)}　${a.born} — ${a.died}　${esc(a.place)}</p>
    <p class="work-lead">${esc(a.lead)}</p>
    <p>${esc(a.bio)}</p>
  </div>

  <section style="margin-top:5rem">
    <p class="eyebrow">この画家の作品　${list.length}点</p>
    <ul class="grid">
      ${list.map((w) => card(w, 1)).join('\n      ')}
    </ul>
  </section>
</div>`;
  out(`artists/${a.id}.html`, layout({
    title: `${a.name} ── 名画の部屋`, desc: a.lead,
    body, depth: 1, accent: m ? m.accent : null,
  }));
});

/* ---------- 5. 流派 ─────────────────────────────────────── */
{
  const body = `<div class="wrap" style="padding-top:clamp(2.6rem,7vh,5rem)">
  <p class="eyebrow">Movements</p>
  <h1 class="page-title">流派</h1>
  <p class="page-lead">「印象派とは何か」に、一段落で答えます。時代順です。</p>
  <ul class="bands">
    ${[...movements].sort((x, y) => x.from - y.from).map((m) => `<li><a href="movements/${esc(m.id)}.html" style="--band:${m.accent}">
      <span><span class="n">${esc(m.name)}</span><span class="y">${fmtSpan(m)}　${worksOfMovement(m.id).length}点</span></span>
      <span class="l">${esc(m.lead)}</span></a></li>`).join('\n    ')}
  </ul>
</div>`;
  out('movements.html', layout({ title: '流派 ── 名画の部屋', desc: '印象派、バロック、キュビスム。主要な流派を時代順に。', body, depth: 0, nav: 'movements' }));
}

movements.forEach((m) => {
  const list = worksOfMovement(m.id);
  const people = artists.filter((a) => a.movements.includes(m.id));
  const body = `<div class="wrap" style="padding-top:clamp(2.6rem,7vh,5rem)">
  <div class="narrow">
    ${backLink('../movements.html', '流派一覧へ')}
    <p class="eyebrow">${fmtSpan(m)}</p>
    <h1 class="page-title">${esc(m.name)}</h1>
    <p class="by" style="color:var(--ink-2);margin:0 0 2rem">${esc(m.nameOriginal)}</p>
    <p class="work-lead">${esc(m.lead)}</p>
    <p>${esc(m.body)}</p>
  </div>

  ${people.length ? `<section style="margin-top:5rem">
    <p class="eyebrow">この流派の画家</p>
    <ul class="people">
      ${people.map((a) => `<li><a href="../artists/${esc(a.id)}.html">
        ${face(a, 1)}
        <span><span class="n">${esc(a.name)}</span><span class="y">${a.born} — ${a.died}</span><span class="l">${esc(a.lead)}</span></span>
      </a></li>`).join('\n      ')}
    </ul>
  </section>` : ''}

  <section style="margin-top:5rem">
    <p class="eyebrow">作品　${list.length}点</p>
    <ul class="grid">
      ${list.map((w) => card(w, 1)).join('\n      ')}
    </ul>
  </section>
</div>`;
  out(`movements/${m.id}.html`, layout({
    title: `${m.name} ── 名画の部屋`, desc: m.lead,
    body, depth: 1, accent: m.accent,
  }));
});

/* ---------- 6. 年表 ─────────────────────────────────────
   一本道に並べるだけだと、86点でもう探せない。250点なら尚更である。
   そこで世紀ごとに区切り、頭に飛べる目次を置く。
   区切りの見出しは読んでいる間そこに留まり、いま何世紀を見ているかが常に分かる。 */
{
  const centuryOf = (y) => (y < 0 ? 0 : Math.floor((y - 1) / 100) + 1);
  const centuryLabel = (c) => (c === 0 ? '紀元前' : String(c));

  const groups = [];
  for (const w of byYear) {
    const c = centuryOf(w.yearSort);
    let g = groups[groups.length - 1];
    if (!g || g.c !== c) { g = { c, works: [] }; groups.push(g); }
    g.works.push(w);
  }

  const jump = groups.map((g) =>
    `<a href="#c${g.c}">${centuryLabel(g.c)}${g.c === 0 ? '' : '世紀'}</a>`).join('');

  const body = `<div class="wrap" style="padding-top:clamp(2.6rem,7vh,5rem)">
  <p class="eyebrow">Timeline</p>
  <h1 class="page-title">年表</h1>
  <p class="page-lead">古いものから新しいものへ、一本道で通ります。いま${works.length}点。
     見出しの世紀を押すと、そこへ飛べます。</p>

  <nav class="jump" aria-label="世紀へ飛ぶ">
    ${jump}
  </nav>

  ${groups.map((g) => `<section class="era-group" id="c${g.c}">
    <h2 class="era-head">
      <span class="n">${centuryLabel(g.c)}</span>
      <span class="u">${g.c === 0 ? '' : 'CENTURY'}</span>
      <span class="c">${g.works.length}点</span>
    </h2>
    <ul class="timeline">
      ${g.works.map((w) => {
        const m = movementById.get(w.movement);
        return `<li style="--band:${m.accent}">
        <a href="works/${esc(w.id)}.html">
          <span class="y">${esc(shortYear(w))}</span>
          ${plate(w, { depth: 0, card: true })}
          <span><span class="t">${esc(w.title)}</span><span class="a">${esc(w.artist)}</span><span class="l">${esc(w.lead)}</span><span class="m">${esc(m.name)}</span></span>
        </a></li>`;
      }).join('')}
    </ul>
  </section>`).join('')}
</div>`;
  out('timeline.html', layout({
    title: '年表 ── 名画の部屋',
    desc: '有名な絵を、古いものから新しいものへ一本道で。世紀ごとに区切ってあります。',
    body, depth: 0, nav: 'timeline',
  }));
}

/* 年表の行に出す年。「1503 — 1519年ごろ」のような表記は長すぎて列が崩れるので、
   先頭の年だけを取り出す。元の表記は作品ページに残っている。 */
function shortYear(w) {
  const y = String(w.year);
  // 「12世紀前半」を数字だけ取ると「12年」になってしまう。世紀表記を先に拾う
  const n = y.match(/^(前?\d+)/);
  // 「12 — 13世紀」のように範囲で書かれることがある。
  // 先頭の数字だけ取ると「12年」になるので、世紀表記かどうかは文字列全体で判断する。
  if (n) return n[1] + (y.includes('世紀') ? '世紀' : '年');
  return y.replace(/\s*[—-].*$/, '');
}

/* ---------- 7. plate.js が読む名簿 ──────────────────────── */
{
  const manifest = {};
  for (const w of works) {
    manifest[w.id] = {
      title: w.title, artist: w.artist,
      commons: w.commons, wiki: w.wiki, wikiLang: w.wikiLang, wikiEn: w.wikiEn,
      ...(w.noPhoto ? { noPhoto: true } : {}),
    };
  }
  for (const a of artists) {
    /* artist は空にする。plate.js は「記事名＝作者名」のとき記事の代表画像を
       塞ぐ（作品の額に作者の顔が入るのを防ぐため）。画家ページではその顔こそ
       欲しいので、ここでは塞がないようにしておく。 */
    manifest['artist-' + a.id] = {
      title: a.name, artist: '',
      commons: a.commons, wiki: a.wiki, wikiLang: 'ja', wikiEn: a.wikiEn,
      ...(a.noPhoto ? { noPhoto: true } : {}),
    };
  }
  out('data/manifest.json', JSON.stringify(manifest, null, 2));
}

console.log(`生成しました： 作品 ${works.length} ／ 画家 ${artists.length} ／ 流派 ${movements.length}`);
console.log(`  ページ数 ${works.length + artists.length + movements.length + 5}`);

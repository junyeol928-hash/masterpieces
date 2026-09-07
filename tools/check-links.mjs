/* =========================================================================
   外の世界とのつながりを検算する

   check.mjs はサイトの内側（ページ間のリンク、名簿の漏れ）を見る。
   こちらは外側を見る。壊れ方が三つあり、どれも読者が踏むまで気づけない。

     1. commons に書いたファイル名が存在しない
        → 焼き込みが Wikipedia 記事の代表画像へ落ちる。記事が画家のものだと
          作品の額に画家の顔が入る。実際にそれで3点、別の絵が焼かれていた。
     2. wiki / wikiEn の記事名が存在しない
        → 「Wikipediaで読む」を押した読者が「ページがありません」に着く。
     3. collectionUrl が死んでいる
        → 所蔵館へのリンクが切れる。館の改装や移転で静かに起きる。

   使い方:
     node tools/check-links.mjs            … 1と2だけ（速い）
     node tools/check-links.mjs --all      … 3も見る（館のサーバを叩くので遅い）

   3 の 403/429 は「拒まれた」であって「死んだ」ではない。館は素性の分から
   ない相手を弾く。だから注意として出すだけで、失敗にはしない。
   ========================================================================= */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const UA = 'meigano-heya/1.0 (https://github.com/junyeol928-hash; static art reading site) node-fetch';
const ALL = process.argv.includes('--all');

const read = (p) => JSON.parse(readFileSync(join(ROOT, p), 'utf8'));
const works = read('data/works.json');
const artists = read('data/artists.json');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const problems = [];
const notes = [];

async function api(url) {
  const r = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

/* 記事名・ファイル名は50件ずつまとめて問える。一件ずつ引くと数百回になる。 */
async function existing(host, titles) {
  const gone = new Set();
  for (let i = 0; i < titles.length; i += 50) {
    const batch = titles.slice(i, i + 50);
    const d = await api(`https://${host}/w/api.php?action=query&format=json&titles=`
      + encodeURIComponent(batch.join('|')));
    // API は名前を正規化して返すので、元の綴りに戻してから照合する
    const back = {};
    (d.query.normalized || []).forEach((n) => { back[n.to] = n.from; });
    for (const p of Object.values(d.query.pages)) {
      if (p.missing !== undefined) gone.add(back[p.title] || p.title);
    }
    await sleep(350);
  }
  return gone;
}

/* ---- 1. Commons のファイル名 ---- */
const files = [
  ...works.filter((w) => w.commons).map((w) => ({ what: '作品', id: w.id, v: w.commons })),
  ...artists.filter((a) => a.commons).map((a) => ({ what: '画家', id: a.id, v: a.commons })),
];
{
  const gone = await existing('commons.wikimedia.org', [...new Set(files.map((f) => 'File:' + f.v))]
    .map((t) => t));
  for (const f of files) if (gone.has('File:' + f.v)) problems.push(`図版 ${f.what} ${f.id}: File:${f.v} が無い`);
  console.log(`Commons のファイル名 ${files.length} 件`);
}

/* ---- 2. Wikipedia の記事名 ---- */
const titles = [
  ...works.map((w) => ({ what: '作品', id: w.id, f: 'wiki', lang: w.wikiLang || 'ja', v: w.wiki })),
  ...works.map((w) => ({ what: '作品', id: w.id, f: 'wikiEn', lang: 'en', v: w.wikiEn })),
  ...artists.map((a) => ({ what: '画家', id: a.id, f: 'wiki', lang: 'ja', v: a.wiki })),
  ...artists.map((a) => ({ what: '画家', id: a.id, f: 'wikiEn', lang: 'en', v: a.wikiEn })),
].filter((t) => t.v);
for (const lang of ['ja', 'en']) {
  const sub = titles.filter((t) => t.lang === lang);
  const gone = await existing(`${lang}.wikipedia.org`, [...new Set(sub.map((t) => t.v))]);
  for (const t of sub) if (gone.has(t.v)) problems.push(`記事 ${t.what} ${t.id}.${t.f}: ${lang} に「${t.v}」が無い`);
}
console.log(`Wikipedia の記事名 ${titles.length} 件`);

/* ---- 3. 所蔵館のURL ---- */
if (ALL) {
  const urls = works.filter((w) => w.collectionUrl).map((w) => ({ id: w.id, v: w.collectionUrl }));
  let i = 0;
  const worker = async () => {
    while (i < urls.length) {
      const u = urls[i++];
      try {
        const ctl = new AbortController();
        const timer = setTimeout(() => ctl.abort(), 20000);
        const r = await fetch(u.v, { redirect: 'follow', signal: ctl.signal, headers: { 'User-Agent': UA } });
        clearTimeout(timer);
        if (r.status >= 400) notes.push(`所蔵 ${u.id}: HTTP ${r.status} ${u.v}`);
      } catch (e) {
        notes.push(`所蔵 ${u.id}: ${String(e.cause?.code || e.name)} ${u.v}`);
      }
      await sleep(120);
    }
  };
  await Promise.all(Array.from({ length: 8 }, worker));
  console.log(`所蔵館のURL ${urls.length} 件`);
}

console.log('');
if (notes.length) {
  console.log(`注意 ${notes.length} 件（館側が拒んだだけの場合も多い。目で見て判断する）`);
  notes.forEach((n) => console.log('  ' + n));
  console.log('');
}
if (problems.length) {
  console.log(`問題 ${problems.length} 件`);
  problems.forEach((p) => console.log('  ' + p));
  process.exit(1);
}
console.log('問題なし。');

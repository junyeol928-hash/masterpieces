/* =========================================================================
   図版を焼き込む

   plate.js は実行時に Commons の API を叩けるが、それを本番にしてはいけない。
   250点のページを開くたびに250回の外部問い合わせが走ることになり、
   遅いうえに、相手のサービスに寄りかかりすぎている。

   だからここで先に落としておく。落としたものは assets/artworks/<id>.jpg。
   plate.js の一段目がこれを見にいく。API は「焼き込みそこねた分」の保険になる。

   使い方:
     node tools/fetch-artworks.mjs           … まだ無いものだけ取る
     node tools/fetch-artworks.mjs --force   … 取り直す

   noPhoto（著作権が生きている作品）は取りにいかない。
   ========================================================================= */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DEST = join(ROOT, 'assets/artworks');
const FORCE = process.argv.includes('--force');
const WIDTH = 1800;

const UA = 'meigano-heya/1.0 (static art site; contact via GitHub)';

const read = (p) => JSON.parse(readFileSync(join(ROOT, p), 'utf8'));
const works = read('data/works.json');
const artists = read('data/artists.json');

/* 作品と画家を同じ表に載せる。画家の顔も同じ仕組みで焼く。 */
const targets = [
  ...works.map((w) => ({
    id: w.id, commons: w.commons, wiki: w.wiki, lang: w.wikiLang || 'ja', wikiEn: w.wikiEn,
    noPhoto: !!w.noPhoto, label: w.title,
  })),
  ...artists.map((a) => ({
    id: 'artist-' + a.id, commons: a.commons, wiki: a.wiki, lang: 'ja', wikiEn: a.wikiEn,
    noPhoto: !!a.noPhoto, label: a.name,
  })),
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* Wikimedia は連打すると 429 を返す。そこで諦めると、
   取れなかった作品の一覧が「本当に無いもの」と「急ぎすぎただけのもの」で
   混ざってしまう。区別できるように、待って何度か試す。 */
async function pull(url, init) {
  const waits = [0, 2000, 5000, 12000];
  let last = null;
  for (const w of waits) {
    if (w) await sleep(w);
    const r = await fetch(url, init);
    if (r.ok) return r;
    last = `HTTP ${r.status}`;
    if (r.status !== 429 && r.status < 500) break;   // 429 と 5xx だけ待ち直す
  }
  throw new Error(last);
}

async function getJSON(url) {
  const r = await pull(url, { headers: { 'user-agent': UA } });
  return r.json();
}

async function fromCommons(file) {
  const api = 'https://commons.wikimedia.org/w/api.php?action=query&format=json'
            + `&prop=imageinfo&iiprop=url&iiurlwidth=${WIDTH}`
            + '&titles=' + encodeURIComponent('File:' + file);
  const d = await getJSON(api);
  for (const k of Object.keys(d?.query?.pages || {})) {
    const ii = d.query.pages[k].imageinfo;
    if (ii && ii[0]) return ii[0].thumburl || ii[0].url;
  }
  throw new Error('imageinfo なし');
}

async function fromWikipedia(lang, title) {
  const api = `https://${lang}.wikipedia.org/api/rest_v1/page/summary/`
            + encodeURIComponent(String(title).replace(/ /g, '_'));
  const d = await getJSON(api);
  const u = d?.originalimage?.source || d?.thumbnail?.source;
  if (!u) throw new Error('画像なし');
  return u;
}

/* 幅を大きく書き換えた URL は、元画像がそれより小さいと 400 が返る。
   大きいほうを先に試し、駄目なら書き換える前の URL に戻す。 */
function widen(url) {
  const big = url.replace(/\/(\d+)px-/, `/${WIDTH}px-`);
  return big === url ? [url] : [big, url];
}

async function download(url) {
  const r = await pull(url, { headers: { 'user-agent': UA, referer: 'https://commons.wikimedia.org/' } });
  const buf = Buffer.from(await r.arrayBuffer());
  // 数百バイトしかないものは、画像ではなくエラーページである
  if (buf.length < 2048) throw new Error(`小さすぎる (${buf.length} B)`);
  return buf;
}

mkdirSync(DEST, { recursive: true });

let got = 0, skipped = 0, failed = 0;
const problems = [];

for (const t of targets) {
  const dest = join(DEST, `${t.id}.jpg`);

  if (t.noPhoto) { skipped++; continue; }
  if (!FORCE && existsSync(dest)) { skipped++; continue; }

  let url = null;
  const tried = [];
  for (const attempt of [
    t.commons ? () => fromCommons(t.commons) : null,
    t.wiki ? () => fromWikipedia(t.lang, t.wiki) : null,
    (t.wikiEn && t.lang !== 'en') ? () => fromWikipedia('en', t.wikiEn) : null,
  ].filter(Boolean)) {
    try { url = await attempt(); break; }
    catch (e) { tried.push(e.message); }
  }

  if (!url) {
    failed++;
    problems.push(`${t.id}（${t.label}）: 解決できず ── ${tried.join(' / ')}`);
    continue;
  }

  let saved = false, why = [];
  for (const candidate of widen(url)) {
    try { writeFileSync(dest, await download(candidate)); saved = true; break; }
    catch (e) { why.push(e.message); }
  }
  if (saved) { got++; console.log(`  取得 ${t.id}`); }
  else { failed++; problems.push(`${t.id}（${t.label}）: 取得に失敗 ── ${why.join(' / ')}`); }

  // 相手のサーバに連打しない
  await sleep(700);
}

console.log(`\n取得 ${got} ／ 済み・対象外 ${skipped} ／ 失敗 ${failed}`);
if (problems.length) {
  // 握りつぶさない。取れなかったものは名指しで残す。
  console.log('\n取れなかったもの:');
  for (const p of problems) console.log('  - ' + p);
}

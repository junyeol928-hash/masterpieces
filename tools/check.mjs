/* =========================================================================
   組み上がったページを検算する。

   生成しているので、壊れ方は「一箇所直したら全ページで壊れた」という形になる。
   だから公開の直前に、機械で通しておく。

     ・ページ内のリンク先が実在するか
     ・図版の id が名簿にあるか
     ・置き換えそこねた記法が残っていないか
     ・データにある作品・画家・流派が、全部ページになっているか

   直しはしない。見つけて、名指しで並べて、0でなければ落とす。
   ========================================================================= */
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => JSON.parse(readFileSync(join(ROOT, p), 'utf8'));

const works = read('data/works.json');
const artists = read('data/artists.json');
const movements = read('data/movements.json');
const manifest = existsSync(join(ROOT, 'data/manifest.json')) ? read('data/manifest.json') : null;

const problems = [];

/* ---------- 組み上がった HTML を集める ---------- */
function htmlFiles(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '.git' || name === 'shot-tmp') continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) htmlFiles(p, acc);
    else if (name.endsWith('.html')) acc.push(p);
  }
  return acc;
}

const pages = htmlFiles(ROOT);
if (!pages.length) {
  console.error('ページが一枚もありません。先に node tools/build.mjs を走らせてください。');
  process.exit(1);
}

/* ---------- 1. リンク先が実在するか ---------- */
for (const page of pages) {
  const html = readFileSync(page, 'utf8');
  const here = relative(ROOT, page).replace(/\\/g, '/');

  for (const m of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
    const href = m[1];
    if (/^(https?:|mailto:|#|data:)/.test(href)) continue;
    // ?v=... はキャッシュ避けの版番号で、ファイル名の一部ではない
    const target = resolve(dirname(page), href.split('#')[0].split('?')[0]);
    if (!existsSync(target)) problems.push(`${here}: リンク切れ → ${href}`);
  }

  /* ---------- 2. 置き換えそこねた記法 ---------- */
  if (html.includes('${')) problems.push(`${here}: 展開されていない \${...} が残っている`);
  if (html.includes('undefined')) problems.push(`${here}: undefined が出力されている`);
  if (html.includes('[object Object]')) problems.push(`${here}: [object Object] が出力されている`);

  /* ---------- 3. 図版の id が名簿にあるか ---------- */
  if (manifest) {
    for (const m of html.matchAll(/data-art="([^"]+)"/g)) {
      if (!manifest[m[1]]) problems.push(`${here}: 名簿にない図版 id → ${m[1]}`);
    }
  }

  /* ---------- 4. 最低限の体裁 ---------- */
  if (!/<title>[^<]+<\/title>/.test(html)) problems.push(`${here}: title が空`);
  if (!/<html lang="ja">/.test(html)) problems.push(`${here}: lang 指定がない`);
}

/* ---------- 5. データが全部ページになっているか ---------- */
for (const w of works) {
  if (!existsSync(join(ROOT, 'works', `${w.id}.html`))) problems.push(`作品ページがない → ${w.id}`);
}
for (const a of artists) {
  if (!existsSync(join(ROOT, 'artists', `${a.id}.html`))) problems.push(`画家ページがない → ${a.id}`);
}
for (const m of movements) {
  if (!existsSync(join(ROOT, 'movements', `${m.id}.html`))) problems.push(`流派ページがない → ${m.id}`);
}

/* ---------- 6. 著作権作品には構図図が要る ---------- */
for (const w of works.filter((w) => w.copyright)) {
  const svg = join(ROOT, 'assets/figures', `${w.figure}.svg`);
  if (!existsSync(svg)) problems.push(`著作権作品に構図図がない → ${w.id}（${w.figure}.svg）`);
}

/* ---------- 結果 ---------- */
console.log(`ページ ${pages.length} 枚を検算しました。`);
if (problems.length) {
  console.error(`\n要修正 ${problems.length} 件:`);
  for (const p of problems) console.error('  - ' + p);
  process.exit(1);
}
console.log('問題なし。');

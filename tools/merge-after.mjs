/* =========================================================================
   「その後」の本文を works.json へ差し込む。

   なぜ専用の道具にするか。
   JSON を読み込んで書き戻すと、手で整えた並びが全部崩れて差分が読めなくなる。
   ここでは **"why" の行のすぐ後ろに一行を挿し込む**だけにして、
   他の行には一切触れない。差分が「足した行」だけになる。

   使い方:
     node tools/merge-after.mjs <差し込む内容.json>

   内容は { "作品id": "その後の本文", ... } という形。
   すでに after を持っている作品は上書きせず、名指しで報告して飛ばす。
   ========================================================================= */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = process.argv[2];
if (!src) {
  console.error('差し込む内容の JSON を指定してください。');
  process.exit(1);
}

const additions = JSON.parse(readFileSync(resolve(src), 'utf8'));
const target = join(ROOT, 'data/works.json');
let text = readFileSync(target, 'utf8');

/* JSON の文字列として安全な形にする。
   本文に " や \ が入っても壊れないよう、JSON.stringify に任せる。 */
const asJsonString = (s) => JSON.stringify(String(s));

let added = 0;
const skipped = [];
const missing = [];

for (const [id, body] of Object.entries(additions)) {
  const idAt = text.indexOf(`"id": "${id}"`);
  if (idAt === -1) { missing.push(id); continue; }

  // この作品の範囲（次の "id": が現れるまで）
  const nextId = text.indexOf('"id": "', idAt + 8);
  const end = nextId === -1 ? text.length : nextId;
  const block = text.slice(idAt, end);

  if (/"after"\s*:/.test(block)) { skipped.push(id); continue; }

  // "why": の行を見つけ、その行の終わりに一行足す
  const whyAt = block.search(/\n(\s*)"why":\s*"/);
  if (whyAt === -1) { missing.push(id + '（why の行が見つからない）'); continue; }

  const indent = block.match(/\n(\s*)"why":\s*"/)[1];
  // why の行末（次の改行）まで進む
  const lineEnd = block.indexOf('\n', whyAt + 1);
  const insertAt = idAt + lineEnd;

  const line = `\n${indent}"after": ${asJsonString(body)},`;
  text = text.slice(0, insertAt) + line + text.slice(insertAt);
  added++;
}

writeFileSync(target, text, 'utf8');

// 書いたものが JSON として妥当か、その場で確かめる
try {
  const parsed = JSON.parse(text);
  const without = parsed.filter((w) => !w.after).map((w) => w.id);
  console.log(`差し込み ${added} 件 ／ すでに有り ${skipped.length} 件 ／ 見つからず ${missing.length} 件`);
  if (skipped.length) console.log('  すでに有り: ' + skipped.join(', '));
  if (missing.length) console.log('  見つからず: ' + missing.join(', '));
  console.log(`まだ「その後」が無い作品: ${without.length} 件`);
  if (without.length && without.length <= 60) console.log('  ' + without.join(' '));
} catch (e) {
  console.error('JSON が壊れました。書き戻す前に止めるべきでした: ' + e.message);
  process.exit(1);
}

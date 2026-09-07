/* Commons のファイル名を先に確かめる。
   推測でファイル名を書くと、別の絵が焼き込まれる事故が起きる。 */
const UA = 'meigano-heya/1.0 (https://github.com/junyeol928-hash; static art reading site) node-fetch';
const q = process.argv.slice(2).join(' ');
const api = 'https://commons.wikimedia.org/w/api.php?action=query&format=json&generator=search'
  + '&gsrnamespace=6&gsrlimit=8&prop=imageinfo&iiprop=url|size&iiurlwidth=200'
  + '&gsrsearch=' + encodeURIComponent(q);
const r = await fetch(api, { headers: { 'user-agent': UA } });
const d = await r.json();
const pages = Object.values(d?.query?.pages || {});
if (!pages.length) { console.log('  (なし) ' + q); process.exit(0); }
pages.sort((a, b) => (a.index || 0) - (b.index || 0));
for (const p of pages) {
  const ii = p.imageinfo?.[0];
  console.log(`  ${p.title.replace(/^File:/, '')}   [${ii?.width}x${ii?.height}]`);
}

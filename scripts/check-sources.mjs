// 出典URL（ja.wikipedia.org）の実在確認。MediaWiki API で記事の存在・曖昧さ回避・転送を調べる。
// 対象：src/data/events.json（世界史のイベント）、src/data/events-japan.json（日本史のイベント）、src/data/works.json（作品）の sources。
//   node scripts/check-sources.mjs         … 確認結果を表示（問題があれば終了コード1）
//   node scripts/check-sources.mjs --fix   … 存在が確認できなかった URL を空欄にして JSON を書き戻す
// ※ ja.wikipedia.org へ接続できるネットワークで実行すること。
import { readFileSync, writeFileSync } from "node:fs";

const PREFIX = "https://ja.wikipedia.org/wiki/";
const FILES = [
  { name: "events.json", url: new URL("../src/data/events.json", import.meta.url) },
  { name: "events-japan.json", url: new URL("../src/data/events-japan.json", import.meta.url) },
  { name: "works.json", url: new URL("../src/data/works.json", import.meta.url) },
];
const toTitle = (url) => decodeURIComponent(url.slice(PREFIX.length)).replace(/_/g, " ");

const data = FILES.map((f) => ({ ...f, items: JSON.parse(readFileSync(f.url, "utf8")) }));
const titles = [
  ...new Set(
    data.flatMap((d) => d.items.flatMap((x) => x.sources.filter((s) => s.url.startsWith(PREFIX)).map((s) => toTitle(s.url)))),
  ),
];

const bad = new Map(); // title -> 理由
for (let i = 0; i < titles.length; i += 40) {
  const chunk = titles.slice(i, i + 40);
  const url =
    "https://ja.wikipedia.org/w/api.php?action=query&format=json&redirects=1&prop=pageprops&ppprop=disambiguation&titles=" +
    chunk.map(encodeURIComponent).join("|");
  const res = await fetch(url, { headers: { "user-agent": "world-history-globe source checker" } });
  if (!res.ok) throw new Error(`API error ${res.status}`);
  const q = (await res.json()).query;
  for (const r of q.redirects ?? []) bad.set(r.from, `転送ページ（→ ${r.to}）`);
  for (const p of Object.values(q.pages)) {
    if ("missing" in p) bad.set(p.title, "記事が存在しない");
    else if (p.pageprops && "disambiguation" in p.pageprops) bad.set(p.title, "曖昧さ回避ページ");
  }
}

for (const d of data) {
  const n = new Set(d.items.flatMap((x) => x.sources.filter((s) => s.url.startsWith(PREFIX)).map((s) => toTitle(s.url)))).size;
  console.log(`${d.name}: ${n} 記事`);
}
console.log(`確認した記事: ${titles.length} 件 / 問題: ${bad.size} 件`);
for (const [t, why] of bad) console.log(`  ✘ ${t} … ${why}`);

if (process.argv.includes("--fix") && bad.size) {
  const today = new Date().toISOString().slice(0, 10);
  for (const d of data) {
    let changed = false;
    for (const x of d.items)
      for (const s of x.sources) {
        if (!s.url.startsWith(PREFIX)) continue;
        if (bad.get(toTitle(s.url)) === "記事が存在しない") {
          s.url = "";
          s.accessedAt = today;
          changed = true;
        }
      }
    if (changed) writeFileSync(d.url, JSON.stringify(d.items, null, 2) + "\n");
  }
  console.log("存在しない記事の URL を空欄にしました。");
}
process.exit(bad.size ? 1 : 0);

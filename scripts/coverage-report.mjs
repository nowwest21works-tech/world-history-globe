// 単元カバー表 docs/COVERAGE.md を src/data/units.json と src/data/events.json から生成する。
//   node scripts/coverage-report.mjs
import { readFileSync, writeFileSync } from "node:fs";

const read = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), "utf8"));
const { basis, majors, units } = read("../src/data/units.json");
const events = read("../src/data/events.json");
const ids = new Set(events.map((e) => e.id));

const counted = units.filter((u) => u.min > 0);
const have = (u) => u.eventIds.filter((id) => ids.has(id)).length;
const pct = (u) => Math.round((Math.min(have(u), u.min) / u.min) * 100);
const minTotal = counted.reduce((s, u) => s + u.min, 0);
const shortfall = counted.reduce((s, u) => s + Math.max(0, u.min - have(u)), 0);
const completeTotal = events.length + shortfall;
const doneUnits = counted.filter((u) => have(u) >= u.min).length;
// 未実施の回（候補が残っている回）。実施済みの回は units.json から候補が消え、収録済みに移る
const batches = [...new Set(units.flatMap((u) => u.candidates.map((c) => c.batch)))].filter((b) => b !== "予備").sort();
const DONE = ["第1次（ツアー用13件）", "第2次（C(3)・D(2)・D(3) の20件）", "第3次（D(3)・D(4)・E(1) の20件）", "第4次（C(3)・D(2)・E(2)・E(3) の20件）"];

const majorName = Object.fromEntries(majors.map((m) => [m.code, m.name]));
const unitLabel = (u) => `${u.major}(${u.code.slice(1)}) ${u.name}`;

let md = `# 単元カバー表（世界史探究）

> このファイルは \`node scripts/coverage-report.mjs\` で生成しています。手で編集せず、\`src/data/units.json\`（単元の定義・最低件数・イベントの割り当て・候補）を直してから再生成してください。

- 基準：${basis}。単元名のみを用い、学習指導要領の文章は転載していない。各単元の説明は自分の言葉での要約。
- 現在のイベント件数：**${events.length}件**（すべて verified=false）
- 「問い」の単元（B(1)・C(1)・D(1)）と「探究」の単元（E(4)）は、個別のイベントを置かず、ツアーや問いで扱うため件数の目安を設けない。

## 「高校世界史の骨格の完成」の定義

**件数の目安を設けた ${counted.length} 単元のすべてで、イベント件数が最低件数を満たした状態**を「高校世界史の骨格の完成」とする。

- 最低件数の合計：${minTotal}件
- 現在、最低件数を満たしている単元：${doneUnits} / ${counted.length}
- 不足の合計：${shortfall}件 → 骨格の完成時の合計は **約${completeTotal}件**（B(2) などすでに最低件数を超えている単元があるため、最低件数の合計より多くなる）
- 骨格の完成後は、ツアーの充実や地域の偏りの解消のために 170〜200件程度まで増やすことを想定する。

## 単元ごとの充足状況

| 大項目 | 中項目 | 現在 | 最低 | 充足率 | 不足 |
|---|---|---|---|---|---|
`;
for (const u of units) {
  const target = u.min > 0;
  md += `| ${u.major} ${majorName[u.major]} | ${u.code.slice(1)} ${u.name} | ${have(u)} | ${target ? u.min : "—"} | ${
    target ? `${pct(u)}%` : "—"
  } | ${target ? Math.max(0, u.min - have(u)) : "—"} |\n`;
}
md += `| | **合計** | **${events.length}** | **${minTotal}** | | **${shortfall}** |\n`;

md += `\n## 単元の内容と不足分の候補\n`;
for (const u of units) {
  md += `\n### ${unitLabel(u)}\n\n${u.summary}\n\n`;
  if (u.min === 0) {
    md += `件数の目安なし。\n`;
    continue;
  }
  md += `- 現在 ${have(u)}件 / 最低 ${u.min}件（充足率 ${pct(u)}%）\n`;
  if (u.eventIds.length) {
    const titles = u.eventIds.map((id) => events.find((e) => e.id === id)?.title ?? id);
    md += `- 収録済み：${titles.join("、")}\n`;
  }
  if (u.candidates.length) {
    md += `- 不足分の候補：\n`;
    for (const c of u.candidates) md += `  - ${c.title}（${c.batch}）\n`;
  }
}

md += `\n## 追加の計画（1回20件以内）\n\nこれまでの C 案（第2次〜第4次）を、上の不足分に合わせて組み直した。不足が大きい単元から順に埋める。\n\n- 実施済み：${DONE.join("、")}\n\n| 回 | 件数 | 対象の単元（件数） |\n|---|---|---|\n`;
for (const b of batches) {
  const per = counted
    .map((u) => [u, u.candidates.filter((c) => c.batch === b).length])
    .filter(([, n]) => n > 0);
  const total = per.reduce((s, [, n]) => s + n, 0);
  md += `| ${b} | ${total} | ${per.map(([u, n]) => `${u.major}(${u.code.slice(1)}) ${n}`).join("、")} |\n`;
}
const spare = counted.flatMap((u) => u.candidates.filter((c) => c.batch === "予備").map((c) => c.title));
md += `\n- 予備（最低件数の達成には不要だが、地域の偏りを減らすために次の段階で検討）：${spare.join("、") || "なし"}\n`;
md += `- 各回とも、出典記事の実在確認・独自の文章・verified=false・\`docs/VERIFICATION.md\` への照合結果の追記を通す（\`docs/EVENT_PLAN.md\`）。\n`;

writeFileSync(new URL("../docs/COVERAGE.md", import.meta.url), md);
console.log(`イベント ${events.length} 件、充足 ${doneUnits}/${counted.length} 単元、不足 ${shortfall} 件 → 骨格の完成時 約${completeTotal} 件`);

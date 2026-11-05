// 日本史の単元カバー表 docs/COVERAGE-JAPAN.md を生成する（coverage-report.mjs --mode=japan から呼ばれる）。
// 単元の定義・最低件数・イベントの割り当て・候補は src/data/units-japan.json。
// 件数は「日本の地図に出るイベント」（events-japan.json 全件と、events.json のうち scopes に japan を含むもの）で数える。
import { writeFileSync } from "node:fs";

export function renderJapan(read) {
  const { basis, majors, units, batchesDone } = read("../src/data/units-japan.json");
  const japan = read("../src/data/events-japan.json");
  const world = read("../src/data/events.json");
  const events = [...japan, ...world.filter((e) => (e.scopes ?? []).includes("japan"))];
  const byId = new Map(events.map((e) => [e.id, e]));
  const ids = new Set(events.map((e) => e.id));

  const counted = units.filter((u) => u.min > 0);
  const have = (u) => u.eventIds.filter((id) => ids.has(id)).length;
  const pct = (u) => Math.round((Math.min(have(u), u.min) / u.min) * 100);
  const minTotal = counted.reduce((s, u) => s + u.min, 0);
  const shortfall = counted.reduce((s, u) => s + Math.max(0, u.min - have(u)), 0);
  const doneUnits = counted.filter((u) => have(u) >= u.min).length;
  const completeTotal = events.length + shortfall;
  const majorName = Object.fromEntries(majors.map((m) => [m.code, m.name]));
  const label = (u) => `${u.major}(${u.code.slice(1)}) ${u.name}`;
  const shared = events.filter((e) => (e.scopes ?? []).includes("world") && (e.scopes ?? []).includes("japan"));

  let md = `# 単元カバー表（日本史探究）

> このファイルは \`node scripts/coverage-report.mjs --mode=japan\`（または \`npm run coverage:doc\`）で生成しています。手で編集せず、\`src/data/units-japan.json\`（単元の定義・最低件数・イベントの割り当て・候補）を直してから再生成してください。

- 基準：${basis}。単元名のみを用い、学習指導要領の文章は転載していない。各単元の説明は自分の言葉での要約。
- 現在、日本の地図に出るイベント：**${events.length}件**（日本史 ${japan.length}件 ＋ 世界史と共有 ${events.length - japan.length}件。すべて verified=false）
- 世界と日本の両方の地図に出る共有イベント：${shared.length}件（${shared.map((e) => e.title).join("、")}）
- 各大項目の (1)「…への転換と歴史的環境」と (2)「歴史資料と…の展望」は、時代を通観する問いや仮説を立てる単元で、個別の出来事は (3) に置く。そのため (1)(2) と D(4)「現代の日本の課題の探究」には件数の目安を設けない（ツアーや問いで扱う）。

## 「日本史の骨格の完成」の定義

**件数の目安を設けた ${counted.length} 単元のすべてで、イベント件数が最低件数を満たした状態**を「日本史の骨格の完成」とする（指示書 4.4）。

- 最低件数の合計：${minTotal}件
- 現在、最低件数を満たしている単元：${doneUnits} / ${counted.length}
- 不足の合計：${shortfall}件 → 骨格の完成時の合計は **約${completeTotal}件**（指示書の想定は120〜150件程度）
${shortfall === 0 ? "- **すべての単元が最低件数を満たし、「日本史の骨格」は完成している。**\n" : ""}
## 単元ごとの充足状況

| 大項目 | 中項目 | 現在 | 最低 | 充足率 | 不足 |
|---|---|---|---|---|---|
`;
  for (const u of units) {
    const t = u.min > 0;
    md += `| ${u.major} ${majorName[u.major]} | ${u.code.slice(1)} ${u.name} | ${have(u)} | ${t ? u.min : "—"} | ${t ? `${pct(u)}%` : "—"} | ${
      t ? Math.max(0, u.min - have(u)) : "—"
    } |\n`;
  }
  md += `| | **合計** | **${events.length}** | **${minTotal}** | | **${shortfall}** |\n`;

  md += `\n## 時代区分（目安）ごとの件数\n\n時代区分の境目には諸説あり、ここでの区切りは目安（\`src/lib/japanEras.ts\`）。\n\n| 時代 | 件数 |\n|---|---|\n`;
  const eras = ["旧石器", "縄文", "弥生", "古墳", "飛鳥", "奈良", "平安", "鎌倉", "室町", "安土桃山", "江戸", "明治", "大正", "昭和", "平成", "令和"];
  for (const era of eras) md += `| ${era} | ${events.filter((e) => e.era === era).length} |\n`;

  md += `\n## 単元の内容と不足分の候補\n`;
  for (const u of units) {
    md += `\n### ${label(u)}\n\n${u.summary}\n\n`;
    if (u.min === 0) {
      md += `件数の目安なし。\n`;
      continue;
    }
    md += `- 現在 ${have(u)}件 / 最低 ${u.min}件（充足率 ${pct(u)}%）\n`;
    if (u.eventIds.length) md += `- 収録済み：${u.eventIds.map((id) => byId.get(id)?.title ?? id).join("、")}\n`;
    if (u.candidates.length) {
      md += `- 不足分の候補：\n`;
      for (const c of u.candidates) md += `  - ${c.title}（${c.batch}）\n`;
    }
  }

  const batches = [...new Set(units.flatMap((u) => u.candidates.map((c) => c.batch)))].filter((b) => b !== "予備").sort();
  md += `\n## 追加の計画（1回20件以内）\n\n- 実施済み：${batchesDone.join("、")}\n\n`;
  md += batches.length ? `| 回 | 件数 | 対象の単元（件数） |\n|---|---|---|\n` : `未実施の回はない。\n`;
  for (const b of batches) {
    const per = counted.map((u) => [u, u.candidates.filter((c) => c.batch === b).length]).filter(([, n]) => n > 0);
    md += `| ${b} | ${per.reduce((s, [, n]) => s + n, 0)} | ${per.map(([u, n]) => `${u.major}(${u.code.slice(1)}) ${n}`).join("、")} |\n`;
  }
  const spare = counted.flatMap((u) => u.candidates.filter((c) => c.batch === "予備").map((c) => c.title));
  md += `\n- 予備（最低件数の達成には不要だが、次の段階で検討）：${spare.join("、") || "なし"}\n`;
  md += `- 各回とも、出典記事の実在確認・独自の文章・verified=false・\`docs/VERIFICATION-JAPAN.md\` への照合結果の追記を通す。\n`;

  writeFileSync(new URL("../docs/COVERAGE-JAPAN.md", import.meta.url), md);
  console.log(`日本：イベント ${events.length} 件、充足 ${doneUnits}/${counted.length} 単元、不足 ${shortfall} 件 → 骨格の完成時 約${completeTotal} 件`);
}

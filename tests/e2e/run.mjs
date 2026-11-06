// 操作テスト（Playwright / Chromium headless）。事前に `npm run build` で out/ を作っておくこと。
// 実行: npm run test:e2e
// GitHub Pages と同じサブパスで確かめるときは、ビルドと実行の両方で NEXT_PUBLIC_BASE_PATH を指定する:
//   NEXT_PUBLIC_BASE_PATH=/world-history-globe npm run build
//   NEXT_PUBLIC_BASE_PATH=/world-history-globe npm run test:e2e
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
import { serve } from "../../scripts/serve-out.mjs";

const require = createRequire(import.meta.url);
const { chromium, devices } = require("playwright");

const PORT = 4175;
const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const ORIGIN = `http://127.0.0.1:${PORT}`;
const URL = `${ORIGIN}${BASE}/`;
const SHOTS = "tests/e2e/screenshots";
mkdirSync(SHOTS, { recursive: true });

const results = [];
async function check(name, fn) {
  try {
    const detail = await fn();
    results.push({ name, ok: true, detail: detail ?? "" });
  } catch (e) {
    results.push({ name, ok: false, detail: String(e?.message ?? e).split("\n")[0] });
  }
}
function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}
const pov = (page) => page.evaluate(() => window.__WHG__?.pov());
const yearText = (page) => page.getByTestId("current-year").innerText();

async function setSlider(page, value) {
  await page.getByTestId("year-slider").fill(String(value));
}

async function openGlobe(page) {
  await page.goto(URL);
  await page.waitForFunction(() => !!window.__WHG__, null, { timeout: 20000 });
  await page.waitForTimeout(800);
}

/** 画面内で見えている（地球の裏側でない）アクティブなマーカーを1つクリックする */
async function clickVisibleMarker(page, { tap = false } = {}) {
  const handle = await page.waitForFunction(() => {
    const vw = innerWidth, vh = innerHeight;
    // まとめたマーカー（一覧が出る）ではなく、1件だけのマーカーを選ぶ
    for (const el of document.querySelectorAll('.marker.is-active[data-count="1"]:not(.is-behind)')) {
      const r = el.getBoundingClientRect();
      const cx = r.x + r.width / 2, cy = r.y + r.height / 2;
      if (cx > 0 && cy > 0 && cx < vw && cy < vh && document.elementFromPoint(cx, cy)?.closest(".marker") === el) {
        return { x: cx, y: cy, id: el.dataset.eventId };
      }
    }
    return null;
  }, null, { timeout: 5000 }).catch(() => null);
  const box = handle ? await handle.jsonValue() : null;
  assert(box, "クリック可能なマーカーが見つからない");
  if (tap) await page.touchscreen.tap(box.x, box.y);
  else await page.mouse.click(box.x, box.y);
  return box.id;
}

const server = await serve(PORT, BASE);
const browser = await chromium.launch();

// ───────────── PC ─────────────
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  // 同じオリジンへのリクエストの結果をすべて記録する（サブパス配信で読み込めない資源がないかを見る）
  const loaded = [];
  page.on("response", (r) => {
    if (r.url().startsWith(ORIGIN)) loaded.push({ path: r.url().slice(ORIGIN.length), status: r.status() });
  });
  page.on("requestfailed", (r) => {
    if (r.url().startsWith(ORIGIN)) loaded.push({ path: r.url().slice(ORIGIN.length), status: "failed" });
  });
  await openGlobe(page);

  await check(`PC: サブパス「${BASE || "/"}」で地球の画像・JS・CSSがすべて読み込まれる`, async () => {
    const bad = loaded.filter((x) => x.status !== 200);
    assert(bad.length === 0, `読み込めなかった資源: ${bad.map((x) => `${x.path}(${x.status})`).join(", ")}`);
    const outside = loaded.filter((x) => BASE && !x.path.startsWith(BASE + "/"));
    assert(outside.length === 0, `サブパスの外を参照している: ${outside.map((x) => x.path).join(", ")}`);
    const has = (re) => loaded.some((x) => re.test(x.path) && x.status === 200);
    assert(has(/\/textures\/earth-blue-marble\.jpg$/), "地球の画像が読み込まれていない");
    assert(has(/\/_next\/static\/.+\.js$/), "JS が読み込まれていない");
    assert(has(/\/_next\/static\/.+\.css$/), "CSS が読み込まれていない");
    const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    assert(bg === "rgb(5, 7, 13)", `CSS が適用されていない（背景色 ${bg}）`);
    const n = (re) => loaded.filter((x) => re.test(x.path)).length;
    return `JS ${n(/\.js$/)}件・CSS ${n(/\.css$/)}件・地球画像 ${n(/earth-blue-marble/)}件（すべて200）`;
  });

  await check("PC: noindex の meta が出力されている", async () => {
    const robots = await page.locator('meta[name="robots"]').getAttribute("content");
    assert(robots === "noindex", `robots = ${robots}`);
    return `<meta name="robots" content="${robots}">`;
  });

  await check("PC: 試作版の帯が表示され、閉じられる（再読み込み後も閉じたまま）", async () => {
    const b = page.getByTestId("preview-banner");
    assert(await b.isVisible(), "帯が表示されていない");
    const text = await b.innerText();
    assert(text.includes("試作版｜掲載内容は検証中です"), `文言が違う: ${text}`);
    await page.getByLabel("試作版の表示を閉じる").click();
    assert((await b.count()) === 0, "閉じても消えない");
    await openGlobe(page);
    assert((await page.getByTestId("preview-banner").count()) === 0, "再読み込みで帯が戻った");
    return "表示 → 閉じる → 再読み込み後も非表示";
  });

  await check("PC: 3D地球（WebGL canvas）が描画される", async () => {
    assert((await page.locator("canvas").count()) === 1, "canvas がない");
    return `初期年 ${await yearText(page)}`;
  });

  await check("PC: ドラッグで回転する", async () => {
    const before = await pov(page);
    await page.mouse.move(640, 330);
    await page.mouse.down();
    await page.mouse.move(820, 300, { steps: 12 });
    await page.mouse.up();
    await page.waitForTimeout(900);
    const after = await pov(page);
    const moved = Math.abs(after.lng - before.lng) + Math.abs(after.lat - before.lat);
    assert(moved > 5, `視点がほとんど変化しない (${JSON.stringify(before)} → ${JSON.stringify(after)})`);
    return `lng ${before.lng.toFixed(1)} → ${after.lng.toFixed(1)}, lat ${before.lat.toFixed(1)} → ${after.lat.toFixed(1)}`;
  });

  await check("PC: ホイールでズームする", async () => {
    const before = await pov(page);
    await page.mouse.move(640, 330);
    for (let i = 0; i < 5; i++) {
      await page.mouse.wheel(0, -300);
      await page.waitForTimeout(80);
    }
    await page.waitForTimeout(900);
    const after = await pov(page);
    assert(after.altitude < before.altitude - 0.1, `高度が下がらない (${before.altitude} → ${after.altitude})`);
    return `altitude ${before.altitude.toFixed(2)} → ${after.altitude.toFixed(2)}`;
  });

  await check("PC: 年代スライダーで年と表示イベントが変わる", async () => {
    await setSlider(page, 360); // 前1年付近
    const y1 = await yearText(page);
    const strip1 = await page.getByTestId("strip-list").innerText();
    await setSlider(page, 930); // 1950年付近
    const y2 = await yearText(page);
    const strip2 = await page.getByTestId("strip-list").innerText();
    assert(y1 === "前1年", `前1年にならない: ${y1}`);
    assert(y1 !== y2 && strip1 !== strip2, "年または同時代リストが変化しない");
    assert(strip2.includes("冷戦") || strip2.includes("第二次世界大戦"), "1950年頃のイベントがない");
    const n = await page.getByTestId("strip-list").locator("li").count();
    assert(n >= 2, "同時代のできごとが2件未満");
    return `${y1} → ${y2}（同時代 ${n} 件）`;
  });

  await check("PC: マーカー選択で 概要・年代・位置・出典・未検証 を表示", async () => {
    await setSlider(page, 250); // 前500年付近
    await page.waitForTimeout(300);
    const id = await clickVisibleMarker(page);
    const d = page.getByTestId("event-detail");
    await d.waitFor({ timeout: 3000 });
    const t = await d.innerText();
    for (const k of ["概要", "年代", "位置", "出典", "歴史的な注記"]) assert(t.includes(k), `「${k}」がない`);
    assert(await d.locator(".head-only [data-testid=unverified-badge]").isVisible(), "未検証バッジがない");
    assert((await d.locator(".sources a").count()) >= 1, "出典リンクがない");
    await page.screenshot({ path: `${SHOTS}/pc-detail.png` });
    return `選択: ${id}`;
  });

  await check("PC: 同時代チップ選択でカメラが移動する", async () => {
    const before = await pov(page);
    const chip = page.getByTestId("strip-list").locator("button").last();
    const label = await chip.innerText();
    await chip.click();
    await page.waitForTimeout(1900);
    const after = await pov(page);
    const moved = Math.abs(after.lng - before.lng) + Math.abs(after.lat - before.lat);
    assert(moved > 1, "カメラが動かない");
    return `${label.split("\n")[0]}: lng ${before.lng.toFixed(1)} → ${after.lng.toFixed(1)}`;
  });

  await check("PC: 年代表示（紀元前→紀元後・頃・±・期間）", async () => {
    const cases = [
      [930, "冷戦", "1947年頃〜1991年（約44年間）"],
    ];
    const out = [];
    // スライダーで該当年代へ移動し、チップから選んで詳細の年代表示を確かめる
    const targets = [
      { slider: 362, title: "ローマ帝政の開始", expect: "前27年" },
      { slider: 30, title: "インダス文明の都市", expect: "前2600年頃〜前1900年頃（約700年間）" },
      { slider: 125, title: "ハンムラビ法典", expect: "前18世紀頃" },
      { slider: 290, title: "アレクサンドロスの東方遠征", expect: "前334年〜前323年（11年間）" },
      ...cases.map(([slider, title, expect]) => ({ slider, title, expect })),
    ];
    for (const tg of targets) {
      await setSlider(page, tg.slider);
      const chip = page.getByTestId("strip-list").getByRole("button", { name: new RegExp(tg.title) });
      assert((await chip.count()) > 0, `${await yearText(page)} の同時代に「${tg.title}」がない`);
      await chip.first().click();
      const date = await page.getByTestId("detail-date").innerText();
      assert(date.startsWith(tg.expect), `「${tg.title}」の年代表示が想定外: ${date}`);
      out.push(`${tg.title}=${date.split("（開始")[0]}`);
    }
    return out.join(" / ");
  });

  await check("PC: 自動再生で年が進み、注目イベントへカメラが移動する", async () => {
    await page.getByLabel("詳細を閉じる").click().catch(() => {});
    await setSlider(page, 345); // 前100年付近 → 前27年（ローマ帝政）を通過する
    const y0 = await yearText(page);
    const p0 = await pov(page);
    await page.getByTestId("play").click();
    await page.waitForFunction(
      () => document.querySelector("[data-testid=event-detail]") !== null,
      null,
      { timeout: 15000 },
    );
    await page.waitForTimeout(1800);
    await page.getByTestId("play").click(); // 停止
    const y1 = await yearText(page);
    const p1 = await pov(page);
    const title = await page.locator(".detail-title").innerText();
    const moved = Math.abs(p1.lng - p0.lng) + Math.abs(p1.lat - p0.lat);
    assert(y0 !== y1, "年が進まない");
    assert(moved > 1, "カメラが移動しない");
    await page.screenshot({ path: `${SHOTS}/pc-autoplay.png` });
    return `${y0} → ${y1}、注目イベント「${title}」へ移動（lng ${p0.lng.toFixed(1)} → ${p1.lng.toFixed(1)}）`;
  });

  await check("PC: 年表表示に切り替えられる", async () => {
    await page.getByTestId("view-toggle").click();
    await page.getByTestId("chronology").waitFor();
    const n = await page.locator(".chrono-item").count();
    await page.getByTestId("view-toggle").click();
    return `${n} 件`;
  });

  await check("PC: ページエラーなし", async () => {
    assert(errors.length === 0, errors.join(" | "));
  });
  await ctx.close();
}

// ───────────── スマートフォン幅 ─────────────
{
  const { defaultBrowserType: _ignored, ...iphone } = devices["iPhone 13"];
  const ctx = await browser.newContext(iphone);
  const page = await ctx.newPage();
  await openGlobe(page);

  await check("SP: 試作版の帯は1行に収まり、タップで閉じられる", async () => {
    const b = page.getByTestId("preview-banner");
    const box = await b.boundingBox();
    assert(box && box.height <= 34, `帯が高すぎる（${box?.height}px）`);
    await page.screenshot({ path: `${SHOTS}/sp-banner.png` });
    await page.getByLabel("試作版の表示を閉じる").tap();
    assert((await b.count()) === 0, "閉じても消えない");
    return `高さ ${Math.round(box.height)}px`;
  });

  await check("SP(390×844): 横スクロールが出ない", async () => {
    const r = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, w: innerWidth, h: innerHeight }));
    assert(r.sw <= r.w, `scrollWidth ${r.sw} > ${r.w}`);
    await page.screenshot({ path: `${SHOTS}/sp-initial.png` });
    return `${r.w}×${r.h}`;
  });

  await check("SP: スライダーを操作できる", async () => {
    const s = page.getByTestId("year-slider");
    const box = await s.boundingBox();
    await page.touchscreen.tap(box.x + box.width * 0.7, box.y + box.height / 2);
    await page.waitForTimeout(300);
    const y = await yearText(page);
    assert(y !== "前3000年", `タップで年が変わらない: ${y}`);
    return `タップ後 ${y}`;
  });

  await check("SP: タッチドラッグで回転する（CDPのタッチイベント）", async () => {
    const cdp = await ctx.newCDPSession(page);
    const before = await pov(page);
    const pts = Array.from({ length: 12 }, (_, i) => ({ x: 130 + i * 12, y: 330 }));
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [pts[0]] });
    for (const p of pts.slice(1)) {
      await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [p] });
      await page.waitForTimeout(16);
    }
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await page.waitForTimeout(900);
    const after = await pov(page);
    const moved = Math.abs(after.lng - before.lng) + Math.abs(after.lat - before.lat);
    assert(moved > 3, `視点が変化しない (${before.lng} → ${after.lng})`);
    return `lng ${before.lng.toFixed(1)} → ${after.lng.toFixed(1)}`;
  });

  await check("SP: ピンチでズームする（CDPのタッチイベント）", async () => {
    const cdp = await ctx.newCDPSession(page);
    const before = await pov(page);
    const cx = 195, cy = 330;
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x: cx - 20, y: cy, id: 1 }, { x: cx + 20, y: cy, id: 2 }],
    });
    for (let d = 20; d <= 120; d += 10) {
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{ x: cx - d, y: cy, id: 1 }, { x: cx + d, y: cy, id: 2 }],
      });
      await page.waitForTimeout(16);
    }
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await page.waitForTimeout(900);
    const after = await pov(page);
    assert(after.altitude < before.altitude - 0.05, `高度が下がらない (${before.altitude} → ${after.altitude})`);
    return `altitude ${before.altitude.toFixed(2)} → ${after.altitude.toFixed(2)}`;
  });

  let spSelected = null;
  await check("SP: 詳細を開くと、上55%に地球・下45%に詳細の2段になる", async () => {
    // 直前のピンチで大きくズームしているため、同時代チップでイベント地点へカメラを移してから閉じ、マーカーをタップする
    await page.getByTestId("strip-list").locator("button").first().tap();
    await page.waitForTimeout(1800);
    await page.getByLabel("詳細を閉じる").tap();
    await page.waitForTimeout(400);
    spSelected = await clickVisibleMarker(page, { tap: true });
    const d = page.getByTestId("event-detail");
    await d.waitFor({ timeout: 3000 });
    await page.waitForTimeout(1900); // カメラ移動（1.5秒）を待つ
    const g = await page.getByTestId("globe").boundingBox();
    const box = await d.boundingBox();
    const ratio = g.height / (g.height + box.height);
    assert(Math.abs(ratio - 0.55) < 0.03, `地球:詳細の比率が想定外（地球 ${Math.round(ratio * 100)}%）`);
    assert(Math.abs(g.y + g.height - box.y) < 2, "地球と詳細の間にすき間・重なりがある");
    const canvas = await page.locator("canvas").boundingBox();
    assert(Math.abs(canvas.height - g.height) < 2, `canvas が縮んでいない（canvas ${canvas.height} / 領域 ${g.height}）`);
    const noHScroll = await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
    assert(noHScroll, "詳細表示時に横スクロールが出る");
    await page.screenshot({ path: `${SHOTS}/sp-detail.png` });
    return `地球 ${Math.round(g.height)}px（${Math.round(ratio * 100)}%）／詳細 ${Math.round(box.height)}px／選択: ${spSelected}`;
  });

  await check("SP: 詳細を開いても、選んだマーカーが見えている地球の中央付近にある", async () => {
    const r = await page.evaluate((id) => {
      const el = document.querySelector(`.marker[data-event-ids~="${id}"]`);
      const globe = document.querySelector("[data-testid=globe]").getBoundingClientRect();
      const detail = document.querySelector("[data-testid=event-detail]").getBoundingClientRect();
      if (!el) return { error: "マーカーが描画されていない" };
      const m = el.getBoundingClientRect();
      const cx = m.x + m.width / 2, cy = m.y + m.height / 2;
      return {
        behind: el.classList.contains("is-behind"),
        hit: document.elementFromPoint(cx, cy)?.closest(".marker") === el,
        inGlobe: cx > globe.left && cx < globe.right && cy > globe.top && cy < globe.bottom,
        underSheet: cy > detail.top,
        dx: Math.abs(cx - (globe.left + globe.width / 2)),
        dy: Math.abs(cy - (globe.top + globe.height / 2)),
        h: globe.height,
      };
    }, spSelected);
    assert(!r.error, r.error);
    assert(!r.behind && r.inGlobe && !r.underSheet, `マーカーが見えていない ${JSON.stringify(r)}`);
    assert(r.hit, "マーカーの上に別の要素が重なっている");
    assert(r.dx < 20 && r.dy < 20, `マーカーが中央からずれている（横 ${Math.round(r.dx)}px・縦 ${Math.round(r.dy)}px）`);
    return `中央からのずれ 横${Math.round(r.dx)}px・縦${Math.round(r.dy)}px（地球の高さ ${Math.round(r.h)}px）`;
  });

  await check("SP: 詳細は タイトル→年代→場所→概要 の順で、その下に注記→出典→未検証。詳細の中だけがスクロールする", async () => {
    const r = await page.evaluate(() => {
      const d = document.querySelector("[data-testid=event-detail]");
      const top = (sel) => d.querySelector(sel).getBoundingClientRect().top;
      const dds = d.querySelectorAll(".detail-meta dd");
      return {
        title: top(".detail-title"),
        date: dds[0].getBoundingClientRect().top,
        place: dds[1].getBoundingClientRect().top,
        summary: top("[data-testid=detail-summary]"),
        note: top("[data-testid=detail-note-head]"),
        sources: top(".sources"),
        unverified: top(".foot-only [data-testid=unverified-badge]"),
        detailTop: d.getBoundingClientRect().top,
        detailBottom: d.getBoundingClientRect().bottom,
        scrollable: d.scrollHeight > d.clientHeight,
      };
    });
    const order = [r.title, r.date, r.place, r.summary, r.note, r.sources, r.unverified];
    assert(order.every((v, i) => i === 0 || v > order[i - 1]), `表示順が違う ${JSON.stringify(r)}`);
    assert(r.title >= r.detailTop && r.summary < r.detailBottom, "最初の表示でタイトル〜概要の見出しが見えていない");
    assert(r.scrollable, "詳細がスクロール可能になっていない");
    const before = await page.evaluate(() => ({ win: scrollY, globe: document.querySelector("[data-testid=globe]").getBoundingClientRect().top }));
    const d = page.getByTestId("event-detail");
    const box = await d.boundingBox();
    await page.touchscreen.tap(box.x + 20, box.y + box.height - 20); // フォーカスを詳細へ
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.wheel(0, 2000);
    await page.waitForTimeout(500);
    const after = await page.evaluate(() => ({
      win: scrollY,
      globe: document.querySelector("[data-testid=globe]").getBoundingClientRect().top,
      dScroll: document.querySelector("[data-testid=event-detail]").scrollTop,
    }));
    assert(after.dScroll > 0, "詳細の中がスクロールしない");
    assert(after.win === before.win && after.globe === before.globe, "ページ全体や地球まで動いてしまう");
    assert(await page.locator(".foot-only [data-testid=unverified-badge]").isVisible(), "末尾までスクロールしても未検証表示が見えない");
    await page.screenshot({ path: `${SHOTS}/sp-detail-scrolled.png` });
    await d.evaluate((el) => (el.scrollTop = 0));
    return `詳細内スクロール ${Math.round(after.dScroll)}px（ページ・地球は動かない）`;
  });

  await check("SP: 詳細表示中も年代スライダーは操作でき、同時代リストは隠れる", async () => {
    assert(!(await page.getByTestId("strip-list").isVisible()), "同時代リストが表示されたまま");
    const s = page.getByTestId("year-slider");
    assert(await s.isVisible(), "スライダーが見えない");
    const y0 = await yearText(page);
    const sb = await s.boundingBox();
    await page.touchscreen.tap(sb.x + sb.width * 0.2, sb.y + sb.height / 2);
    await page.waitForTimeout(300);
    const y1 = await yearText(page);
    assert(y0 !== y1, "スライダーをタップしても年が変わらない");
    assert(await page.getByTestId("event-detail").isVisible(), "スライダー操作で詳細が閉じてしまった");
    const kept = await page.locator(`.marker[data-event-ids~="${spSelected}"]`).count();
    assert(kept === 1, "同時代から外れた選択中のマーカーが地球から消えた");
    return `${y0} → ${y1}（詳細は開いたまま）`;
  });

  await check("SP: 詳細を閉じると地球が全画面に戻る", async () => {
    await page.getByLabel("詳細を閉じる").tap();
    await page.waitForTimeout(500);
    const stage = await page.locator(".stage").boundingBox();
    const g = await page.getByTestId("globe").boundingBox();
    const canvas = await page.locator("canvas").boundingBox();
    assert(Math.abs(g.height - stage.height) < 2, `地球の領域が戻っていない（${g.height} / ${stage.height}）`);
    assert(Math.abs(canvas.height - stage.height) < 2, "canvas が全画面に戻っていない");
    assert(await page.getByTestId("strip-list").isVisible(), "同時代リストが戻っていない");
    await page.screenshot({ path: `${SHOTS}/sp-closed.png` });
    return `地球 ${Math.round(g.height)}px（全画面）`;
  });

  await check("SP: 凡例はボタンで開閉できる", async () => {
    const t = page.getByRole("button", { name: "凡例・絞り込み" });
    assert(await t.isVisible(), "凡例ボタンがない");
    await t.tap();
    assert(await page.locator(".legend-body").isVisible(), "凡例が開かない");
    await page.screenshot({ path: `${SHOTS}/sp-legend.png` });
  });
  await ctx.close();
}

// ───────────── WebGL 非対応フォールバック ─────────────
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await ctx.addInitScript(() => {
    const orig = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
      if (String(type).startsWith("webgl") || type === "experimental-webgl") return null;
      return orig.call(this, type, ...rest);
    };
  });
  const page = await ctx.newPage();
  await page.goto(URL);
  await check("WebGL無効: 年表表示にフォールバックする", async () => {
    await page.getByTestId("fallback-notice").waitFor({ timeout: 10000 });
    await page.getByTestId("chronology").waitFor();
    const n = await page.locator(".chrono-item").count();
    assert((await page.locator("canvas").count()) === 0, "canvas が作られている");
    await page.locator(".chrono-item").first().click();
    await page.getByTestId("event-detail").waitFor();
    await page.screenshot({ path: `${SHOTS}/fallback.png` });
    return `年表 ${n} 件・詳細表示OK`;
  });
  await ctx.close();
}


// ───────────── 学習ツアー ─────────────
const near = (pov, lat, lng, tol = 4) => Math.abs(pov.lat - lat) < tol && Math.abs(((pov.lng - lng + 540) % 360) - 180) < tol;
const query = (page) => page.evaluate(() => location.search);

{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await openGlobe(page);

  await check("ツアー(PC): 一覧から「紙の旅」を開始できる", async () => {
    await page.getByTestId("tour-open").click();
    const menu = page.getByTestId("tour-menu");
    await menu.waitFor();
    const titles = await menu.locator(".tour-card h3").allInnerTexts();
    assert(
      titles.join("/") === "前500年頃、世界では？/紙の旅/銀が世界をめぐる/元寇――ユーラシアの嵐が博多湾へ/800年頃、世界では？/1600年、日本では？ 世界では？/幕末――黒船から箱館まで",
      `ツアー一覧が違う: ${titles}`,
    );
    await page.getByTestId("tour-start-paper").click();
    await page.getByTestId("tour-panel").waitFor();
    assert((await menu.count()) === 0, "一覧が閉じない");
    const pos = await page.getByTestId("tour-position").innerText();
    assert(pos === "はじめに", `最初の表示が導入でない: ${pos}`);
    assert((await query(page)) === "?tour=paper&step=0", `URL が更新されない: ${await query(page)}`);
    assert(await page.getByTestId("play").isDisabled(), "ツアー中に自動再生ボタンが押せる");
    return `一覧 ${titles.length} 本 → 導入（URL ${await query(page)}）`;
  });

  await check("ツアー(PC): 次へで年・カメラ・URL がステップに合わせて動く", async () => {
    await page.getByTestId("tour-next").click();
    await page.waitForTimeout(1900);
    const pos = await page.getByTestId("tour-position").innerText();
    const title = await page.getByTestId("tour-step-title").innerText();
    const y = await yearText(page);
    const p = await pov(page);
    assert(pos === "1 / 6" && title.includes("蔡倫") && y === "105年", `1番目が違う: ${pos} ${title} ${y}`);
    assert(near(p, 34.62, 112.45), `カメラが洛陽に向いていない ${JSON.stringify(p)}`);
    assert((await query(page)) === "?tour=paper&step=1", "URL が step=1 にならない");
    return `${pos}「${title.trim()}」${y}、カメラ lat ${p.lat.toFixed(1)} lng ${p.lng.toFixed(1)}`;
  });

  await check("ツアー(PC): つながり型の弧が積み重なり、タラス→バグダードは「伝承」と表示される", async () => {
    for (let i = 0; i < 3; i++) await page.getByTestId("tour-next").click();
    await page.waitForTimeout(1900);
    const title = await page.getByTestId("tour-step-title").innerText();
    assert(title.includes("バグダード"), `4番目がバグダードでない: ${title}`);
    const arcText = await page.getByTestId("tour-arc").innerText();
    assert(arcText.includes("伝承"), `パネルに伝承の表示がない: ${arcText}`);
    const labels = await page.locator("[data-testid=arc-label]").evaluateAll((els) =>
      els.map((e) => ({ c: e.dataset.certainty, t: e.textContent, cur: e.classList.contains("is-current") })),
    );
    assert(labels.length === 3, `弧が3本積み重なっていない（${labels.length}本）`);
    const cur = labels.find((l) => l.cur);
    assert(cur && cur.c === "traditional" && cur.t.includes("伝承"), `いまの弧が伝承になっていない ${JSON.stringify(labels)}`);
    await page.screenshot({ path: `${SHOTS}/tour-paper-baghdad.png` });
    return `弧 ${labels.length} 本（いまの弧：${cur.t}）`;
  });

  await check("ツアー(PC): 前へ・キーボード（← →）で行き来できる", async () => {
    await page.getByTestId("tour-prev").click();
    const a = await page.getByTestId("tour-position").innerText();
    const ta = await page.getByTestId("tour-step-title").innerText();
    await page.locator("body").click({ position: { x: 5, y: 790 } }).catch(() => {});
    await page.keyboard.press("ArrowRight");
    const b = await page.getByTestId("tour-position").innerText();
    await page.keyboard.press("ArrowLeft");
    const c = await page.getByTestId("tour-position").innerText();
    assert(a === "3 / 6" && ta.includes("タラス"), `前へで戻らない: ${a} ${ta}`);
    assert(b === "4 / 6" && c === "3 / 6", `キー操作が効かない: ${b} ${c}`);
    return `前へ → ${a}、→ ${b}、← ${c}`;
  });

  await check("ツアー(PC): ツアー中に詳細を開き、「ツアーに戻る」で戻れる", async () => {
    await page.getByTestId("tour-detail").click();
    await page.getByTestId("event-detail").waitFor();
    assert((await page.getByTestId("tour-panel").count()) === 0, "詳細とツアーが重なって表示される");
    await page.getByRole("button", { name: "ツアーに戻る" }).click();
    await page.getByTestId("tour-panel").waitFor();
    const pos = await page.getByTestId("tour-position").innerText();
    assert(pos === "3 / 6", `戻った位置が違う: ${pos}`);
    return `詳細 → ツアー（${pos}）`;
  });

  await check("ツアー(PC): 途中で抜けると、その年のまま自由に見て回れる状態に戻る", async () => {
    const y = await yearText(page);
    await page.getByTestId("tour-exit").click();
    assert((await page.getByTestId("tour-panel").count()) === 0, "ツアーのパネルが消えない");
    assert((await query(page)) === "", `URL にツアーが残っている: ${await query(page)}`);
    assert((await yearText(page)) === y, "抜けたときに年が変わった");
    assert(!(await page.getByTestId("play").isDisabled()), "抜けても自動再生が押せない");
    assert((await page.locator("[data-testid=arc-label]").count()) === 0, "弧が残っている");
    return `抜けたあとの年 ${y}`;
  });

  await check("ツアー(PC): URL（?tour=silver&step=3）から直接開始できる", async () => {
    await page.goto(`${URL}?tour=silver&step=3`);
    await page.getByTestId("tour-panel").waitFor({ timeout: 20000 });
    await page.waitForFunction(() => !!window.__WHG__, null, { timeout: 20000 });
    const pos = await page.getByTestId("tour-position").innerText();
    const title = await page.getByTestId("tour-step-title").innerText();
    const arcText = await page.getByTestId("tour-arc").innerText();
    assert(pos === "3 / 9" && title.includes("ガマ"), `直接開始の位置が違う: ${pos} ${title}`);
    assert(arcText.includes("諸説あり"), `諸説ありの弧の表示がない: ${arcText}`);
    assert((await yearText(page)) === "1498年", "年が合っていない");
    return `${pos}「${title.trim()}」（${arcText.replace(/\s+/g, " ").trim()}）`;
  });

  await check("ツアー(PC): 同時代型は年を止めたまま各地を巡り、まとめで終われる", async () => {
    await page.goto(`${URL}?tour=bc500&step=1`);
    await page.getByTestId("tour-panel").waitFor({ timeout: 20000 });
    const years = [];
    const places = [];
    for (let i = 0; i < 7; i++) {
      years.push(await yearText(page));
      places.push((await page.getByTestId("tour-step-title").innerText()).trim());
      await page.getByTestId("tour-next").click();
    }
    assert(new Set(years).size === 1 && years[0] === "前500年", `年が動いている: ${years}`);
    assert((await page.getByTestId("tour-position").innerText()) === "まとめ", "まとめに着かない");
    await page.getByTestId("tour-finish").click();
    assert((await page.getByTestId("tour-panel").count()) === 0, "終えてもパネルが残る");
    return `${years[0]}のまま ${places.length} か所 → まとめ → 終了`;
  });

  await check("ツアー(PC): ページエラーなし", async () => {
    assert(errors.length === 0, errors.join(" | "));
  });
  await ctx.close();
}

{
  const { defaultBrowserType: _ignored2, ...iphone2 } = devices["iPhone 13"];
  const ctx = await browser.newContext(iphone2);
  const page = await ctx.newPage();
  await openGlobe(page);

  await check("ツアー(SP): ヘッダーから開始でき、地球55%・ツアー45%で、地点が地球の中央に来る", async () => {
    const noScroll0 = await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
    assert(noScroll0, "ヘッダーのボタンで横スクロールが出る");
    await page.getByTestId("tour-open").tap();
    await page.getByTestId("tour-start-silver").tap();
    await page.getByTestId("tour-next").tap();
    await page.getByTestId("tour-next").tap(); // 2番目：コロンブス
    await page.waitForTimeout(1900);
    const g = await page.getByTestId("globe").boundingBox();
    const panel = await page.getByTestId("tour-panel").boundingBox();
    const ratio = g.height / (g.height + panel.height);
    assert(Math.abs(ratio - 0.55) < 0.03, `比率が想定外（地球 ${Math.round(ratio * 100)}%）`);
    const r = await page.evaluate(() => {
      const el = document.querySelector('.marker[data-event-ids~="columbus"]');
      const globe = document.querySelector("[data-testid=globe]").getBoundingClientRect();
      const m = el.getBoundingClientRect();
      const cx = m.x + m.width / 2, cy = m.y + m.height / 2;
      return {
        behind: el.classList.contains("is-behind"),
        hit: document.elementFromPoint(cx, cy)?.closest(".marker") === el,
        dx: Math.abs(cx - (globe.left + globe.width / 2)),
        dy: Math.abs(cy - (globe.top + globe.height / 2)),
      };
    });
    assert(!r.behind && r.hit && r.dx < 20 && r.dy < 20, `地点が中央に見えていない ${JSON.stringify(r)}`);
    const nav = await page.getByTestId("tour-next").boundingBox();
    assert(nav.y + nav.height <= panel.y + panel.height + 1 && nav.y >= panel.y, "前へ／次へがパネルの外にはみ出す");
    assert(nav.height >= 40, `ボタンが小さい（${nav.height}px）`);
    const noScroll = await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
    assert(noScroll, "ツアー中に横スクロールが出る");
    await page.screenshot({ path: `${SHOTS}/sp-tour.png` });
    return `地球 ${Math.round(ratio * 100)}%・中央からのずれ 横${Math.round(r.dx)}px 縦${Math.round(r.dy)}px`;
  });

  await check("ツアー(SP): 途中で抜けると全画面の地球に戻る", async () => {
    await page.getByTestId("tour-exit").tap();
    await page.waitForTimeout(400);
    const stage = await page.locator(".stage").boundingBox();
    const g = await page.getByTestId("globe").boundingBox();
    assert(Math.abs(g.height - stage.height) < 2, "地球が全画面に戻らない");
    return `地球 ${Math.round(g.height)}px`;
  });
  await ctx.close();
}


// ───────────── 同じ地点に重なるマーカー ─────────────
async function checkGroupedMarker(page, { tap }) {
  await setSlider(page, 965); // 1989年：「冷戦」と「ベルリンの壁崩壊」が同時に表示される
  const y = await yearText(page);
  assert(y === "1989年", `1989年にならない: ${y}`);
  // 同時代チップでベルリンへカメラを移してから、詳細を閉じる
  const chip = page.getByTestId("strip-list").getByRole("button", { name: /ベルリンの壁崩壊/ });
  if (tap) await chip.tap(); else await chip.click();
  await page.waitForTimeout(1900);
  const close = page.getByLabel("詳細を閉じる");
  if (tap) await close.tap(); else await close.click();
  await page.waitForTimeout(500);
  const group = page.locator('.marker[data-event-ids~="berlin-wall"][data-event-ids~="cold-war"]');
  assert((await group.count()) === 1, "2件が1つのマーカーにまとまっていない");
  assert((await group.getAttribute("data-count")) === "2", "件数のバッジが2でない");
  assert((await page.locator(".marker[data-event-ids]").evaluateAll((els) =>
    els.filter((e) => e.dataset.eventIds.split(" ").includes("berlin-wall")).length)) === 1, "ベルリンの壁が複数のマーカーに出ている");
  const box = await group.boundingBox();
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
  if (tap) await page.touchscreen.tap(cx, cy); else await page.mouse.click(cx, cy);
  const picker = page.getByTestId("marker-picker");
  await picker.waitFor({ timeout: 3000 });
  const items = await picker.locator(".marker-picker-title").allInnerTexts();
  assert(items.length === 2 && items.includes("冷戦") && items.includes("ベルリンの壁崩壊"), `一覧の中身が違う: ${items}`);
  const pb = await picker.boundingBox();
  const vp = page.viewportSize();
  assert(pb.x >= 0 && pb.x + pb.width <= vp.width + 1, "一覧が画面からはみ出す");
  await page.screenshot({ path: `${SHOTS}/${tap ? "sp" : "pc"}-group-picker.png` });
  // 1件目を選ぶ → 詳細が開く → もう一度マーカーから2件目を選ぶ
  const first = picker.getByRole("button", { name: /冷戦/ });
  if (tap) await first.tap(); else await first.click();
  const t1 = await page.locator(".detail-title").innerText();
  if (tap) await page.getByLabel("詳細を閉じる").tap(); else await page.getByLabel("詳細を閉じる").click();
  await page.waitForTimeout(300);
  const box2 = await group.boundingBox();
  if (tap) await page.touchscreen.tap(box2.x + box2.width / 2, box2.y + box2.height / 2);
  else await page.mouse.click(box2.x + box2.width / 2, box2.y + box2.height / 2);
  await picker.waitFor({ timeout: 3000 });
  const second = picker.getByRole("button", { name: /ベルリンの壁崩壊/ });
  if (tap) await second.tap(); else await second.click();
  const t2 = await page.locator(".detail-title").innerText();
  assert(t1 === "冷戦" && t2 === "ベルリンの壁崩壊", `選んだイベントが開かない: ${t1} / ${t2}`);
  return `マーカー1つ（バッジ2）→ 一覧 →「${t1}」「${t2}」をそれぞれ選べた`;
}

{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  await openGlobe(page);
  await check("重なり(PC): 同じ地点の2件は1つのマーカーにまとまり、一覧からどちらも選べる", () =>
    checkGroupedMarker(page, { tap: false }).then(async (r) => {
      await page.screenshot({ path: `${SHOTS}/pc-group.png` });
      return r;
    }),
  );
  await ctx.close();
}
{
  const { defaultBrowserType: _ignored3, ...iphone3 } = devices["iPhone 13"];
  const ctx = await browser.newContext(iphone3);
  const page = await ctx.newPage();
  await openGlobe(page);
  await check("重なり(SP): タップでも一覧が出て、どちらも選べる", () => checkGroupedMarker(page, { tap: true }));
  await ctx.close();
}

// ───────────── 作品から探す ─────────────
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await openGlobe(page);

  await check("作品(PC): 「作品から探す」→ キングダム で、前221年付近・秦による中国統一の詳細・キングダムが開く", async () => {
    await page.getByTestId("works-open").click();
    const menu = page.getByTestId("works-menu");
    await menu.waitFor();
    const n = await menu.locator(".work-card").count();
    assert(n >= 30, `作品が少ない（${n}件）`);
    assert(await page.getByTestId("works-search").evaluate((el) => el === document.activeElement), "検索欄にフォーカスがない");
    await page.screenshot({ path: `${SHOTS}/works-menu.png` });
    await page.getByTestId("work-start-kingdom-hara").click();
    assert((await menu.count()) === 0, "ダイアログが閉じない");
    const d = page.getByTestId("event-detail");
    await d.waitFor({ timeout: 3000 });
    await page.waitForTimeout(1900);
    const y = await yearText(page);
    assert(y === "前221年", `スライダーが前221年にならない: ${y}`);
    const title = await d.locator(".detail-title").innerText();
    assert(title === "秦による中国統一", `詳細が違う: ${title}`);
    const sec = page.getByTestId("detail-works");
    assert(await sec.isVisible(), "作品セクションがない");
    const k = page.getByTestId("detail-work-kingdom-hara");
    assert(await k.evaluate((el) => el.open), "キングダムが開いていない");
    assert(await k.evaluate((el) => el.classList.contains("is-active")), "キングダムが強調されていない");
    const body = await k.innerText();
    assert(body.includes("作品と史実のあいだ"), "「作品と史実のあいだ」がない");
    assert(await k.locator("[data-testid=unverified-badge]").isVisible(), "作品の未検証バッジがない");
    assert((await query(page)) === "?work=kingdom-hara", `URL に作品が反映されない: ${await query(page)}`);
    const p = await pov(page);
    assert(near(p, 34.26, 108.94, 6), `カメラが咸陽付近に向いていない ${JSON.stringify(p)}`);
    // 「歴史的な注記」と「出典」のあいだにある
    const order = await d.evaluate((el) => {
      const top = (sel) => el.querySelector(sel).getBoundingClientRect().top;
      return [top("[data-testid=detail-note-head]"), top("[data-testid=detail-works]"), top(".detail > .sources, aside > ul.sources")];
    });
    assert(order[0] < order[1] && order[1] < order[2], `作品セクションの位置が違う ${order}`);
    await page.screenshot({ path: `${SHOTS}/works-kingdom.png` });
    return `${y}「${title}」・キングダムを開いた状態（URL ${await query(page)}）`;
  });

  await check("作品(PC): 作品を閉じると URL から外れ、詳細を閉じても外れる", async () => {
    await page.locator("[data-testid=detail-work-kingdom-hara] > summary").click();
    await page.waitForTimeout(200);
    assert((await query(page)) === "", `作品を閉じても URL に残る: ${await query(page)}`);
    await page.locator("[data-testid=detail-work-kingdom-hara] > summary").click();
    await page.waitForTimeout(200);
    assert((await query(page)) === "?work=kingdom-hara", "作品を開き直しても URL に戻らない");
    await page.getByLabel("詳細を閉じる").click();
    await page.waitForTimeout(200);
    assert((await query(page)) === "", `詳細を閉じても URL に残る: ${await query(page)}`);
    return "閉じる → 外れる／開く → 戻る／詳細を閉じる → 外れる";
  });

  await check("作品(PC): 検索欄に「ベルサイユ」と入れると1件に絞られる（ひらがなでも）", async () => {
    await page.getByTestId("works-open").click();
    const s = page.getByTestId("works-search");
    await s.fill("ベルサイユ");
    const a = await page.locator(".work-card").count();
    const t = await page.locator(".work-card-title").first().innerText();
    await s.fill("べるさいゆ");
    const b = await page.locator(".work-card").count();
    assert(a === 1 && t === "ベルサイユのばら", `1件に絞られない: ${a}件 ${t}`);
    assert(b === 1, `ひらがなで絞られない: ${b}件`);
    await s.fill("");
    await page.getByTestId("works-media-stage").click();
    const c = await page.locator(".work-card").count();
    const all = await page.locator(".work-media").allInnerTexts();
    assert(c > 0 && all.every((x) => x.includes("舞台")), "媒体の絞り込みが効かない");
    await page.keyboard.press("Escape");
    assert((await page.getByTestId("works-menu").count()) === 0, "Esc で閉じない");
    return `「ベルサイユ」${a}件・「べるさいゆ」${b}件・舞台 ${c}件・Esc で閉じる`;
  });

  await check("作品(PC): 背景クリックで閉じる", async () => {
    await page.getByTestId("works-open").click();
    await page.getByTestId("works-menu").waitFor();
    await page.mouse.click(8, 400);
    assert((await page.getByTestId("works-menu").count()) === 0, "背景クリックで閉じない");
  });

  await check("作品(PC): ?work=rose-of-versailles で直接開くと、フランス革命の詳細が開く", async () => {
    await page.goto(`${URL}?work=rose-of-versailles`);
    await page.waitForFunction(() => !!window.__WHG__, null, { timeout: 20000 });
    const d = page.getByTestId("event-detail");
    await d.waitFor({ timeout: 5000 });
    const title = await d.locator(".detail-title").innerText();
    assert(title === "フランス革命", `詳細が違う: ${title}`);
    const r = page.getByTestId("detail-work-rose-of-versailles");
    assert(await r.evaluate((el) => el.open), "ベルサイユのばらが開いていない");
    assert((await yearText(page)) === "1789年", `年が違う: ${await yearText(page)}`);
    await page.waitForTimeout(1900);
    const p = await pov(page);
    assert(near(p, 48.85, 2.35, 6), `カメラがパリに向いていない ${JSON.stringify(p)}`);
    return `「${title}」${await yearText(page)}`;
  });

  await check("作品(PC): ?tour= と ?work= が両方あればツアーを優先する", async () => {
    await page.goto(`${URL}?tour=paper&step=1&work=rose-of-versailles`);
    await page.getByTestId("tour-panel").waitFor({ timeout: 20000 });
    assert((await page.getByTestId("event-detail").count()) === 0, "作品の詳細も開いている");
    return await page.getByTestId("tour-position").innerText();
  });

  await check("作品(PC): 年表表示で、作品が紐づく出来事に「作品 n」が付き、押すと作品セクションが見える", async () => {
    await page.goto(URL);
    await page.waitForFunction(() => !!window.__WHG__, null, { timeout: 20000 });
    await page.getByTestId("view-toggle").click();
    await page.getByTestId("chronology").waitFor();
    const badges = await page.locator("[data-testid=chrono-works]").count();
    assert(badges >= 30, `「作品 n」が少ない（${badges}件）`);
    const qin = page.getByTestId("chrono-qin-unification").locator("[data-testid=chrono-works]");
    const label = await qin.innerText();
    assert(/^作品 \d+$/.test(label), `表示が違う: ${label}`);
    await qin.click();
    const d = page.getByTestId("event-detail");
    await d.waitFor();
    await page.waitForTimeout(400);
    const vis = await page.evaluate(() => {
      const d = document.querySelector("[data-testid=event-detail]").getBoundingClientRect();
      const s = document.querySelector("[data-testid=detail-works]").getBoundingClientRect();
      return s.top >= d.top - 1 && s.top < d.bottom;
    });
    assert(vis, "作品セクションが見えるところまで送られない");
    await page.getByTestId("view-toggle").click();
    return `「作品 n」${badges}件・秦の統一は「${label}」`;
  });

  await check("作品(PC): ページエラーなし", async () => {
    assert(errors.length === 0, errors.join(" | "));
  });
  await ctx.close();
}

{
  const { defaultBrowserType: _ignored4, ...iphone4 } = devices["iPhone 13"];
  const ctx = await browser.newContext(iphone4);
  const page = await ctx.newPage();
  await openGlobe(page);

  await check("作品(SP): ヘッダーのボタンが収まり、ダイアログが崩れない", async () => {
    const noScroll0 = await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
    assert(noScroll0, "ヘッダーのボタンで横スクロールが出る");
    const btn = await page.getByTestId("works-open").boundingBox();
    const vp = page.viewportSize();
    assert(btn && btn.x + btn.width <= vp.width, "「作品から探す」が画面からはみ出す");
    await page.getByTestId("works-open").tap();
    const menu = page.getByTestId("works-menu");
    await menu.waitFor();
    const mb = await menu.boundingBox();
    assert(mb.x >= 0 && mb.x + mb.width <= vp.width + 1, "ダイアログが横にはみ出す");
    const cards = await page.locator(".work-card").evaluateAll((els) =>
      els.slice(0, 5).map((e) => { const r = e.getBoundingClientRect(); return { l: r.left, r: r.right }; }),
    );
    assert(cards.every((c) => c.l >= 0 && c.r <= vp.width + 1), "カードが横にはみ出す");
    const over = await menu.evaluate((el) => el.scrollWidth > el.clientWidth + 1);
    assert(!over, "ダイアログの中で横スクロールが出る");
    await page.screenshot({ path: `${SHOTS}/sp-works-menu.png` });
    return `ダイアログ ${Math.round(mb.width)}×${Math.round(mb.height)}px`;
  });

  await check("作品(SP): 作品を選ぶと詳細が下45%に開き、作品セクションが崩れない", async () => {
    await page.getByTestId("work-start-rose-of-versailles").tap();
    const d = page.getByTestId("event-detail");
    await d.waitFor();
    await page.waitForTimeout(1900);
    const g = await page.getByTestId("globe").boundingBox();
    const box = await d.boundingBox();
    const ratio = g.height / (g.height + box.height);
    assert(Math.abs(ratio - 0.55) < 0.03, `比率が想定外（地球 ${Math.round(ratio * 100)}%）`);
    const r = await page.evaluate(() => {
      const s = document.querySelector("[data-testid=detail-works]");
      const w = document.querySelector("[data-testid=detail-work-rose-of-versailles]");
      const gap = w.querySelector("[data-testid=work-gap]").getBoundingClientRect();
      return {
        open: w.open,
        overflow: s.scrollWidth > s.clientWidth + 1,
        gapInside: gap.left >= 0 && gap.right <= innerWidth + 1,
        noHScroll: document.documentElement.scrollWidth <= innerWidth,
      };
    });
    assert(r.open, "作品が開いていない");
    assert(!r.overflow && r.gapInside && r.noHScroll, `作品セクションが崩れている ${JSON.stringify(r)}`);
    await page.getByTestId("detail-work-rose-of-versailles").scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${SHOTS}/sp-works-detail.png` });
    return `地球 ${Math.round(ratio * 100)}%・作品セクションは横幅内`;
  });
  await ctx.close();
}

// ───────────── 日本史モード ─────────────
const jpView = (page) => page.evaluate(() => window.__WHG_JP__?.view());
const waitJapan = (page) => page.waitForFunction(() => !!window.__WHG_JP__ && window.__WHG_JP__.size().width > 0, null, { timeout: 20000 });
const markerCenter = (page, id) =>
  page.evaluate((id) => {
    const el = document.querySelector(`.japan-map .marker[data-event-ids~="${id}"]`);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const cx = r.x + r.width / 2, cy = r.y + r.height / 2;
    return { x: cx, y: cy, hidden: el.classList.contains("is-behind"), hit: document.elementFromPoint(cx, cy)?.closest(".marker") === el };
  }, id);

{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await openGlobe(page);

  await check("日本(PC): ヘッダーの「🗾 日本」で日本地図に切り替わり、年は引き継がれ、URL に ?mode=japan が付く", async () => {
    await setSlider(page, 590); // 1274年付近（世界の目盛り）
    const y0 = await yearText(page);
    await page.getByTestId("mode-japan").click();
    await waitJapan(page);
    const y1 = await yearText(page);
    assert(y0 === y1, `年が引き継がれない: ${y0} → ${y1}`);
    assert((await page.locator("canvas").count()) === 0, "地球儀（canvas）が残っている");
    assert(await page.getByTestId("japan-map").isVisible(), "日本地図が出ない");
    assert((await query(page)) === "?mode=japan", `URL: ${await query(page)}`);
    assert(await page.getByTestId("mode-japan").getAttribute("aria-pressed") === "true", "切り替えボタンの状態が違う");
    const attr = await page.getByTestId("map-attribution").innerText();
    assert(attr.includes("Natural Earth"), `出典表記がない: ${attr}`);
    assert(await page.getByTestId("era-bands").isVisible(), "時代区分の目盛りがない");
    const eras = await page.locator("[data-era]").count();
    assert(eras === 16, `時代区分が16ではない（${eras}）`);
    return `${y0} のまま日本地図へ（時代区分 ${eras}・${attr}）`;
  });

  await check("日本(PC): 背景の陰影起伏画像（Natural Earth のラスター）が読み込まれ、ベクターの陸地は海岸線だけになる", async () => {
    await page.waitForSelector("[data-testid=jp-relief-lo].is-ready", { timeout: 15000 });
    const r = await page.evaluate(() => {
      const img = document.querySelector("[data-testid=jp-relief-lo]");
      const land = document.querySelector(".jp-land");
      return { href: img.getAttribute("href"), outline: land.classList.contains("is-outline"), fill: getComputedStyle(land).fill };
    });
    assert(r.href === `${BASE}/japan/relief-lo.webp`, `画像のパスが違う: ${r.href}`);
    assert(r.outline && r.fill === "none", `陸地が塗られたまま: ${JSON.stringify(r)}`);
    const res = await page.evaluate(async (href) => (await fetch(href)).status, r.href);
    assert(res === 200, `画像が取れない: ${res}`);
    return `${r.href}（HTTP ${res}）`;
  });

  await check("日本(PC): 日本の範囲は前3万年から。世界へ戻ると範囲の端（前3000年）に合わせる", async () => {
    await setSlider(page, 0);
    const y = await yearText(page);
    assert(y === "前30000年", `日本の始まりが違う: ${y}`);
    await page.getByTestId("mode-world").click();
    await page.waitForFunction(() => !!document.querySelector("canvas"), null, { timeout: 20000 });
    const y2 = await yearText(page);
    assert(y2 === "前3000年", `世界の範囲の端に合わない: ${y2}`);
    assert((await query(page)) === "", `URL に mode が残る: ${await query(page)}`);
    await page.getByTestId("mode-japan").click();
    await waitJapan(page);
    return `${y} → 世界 ${y2}`;
  });

  await check("日本(PC): ドラッグで移動、ホイールで拡大縮小（上限あり）", async () => {
    const box = await page.getByTestId("japan-map").boundingBox();
    const v0 = await jpView(page);
    await page.mouse.move(box.x + 500, box.y + 300);
    await page.mouse.down();
    await page.mouse.move(box.x + 650, box.y + 260, { steps: 8 });
    await page.mouse.up();
    const v1 = await jpView(page);
    assert(v1.lng < v0.lng - 1, `ドラッグで動かない ${JSON.stringify(v0)} → ${JSON.stringify(v1)}`);
    for (let i = 0; i < 30; i++) await page.mouse.wheel(0, -400);
    await page.waitForTimeout(200);
    const v2 = await jpView(page);
    assert(v2.zoom > v1.zoom && v2.zoom <= 12.0001, `ズームが効かないか上限を超える: ${v2.zoom}`);
    for (let i = 0; i < 30; i++) await page.mouse.wheel(0, 400);
    await page.waitForTimeout(200);
    const v3 = await jpView(page);
    assert(v3.zoom < 1, `縮小できない: ${v3.zoom}`);
    return `lng ${v0.lng.toFixed(1)} → ${v1.lng.toFixed(1)}、zoom 最大 ${v2.zoom.toFixed(1)}・最小 ${v3.zoom.toFixed(2)}`;
  });

  await check("日本(PC): 最大まで拡大すると京都・奈良・大阪のマーカーが重ならない", async () => {
    await page.goto(`${URL}?mode=japan&event=heian-kyo`);
    await waitJapan(page);
    await page.getByLabel("詳細を閉じる").click();
    await page.getByTestId("legend-show-all").check().catch(async () => {
      await page.getByText("他の時代のイベントも薄く表示").click();
    });
    const box = await page.getByTestId("japan-map").boundingBox();
    const k = await markerCenter(page, "heian-kyo");
    await page.mouse.move(k.x, k.y + 40);
    for (let i = 0; i < 30; i++) await page.mouse.wheel(0, -400);
    await page.waitForTimeout(300);
    const pts = await page.evaluate(() =>
      ["heian-kyo", "jp-todaiji-ganjin"].map((id) => {
        const el = document.querySelector(`.japan-map .marker[data-event-ids~="${id}"]`);
        const r = el.getBoundingClientRect();
        return { id, x: r.x + r.width / 2, y: r.y + r.height / 2, ids: el.dataset.eventIds };
      }),
    );
    const d = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
    // 同じ地点（平安京）の出来事どうしはまとまってよいが、京都と奈良は別のマーカーになる
    assert(!pts[0].ids.split(" ").includes("jp-todaiji-ganjin"), `京都と奈良が1つにまとめられている ${JSON.stringify(pts)}`);
    assert(d > 40, `京都と奈良のマーカーが近すぎる（${Math.round(d)}px）`);
    await page.getByText("他の時代のイベントも薄く表示").click();
    return `京都—奈良 ${Math.round(d)}px（地図 ${Math.round(box.width)}px 幅）`;
  });

  await check("日本(PC): ?mode=japan&event=jp-mongol-invasions で直接開き、「世界とのつながり」と地図の端の矢印が出る", async () => {
    await page.goto(`${URL}?mode=japan&event=jp-mongol-invasions`);
    await waitJapan(page);
    const d = page.getByTestId("event-detail");
    await d.waitFor();
    const title = await d.locator(".detail-title").innerText();
    assert(title.startsWith("元寇"), `詳細が違う: ${title}`);
    assert((await yearText(page)) === "1274年", "年が合わない");
    const cards = await page.locator("[data-testid=cross-links] .cross-card").allInnerTexts();
    assert(cards.some((c) => c.includes("世界史で見る") && c.includes("元の成立")), `つながりのカード: ${cards}`);
    await page.waitForTimeout(1200);
    const edges = await page.locator(".edge-link").count();
    assert(edges >= 2, `端の矢印が出ない（${edges}）`);
    // 矢印どうし・凡例・詳細パネルと重ならない
    const r = await page.evaluate(() => {
      const rects = [...document.querySelectorAll(".edge-link, .legend, [data-testid=event-detail]")].map((e) => e.getBoundingClientRect());
      let overlap = 0;
      for (let i = 0; i < rects.length; i++)
        for (let j = i + 1; j < rects.length; j++) {
          const a = rects[i], b = rects[j];
          if (a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top) overlap++;
        }
      return overlap;
    });
    assert(r === 0, `矢印が重なっている（${r}組）`);
    await page.screenshot({ path: `${SHOTS}/jp-pc-mongol.png` });
    return `「${title}」・カード ${cards.length}枚・端の矢印 ${edges}本`;
  });

  await check("日本(PC): 「🌏 世界史で見る」で地球儀へ移り、元の成立の詳細が開く（年・カメラ・URL も移る）", async () => {
    await page.getByTestId("cross-link-yuan-dadu").click();
    await page.waitForFunction(() => !!window.__WHG__ && !!document.querySelector("canvas"), null, { timeout: 20000 });
    const d = page.getByTestId("event-detail");
    await d.waitFor();
    const t1 = await d.locator(".detail-title").innerText();
    assert(t1.includes("元の成立"), `地球儀で開いた詳細が違う: ${t1}`);
    assert((await yearText(page)) === "1271年", `年が違う: ${await yearText(page)}`);
    assert((await query(page)) === "", `URL: ${await query(page)}`);
    await page.waitForTimeout(1700);
    const p = await pov(page);
    assert(near(p, 39.95, 116.39, 6), `カメラが大都に向いていない ${JSON.stringify(p)}`);
    return `日本「元寇」→ 世界「${t1}」（lat ${p.lat.toFixed(1)} lng ${p.lng.toFixed(1)}）`;
  });

  await check("日本(PC): 世界↔日本の往復（日明貿易 →🌏 明 →🗾 琉球王国）", async () => {
    await page.goto(`${URL}?mode=japan&event=jp-ming-trade`);
    await waitJapan(page);
    await page.getByTestId("cross-link-ming").click();
    await page.waitForFunction(() => !!document.querySelector("canvas"), null, { timeout: 20000 });
    const t1 = await page.getByTestId("event-detail").locator(".detail-title").innerText();
    assert(t1 === "明の成立", `世界で開いた詳細が違う: ${t1}`);
    const back = await page.locator("[data-testid=cross-links] .cross-card").allInnerTexts();
    assert(back.some((c) => c.includes("日本史で見る") && c.includes("琉球王国")), `日本へのカード: ${back}`);
    await page.getByTestId("cross-link-jp-ryukyu-kingdom").click();
    await waitJapan(page);
    const t2 = await page.getByTestId("event-detail").locator(".detail-title").innerText();
    assert(t2.includes("琉球王国"), `日本へ戻った詳細が違う: ${t2}`);
    assert((await yearText(page)) === "1429年", `年が違う: ${await yearText(page)}`);
    assert((await query(page)) === "?mode=japan", `URL: ${await query(page)}`);
    await page.waitForTimeout(1200);
    const m = await markerCenter(page, "jp-ryukyu-kingdom");
    assert(m && !m.hidden && m.hit, "琉球王国のマーカーが見えていない");
    return `日本「日明貿易」→ 世界「${t1}」→ 日本「${t2}」`;
  });

  await check("日本(PC): 地図の端の矢印を押すと、地球儀でそのイベントが開く", async () => {
    await page.goto(`${URL}?mode=japan&event=jp-iwami-silver`);
    await waitJapan(page);
    await page.waitForTimeout(1200);
    await page.getByTestId("edge-link-manila-galleon").click();
    await page.waitForFunction(() => !!document.querySelector("canvas"), null, { timeout: 20000 });
    const t = await page.getByTestId("event-detail").locator(".detail-title").innerText();
    assert(t.includes("マニラ"), `開いた詳細が違う: ${t}`);
    return `石見銀山 → 矢印 →「${t}」`;
  });

  await check("日本(PC): 共有イベント（平安京）は切り替えても選択が引き継がれる", async () => {
    await page.goto(`${URL}?event=heian-kyo`);
    await page.waitForFunction(() => !!window.__WHG__, null, { timeout: 20000 });
    await page.getByTestId("event-detail").waitFor();
    assert(await page.getByTestId("shared-note").isVisible(), "共有イベントの表示がない");
    await page.getByTestId("mode-japan").click();
    await waitJapan(page);
    const t = await page.getByTestId("event-detail").locator(".detail-title").innerText();
    assert(t === "平安京への遷都", `選択が引き継がれない: ${t}`);
    const m = await markerCenter(page, "heian-kyo");
    assert(m && !m.hidden, "日本地図に平安京のマーカーがない");
    return `世界「${t}」→ 日本でも選択中`;
  });

  await check("日本(PC): 同時代リストに「🌏 同じころ、世界では？」の段が出て、押すと地球儀で開く", async () => {
    await page.goto(`${URL}?mode=japan&event=jp-ming-trade`);
    await waitJapan(page);
    await page.getByLabel("詳細を閉じる").click();
    const other = page.getByTestId("strip-other");
    assert(await other.isVisible(), "「同じころ、世界では？」の段がない");
    const head = await other.locator(".strip-other-title").innerText();
    assert(head.includes("同じころ、世界では"), head);
    const chip = other.locator(".chip-other").first();
    const id = await chip.getAttribute("data-event-id");
    await chip.click();
    await page.waitForFunction(() => !!document.querySelector("canvas"), null, { timeout: 20000 });
    const t = await page.getByTestId("event-detail").locator(".detail-title").innerText();
    // 世界モードでは「🗾 同じころ、日本では？」の段に分かれる
    const head2 = await page.getByTestId("strip-other").locator(".strip-other-title").innerText();
    assert(head2.includes("同じころ、日本では"), head2);
    const worldChips = await page.getByTestId("strip-list").locator("button").allInnerTexts();
    assert(!worldChips.some((c) => c.includes("日明貿易")), "世界の同時代リストに日本だけの出来事が混ざっている");
    return `日本の段 → 世界「${t}」(${id})／世界側は「同じころ、日本では？」の段`;
  });

  await check("日本(PC): 年表表示は時代区分（目安）の見出しで並ぶ", async () => {
    await page.goto(`${URL}?mode=japan`);
    await waitJapan(page);
    await page.getByTestId("view-toggle").click();
    await page.getByTestId("chronology").waitFor();
    const heads = await page.locator(".chronology h2").allInnerTexts();
    assert(heads.some((h) => h.includes("鎌倉（目安）")), `見出し: ${heads}`);
    const n = await page.locator(".chrono-item").count();
    await page.getByTestId("view-toggle").click();
    return `見出し ${heads.length}・項目 ${n}`;
  });

  await check("日本(PC): ページエラーなし", async () => {
    assert(errors.length === 0, errors.join(" | "));
  });
  await ctx.close();
}

// ───────────── モードをまたぐツアー ─────────────
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await openGlobe(page);

  await check("またぐツアー(PC): 元寇ツアーを最後まで。地球儀で始まり、文永の役で日本地図に切り替わる", async () => {
    await page.getByTestId("tour-open").click();
    await page.getByTestId("tour-start-mongol").click();
    await page.getByTestId("tour-panel").waitFor();
    const modes = [];
    const titles = [];
    for (let i = 0; i < 6; i++) {
      await page.getByTestId("tour-next").click();
      await page.waitForTimeout(i === 3 ? 1600 : 400);
      modes.push(await page.locator(".app").getAttribute("data-mode"));
      titles.push((await page.getByTestId("tour-step-title").innerText()).trim());
      if (i === 2) {
        await page.waitForTimeout(1400);
        await page.screenshot({ path: `${SHOTS}/tour-mongol-3-world.png` });
      }
      if (i === 3) {
        assert(await page.getByTestId("japan-map").isVisible(), "4番目で日本地図にならない");
        assert((await query(page)) === "?mode=japan&tour=mongol&step=4", `URL: ${await query(page)}`);
        const v = await jpView(page);
        assert(Math.abs(v.zoom - 2.2) < 0.05, `日本地図のカメラ（拡大率）が違う: ${v.zoom}`);
        const arcs = await page.locator(".japan-map [data-testid=arc-label]").allInnerTexts();
        assert(arcs.some((a) => a.includes("朝鮮半島から博多湾へ")), `日本地図に弧のラベルがない: ${arcs}`);
        assert((await page.getByTestId("tour-mode").innerText()).includes("日本地図"), "パネルに日本地図の表示がない");
        await page.screenshot({ path: `${SHOTS}/tour-mongol-4-japan.png` });
      }
    }
    assert(modes.join(",") === "world,world,world,japan,japan,japan", `モードの並びが違う: ${modes}`);
    assert((await yearText(page)) === "1333年", "最後の年が違う");
    await page.getByTestId("tour-next").click();
    assert((await page.getByTestId("tour-position").innerText()) === "まとめ", "まとめに着かない");
    const lastArc = await page.locator(".japan-map [data-testid=arc-label][data-certainty=debated]").count();
    assert(lastArc >= 1, "鎌倉幕府への弧（諸説あり）が描かれていない");
    await page.getByTestId("tour-finish").click();
    assert((await page.getByTestId("tour-panel").count()) === 0, "終えてもパネルが残る");
    assert((await query(page)) === "?mode=japan", `終了後の URL: ${await query(page)}`);
    return titles.join(" → ");
  });

  await check("またぐツアー(PC): 前へで日本地図から地球儀に戻り、?tour=mongol&step=4 で日本地図から直接始まる", async () => {
    await page.goto(`${URL}?tour=mongol&step=4`);
    await waitJapan(page);
    assert((await page.locator(".app").getAttribute("data-mode")) === "japan", "直接開始で日本地図にならない");
    await page.getByTestId("tour-prev").click();
    await page.waitForFunction(() => !!document.querySelector("canvas"), null, { timeout: 20000 });
    const t = (await page.getByTestId("tour-step-title").innerText()).trim();
    assert(t.includes("高麗"), `3番目が高麗でない: ${t}`);
    assert((await query(page)) === "?tour=mongol&step=3", `URL: ${await query(page)}`);
    return `step4（日本）→ 前へ →「${t}」（地球儀）`;
  });

  await check("またぐツアー(PC): 銀のツアーはポトシ → 石見銀山（日本地図）→ マニラ（地球儀）", async () => {
    await page.goto(`${URL}?tour=silver&step=7`);
    await page.getByTestId("tour-panel").waitFor({ timeout: 20000 });
    const seq = [];
    for (let i = 0; i < 3; i++) {
      if (i) {
        await page.getByTestId("tour-next").click();
        await page.waitForTimeout(500);
      }
      seq.push(`${(await page.getByTestId("tour-step-title").innerText()).trim()}(${await page.locator(".app").getAttribute("data-mode")})`);
    }
    assert(/ポトシ.*\(world\)/.test(seq[0]) && /石見銀山.*\(japan\)/.test(seq[1]) && /マニラ.*\(world\)/.test(seq[2]), seq.join(" → "));
    return seq.join(" → ");
  });

  await check("またぐツアー(PC): 「幕末――黒船から箱館まで」は地球儀（アヘン戦争・ペリー来航）から日本地図へ移り、箱館戦争で終わる", async () => {
    await page.goto(`${URL}?tour=bakumatsu&step=1`);
    await page.waitForFunction(() => !!window.__WHG__, null, { timeout: 20000 });
    await page.getByTestId("tour-step-title").waitFor();
    const seq = [];
    for (let i = 0; i < 10; i++) {
      if (i > 0) {
        await page.getByTestId("tour-next").click();
        await page.waitForTimeout(400);
      }
      seq.push(`${(await page.getByTestId("tour-step-title").innerText()).trim()}(${await page.locator(".app").getAttribute("data-mode")})`);
    }
    assert(/アヘン戦争.*\(world\)/.test(seq[0]) && /ペリー.*\(world\)/.test(seq[1]) && /日米修好通商条約.*\(japan\)/.test(seq[2]), seq.slice(0, 3).join(" → "));
    assert(/箱館戦争.*\(japan\)/.test(seq[9]), `最後が箱館戦争でない: ${seq[9]}`);
    const arcs = await page.locator(".japan-map [data-testid=arc-label]").count();
    assert(arcs >= 5, `日本地図の弧が少ない（${arcs}）`);
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${SHOTS}/tour-bakumatsu-last.png` });
    return `${seq[0]} → … → ${seq[9]}（弧 ${arcs}本）`;
  });

  await check("日本だけのツアー(PC): 「1600年、日本では？ 世界では？」を日本地図のまま最後まで。「同じころ、世界では？」の段も出る", async () => {
    await page.goto(URL);
    await page.waitForFunction(() => !!window.__WHG__, null, { timeout: 20000 });
    await page.getByTestId("tour-open").click();
    await page.getByTestId("tour-start-jp1600").click();
    await waitJapan(page);
    assert((await query(page)) === "?mode=japan&tour=jp1600&step=0", `URL: ${await query(page)}`);
    const years = [];
    const titles = [];
    for (let i = 0; i < 6; i++) {
      await page.getByTestId("tour-next").click();
      await page.waitForTimeout(300);
      years.push(await yearText(page));
      titles.push((await page.getByTestId("tour-step-title").innerText()).trim());
      assert((await page.locator(".app").getAttribute("data-mode")) === "japan", `${i + 1}番目で日本地図でない`);
    }
    assert(new Set(years).size === 1 && years[0] === "1600年", `年が動いている: ${years}`);
    assert(titles[0].includes("関ヶ原"), `1番目が関ヶ原でない: ${titles[0]}`);
    const other = await page.getByTestId("strip-other").locator(".chip-other").allInnerTexts();
    assert(other.some((t) => t.includes("明の成立")), `「同じころ、世界では？」に明がない: ${other}`);
    await page.screenshot({ path: `${SHOTS}/tour-jp1600.png` });
    await page.getByTestId("tour-next").click();
    assert((await page.getByTestId("tour-position").innerText()) === "まとめ", "まとめに着かない");
    await page.getByTestId("tour-finish").click();
    assert((await page.getByTestId("tour-panel").count()) === 0, "終えてもパネルが残る");
    return `1600年のまま ${titles.length} か所（${titles[0]} ほか）→ まとめ`;
  });

  await check("またぐツアー(PC): ページエラーなし", async () => {
    assert(errors.length === 0, errors.join(" | "));
  });
  await ctx.close();
}

{
  const { defaultBrowserType: _ignored5, ...iphone5 } = devices["iPhone 13"];
  const ctx = await browser.newContext(iphone5);
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));

  await check("日本(SP): ?mode=japan で直接開き、横スクロールなし。切り替えボタンが画面内に収まる", async () => {
    await page.goto(`${URL}?mode=japan`);
    await waitJapan(page);
    const r = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, w: innerWidth }));
    assert(r.sw <= r.w, `横スクロール ${r.sw} > ${r.w}`);
    const sw = await page.getByTestId("mode-switch").boundingBox();
    assert(sw.x >= 0 && sw.x + sw.width <= r.w, "切り替えボタンがはみ出す");
    const hdr = await page.locator(".topbar").evaluate((el) => el.scrollWidth <= el.clientWidth + 1);
    assert(hdr, "ヘッダーのボタンがはみ出す");
    await page.screenshot({ path: `${SHOTS}/jp-sp-initial.png` });
    return `${r.w}px 幅`;
  });

  await check("日本(SP): 画素密度の高い画面では、高解像度の背景画像に切り替わる", async () => {
    await page.waitForSelector("[data-testid=jp-relief-hi].is-ready", { timeout: 15000 });
    const href = await page.getByTestId("jp-relief-hi").getAttribute("href");
    assert(href === `${BASE}/japan/relief-hi.webp`, `画像のパスが違う: ${href}`);
    return href;
  });

  await check("日本(SP): イベントを開くと、上55%に日本地図・下45%に詳細の2段になり、地点が地図の中央に来る", async () => {
    await page.goto(`${URL}?mode=japan&event=jp-mongol-invasions`);
    await waitJapan(page);
    await page.getByTestId("event-detail").waitFor();
    await page.waitForTimeout(600);
    const g = await page.getByTestId("japan-map").boundingBox();
    const d = await page.getByTestId("event-detail").boundingBox();
    const ratio = g.height / (g.height + d.height);
    assert(Math.abs(ratio - 0.55) < 0.03, `比率が想定外（地図 ${Math.round(ratio * 100)}%）`);
    assert(d.y >= g.y + g.height - 2, "詳細が地図の上に重なっている");
    const m = await markerCenter(page, "jp-mongol-invasions");
    const dx = Math.abs(m.x - (g.x + g.width / 2)), dy = Math.abs(m.y - (g.y + g.height / 2));
    assert(m.hit && dx < 20 && dy < 20, `地点が中央にない（横${Math.round(dx)} 縦${Math.round(dy)}）`);
    const noH = await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
    assert(noH, "横スクロールが出る");
    await page.screenshot({ path: `${SHOTS}/jp-sp-detail.png` });
    return `地図 ${Math.round(ratio * 100)}%・中央からのずれ 横${Math.round(dx)} 縦${Math.round(dy)}px`;
  });

  await check("日本(SP): タッチのドラッグで移動し、ピンチで拡大する", async () => {
    await page.getByLabel("詳細を閉じる").tap();
    await page.waitForTimeout(300);
    const cdp = await ctx.newCDPSession(page);
    const box = await page.getByTestId("japan-map").boundingBox();
    // 地図の中央には選んでいたマーカーがあるので、海の上（マーカーのない所）から触る
    const cx = box.x + box.width * 0.75, cy = box.y + box.height * 0.8;
    const v0 = await jpView(page);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: cx, y: cy }] });
    for (let i = 1; i <= 10; i++) {
      await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: cx + i * 10, y: cy }] });
      await page.waitForTimeout(16);
    }
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    const v1 = await jpView(page);
    assert(v1.lng < v0.lng - 0.2, `タッチで動かない ${v0.lng} → ${v1.lng}`);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: cx - 20, y: cy, id: 1 }, { x: cx + 20, y: cy, id: 2 }] });
    for (let d = 20; d <= 120; d += 10) {
      await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: cx - d, y: cy, id: 1 }, { x: cx + d, y: cy, id: 2 }] });
      await page.waitForTimeout(16);
    }
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    const v2 = await jpView(page);
    assert(v2.zoom > v1.zoom * 2, `ピンチで拡大しない ${v1.zoom} → ${v2.zoom}`);
    return `lng ${v0.lng.toFixed(1)} → ${v1.lng.toFixed(1)}、zoom ${v1.zoom.toFixed(2)} → ${v2.zoom.toFixed(2)}`;
  });

  await check("またぐツアー(SP): 元寇ツアーで地球儀から日本地図へ切り替わる（上に地図・下にツアー）", async () => {
    await page.goto(`${URL}?tour=mongol&step=3`);
    await page.getByTestId("tour-panel").waitFor({ timeout: 20000 });
    await page.waitForFunction(() => !!window.__WHG__, null, { timeout: 20000 });
    await page.waitForTimeout(1800);
    await page.screenshot({ path: `${SHOTS}/tour-mongol-sp-3-world.png` });
    await page.getByTestId("tour-next").tap();
    await waitJapan(page);
    await page.waitForTimeout(1300);
    const g = await page.getByTestId("japan-map").boundingBox();
    const p = await page.getByTestId("tour-panel").boundingBox();
    const ratio = g.height / (g.height + p.height);
    assert(Math.abs(ratio - 0.55) < 0.03, `比率が想定外（地図 ${Math.round(ratio * 100)}%）`);
    const noH = await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
    assert(noH, "横スクロールが出る");
    await page.screenshot({ path: `${SHOTS}/tour-mongol-sp-4-japan.png` });
    return `地図 ${Math.round(ratio * 100)}%（${(await page.getByTestId("tour-step-title").innerText()).trim()}）`;
  });

  await check("日本(SP): ページエラーなし", async () => {
    assert(errors.length === 0, errors.join(" | "));
  });
  await ctx.close();
}

// ───────────── WebGL 非対応でも日本地図は出る ─────────────
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await ctx.addInitScript(() => {
    const orig = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
      if (String(type).startsWith("webgl") || type === "experimental-webgl") return null;
      return orig.call(this, type, ...rest);
    };
  });
  const page = await ctx.newPage();
  await check("WebGL無効: 日本モードでは地図（SVG）が表示され、年表にも切り替えられる", async () => {
    await page.goto(`${URL}?mode=japan`);
    await page.getByTestId("japan-map").waitFor({ timeout: 10000 });
    assert((await page.getByTestId("fallback-notice").count()) === 0, "日本モードで WebGL の注意が出る");
    await page.getByTestId("view-toggle").click();
    await page.getByTestId("chronology").waitFor();
    await page.getByTestId("mode-world").click();
    await page.getByTestId("fallback-notice").waitFor();
    assert((await page.getByTestId("view-toggle").count()) === 0, "世界モード（WebGL なし）で地図に戻すボタンが出る");
    return "日本地図 → 年表 → 世界（年表のまま）";
  });
  await ctx.close();
}

{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await ctx.route("**/japan/relief-*.webp", (route) => route.abort());
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await check("背景画像なし: 陰影起伏の画像を読み込めないときは、これまでのベクターの陸地（塗りつぶし）で描く", async () => {
    await page.goto(`${URL}?mode=japan&event=jp-sekigahara`);
    await waitJapan(page);
    await page.waitForFunction(() => !document.querySelector("[data-testid=jp-relief-lo]"), null, { timeout: 10000 });
    const r = await page.evaluate(() => {
      const land = document.querySelector(".jp-land");
      return { outline: land.classList.contains("is-outline"), fill: getComputedStyle(land).fill, hi: !!document.querySelector("[data-testid=jp-relief-hi]") };
    });
    assert(!r.outline && r.fill !== "none" && !r.hi, `ベクターの陸地に戻らない: ${JSON.stringify(r)}`);
    const m = await markerCenter(page, "jp-sekigahara");
    assert(m && m.hit, "マーカーが押せない");
    assert(errors.length === 0, errors.join(" | "));
    return `陸地の塗り ${r.fill}`;
  });
  await ctx.close();
}

await browser.close();
server.close();

for (const r of results) console.log(`${r.ok ? "✔" : "✘"} ${r.name}${r.detail ? ` — ${r.detail}` : ""}`);
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);

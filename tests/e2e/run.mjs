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
    for (const el of document.querySelectorAll(".marker.is-active:not(.is-behind)")) {
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
      const el = document.querySelector(`.marker[data-event-id="${id}"]`);
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
    const kept = await page.locator(`.marker[data-event-id="${spSelected}"]`).count();
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

await browser.close();
server.close();

for (const r of results) console.log(`${r.ok ? "✔" : "✘"} ${r.name}${r.detail ? ` — ${r.detail}` : ""}`);
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);

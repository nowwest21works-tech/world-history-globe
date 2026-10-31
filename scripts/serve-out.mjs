// out/ を配信する最小の静的サーバー（ローカル確認・E2Eテスト用）
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";

const ROOT = path.resolve("out");
const TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css",
  ".json": "application/json", ".txt": "text/plain; charset=utf-8", ".jpg": "image/jpeg",
  ".png": "image/png", ".svg": "image/svg+xml", ".ico": "image/x-icon", ".woff2": "font/woff2",
};

export function serve(port = Number(process.env.PORT ?? 4173)) {
  const server = createServer(async (req, res) => {
    try {
      let p = decodeURIComponent(new URL(req.url ?? "/", "http://x").pathname);
      let file = path.join(ROOT, p);
      if (!file.startsWith(ROOT)) throw new Error("forbidden");
      if ((await stat(file).catch(() => null))?.isDirectory()) file = path.join(file, "index.html");
      const body = await readFile(file);
      res.writeHead(200, { "content-type": TYPES[path.extname(file)] ?? "application/octet-stream" });
      res.end(body);
    } catch {
      res.writeHead(404).end("not found");
    }
  });
  return new Promise((resolve) => server.listen(port, "127.0.0.1", () => resolve(server)));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  serve().then(() => console.log(`http://127.0.0.1:${process.env.PORT ?? 4173}/`));
}

import type { Scope } from "@/types/event";

/** URL の ?mode=japan を解釈する（省略・不明な値は世界） */
export function parseModeQuery(search: string): Scope {
  return new URLSearchParams(search).get("mode") === "japan" ? "japan" : "world";
}

/**
 * URL の検索部分を組み立てる。mode は世界なら省略し、日本なら先頭に ?mode=japan を付ける。
 * rest には ?tour=…&step=… や ?work=… や ?event=… を渡す（先頭の ? はあってもなくてもよい）。
 */
export function buildQuery(mode: Scope, rest = ""): string {
  const q = new URLSearchParams(rest.replace(/^\?/, ""));
  q.delete("mode");
  const parts: string[] = [];
  if (mode === "japan") parts.push("mode=japan");
  for (const [k, v] of q) parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(v)}`);
  return parts.length ? `?${parts.join("&")}` : "";
}

/** URL の ?event=<id> を解釈する */
export function parseEventQuery(search: string): string | null {
  return new URLSearchParams(search).get("event");
}

export const MODE_LABEL: Record<Scope, string> = { world: "世界", japan: "日本" };

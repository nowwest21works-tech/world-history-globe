/** basePath（GitHub Pages のサブパス公開用）を考慮した静的ファイルのパス */
export function assetPath(path: string): string {
  return `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}${path}`;
}

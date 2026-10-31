export function UnverifiedBadge({ verified }: { verified: boolean }) {
  if (verified) {
    return <span className="badge badge-verified">確認済み</span>;
  }
  return (
    <span className="badge badge-unverified" title="史実・出典は人間による確認前です" data-testid="unverified-badge">
      未検証
    </span>
  );
}

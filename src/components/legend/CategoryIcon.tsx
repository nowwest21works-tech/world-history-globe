import type { EventCategory } from "@/types/event";
import { CATEGORIES } from "@/lib/categories";

export function CategoryIcon({ category, size = 16 }: { category: EventCategory; size?: number }) {
  const c = CATEGORIES[category];
  return (
    <span className="cat-icon" style={{ background: c.color, width: size + 6, height: size + 6 }} aria-hidden="true">
      <svg viewBox="0 0 24 24" width={size} height={size}>
        <path d={c.icon} />
      </svg>
    </span>
  );
}

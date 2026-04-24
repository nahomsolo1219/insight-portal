/**
 * Placeholder blocks for loading states. Tailwind `animate-pulse` handles
 * the shimmer; the shapes match the real layouts (card, table, grid) so the
 * transition to the actual content doesn't cause a visual jump.
 */

interface SkeletonLineProps {
  width?: string;
  height?: string;
}

export function SkeletonLine({ width = '100%', height = '16px' }: SkeletonLineProps) {
  return (
    <div
      className="animate-pulse rounded-lg bg-gray-100"
      style={{ width, height }}
    />
  );
}

export function SkeletonCard() {
  return (
    <div className="shadow-card animate-pulse space-y-4 rounded-2xl bg-white p-6">
      <SkeletonLine width="40%" height="20px" />
      <SkeletonLine width="100%" />
      <SkeletonLine width="75%" />
    </div>
  );
}

export function SkeletonTable({ rows = 3 }: { rows?: number }) {
  return (
    <div className="shadow-card animate-pulse space-y-4 rounded-2xl bg-white p-6">
      <SkeletonLine width="30%" height="20px" />
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex gap-4">
          <SkeletonLine width="15%" />
          <SkeletonLine width="35%" />
          <SkeletonLine width="20%" />
          <SkeletonLine width="15%" />
        </div>
      ))}
    </div>
  );
}

export function SkeletonGrid({ items = 4 }: { items?: number }) {
  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
      {Array.from({ length: items }).map((_, i) => (
        <div
          key={i}
          className="shadow-card animate-pulse overflow-hidden rounded-2xl bg-white"
        >
          <div className="aspect-square bg-gray-100" />
          <div className="space-y-2 p-3">
            <SkeletonLine width="60%" height="14px" />
            <SkeletonLine width="40%" height="12px" />
          </div>
        </div>
      ))}
    </div>
  );
}

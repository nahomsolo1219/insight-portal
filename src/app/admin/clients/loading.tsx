import { SkeletonLine, SkeletonTable } from '@/components/admin/Skeleton';

/**
 * Route-level loading state for the clients list — mirrors the real page's
 * header (eyebrow + title + count) and filter tabs, then a table skeleton.
 * This is the surface that was reliably hanging with no feedback; the
 * boundary lets the nav swap instantly to a skeleton while listClients runs.
 */
export default function ClientsLoading() {
  return (
    <div className="animate-pulse">
      {/* Page header — matches the "Book of business" eyebrow + title. */}
      <div className="mb-8">
        <SkeletonLine width="120px" height="12px" />
        <div className="mt-3">
          <SkeletonLine width="160px" height="32px" />
        </div>
        <div className="mt-2">
          <SkeletonLine width="80px" height="14px" />
        </div>
      </div>

      {/* Filter tabs strip. */}
      <div className="border-line mb-5 flex gap-3 border-b pb-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <SkeletonLine key={i} width="72px" height="20px" />
        ))}
      </div>

      <SkeletonTable rows={6} />
    </div>
  );
}

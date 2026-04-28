import { SkeletonCard, SkeletonLine } from '@/components/admin/Skeleton';

/**
 * Route-level loading state shown while the client detail page streams in —
 * matches the real page's skeleton (header strip + stats row + tab area)
 * so the swap to real content doesn't cause a layout jump.
 */
export default function ClientDetailLoading() {
  return (
    <div className="animate-pulse">
      <SkeletonLine width="80px" height="14px" />
      <div className="mt-6 mb-8 flex items-start gap-5">
        <div className="h-14 w-14 flex-shrink-0 rounded-full bg-gray-100" />
        <div className="min-w-0 flex-1 space-y-2">
          <SkeletonLine width="240px" height="28px" />
          <SkeletonLine width="320px" height="14px" />
        </div>
      </div>

      <div className="mb-8 grid grid-cols-4 gap-5">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="shadow-soft-md rounded-2xl bg-paper p-5">
            <SkeletonLine width="60%" height="12px" />
            <div className="mt-2">
              <SkeletonLine width="80%" height="28px" />
            </div>
          </div>
        ))}
      </div>

      <SkeletonCard />
    </div>
  );
}

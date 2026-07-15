import { SkeletonCard, SkeletonLine } from '@/components/admin/Skeleton';

/**
 * Default route-level loading state for admin pages — it's the Suspense
 * boundary Next streams into while a page's server component fetches, and
 * the fallback that lets `<Link>` prefetch dynamic admin routes. Deeper
 * routes with their own `loading.tsx` (e.g. clients, clients/[id]) override
 * it. Generic header + stat strip + card so the swap to real content doesn't
 * jump the layout.
 */
export default function AdminLoading() {
  return (
    <div className="animate-pulse">
      <SkeletonLine width="120px" height="14px" />
      <div className="mt-3 mb-8">
        <SkeletonLine width="260px" height="32px" />
      </div>

      <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-5">
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

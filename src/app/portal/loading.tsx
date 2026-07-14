/**
 * Route-level loading state for the portal landing (the property list).
 * Gives navigation an instant skeleton to swap to — and lets Next prefetch
 * this dynamic route — instead of blocking on the server render. Portal
 * surface tokens (cream / paper / soft shadow); self-contained so it doesn't
 * couple to the admin skeleton primitives.
 */
export default function PortalLoading() {
  return (
    <div className="animate-pulse">
      <div className="mb-8 space-y-3">
        <div className="h-8 w-64 rounded-lg bg-gray-100" />
        <div className="h-4 w-40 rounded-lg bg-gray-100" />
      </div>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="shadow-soft-md overflow-hidden rounded-2xl bg-paper">
            <div className="aspect-[16/9] bg-gray-100" />
            <div className="space-y-3 p-5">
              <div className="h-5 w-1/2 rounded-lg bg-gray-100" />
              <div className="h-4 w-2/3 rounded-lg bg-gray-100" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

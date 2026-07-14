/**
 * Route-level loading state shared by every property-scoped portal page
 * (dashboard, projects, appointments, documents, invoices, maintenance).
 * Placed at the [propertyId] segment so switching between these siblings in
 * the sidebar swaps to a skeleton immediately rather than blocking on the
 * next page's server fetch. Portal surface tokens; self-contained.
 */
export default function PortalPropertyLoading() {
  return (
    <div className="animate-pulse">
      {/* Editorial hero band. */}
      <div className="shadow-soft-md mb-8 space-y-4 rounded-2xl bg-paper p-8">
        <div className="h-3 w-24 rounded-lg bg-gray-100" />
        <div className="h-9 w-2/3 rounded-lg bg-gray-100" />
        <div className="h-4 w-1/2 rounded-lg bg-gray-100" />
      </div>

      {/* Body: main column + right rail. */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="shadow-soft-md space-y-4 rounded-2xl bg-paper p-6 lg:col-span-2">
          <div className="h-5 w-1/3 rounded-lg bg-gray-100" />
          <div className="h-4 w-full rounded-lg bg-gray-100" />
          <div className="h-4 w-5/6 rounded-lg bg-gray-100" />
          <div className="h-4 w-2/3 rounded-lg bg-gray-100" />
        </div>
        <div className="shadow-soft-md space-y-4 rounded-2xl bg-paper p-6">
          <div className="h-5 w-1/2 rounded-lg bg-gray-100" />
          <div className="h-4 w-full rounded-lg bg-gray-100" />
          <div className="h-4 w-3/4 rounded-lg bg-gray-100" />
        </div>
      </div>
    </div>
  );
}

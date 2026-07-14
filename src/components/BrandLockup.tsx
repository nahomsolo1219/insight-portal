// Shared brand lockup (logo tile + wordmark) for the unauthenticated
// surfaces — the login page and the password-set / reset page. Extracted so
// both use one logo source and can't visually drift. Presentational only
// (no hooks / no server deps), so it renders from server or client components.

export function BrandLockup() {
  return (
    <div className="mb-6 inline-flex items-center gap-3">
      <div className="bg-brand-teal-500 flex h-12 w-12 items-center justify-center rounded-xl">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="https://cdn.prod.website-files.com/6824275111a08fd08762cad9/682450f39c2da996ae7c2f74_4a3e3e9e7263ddc479eb4374e0e0d332_Logo.svg"
          alt="Insight Home Maintenance"
          className="h-6 w-6"
        />
      </div>
      <div className="text-left">
        <div className="text-brand-teal-500 font-bold tracking-wider">INSIGHT</div>
        <div className="-mt-1 text-[10px] tracking-widest text-gray-400">HOME MAINTENANCE</div>
      </div>
    </div>
  );
}

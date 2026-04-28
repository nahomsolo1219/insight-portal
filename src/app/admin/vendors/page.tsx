import { requireAdmin } from '@/lib/auth/current-user';
import { VendorsClient } from './VendorsClient';
import { listVendors } from './queries';

export default async function VendorsPage() {
  await requireAdmin();
  const vendors = await listVendors();

  return (
    <div className="space-y-6">
      <header>
        <div className="mb-3 flex items-center gap-2">
          <span aria-hidden="true" className="bg-brand-gold-500 inline-block h-px w-8" />
          <span className="text-ink-500 text-[11px] font-medium uppercase tracking-[0.18em]">
            Subcontractor directory
          </span>
        </div>
        <h1 className="text-ink-900 text-3xl font-light tracking-tight">Vendors</h1>
        <p className="mt-1 text-sm text-[#737373]">
          {vendors.length} {vendors.length === 1 ? 'vendor' : 'vendors'} on file.
        </p>
      </header>

      <VendorsClient vendors={vendors} />
    </div>
  );
}

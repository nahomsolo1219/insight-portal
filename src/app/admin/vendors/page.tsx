import { requireAdmin } from '@/lib/auth/current-user';
import { VendorsClient } from './VendorsClient';
import { listVendors } from './queries';

export default async function VendorsPage() {
  await requireAdmin();
  const vendors = await listVendors();

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-brand-teal-500 text-3xl">Vendors</h1>
        <p className="mt-1 text-sm text-[#737373]">
          Subcontractor directory. {vendors.length} {vendors.length === 1 ? 'vendor' : 'vendors'}.
        </p>
      </header>

      <VendorsClient vendors={vendors} />
    </div>
  );
}

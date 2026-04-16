import { ChevronRight, Users } from 'lucide-react';
import Link from 'next/link';
import { requireAdmin } from '@/lib/auth/current-user';
import { formatCurrency, initialsFrom } from '@/lib/utils';
import { NewClientButton } from './NewClientButton';
import { getClientFormOptions, listClients } from './queries';

export default async function ClientsPage() {
  await requireAdmin();

  const [clientRows, formOptions] = await Promise.all([listClients(), getClientFormOptions()]);

  return (
    <div>
      {/* Page header */}
      <div className="mb-8 flex items-start justify-between">
        <div>
          <h1 className="font-display text-brand-teal-500 text-3xl">Clients</h1>
          <p className="mt-1 text-sm text-gray-500">
            {clientRows.length} {clientRows.length === 1 ? 'client' : 'clients'}
          </p>
        </div>
        <NewClientButton tiers={formOptions.tiers} pms={formOptions.pms} />
      </div>

      {clientRows.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="space-y-3">
          {clientRows.map((client) => (
            <Link
              key={client.id}
              href={`/admin/clients/${client.id}`}
              className="shadow-card hover:shadow-elevated block rounded-2xl bg-white p-5 transition-shadow duration-200"
            >
              <div className="flex items-center gap-5">
                <div className="bg-brand-teal-500 flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white">
                  {initialsFrom(client.name)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-3">
                    <h3 className="truncate text-base font-semibold text-gray-900">
                      {client.name}
                    </h3>
                    {client.status === 'inactive' && (
                      <span className="rounded-md bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500">
                        Inactive
                      </span>
                    )}
                    {client.tierName && (
                      <span className="bg-brand-teal-50 text-brand-teal-500 rounded-md px-2 py-0.5 text-xs font-medium">
                        {client.tierName}
                      </span>
                    )}
                  </div>
                  {client.primaryAddress && (
                    <p className="mt-0.5 truncate text-xs text-gray-500">
                      {client.primaryAddress}
                      {client.propertyCount > 1 && (
                        <span className="text-gray-400"> +{client.propertyCount - 1} more</span>
                      )}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-8">
                  <div className="text-center">
                    <div className="text-lg font-light text-gray-900">
                      {client.activeProjectCount}
                    </div>
                    <div className="text-[10px] tracking-wider text-gray-400 uppercase">
                      Projects
                    </div>
                  </div>
                  <div className="min-w-[80px] text-center">
                    <div
                      className={
                        client.balanceCents > 0
                          ? 'text-lg font-light text-amber-600'
                          : 'text-lg font-light text-gray-900'
                      }
                    >
                      {formatCurrency(client.balanceCents)}
                    </div>
                    <div className="text-[10px] tracking-wider text-gray-400 uppercase">
                      Balance
                    </div>
                  </div>
                  {client.assignedPmName && (
                    <div className="hidden min-w-[100px] text-right lg:block">
                      <div className="text-xs text-gray-500">Assigned PM</div>
                      <div className="text-sm font-medium text-gray-700">
                        {client.assignedPmName}
                      </div>
                    </div>
                  )}
                  <ChevronRight size={18} className="flex-shrink-0 text-gray-300" />
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="shadow-card rounded-2xl bg-white p-12 text-center">
      <div className="bg-brand-warm-200 mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full text-gray-400">
        <Users size={24} strokeWidth={1.5} />
      </div>
      <h2 className="text-lg font-semibold text-gray-900">No clients yet</h2>
      <p className="mx-auto mt-2 max-w-sm text-sm text-gray-500">
        Add your first client to get started. You&apos;ll be able to add their properties, projects,
        and appointments after.
      </p>
    </div>
  );
}

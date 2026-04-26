'use client';

import { ChevronRight, MapPin, Plus, Search } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { Modal } from '@/components/admin/Modal';
import { cn } from '@/lib/utils';
import type { ClientPickerRow } from './queries';

interface Props {
  clients: ClientPickerRow[];
}

/**
 * Dashboard "+ New Project" entry point. Opens a small client-picker modal
 * (the dashboard doesn't know which client the project is for), then
 * navigates to that client's detail page with `?action=new-project` so
 * the project modal opens automatically on arrival.
 *
 * Clients with zero properties get routed to the same URL — the project
 * modal will detect the empty property list and prompt David to add a
 * property first.
 */
export function DashboardNewProjectButton({ clients }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return clients;
    return clients.filter((c) => c.name.toLowerCase().includes(q));
  }, [clients, query]);

  function pick(clientId: string, hasProperty: boolean) {
    setOpen(false);
    setQuery('');
    if (hasProperty) {
      router.push(`/admin/clients/${clientId}?action=new-project`);
    } else {
      // No property yet — landing on the client page surfaces the
      // first-property CTA. The plan modal won't auto-open with no
      // properties, so this is the right hand-off.
      router.push(`/admin/clients/${clientId}`);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="border-brand-teal-200 text-brand-teal-500 hover:bg-brand-teal-50 inline-flex items-center gap-2 rounded-xl border px-5 py-2.5 font-medium transition-all"
      >
        <Plus size={16} strokeWidth={2} />
        New Project
      </button>

      <Modal
        open={open}
        onClose={() => {
          setOpen(false);
          setQuery('');
        }}
        title="Create a project"
        size="md"
      >
        <p className="mb-4 text-sm text-gray-500">
          Pick the client this project belongs to. We&apos;ll take you to their detail
          page with the project form ready.
        </p>

        <div className="relative mb-3">
          <Search
            size={14}
            strokeWidth={1.5}
            className="absolute top-1/2 left-3 -translate-y-1/2 text-gray-400"
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search clients"
            autoFocus
            className="focus:ring-brand-teal-200 focus:border-brand-teal-300 w-full rounded-xl border border-gray-200 bg-white py-2.5 pr-3 pl-9 text-sm text-gray-900 focus:ring-2 focus:outline-none"
          />
        </div>

        {filtered.length === 0 ? (
          <p className="rounded-xl bg-brand-warm-50 px-4 py-6 text-center text-sm text-gray-500">
            {clients.length === 0 ? 'No active clients yet.' : 'No matches.'}
          </p>
        ) : (
          // Bounded scroll container so 50+ clients don't push the modal
          // off-screen. Each row is a 44px+ touch target.
          <ul className="max-h-[360px] divide-y divide-gray-50 overflow-y-auto rounded-xl border border-gray-100">
            {filtered.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => pick(c.id, c.propertyCount > 0)}
                  className={cn(
                    'flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-brand-warm-50',
                  )}
                >
                  <div className="bg-brand-teal-500 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-[11px] font-semibold text-white">
                    {initials(c.name)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-gray-900">{c.name}</div>
                    <div className="mt-0.5 inline-flex items-center gap-1 text-[11px] text-gray-500">
                      <MapPin size={10} strokeWidth={1.5} />
                      {c.propertyCount === 0
                        ? 'No properties yet — add one first'
                        : `${c.propertyCount} ${c.propertyCount === 1 ? 'property' : 'properties'}`}
                    </div>
                  </div>
                  <ChevronRight size={14} strokeWidth={1.5} className="text-gray-400" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </Modal>
    </>
  );
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((s) => s[0]?.toUpperCase() ?? '')
    .slice(0, 2)
    .join('');
}

import { ChevronLeft } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireAdmin } from '@/lib/auth/current-user';
import { formatCurrency, formatDate, initialsFrom } from '@/lib/utils';
import { AppointmentsTab } from './AppointmentsTab';
import { ClientDetailTabs } from './ClientDetailTabs';
import { DocumentsTab } from './DocumentsTab';
import { InvoicesTab } from './InvoicesTab';
import { PhotosTab } from './PhotosTab';
import { ProfileTab } from './ProfileTab';
import { ProjectsTab } from './ProjectsTab';
import { ReportsTab } from './ReportsTab';
import { getClientDetail } from './queries';

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ property?: string }>;
}

export default async function ClientDetailPage({ params, searchParams }: PageProps) {
  await requireAdmin();
  const [{ id }, { property: propertyParam }] = await Promise.all([params, searchParams]);

  const data = await getClientDetail(id);
  if (!data) notFound();

  const { client, properties, stats } = data;

  // The active property lives in the URL so the property switcher can
  // trigger a server re-render (and refetch projects) without having to
  // juggle client-side state + route-handler round-trips.
  const activePropertyId =
    propertyParam && properties.some((p) => p.id === propertyParam)
      ? propertyParam
      : (properties[0]?.id ?? null);

  // Pre-render each data-backed tab on the server so the initial HTML already
  // has its content. Slots get rebuilt on every navigation; keying by the
  // active property id means switching properties remounts a fresh subtree.
  const projectsSlot = activePropertyId ? (
    <ProjectsTab key={activePropertyId} clientId={id} propertyId={activePropertyId} />
  ) : null;
  const documentsSlot = activePropertyId ? (
    <DocumentsTab key={activePropertyId} clientId={id} propertyId={activePropertyId} />
  ) : null;
  const reportsSlot = activePropertyId ? (
    <ReportsTab key={activePropertyId} clientId={id} propertyId={activePropertyId} />
  ) : null;
  const appointmentsSlot = activePropertyId ? (
    <AppointmentsTab key={activePropertyId} clientId={id} propertyId={activePropertyId} />
  ) : null;
  const photosSlot = activePropertyId ? (
    <PhotosTab key={activePropertyId} clientId={id} propertyId={activePropertyId} />
  ) : null;
  // Invoices are client-scoped, not property-scoped — keyed by client id so
  // switching properties does NOT remount (and refetch) the tab.
  const invoicesSlot = (
    <InvoicesTab
      key={id}
      clientId={id}
      properties={properties.map((p) => ({ id: p.id, name: p.name }))}
    />
  );
  const profileSlot = (
    <ProfileTab
      key={activePropertyId ?? 'no-property'}
      clientId={id}
      propertyId={activePropertyId}
      client={client}
    />
  );

  return (
    <div>
      <Link
        href="/admin/clients"
        className="hover:text-brand-teal-500 mb-4 inline-flex items-center gap-1 text-sm text-gray-500 transition-colors"
      >
        <ChevronLeft size={16} strokeWidth={1.5} />
        All clients
      </Link>

      <div className="mb-8 flex items-start gap-5">
        <div className="bg-brand-teal-500 flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-full text-base font-semibold text-white">
          {initialsFrom(client.name)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex flex-wrap items-center gap-3">
            <h1 className="font-display text-brand-teal-500 text-3xl">{client.name}</h1>
            {client.tierName && (
              <span className="bg-brand-teal-50 text-brand-teal-500 rounded-md px-2.5 py-1 text-xs font-medium">
                {client.tierName}
              </span>
            )}
            {client.status === 'inactive' && (
              <span className="rounded-md bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-500">
                Inactive
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-3 text-sm text-gray-500">
            {client.email && <span>{client.email}</span>}
            {client.phone && <span>{client.phone}</span>}
            {client.assignedPmName && <span>PM: {client.assignedPmName}</span>}
          </div>
        </div>
      </div>

      <div className="mb-8 grid grid-cols-4 gap-5">
        <StatMini label="Properties" value={stats.propertyCount.toString()} />
        <StatMini label="Active projects" value={stats.activeProjectCount.toString()} />
        <StatMini
          label="Balance"
          value={formatCurrency(stats.balanceCents)}
          valueColor={stats.balanceCents > 0 ? 'amber' : 'default'}
        />
        <StatMini
          label="Member since"
          value={client.memberSince ? formatDate(client.memberSince) : '—'}
        />
      </div>

      <ClientDetailTabs
        clientId={client.id}
        properties={properties}
        activePropertyId={activePropertyId}
        projectsSlot={projectsSlot}
        documentsSlot={documentsSlot}
        reportsSlot={reportsSlot}
        appointmentsSlot={appointmentsSlot}
        photosSlot={photosSlot}
        invoicesSlot={invoicesSlot}
        profileSlot={profileSlot}
      />
    </div>
  );
}

interface StatMiniProps {
  label: string;
  value: string;
  valueColor?: 'default' | 'amber';
}

function StatMini({ label, value, valueColor = 'default' }: StatMiniProps) {
  return (
    <div className="shadow-card rounded-2xl bg-white p-5">
      <div className="text-xs font-medium tracking-wider text-gray-500 uppercase">{label}</div>
      <div
        className={
          valueColor === 'amber'
            ? 'mt-2 text-2xl font-light tracking-tight text-amber-600'
            : 'mt-2 text-2xl font-light tracking-tight text-gray-900'
        }
      >
        {value}
      </div>
    </div>
  );
}

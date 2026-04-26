import { Briefcase, ChevronLeft, ClipboardList, Mail, Phone } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireAdmin } from '@/lib/auth/current-user';
import { cn, formatDate } from '@/lib/utils';
import { VendorDocumentsSection } from './VendorDocumentsSection';
import { VendorEditButton } from './VendorEditButton';
import {
  getVendorDetail,
  getVendorDocuments,
  getVendorJobHistory,
  type VendorDocumentRow,
} from './queries';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function VendorDetailPage({ params }: PageProps) {
  await requireAdmin();
  const { id } = await params;

  const [vendor, documents, jobs] = await Promise.all([
    getVendorDetail(id),
    getVendorDocuments(id),
    getVendorJobHistory(id, 10),
  ]);

  if (!vendor) notFound();

  // Pre-compute the worst-case expiration so the docs stat card can flag
  // attention without re-walking the list in the JSX.
  const expiringInfo = summarizeExpirations(documents);

  return (
    <div>
      <Link
        href="/admin/vendors"
        className="hover:text-brand-teal-500 mb-4 inline-flex items-center gap-1 text-sm text-gray-500 transition-colors"
      >
        <ChevronLeft size={16} strokeWidth={1.5} />
        All vendors
      </Link>

      <div className="mb-8 flex items-start justify-between gap-5">
        <div className="min-w-0">
          <div className="mb-1 flex flex-wrap items-center gap-3">
            <h1 className="font-display text-brand-teal-500 text-3xl">{vendor.name}</h1>
            <span className="bg-brand-warm-100 text-gray-600 rounded-md px-2.5 py-1 text-xs font-medium">
              {vendor.category}
            </span>
            <span
              className={cn(
                'rounded-md px-2.5 py-1 text-xs font-medium',
                vendor.active
                  ? 'bg-emerald-50 text-emerald-700'
                  : 'bg-gray-100 text-gray-500',
              )}
            >
              {vendor.active ? 'Active' : 'Inactive'}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-sm text-gray-500">
            {vendor.email && (
              <a
                href={`mailto:${vendor.email}`}
                className="hover:text-brand-teal-500 inline-flex items-center gap-1.5 transition-colors"
              >
                <Mail size={12} strokeWidth={1.5} />
                {vendor.email}
              </a>
            )}
            {vendor.phone && (
              <a
                href={`tel:${vendor.phone}`}
                className="hover:text-brand-teal-500 inline-flex items-center gap-1.5 transition-colors"
              >
                <Phone size={12} strokeWidth={1.5} />
                {vendor.phone}
              </a>
            )}
            {!vendor.email && !vendor.phone && (
              <span className="text-xs text-gray-400">No contact info on file</span>
            )}
          </div>
        </div>

        <VendorEditButton vendor={vendor} />
      </div>

      <div className="mb-8 grid grid-cols-2 gap-5">
        <StatCard
          label="Jobs completed"
          value={vendor.jobsCompleted.toString()}
          icon={<Briefcase size={16} strokeWidth={1.5} />}
        />
        <StatCard
          label="Documents on file"
          value={documents.length.toString()}
          tone={expiringInfo.flag}
          hint={expiringInfo.hint}
          icon={<ClipboardList size={16} strokeWidth={1.5} />}
        />
      </div>

      <div className="space-y-6">
        <VendorDocumentsSection vendorId={vendor.id} documents={documents} />
        <JobHistorySection jobs={jobs} />
      </div>

      {vendor.notes && (
        <div className="shadow-card mt-6 rounded-2xl bg-white p-6">
          <h3 className="text-base font-semibold text-gray-900">Notes</h3>
          <p className="mt-2 text-sm whitespace-pre-wrap text-gray-700">{vendor.notes}</p>
        </div>
      )}
    </div>
  );
}

interface StatCardProps {
  label: string;
  value: string;
  hint?: string;
  tone?: 'default' | 'amber' | 'red';
  icon: React.ReactNode;
}

function StatCard({ label, value, hint, tone = 'default', icon }: StatCardProps) {
  const valueClass =
    tone === 'red'
      ? 'text-red-600'
      : tone === 'amber'
        ? 'text-amber-600'
        : 'text-gray-900';
  const iconTone =
    tone === 'red'
      ? 'bg-red-50 text-red-500'
      : tone === 'amber'
        ? 'bg-amber-50 text-amber-500'
        : 'bg-brand-warm-200 text-brand-teal-500';
  return (
    <div className="shadow-card rounded-2xl bg-white p-5">
      <div className="flex items-start justify-between">
        <div className="text-xs font-medium tracking-wider text-gray-500 uppercase">
          {label}
        </div>
        <div className={cn('flex h-7 w-7 items-center justify-center rounded-lg', iconTone)}>
          {icon}
        </div>
      </div>
      <div className={cn('mt-2 text-2xl font-light tracking-tight', valueClass)}>{value}</div>
      {hint && <div className="mt-1 text-xs text-gray-500">{hint}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Job history (static, server-rendered)
// ---------------------------------------------------------------------------

interface Job {
  id: string;
  title: string;
  date: string;
  status: 'scheduled' | 'confirmed' | 'completed' | 'cancelled';
  clientId: string;
  clientName: string;
  propertyName: string;
  projectName: string | null;
}

function JobHistorySection({ jobs }: { jobs: Job[] }) {
  return (
    <section className="shadow-card rounded-2xl bg-white p-6">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-base font-semibold text-gray-900">Recent jobs</h3>
        {jobs.length > 0 && (
          <span className="text-xs text-gray-400">Last {jobs.length}</span>
        )}
      </div>

      {jobs.length === 0 ? (
        <p className="py-8 text-center text-sm text-gray-400">
          No appointments scheduled with this vendor yet.
        </p>
      ) : (
        <ul className="divide-y divide-gray-50">
          {jobs.map((job) => (
            <li key={job.id} className="py-3 first:pt-0 last:pb-0">
              <Link
                href={`/admin/clients/${job.clientId}`}
                className="hover:bg-brand-warm-50 -mx-2 flex items-center gap-4 rounded-lg px-2 py-2 transition-colors"
              >
                <span className="w-20 flex-shrink-0 font-mono text-xs font-semibold tracking-wider text-brand-teal-400">
                  {formatDate(job.date)}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-gray-900">{job.title}</div>
                  <div className="truncate text-xs text-gray-500">
                    {[job.clientName, job.propertyName, job.projectName]
                      .filter(Boolean)
                      .join(' · ')}
                  </div>
                </div>
                <JobStatusBadge status={job.status} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function JobStatusBadge({ status }: { status: Job['status'] }) {
  const meta =
    status === 'completed'
      ? { label: 'Completed', tone: 'bg-emerald-50 text-emerald-700' }
      : status === 'confirmed'
        ? { label: 'Confirmed', tone: 'bg-blue-50 text-blue-700' }
        : status === 'cancelled'
          ? { label: 'Cancelled', tone: 'bg-red-50 text-red-700' }
          : { label: 'Scheduled', tone: 'bg-gray-100 text-gray-600' };
  return (
    <span
      className={cn(
        'inline-flex flex-shrink-0 items-center rounded-md px-2 py-0.5 text-[11px] font-medium',
        meta.tone,
      )}
    >
      {meta.label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Expiration helpers (shared with VendorDocumentsSection via duplication —
// the badge logic there reads a single doc; this collapses across all docs
// for the stat card hint)
// ---------------------------------------------------------------------------

function summarizeExpirations(docs: VendorDocumentRow[]): {
  flag: 'default' | 'amber' | 'red';
  hint?: string;
} {
  const today = new Date();
  let earliestExpiringMs: number | null = null;
  let expiredCount = 0;
  let expiringSoonCount = 0;

  for (const d of docs) {
    if (!d.expirationDate) continue;
    const exp = new Date(`${d.expirationDate}T00:00:00`);
    const diffMs = exp.getTime() - today.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays < 0) {
      expiredCount += 1;
      if (earliestExpiringMs === null || diffMs < earliestExpiringMs) {
        earliestExpiringMs = diffMs;
      }
    } else if (diffDays <= 30) {
      expiringSoonCount += 1;
      if (earliestExpiringMs === null || diffMs < earliestExpiringMs) {
        earliestExpiringMs = diffMs;
      }
    }
  }

  if (expiredCount > 0) {
    return {
      flag: 'red',
      hint: `${expiredCount} expired`,
    };
  }
  if (expiringSoonCount > 0) {
    return {
      flag: 'amber',
      hint: `${expiringSoonCount} expiring soon`,
    };
  }
  return { flag: 'default' };
}

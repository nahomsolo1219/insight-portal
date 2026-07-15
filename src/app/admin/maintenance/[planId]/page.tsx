import { ChevronLeft } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireAdmin } from '@/lib/auth/current-user';
import { getSignedUrlsAdmin } from '@/lib/storage/upload';
import { formatCurrency, formatDate } from '@/lib/utils';
import {
  getActiveFieldStaff,
  getActiveVendorsForPicker,
  getPlanDetail,
  getPlanHistory,
  getPlanVisits,
} from '../queries';
import { PlanDetailClient } from './PlanDetailClient';

interface PageProps {
  params: Promise<{ planId: string }>;
}

export default async function MaintenancePlanDetailPage({ params }: PageProps) {
  await requireAdmin();
  const { planId } = await params;

  const plan = await getPlanDetail(planId);
  if (!plan) notFound();

  const [visits, history, vendors, fieldStaff] = await Promise.all([
    getPlanVisits(planId),
    getPlanHistory(planId),
    getActiveVendorsForPicker(),
    getActiveFieldStaff(),
  ]);

  // Sign the home-assessment + playbook URLs once on the server so
  // the Documents tab can render previews without each render
  // hitting Supabase. Service-role signing avoids the cookie-bound
  // edge case noted in upload.ts.
  const docPaths = [plan.homeAssessmentUrl, plan.playbookUrl].filter(
    (p): p is string => Boolean(p),
  );
  const signedDocUrls =
    docPaths.length > 0 ? await getSignedUrlsAdmin(docPaths) : new Map<string, string>();

  return (
    <div>
      <Link
        href="/admin/maintenance"
        className="hover:text-brand-teal-500 mb-4 inline-flex items-center gap-1 text-sm text-gray-500 transition-colors"
      >
        <ChevronLeft size={16} strokeWidth={1.5} />
        All maintenance plans
      </Link>

      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="mb-1 flex items-center gap-3">
            <h1 className="text-ink-900 text-3xl font-light tracking-tight">{plan.name}</h1>
            <PlanStatusInline status={plan.status} />
          </div>
          <div className="text-sm text-gray-500">
            <Link
              href={`/admin/clients/${plan.clientId}`}
              className="hover:text-brand-teal-500"
            >
              {plan.clientName}
            </Link>
            {' — '}
            {plan.propertyName} · {plan.propertyAddress}
          </div>
        </div>
      </div>

      <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-5">
        <StatMini label="Start" value={formatDate(plan.startDate)} />
        <StatMini label="End" value={formatDate(plan.endDate)} />
        <StatMini
          label="Visits"
          value={`${visits.filter((v) => v.status === 'completed').length} / ${visits.length}`}
        />
        <StatMini
          label="Billing"
          value={
            plan.billingTotalCents != null
              ? formatCurrency(plan.billingTotalCents)
              : '—'
          }
        />
      </div>

      <PlanDetailClient
        plan={plan}
        visits={visits}
        history={history}
        vendors={vendors}
        fieldStaff={fieldStaff}
        signedHomeAssessmentUrl={
          plan.homeAssessmentUrl ? (signedDocUrls.get(plan.homeAssessmentUrl) ?? null) : null
        }
        signedPlaybookUrl={
          plan.playbookUrl ? (signedDocUrls.get(plan.playbookUrl) ?? null) : null
        }
      />
    </div>
  );
}

function PlanStatusInline({ status }: { status: string }) {
  const map: Record<string, { label: string; classes: string }> = {
    active: { label: 'Active', classes: 'bg-emerald-50 text-emerald-700' },
    draft: { label: 'Draft', classes: 'bg-gray-100 text-gray-600' },
    completed: { label: 'Completed', classes: 'bg-blue-50 text-blue-700' },
    archived: { label: 'Archived', classes: 'bg-amber-50 text-amber-700' },
  };
  const tone = map[status] ?? { label: status, classes: 'bg-gray-100 text-gray-600' };
  return (
    <span
      className={`inline-flex items-center rounded-md px-2.5 py-1 text-xs font-medium ${tone.classes}`}
    >
      {tone.label}
    </span>
  );
}

function StatMini({ label, value }: { label: string; value: string }) {
  return (
    <div className="shadow-soft-md rounded-2xl bg-paper p-5">
      <div className="text-xs font-medium tracking-wider text-gray-500 uppercase">{label}</div>
      <div className="mt-2 text-2xl font-light tracking-tight text-ink-900">{value}</div>
    </div>
  );
}

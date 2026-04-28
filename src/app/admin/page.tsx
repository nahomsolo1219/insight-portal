import { AlertCircle, Briefcase, Plus, TrendingUp, Users } from 'lucide-react';
import Link from 'next/link';
import { StatCard } from '@/components/admin/StatCard';
import { StatusBadge } from '@/components/admin/StatusBadge';
import { requireAdmin } from '@/lib/auth/current-user';
import { formatCurrency, initialsFrom } from '@/lib/utils';
import { DashboardNewProjectButton } from './DashboardNewProjectButton';
import {
  getActiveClientsCount,
  getActiveClientsForProjectPicker,
  getActiveProjectsCount,
  getNewClientsThisMonthCount,
  getOutstandingInvoices,
  getPendingPhotosCount,
  getRecentActivity,
  getRevenueMtdCents,
  getTodaysAppointments,
  getUnpaidInvoicesForAlerts,
  getUrgentDecisions,
} from './queries';

export default async function DashboardPage() {
  await requireAdmin();

  const [
    activeClients,
    newClients,
    activeProjects,
    revenueCents,
    outstanding,
    todayAppointments,
    urgentDecisions,
    pendingPhotos,
    unpaidInvoices,
    activity,
    projectPickerClients,
  ] = await Promise.all([
    getActiveClientsCount(),
    getNewClientsThisMonthCount(),
    getActiveProjectsCount(),
    getRevenueMtdCents(),
    getOutstandingInvoices(),
    getTodaysAppointments(),
    getUrgentDecisions(),
    getPendingPhotosCount(),
    getUnpaidInvoicesForAlerts(),
    getRecentActivity(),
    getActiveClientsForProjectPicker(),
  ]);

  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  const attentionCount =
    urgentDecisions.length + (pendingPhotos > 0 ? 1 : 0) + unpaidInvoices.length;

  return (
    <div>
      {/* Page header */}
      <div className="mb-8 flex items-start justify-between">
        <div>
          <div className="mb-3 flex items-center gap-2">
            <span aria-hidden="true" className="bg-brand-gold-500 inline-block h-px w-8" />
            <span className="text-ink-500 text-[11px] font-medium uppercase tracking-[0.18em]">
              Operations
            </span>
          </div>
          <h1 className="text-ink-900 text-3xl font-light tracking-tight">Dashboard</h1>
          <p className="mt-1 text-sm text-gray-500">{today}</p>
        </div>
        <div className="flex gap-3">
          <Link
            href="/admin/clients"
            className="bg-brand-gold-400 hover:bg-brand-gold-500 shadow-soft inline-flex items-center gap-2 rounded-xl px-5 py-2.5 font-medium text-white transition-all duration-150"
          >
            <Plus size={16} strokeWidth={2} />
            New Client
          </Link>
          <DashboardNewProjectButton clients={projectPickerClients} />
        </div>
      </div>

      {/* Stat cards */}
      <div className="mb-8 grid grid-cols-4 gap-5">
        <StatCard
          label="Active Clients"
          value={activeClients.toString()}
          trend={newClients > 0 ? `↑ ${newClients} new this month` : undefined}
          trendColor="green"
          icon={Users}
        />
        <StatCard
          label="Active Projects"
          value={activeProjects.toString()}
          trend="across all clients"
          trendColor="gray"
          icon={Briefcase}
        />
        <StatCard label="Revenue MTD" value={formatCurrency(revenueCents)} icon={TrendingUp} />
        <StatCard
          label="Outstanding"
          value={formatCurrency(outstanding.totalCents)}
          trend={`${outstanding.count} ${outstanding.count === 1 ? 'invoice' : 'invoices'} unpaid`}
          trendColor="gray"
          valueColor="amber"
          icon={AlertCircle}
          iconTone="gold"
        />
      </div>

      {/* Two-column: schedule + needs attention */}
      <div className="mb-8 grid grid-cols-[1.3fr_1fr] gap-5">
        {/* Today's Schedule */}
        <div className="shadow-soft-md rounded-2xl bg-paper p-6">
          <div className="mb-5 flex items-center justify-between">
            <h2 className="text-base font-semibold text-gray-900">Today&apos;s Schedule</h2>
            <Link
              href="/admin/schedule"
              className="text-brand-gold-400 hover:text-brand-gold-500 text-sm font-medium"
            >
              Full schedule →
            </Link>
          </div>
          {todayAppointments.length === 0 ? (
            <div className="py-10 text-center text-sm text-gray-400">
              No appointments scheduled for today
            </div>
          ) : (
            <div>
              {todayAppointments.map((apt) => (
                <div
                  key={apt.id}
                  className="flex items-center gap-4 border-t border-line-2 py-3 first:border-t-0"
                >
                  <div className="text-brand-teal-400 w-20 font-mono text-xs font-semibold tracking-wider">
                    {apt.startTime?.slice(0, 5) ?? ''}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold text-gray-900">{apt.title}</div>
                    <div className="truncate text-xs text-gray-500">
                      {[apt.clientName, apt.vendorName].filter(Boolean).join(' · ')}
                    </div>
                  </div>
                  {apt.pmName && (
                    <div className="text-xs text-gray-500">{apt.pmName.split(' ')[0]}</div>
                  )}
                  <StatusBadge status={apt.status} />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Needs Attention */}
        <div className="shadow-soft-md rounded-2xl bg-paper p-6">
          <div className="mb-5 flex items-center justify-between">
            <h2 className="text-base font-semibold text-gray-900">Needs Attention</h2>
            {attentionCount > 0 && (
              <span className="rounded-full bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700">
                {attentionCount} {attentionCount === 1 ? 'item' : 'items'}
              </span>
            )}
          </div>
          {attentionCount === 0 ? (
            <div className="py-10 text-center text-sm text-gray-400">
              All clear. Nothing needs action right now.
            </div>
          ) : (
            <div className="space-y-1">
              {urgentDecisions.map((d) => (
                <Link
                  key={d.id}
                  href="/admin/decisions"
                  className="hover:bg-brand-warm-50 flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors"
                >
                  <div className="h-2 w-2 flex-shrink-0 rounded-full bg-red-500" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-gray-900">{d.title}</div>
                    <div className="truncate text-xs text-gray-500">
                      {[d.clientName, d.projectName].filter(Boolean).join(' · ')}
                    </div>
                  </div>
                  <span className="rounded-md bg-pink-50 px-2 py-0.5 text-xs font-medium text-pink-700">
                    Decision
                  </span>
                </Link>
              ))}
              {pendingPhotos > 0 && (
                <Link
                  href="/admin/photo-queue"
                  className="hover:bg-brand-warm-50 flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors"
                >
                  <div className="bg-brand-gold-400 h-2 w-2 flex-shrink-0 rounded-full" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-gray-900">
                      {pendingPhotos} {pendingPhotos === 1 ? 'photo' : 'photos'} awaiting review
                    </div>
                    <div className="text-xs text-gray-500">Field uploads need categorization</div>
                  </div>
                  <span className="rounded-md bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
                    Photos
                  </span>
                </Link>
              )}
              {unpaidInvoices.map((inv) => (
                <Link
                  key={inv.id}
                  href="/admin/invoices"
                  className="hover:bg-brand-warm-50 flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors"
                >
                  <div className="h-2 w-2 flex-shrink-0 rounded-full bg-orange-500" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-gray-900">
                      {inv.invoiceNumber} — {formatCurrency(inv.amountCents)}
                    </div>
                    <div className="truncate text-xs text-gray-500">{inv.clientName ?? ''}</div>
                  </div>
                  <span className="rounded-md bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">
                    Unpaid
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Recent activity */}
      <div className="shadow-soft-md rounded-2xl bg-paper p-6">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900">Recent Activity</h2>
          <span className="text-xs text-gray-400">Audit log</span>
        </div>
        {activity.length === 0 ? (
          <div className="py-10 text-center text-sm text-gray-400">No activity yet</div>
        ) : (
          <div>
            {activity.map((entry) => (
              <div
                key={entry.id}
                className="flex items-start gap-3 border-t border-line-2 py-3 first:border-t-0"
              >
                <div className="bg-brand-teal-500 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-[10px] font-semibold text-white">
                  {initialsFrom(entry.actorName ?? 'System')}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm text-gray-700">
                    <strong className="font-semibold text-gray-900">
                      {entry.actorName ?? 'System'}
                    </strong>{' '}
                    <span>{entry.action}</span>
                    {entry.targetLabel && (
                      <>
                        {' '}
                        <strong className="font-semibold text-gray-900">
                          {entry.targetLabel}
                        </strong>
                      </>
                    )}
                  </div>
                  <div className="text-xs text-gray-500">
                    {entry.clientName && `${entry.clientName} · `}
                    {formatRelativeTime(entry.createdAt)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// Render a timestamp as "Just now", "5m ago", "2h ago", "3d ago", or a date.
function formatRelativeTime(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return 'Just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString();
}

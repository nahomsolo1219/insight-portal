// Calls every dashboard query in turn and prints a condensed summary.
// Lets us prove empty-state / populated-state behaviour without having to
// juggle a browser session. Safe to re-run; reads only.

import './_env';

import {
  getActiveClientsCount,
  getActiveProjectsCount,
  getNewClientsThisMonthCount,
  getOutstandingInvoices,
  getPendingPhotosCount,
  getRecentActivity,
  getRevenueMtdCents,
  getTodaysAppointments,
  getUnpaidInvoicesForAlerts,
  getUrgentDecisions,
} from '../src/app/admin/queries';

async function main() {
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
  ]);

  console.log('');
  console.log('Dashboard query results:');
  console.log(`  activeClients          : ${activeClients}`);
  console.log(`  newClients (30d)       : ${newClients}`);
  console.log(`  activeProjects         : ${activeProjects}`);
  console.log(`  revenueMtdCents        : ${revenueCents}`);
  console.log(`  outstanding            : ${JSON.stringify(outstanding)}`);
  console.log(`  todayAppointments (${todayAppointments.length}):`);
  for (const a of todayAppointments) {
    console.log(
      `    - ${a.startTime ?? ''} ${a.title} · ${a.clientName ?? '?'} · ${a.vendorName ?? '?'} [${a.status}]`,
    );
  }
  console.log(`  urgentDecisions (${urgentDecisions.length}):`);
  for (const d of urgentDecisions) {
    console.log(`    - ${d.title} · ${d.clientName ?? '?'} · due ${d.dueDate ?? '?'}`);
  }
  console.log(`  pendingPhotos          : ${pendingPhotos}`);
  console.log(`  unpaidInvoices (${unpaidInvoices.length}):`);
  for (const i of unpaidInvoices) {
    console.log(`    - ${i.invoiceNumber} $${i.amountCents / 100} due ${i.dueDate} · ${i.clientName ?? '?'}`);
  }
  console.log(`  activity (${activity.length}):`);
  for (const e of activity) {
    console.log(`    - ${e.actorName ?? 'System'} ${e.action} ${e.targetLabel ?? ''}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });

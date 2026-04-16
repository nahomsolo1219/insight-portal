// Probe the clients list / form-options queries and the sidebar counts
// without going through the auth flow. Safe to re-run; reads only.

import './_env';

import { getSidebarCounts } from '../src/components/admin/queries';
import { getClientFormOptions, listClients } from '../src/app/admin/clients/queries';

async function main() {
  const [rows, options, counts] = await Promise.all([
    listClients(),
    getClientFormOptions(),
    getSidebarCounts(),
  ]);

  console.log('\nlistClients():');
  for (const c of rows) {
    console.log(
      `  - ${c.name.padEnd(20)} status=${c.status.padEnd(8)} tier=${String(c.tierName).padEnd(16)} pm=${String(c.assignedPmName).padEnd(16)} props=${c.propertyCount} activeProj=${c.activeProjectCount} balance=${(c.balanceCents / 100).toFixed(0)} addr="${c.primaryAddress ?? ''}"`,
    );
  }

  console.log('\ngetClientFormOptions():');
  console.log(`  tiers (${options.tiers.length}):`);
  for (const t of options.tiers) console.log(`    - ${t.name} (${t.id})`);
  console.log(`  pms   (${options.pms.length}):`);
  for (const p of options.pms) console.log(`    - ${p.name} — ${p.role}`);

  console.log('\ngetSidebarCounts():');
  console.log(`  photos pending    : ${counts.photosPending}`);
  console.log(`  decisions pending : ${counts.decisionsPending}`);
  console.log(`  invoices unpaid   : ${counts.invoicesUnpaid}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });

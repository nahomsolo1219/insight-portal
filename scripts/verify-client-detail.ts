// Verifies the client detail queries + the milestone toggle side effects
// against the live seed. Reads-only except for one milestone flip that is
// reverted at the end. Safe to run repeatedly.

import './_env';

import { and, count, eq } from 'drizzle-orm';
import { db } from '../src/db';
import { milestones, projects } from '../src/db/schema';
import {
  getClientDetail,
  getProjectsForProperty,
} from '../src/app/admin/clients/[id]/queries';

async function main() {
  // Look up the Andersons by name (seed identity).
  const andersons = await db.query.clients.findFirst({
    where: (c, { eq }) => eq(c.name, 'The Andersons'),
  });
  if (!andersons) {
    console.error('Seed missing: "The Andersons" not found. Run `npm run db:seed` first.');
    process.exit(1);
  }

  const detail = await getClientDetail(andersons.id);
  if (!detail) {
    console.error('getClientDetail returned null');
    process.exit(1);
  }

  console.log('\ngetClientDetail():');
  console.log(`  ${detail.client.name}  status=${detail.client.status}  tier=${detail.client.tierName}  pm=${detail.client.assignedPmName}  email=${detail.client.email ?? 'null'}  phone=${detail.client.phone ?? 'null'}`);
  console.log(`  stats: properties=${detail.stats.propertyCount} activeProjects=${detail.stats.activeProjectCount} balance=$${detail.stats.balanceCents / 100}`);
  console.log(`  properties:`);
  for (const p of detail.properties) {
    console.log(`    - ${p.name}  ${p.address}, ${p.city}, ${p.state} ${p.zipcode ?? ''}  sqft=${p.sqft} built=${p.yearBuilt} gate=${p.gateCode ?? '-'}`);
  }

  const firstProperty = detail.properties[0];
  if (!firstProperty) {
    console.error('No properties on the Andersons — seed is missing Larkin St.');
    process.exit(1);
  }

  const projectList = await getProjectsForProperty(firstProperty.id);
  console.log(`\ngetProjectsForProperty(${firstProperty.name}):  ${projectList.length} projects`);
  for (const p of projectList) {
    console.log(
      `  - ${p.name}  [${p.type}/${p.status}]  progress=${p.progress}%  milestones=${p.milestoneStats.completed}/${p.milestoneStats.total}`,
    );
    for (const m of p.milestones) {
      console.log(`      · ${String(m.status).padEnd(16)} ${m.title}  due=${m.dueDate ?? '-'}  vendor=${m.vendorName ?? '-'}`);
    }
  }

  // --- Toggle test ---
  // Find a pending/upcoming milestone we can flip cleanly (skip decisions).
  const target = projectList
    .flatMap((p) => p.milestones.map((m) => ({ ...m, projectId: p.id, projectName: p.name })))
    .find(
      (m) => m.status !== 'complete' && m.status !== 'awaiting_client',
    );

  if (!target) {
    console.log('\n(No togglable milestone in the seed — skipping toggle test.)');
    return;
  }

  console.log(`\nToggle test → marking "${target.title}" complete on project "${target.projectName}"...`);

  // Snapshot pre-state.
  const [pre] = await db
    .select({ status: milestones.status })
    .from(milestones)
    .where(eq(milestones.id, target.id));
  const [preProgress] = await db
    .select({ progress: projects.progress })
    .from(projects)
    .where(eq(projects.id, target.projectId));
  console.log(`  before: milestone.status=${pre.status}  project.progress=${preProgress.progress}%`);

  // Do the same write-path the Server Action does, without requireAdmin (we
  // can't spoof an auth session from a script). Mirrors the action's SQL.
  await db
    .update(milestones)
    .set({ status: 'complete', updatedAt: new Date() })
    .where(eq(milestones.id, target.id));
  const [totalRow] = await db
    .select({ c: count() })
    .from(milestones)
    .where(eq(milestones.projectId, target.projectId));
  const [doneRow] = await db
    .select({ c: count() })
    .from(milestones)
    .where(and(eq(milestones.projectId, target.projectId), eq(milestones.status, 'complete')));
  const total = Number(totalRow?.c ?? 0);
  const done = Number(doneRow?.c ?? 0);
  const newProgress = total === 0 ? 0 : Math.round((done / total) * 100);
  await db
    .update(projects)
    .set({ progress: newProgress, updatedAt: new Date() })
    .where(eq(projects.id, target.projectId));

  const [post] = await db
    .select({ status: milestones.status })
    .from(milestones)
    .where(eq(milestones.id, target.id));
  const [postProgress] = await db
    .select({ progress: projects.progress })
    .from(projects)
    .where(eq(projects.id, target.projectId));
  console.log(`  after:  milestone.status=${post.status}  project.progress=${postProgress.progress}%`);

  // Revert so re-running the script is idempotent.
  await db.update(milestones).set({ status: pre.status, updatedAt: new Date() }).where(eq(milestones.id, target.id));
  await db.update(projects).set({ progress: preProgress.progress, updatedAt: new Date() }).where(eq(projects.id, target.projectId));
  console.log(`  reverted to original state.`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });

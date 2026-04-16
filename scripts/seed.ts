// Populate the database with a small set of realistic test rows so the
// dashboard (and later pages) have something to render during development.
//
// Usage: `npm run db:seed` — safe to re-run. Every row added by this script
// is cleared before inserting, so you always get the same starting state.
//
// Tables that ARE seeded: membership_tiers, staff, vendors, clients,
// properties, projects, milestones, appointments, invoices, audit_log.
//
// Tables that ARE NOT touched: profiles (owned by auth.users; wiping it would
// break real sign-in sessions), photos / reports / documents / weekly_updates
// / templates / email_templates (no dashboard surface yet).

import './_env'; // MUST be first — see scripts/_env.ts

import { sql } from 'drizzle-orm';
import { db } from '../src/db';
import {
  appointments,
  auditLog,
  clients,
  invoices,
  membershipTiers,
  milestones,
  projects,
  properties,
  staff,
  vendors,
} from '../src/db/schema';

function localDateString(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

async function clearSeededTables() {
  // Order matters. DELETE respects ON DELETE SET NULL on profiles.{client,staff}_id;
  // TRUNCATE CASCADE would wipe profiles too (since it follows any FK reference)
  // and take real auth users' profile rows with it.
  await db.execute(sql`DELETE FROM weekly_updates`);
  await db.execute(sql`DELETE FROM documents`);
  await db.execute(sql`DELETE FROM reports`);
  await db.execute(sql`DELETE FROM invoices`);
  await db.execute(sql`DELETE FROM photos`);
  await db.execute(sql`DELETE FROM appointments`);
  await db.execute(sql`DELETE FROM milestones`);
  await db.execute(sql`DELETE FROM projects`);
  await db.execute(sql`DELETE FROM properties`);
  await db.execute(sql`DELETE FROM clients`);
  await db.execute(sql`DELETE FROM audit_log`);
  await db.execute(sql`DELETE FROM vendors`);
  await db.execute(sql`DELETE FROM staff`);
  await db.execute(sql`DELETE FROM membership_tiers`);
}

async function seed() {
  console.log('Clearing existing seed data...');
  await clearSeededTables();

  console.log('Inserting seed data...');

  // Tiers
  const [premiumTier] = await db
    .insert(membershipTiers)
    .values({
      name: 'Tier 1 — Premium',
      annualPriceCents: 740000,
      description: 'Full-service annual maintenance + priority scheduling',
    })
    .returning();

  // Staff
  const [david] = await db
    .insert(staff)
    .values({
      name: 'David Hughes',
      role: 'founder',
      email: 'david@insighthm.com',
      phone: '(415) 555-0100',
      status: 'active',
    })
    .returning();

  const [sarah] = await db
    .insert(staff)
    .values({
      name: 'Sarah Kim',
      role: 'project_manager',
      email: 'sarah@insighthm.com',
      phone: '(415) 555-0101',
      status: 'active',
    })
    .returning();

  await db
    .insert(staff)
    .values({
      name: 'Mike Torres',
      role: 'field_lead',
      email: 'mike@insighthm.com',
      phone: '(415) 555-0102',
      status: 'active',
    })
    .returning();

  // Vendors
  const [bayAir] = await db
    .insert(vendors)
    .values({
      name: 'Bay Air Systems',
      category: 'HVAC',
      phone: '(415) 555-0200',
      email: 'service@bayair.com',
      active: true,
      rating: 5,
      jobsCompleted: 12,
    })
    .returning();

  const [sfPlumbing] = await db
    .insert(vendors)
    .values({
      name: 'SF Plumbing Co.',
      category: 'Plumbing',
      phone: '(415) 555-0201',
      email: 'dispatch@sfplumbing.com',
      active: true,
      rating: 4,
      jobsCompleted: 8,
    })
    .returning();

  await db
    .insert(vendors)
    .values({
      name: 'Bay Electric',
      category: 'Electrical',
      phone: '(415) 555-0202',
      email: 'jobs@bayelectric.com',
      active: true,
      rating: 5,
      jobsCompleted: 6,
    })
    .returning();

  // Clients
  const [andersons] = await db
    .insert(clients)
    .values({
      name: 'The Andersons',
      email: 'anderson@example.com',
      phone: '(415) 555-0300',
      membershipTierId: premiumTier.id,
      assignedPmId: david.id,
      memberSince: '2024-01-15',
      status: 'active',
    })
    .returning();

  // Properties
  const [larkinSt] = await db
    .insert(properties)
    .values({
      clientId: andersons.id,
      name: 'Larkin St Residence',
      address: '2531 Larkin Street',
      city: 'San Francisco',
      state: 'CA',
      zipcode: '94109',
      sqft: 4200,
      yearBuilt: 1928,
      gateCode: '4821',
      accessNotes: 'Side gate entry preferred. Dog in backyard (friendly).',
      emergencyContact: 'James Anderson — (415) 555-0192',
    })
    .returning();

  // Projects
  const [annualPlan] = await db
    .insert(projects)
    .values({
      propertyId: larkinSt.id,
      name: 'Annual Maintenance Plan 2026',
      type: 'maintenance',
      status: 'active',
      startDate: '2026-01-01',
      endDate: '2026-12-31',
      progress: 35,
      description: 'Year-long comprehensive home care',
    })
    .returning();

  const [kitchenRemodel] = await db
    .insert(projects)
    .values({
      propertyId: larkinSt.id,
      name: 'Kitchen Remodel',
      type: 'remodel',
      status: 'active',
      startDate: '2026-03-10',
      endDate: '2026-07-15',
      progress: 28,
      description: 'Full kitchen renovation',
      contractCents: 18500000, // $185,000
      changesCents: 1240000, // $12,400
      paidCents: 7896000, // $78,960
    })
    .returning();

  // Milestones — the backsplash one seeds the Decisions feature
  await db.insert(milestones).values([
    {
      projectId: annualPlan.id,
      title: 'HVAC annual service',
      category: 'HVAC',
      dueDate: '2026-01-15',
      status: 'complete',
      vendorId: bayAir.id,
      order: 1,
    },
    {
      projectId: annualPlan.id,
      title: 'Spring plumbing check',
      category: 'Plumbing',
      dueDate: '2026-04-20',
      status: 'upcoming',
      vendorId: sfPlumbing.id,
      order: 2,
    },
    {
      projectId: kitchenRemodel.id,
      title: 'Select backsplash tile',
      category: 'Selections',
      dueDate: '2026-04-18',
      status: 'awaiting_client',
      order: 6,
      questionType: 'single',
      questionBody: "We're ready to order tile. Which option would you like?",
      options: ['White subway', 'Hex marble', 'Slate grey', 'Penny round'],
    },
  ]);

  // One appointment scheduled for today so the dashboard has something live
  await db.insert(appointments).values({
    propertyId: larkinSt.id,
    projectId: annualPlan.id,
    title: 'HVAC Filter Replacement',
    vendorId: bayAir.id,
    date: localDateString(),
    startTime: '09:00:00',
    endTime: '10:00:00',
    status: 'confirmed',
    davidOnSite: true,
    scopeOfWork: 'Replace main filter, inspect compressor',
    assignedPmId: david.id,
  });

  // One unpaid invoice, due in two weeks
  const inTwoWeeks = new Date();
  inTwoWeeks.setDate(inTwoWeeks.getDate() + 14);
  await db.insert(invoices).values({
    clientId: andersons.id,
    propertyId: larkinSt.id,
    projectId: kitchenRemodel.id,
    invoiceNumber: '#0042',
    description: 'Kitchen Remodel — Draw 2',
    amountCents: 4625000, // $46,250
    invoiceDate: localDateString(),
    dueDate: localDateString(inTwoWeeks),
    status: 'unpaid',
    storagePath: 'invoices/placeholder.pdf',
  });

  // Audit log — seeds the activity feed
  await db.insert(auditLog).values([
    {
      actorName: david.name,
      action: 'marked milestone complete',
      targetType: 'milestone',
      targetLabel: 'HVAC annual service',
      clientId: andersons.id,
    },
    {
      actorName: sarah.name,
      action: 'created project',
      targetType: 'project',
      targetLabel: 'Kitchen Remodel',
      clientId: andersons.id,
    },
  ]);

  console.log('Seed complete.');
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });

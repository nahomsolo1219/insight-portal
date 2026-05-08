// Populate the database with realistic test rows so every surface has
// something meaningful to render during demos and development.
//
// Usage: `npm run db:seed` — safe to re-run. Every row added by this script
// is cleared before inserting, so you always get the same starting state.
//
// Tables that ARE seeded: membership_tiers, staff, vendors, clients,
// properties, projects, milestones, appointments, photos, invoices, audit_log.
//
// Tables that ARE NOT touched: profiles (owned by auth.users; wiping it would
// break real sign-in sessions), reports / documents / weekly_updates /
// templates / email_templates.

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
  photos,
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

  // ---------------------------------------------------------------------------
  // Tiers
  // ---------------------------------------------------------------------------

  const [premiumTier] = await db
    .insert(membershipTiers)
    .values({
      name: 'Tier 1 — Premium',
      annualPriceCents: 740000,
      description: 'Full-service annual maintenance + priority scheduling',
    })
    .returning();

  // ---------------------------------------------------------------------------
  // Staff
  // ---------------------------------------------------------------------------

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
      role: 'field_staff',
      email: 'mike@insighthm.com',
      phone: '(415) 555-0102',
      status: 'active',
    })
    .returning();

  // ---------------------------------------------------------------------------
  // Vendors
  // ---------------------------------------------------------------------------

  const [bayAir] = await db
    .insert(vendors)
    .values({
      name: 'Bay Air Systems',
      category: 'HVAC',
      phone: '(415) 555-0200',
      email: 'service@bayair.com',
      active: true,
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
      jobsCompleted: 8,
    })
    .returning();

  const [bayElectric] = await db
    .insert(vendors)
    .values({
      name: 'Bay Electric',
      category: 'Electrical',
      phone: '(415) 555-0202',
      email: 'jobs@bayelectric.com',
      active: true,
      jobsCompleted: 6,
    })
    .returning();

  const [eliteTile] = await db
    .insert(vendors)
    .values({
      name: 'Elite Tile & Stone',
      category: 'Tile',
      phone: '(415) 555-0203',
      email: 'info@elitetile.com',
      active: true,
      jobsCompleted: 4,
    })
    .returning();

  const [bayAreaCabinets] = await db
    .insert(vendors)
    .values({
      name: 'Bay Area Cabinets',
      category: 'Cabinetry',
      phone: '(415) 555-0204',
      email: 'orders@bayareacabinets.com',
      active: true,
      jobsCompleted: 3,
    })
    .returning();

  // ---------------------------------------------------------------------------
  // Clients
  // ---------------------------------------------------------------------------

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

  // ---------------------------------------------------------------------------
  // Properties — two distinct locations for multi-property showcase
  // ---------------------------------------------------------------------------

  const [larkinSt] = await db
    .insert(properties)
    .values({
      clientId: andersons.id,
      name: 'Larkin St residence',
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

  const [tahoeCabin] = await db
    .insert(properties)
    .values({
      clientId: andersons.id,
      name: 'Tahoe cabin',
      address: '412 Pine Ridge Dr',
      city: 'Truckee',
      state: 'CA',
      zipcode: '96161',
      sqft: 2800,
      yearBuilt: 2004,
      accessNotes: 'Lockbox on side door — code is 7392.',
      emergencyContact: 'James Anderson — (415) 555-0192',
    })
    .returning();

  // ---------------------------------------------------------------------------
  // Projects
  // ---------------------------------------------------------------------------

  // --- Annual Maintenance Plan 2026 (Larkin St) ---
  const [annualPlan] = await db
    .insert(projects)
    .values({
      propertyId: larkinSt.id,
      name: 'Annual maintenance plan 2026',
      type: 'maintenance',
      status: 'active',
      startDate: '2026-01-01',
      endDate: '2026-12-31',
      progress: 40, // 2 of 5 complete
      description: 'Year-long comprehensive home care',
    })
    .returning();

  // --- Kitchen Remodel (Larkin St) ---
  const [kitchenRemodel] = await db
    .insert(projects)
    .values({
      propertyId: larkinSt.id,
      name: 'Kitchen remodel',
      type: 'remodel',
      status: 'active',
      startDate: '2026-03-10',
      endDate: '2026-07-15',
      progress: 35, // 6 of 17 complete
      description: 'Full kitchen renovation — custom cabinets, new tile, updated plumbing and electrical.',
      contractCents: 18500000, // $185,000
      changesCents: 1240000, // $12,400
      paidCents: 7896000, // $78,960
    })
    .returning();

  // --- Bathroom Refresh (Tahoe Cabin) ---
  const [bathroomRefresh] = await db
    .insert(projects)
    .values({
      propertyId: tahoeCabin.id,
      name: 'Bathroom refresh',
      type: 'remodel',
      status: 'active',
      startDate: '2026-05-01',
      endDate: '2026-07-30',
      progress: 14, // 1 of 7 complete
      description: 'Guest bathroom update — new vanity, tile, and fixtures.',
      contractCents: 4200000, // $42,000
      changesCents: 0,
      paidCents: 1050000, // $10,500
    })
    .returning();

  // ---------------------------------------------------------------------------
  // Milestones — Annual Maintenance Plan 2026
  // ---------------------------------------------------------------------------

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
      status: 'complete',
      vendorId: sfPlumbing.id,
      order: 2,
    },
    {
      projectId: annualPlan.id,
      title: 'Summer system inspection',
      category: 'HVAC',
      dueDate: '2026-07-20',
      status: 'upcoming',
      vendorId: bayAir.id,
      order: 3,
      notes: 'Full AC performance check before peak heat.',
    },
    {
      projectId: annualPlan.id,
      title: 'Fall electrical & weatherization',
      category: 'Electrical',
      dueDate: '2026-10-15',
      status: 'upcoming',
      vendorId: bayElectric.id,
      order: 4,
      notes: 'Panel inspection, outdoor outlet covers, window seal check.',
    },
    {
      projectId: annualPlan.id,
      title: 'Winter system check',
      category: 'HVAC',
      dueDate: '2026-12-15',
      status: 'upcoming',
      vendorId: bayAir.id,
      order: 5,
      notes: 'Heating system tune-up and filter replacement.',
    },
  ]);

  // ---------------------------------------------------------------------------
  // Milestones — Kitchen Remodel (17 milestones, 5 phases)
  // ---------------------------------------------------------------------------

  // Capture the milestone IDs we'll attach photos to
  const kitchenMilestoneRows = await db
    .insert(milestones)
    .values([
      // ---- Phase: Pre-construction ----
      {
        projectId: kitchenRemodel.id,
        title: 'Final design walkthrough',
        category: 'Pre-construction',
        dueDate: '2026-04-05',
        status: 'complete',
        order: 1,
        notes: 'Walk site with designer, confirm layout and material selections.',
      },
      {
        projectId: kitchenRemodel.id,
        title: 'Permit pulled',
        category: 'Pre-construction',
        dueDate: '2026-04-08',
        status: 'complete',
        order: 2,
      },
      // Decision: tile selection (responded)
      {
        projectId: kitchenRemodel.id,
        title: 'Select backsplash tile',
        category: 'Pre-construction',
        dueDate: '2026-04-18',
        status: 'awaiting_client',
        order: 3,
        questionType: 'single',
        questionBody: "We're ready to order tile. Which option would you like?",
        options: ['White subway', 'Hex marble', 'Slate grey', 'Penny round'],
        clientResponse: 'White subway',
        respondedAt: new Date('2026-04-18T14:30:00Z'),
      },
      // Decision: faucet finish (responded)
      {
        projectId: kitchenRemodel.id,
        title: 'Approve faucet finish',
        category: 'Pre-construction',
        dueDate: '2026-04-22',
        status: 'awaiting_client',
        order: 4,
        questionType: 'single',
        questionBody: 'Please confirm your preferred faucet finish for the kitchen sink.',
        options: ['Brushed nickel', 'Matte black', 'Polished chrome'],
        clientResponse: 'Brushed nickel',
        respondedAt: new Date('2026-04-22T10:15:00Z'),
      },
      // ---- Phase: Demolition ----
      {
        projectId: kitchenRemodel.id,
        title: 'Existing cabinets removed',
        category: 'Demolition',
        dueDate: '2026-05-05',
        status: 'complete',
        vendorId: bayAreaCabinets.id,
        order: 5,
      },
      {
        projectId: kitchenRemodel.id,
        title: 'Old flooring removed',
        category: 'Demolition',
        dueDate: '2026-05-06',
        status: 'complete',
        order: 6,
      },
      {
        projectId: kitchenRemodel.id,
        title: 'Demo old tile and prep walls',
        category: 'Demolition',
        dueDate: '2026-05-12',
        status: 'in_progress',
        vendorId: eliteTile.id,
        order: 7,
        notes: 'Target completion May 15. Dust barriers in place.',
      },
      // ---- Phase: Rough-in ----
      {
        projectId: kitchenRemodel.id,
        title: 'Plumbing rough-in',
        category: 'Rough-in',
        dueDate: '2026-05-20',
        status: 'pending',
        vendorId: sfPlumbing.id,
        order: 8,
      },
      {
        projectId: kitchenRemodel.id,
        title: 'Electrical updates',
        category: 'Rough-in',
        dueDate: '2026-05-24',
        status: 'pending',
        vendorId: bayElectric.id,
        order: 9,
      },
      {
        projectId: kitchenRemodel.id,
        title: 'Inspection',
        category: 'Rough-in',
        dueDate: '2026-05-27',
        status: 'pending',
        order: 10,
        notes: 'City inspector — schedule 48h in advance.',
      },
      // Decision: cabinet stain (awaiting)
      {
        projectId: kitchenRemodel.id,
        title: 'Approve cabinet stain color',
        category: 'Rough-in',
        dueDate: '2026-05-28',
        status: 'awaiting_client',
        order: 11,
        questionType: 'single',
        questionBody: 'Cabinets are ready for finishing. Which stain would you like?',
        options: ['Walnut', 'Honey oak', 'Espresso'],
      },
      // Decision: hardware (responded)
      {
        projectId: kitchenRemodel.id,
        title: 'Confirm cabinet hardware',
        category: 'Rough-in',
        dueDate: '2026-05-01',
        status: 'awaiting_client',
        order: 12,
        questionType: 'single',
        questionBody: 'Choose your cabinet hardware style.',
        options: ['Matte black pulls', 'Brushed brass knobs', 'Stainless bar pulls'],
        clientResponse: 'Matte black pulls',
        respondedAt: new Date('2026-05-01T16:00:00Z'),
      },
      // ---- Phase: Cabinets & tile ----
      {
        projectId: kitchenRemodel.id,
        title: 'Install new tile backsplash',
        category: 'Cabinets & tile',
        dueDate: '2026-06-04',
        status: 'pending',
        vendorId: eliteTile.id,
        order: 13,
      },
      {
        projectId: kitchenRemodel.id,
        title: 'Cabinet install',
        category: 'Cabinets & tile',
        dueDate: '2026-06-12',
        status: 'pending',
        vendorId: bayAreaCabinets.id,
        order: 14,
      },
      {
        projectId: kitchenRemodel.id,
        title: 'Countertop template & fabrication',
        category: 'Cabinets & tile',
        dueDate: '2026-06-17',
        status: 'pending',
        order: 15,
      },
      // ---- Phase: Final ----
      {
        projectId: kitchenRemodel.id,
        title: 'Plumbing fixtures install',
        category: 'Final',
        dueDate: '2026-06-24',
        status: 'pending',
        vendorId: sfPlumbing.id,
        order: 16,
      },
      {
        projectId: kitchenRemodel.id,
        title: 'Final paint touch-ups',
        category: 'Final',
        dueDate: '2026-06-28',
        status: 'pending',
        order: 17,
      },
      {
        projectId: kitchenRemodel.id,
        title: 'Punch list walkthrough',
        category: 'Final',
        dueDate: '2026-07-05',
        status: 'pending',
        order: 18,
        notes: 'Walk every room with the homeowner. Document any remaining items.',
      },
      {
        projectId: kitchenRemodel.id,
        title: 'Project handoff',
        category: 'Final',
        dueDate: '2026-07-15',
        status: 'pending',
        order: 19,
        notes: 'Final walkthrough, warranty documents, and keys.',
      },
    ])
    .returning({ id: milestones.id, title: milestones.title, order: milestones.order });

  // ---------------------------------------------------------------------------
  // Milestones — Bathroom Refresh (7 milestones)
  // ---------------------------------------------------------------------------

  const bathroomMilestoneRows = await db
    .insert(milestones)
    .values([
      {
        projectId: bathroomRefresh.id,
        title: 'Design finalized',
        category: 'Planning',
        dueDate: '2026-05-05',
        status: 'complete',
        order: 1,
      },
      {
        projectId: bathroomRefresh.id,
        title: 'Materials ordered',
        category: 'Planning',
        dueDate: '2026-05-10',
        status: 'upcoming',
        order: 2,
        notes: 'Vanity (4-week lead time), tile, fixtures.',
      },
      {
        projectId: bathroomRefresh.id,
        title: 'Demo existing bathroom',
        category: 'Demolition',
        dueDate: '2026-06-02',
        status: 'upcoming',
        order: 3,
      },
      {
        projectId: bathroomRefresh.id,
        title: 'Plumbing rough-in',
        category: 'Rough-in',
        dueDate: '2026-06-08',
        status: 'upcoming',
        vendorId: sfPlumbing.id,
        order: 4,
      },
      {
        projectId: bathroomRefresh.id,
        title: 'Tile installation',
        category: 'Install',
        dueDate: '2026-06-18',
        status: 'upcoming',
        vendorId: eliteTile.id,
        order: 5,
      },
      {
        projectId: bathroomRefresh.id,
        title: 'Vanity & fixtures install',
        category: 'Install',
        dueDate: '2026-07-01',
        status: 'upcoming',
        vendorId: sfPlumbing.id,
        order: 6,
      },
      {
        projectId: bathroomRefresh.id,
        title: 'Final walkthrough',
        category: 'Completion',
        dueDate: '2026-07-15',
        status: 'upcoming',
        order: 7,
      },
    ])
    .returning({ id: milestones.id, title: milestones.title, order: milestones.order });

  // ---------------------------------------------------------------------------
  // Photos — linked to specific milestones for timeline rendering.
  // These use placeholder storage paths. In a real deployment, photos would
  // exist in the Supabase bucket; the seed just creates DB rows so the
  // timeline cards show photo strips (URLs will 404 but the UI handles that).
  // ---------------------------------------------------------------------------

  // Helper: find a milestone by order from the returned rows
  const kitchenMs = (order: number) =>
    kitchenMilestoneRows.find((m) => m.order === order)!;
  const bathroomMs = (order: number) =>
    bathroomMilestoneRows.find((m) => m.order === order)!;

  await db.insert(photos).values([
    // Kitchen — design walkthrough (before photos)
    {
      propertyId: larkinSt.id,
      projectId: kitchenRemodel.id,
      milestoneId: kitchenMs(1).id, // Final design walkthrough
      tag: 'before',
      category: 'Kitchen',
      caption: 'Existing kitchen — north wall',
      status: 'categorized',
      storagePath: `photos/${andersons.id}/${larkinSt.id}/seed-kitchen-before-1.jpg`,
    },
    {
      propertyId: larkinSt.id,
      projectId: kitchenRemodel.id,
      milestoneId: kitchenMs(1).id,
      tag: 'before',
      category: 'Kitchen',
      caption: 'Existing kitchen — south wall and island',
      status: 'categorized',
      storagePath: `photos/${andersons.id}/${larkinSt.id}/seed-kitchen-before-2.jpg`,
    },
    // Kitchen — demolition (during photos)
    {
      propertyId: larkinSt.id,
      projectId: kitchenRemodel.id,
      milestoneId: kitchenMs(5).id, // Existing cabinets removed
      tag: 'during',
      category: 'Kitchen',
      caption: 'Cabinets removed — framing exposed',
      status: 'categorized',
      storagePath: `photos/${andersons.id}/${larkinSt.id}/seed-kitchen-demo-1.jpg`,
    },
    {
      propertyId: larkinSt.id,
      projectId: kitchenRemodel.id,
      milestoneId: kitchenMs(6).id, // Old flooring removed
      tag: 'during',
      category: 'Kitchen',
      caption: 'Flooring removed — subfloor prep',
      status: 'categorized',
      storagePath: `photos/${andersons.id}/${larkinSt.id}/seed-kitchen-demo-2.jpg`,
    },
    // Kitchen — in-progress tile demo
    {
      propertyId: larkinSt.id,
      projectId: kitchenRemodel.id,
      milestoneId: kitchenMs(7).id, // Demo old tile and prep walls
      tag: 'during',
      category: 'Kitchen',
      caption: 'Wall tile removal in progress',
      status: 'categorized',
      storagePath: `photos/${andersons.id}/${larkinSt.id}/seed-kitchen-tile-demo-1.jpg`,
    },
    // Bathroom — design finalized
    {
      propertyId: tahoeCabin.id,
      projectId: bathroomRefresh.id,
      milestoneId: bathroomMs(1).id, // Design finalized
      tag: 'before',
      category: 'Bathroom',
      caption: 'Existing guest bathroom',
      status: 'categorized',
      storagePath: `photos/${andersons.id}/${tahoeCabin.id}/seed-bathroom-before-1.jpg`,
    },
    {
      propertyId: tahoeCabin.id,
      projectId: bathroomRefresh.id,
      milestoneId: bathroomMs(1).id,
      tag: 'before',
      category: 'Bathroom',
      caption: 'Existing vanity and mirror',
      status: 'categorized',
      storagePath: `photos/${andersons.id}/${tahoeCabin.id}/seed-bathroom-before-2.jpg`,
    },
  ]);

  // ---------------------------------------------------------------------------
  // Appointments
  // ---------------------------------------------------------------------------

  // Today's appointment (maintenance)
  await db.insert(appointments).values({
    propertyId: larkinSt.id,
    projectId: annualPlan.id,
    title: 'HVAC filter replacement',
    vendorId: bayAir.id,
    date: localDateString(),
    startTime: '09:00:00',
    endTime: '10:00:00',
    status: 'confirmed',
    davidOnSite: true,
    scopeOfWork: 'Replace main filter, inspect compressor.',
    assignedPmId: david.id,
  });

  // Upcoming Kitchen Remodel visit
  const inFiveDays = new Date();
  inFiveDays.setDate(inFiveDays.getDate() + 5);
  await db.insert(appointments).values({
    propertyId: larkinSt.id,
    projectId: kitchenRemodel.id,
    title: 'Tile prep site check',
    vendorId: eliteTile.id,
    date: localDateString(inFiveDays),
    startTime: '10:00:00',
    endTime: '11:30:00',
    status: 'scheduled',
    davidOnSite: false,
    scopeOfWork: 'Verify wall prep is ready for tile. Confirm layout.',
    assignedPmId: sarah.id,
  });

  // Upcoming Bathroom Refresh visit at Tahoe
  const inTenDays = new Date();
  inTenDays.setDate(inTenDays.getDate() + 10);
  await db.insert(appointments).values({
    propertyId: tahoeCabin.id,
    projectId: bathroomRefresh.id,
    title: 'Pre-demo measurement check',
    date: localDateString(inTenDays),
    startTime: '14:00:00',
    endTime: '15:00:00',
    status: 'scheduled',
    davidOnSite: true,
    scopeOfWork: 'Final measurements before demo starts.',
    assignedPmId: david.id,
  });

  // ---------------------------------------------------------------------------
  // Invoices
  // ---------------------------------------------------------------------------

  const inTwoWeeks = new Date();
  inTwoWeeks.setDate(inTwoWeeks.getDate() + 14);
  await db.insert(invoices).values({
    clientId: andersons.id,
    propertyId: larkinSt.id,
    projectId: kitchenRemodel.id,
    invoiceNumber: '#0042',
    description: 'Kitchen remodel — draw 2',
    amountCents: 4625000, // $46,250
    invoiceDate: localDateString(),
    dueDate: localDateString(inTwoWeeks),
    status: 'unpaid',
    storagePath: 'invoices/placeholder.pdf',
  });

  // ---------------------------------------------------------------------------
  // Audit log — seeds the activity feed
  // ---------------------------------------------------------------------------

  await db.insert(auditLog).values([
    {
      actorName: david.name,
      action: 'marked milestone complete',
      targetType: 'milestone',
      targetLabel: 'HVAC annual service',
      clientId: andersons.id,
    },
    {
      actorName: david.name,
      action: 'marked milestone complete',
      targetType: 'milestone',
      targetLabel: 'Spring plumbing check',
      clientId: andersons.id,
    },
    {
      actorName: sarah.name,
      action: 'created project',
      targetType: 'project',
      targetLabel: 'Kitchen remodel',
      clientId: andersons.id,
    },
    {
      actorName: david.name,
      action: 'marked milestone complete',
      targetType: 'milestone',
      targetLabel: 'Final design walkthrough',
      clientId: andersons.id,
    },
    {
      actorName: david.name,
      action: 'marked milestone complete',
      targetType: 'milestone',
      targetLabel: 'Permit pulled',
      clientId: andersons.id,
    },
    {
      actorName: sarah.name,
      action: 'created project',
      targetType: 'project',
      targetLabel: 'Bathroom refresh',
      clientId: andersons.id,
    },
  ]);

  // ---------------------------------------------------------------------------
  // Summary
  // ---------------------------------------------------------------------------

  console.log('Seed complete.');
  console.log('  Properties: 2 (Larkin St, Tahoe cabin)');
  console.log('  Projects: 3 (Annual maintenance, Kitchen remodel, Bathroom refresh)');
  console.log('  Milestones: 31 (5 + 19 + 7)');
  console.log('  Photos: 7');
  console.log('  Appointments: 3');
  console.log('  Invoices: 1');
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });

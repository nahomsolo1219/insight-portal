// Populate the database with realistic test rows so every surface has
// something meaningful to render during demos and development.
//
// Usage: `npm run db:seed` — safe to re-run. Every row added by this script
// is cleared before inserting, so you always get the same starting state.
//
// Projects are instantiated FROM templates via applyTemplateToProject so the
// template editor and the live project timeline always agree on structure.
// Per-milestone state (status, due dates, vendors, decision responses) is
// layered on after instantiation.

import './_env'; // MUST be first — see scripts/_env.ts

import { and, eq, sql } from 'drizzle-orm';
import { db } from '../src/db';
import {
  appointments,
  auditLog,
  clients,
  invoices,
  membershipTiers,
  milestones,
  photos,
  projectTemplates,
  projects,
  properties,
  staff,
  templateMilestones,
  templatePhases,
  vendors,
} from '../src/db/schema';
import { applyTemplateToProject } from '../src/lib/templates/instantiate';

function localDateString(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

async function clearSeededTables() {
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
  // Templates — cascade handles template_milestones + template_phases
  await db.execute(sql`DELETE FROM template_milestones`);
  await db.execute(sql`DELETE FROM template_phase_dependencies`);
  await db.execute(sql`DELETE FROM template_phases`);
  await db.execute(sql`DELETE FROM project_templates`);
}

/** Look up a milestone by title on a project. Throws if not found. */
async function msId(projectId: string, title: string): Promise<string> {
  const [row] = await db
    .select({ id: milestones.id })
    .from(milestones)
    .where(and(eq(milestones.projectId, projectId), eq(milestones.title, title)))
    .limit(1);
  if (!row) throw new Error(`Milestone not found: "${title}" on project ${projectId}`);
  return row.id;
}

/** Patch a milestone by title on a project. */
async function patchMs(
  projectId: string,
  title: string,
  patch: Partial<typeof milestones.$inferInsert>,
) {
  const id = await msId(projectId, title);
  await db.update(milestones).set(patch).where(eq(milestones.id, id));
  return id;
}

// ==========================================================================

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

  await db.insert(staff).values({
    name: 'Mike Torres',
    role: 'field_staff',
    email: 'mike@insighthm.com',
    phone: '(415) 555-0102',
    status: 'active',
  });

  // ---------------------------------------------------------------------------
  // Vendors
  // ---------------------------------------------------------------------------

  const [bayAir] = await db.insert(vendors).values({ name: 'Bay Air Systems', category: 'HVAC', phone: '(415) 555-0200', email: 'service@bayair.com', active: true, jobsCompleted: 12 }).returning();
  const [sfPlumbing] = await db.insert(vendors).values({ name: 'SF Plumbing Co.', category: 'Plumbing', phone: '(415) 555-0201', email: 'dispatch@sfplumbing.com', active: true, jobsCompleted: 8 }).returning();
  const [bayElectric] = await db.insert(vendors).values({ name: 'Bay Electric', category: 'Electrical', phone: '(415) 555-0202', email: 'jobs@bayelectric.com', active: true, jobsCompleted: 6 }).returning();
  const [eliteTile] = await db.insert(vendors).values({ name: 'Elite Tile & Stone', category: 'Tile', phone: '(415) 555-0203', email: 'info@elitetile.com', active: true, jobsCompleted: 4 }).returning();
  const [bayAreaCabinets] = await db.insert(vendors).values({ name: 'Bay Area Cabinets', category: 'Cabinetry', phone: '(415) 555-0204', email: 'orders@bayareacabinets.com', active: true, jobsCompleted: 3 }).returning();

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
  // Properties
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

  // =========================================================================
  // TEMPLATES — created first so projects can instantiate from them
  // =========================================================================

  // --- Kitchen Remodel template (phase-based) ---
  const [kitchenTemplate] = await db
    .insert(projectTemplates)
    .values({ name: 'Kitchen remodel', type: 'remodel', description: 'Full kitchen renovation — custom cabinets, new tile, updated plumbing and electrical.', usesPhases: true })
    .returning();

  const kitchenPhases = await db
    .insert(templatePhases)
    .values([
      { templateId: kitchenTemplate.id, title: 'Pre-construction', order: 0 },
      { templateId: kitchenTemplate.id, title: 'Demolition', order: 1 },
      { templateId: kitchenTemplate.id, title: 'Rough-in', order: 2 },
      { templateId: kitchenTemplate.id, title: 'Cabinets & tile', order: 3 },
      { templateId: kitchenTemplate.id, title: 'Final', order: 4 },
    ])
    .returning();

  const kp = (title: string) => kitchenPhases.find((p) => p.title === title)!.id;

  await db.insert(templateMilestones).values([
    // Pre-construction
    { templateId: kitchenTemplate.id, phaseId: kp('Pre-construction'), title: 'Final design walkthrough', order: 0, description: 'Walk site with designer, confirm layout and material selections.' },
    { templateId: kitchenTemplate.id, phaseId: kp('Pre-construction'), title: 'Permit pulled', order: 1 },
    { templateId: kitchenTemplate.id, phaseId: kp('Pre-construction'), title: 'Select backsplash tile', order: 2, isDecisionPoint: true, decisionType: 'single', decisionQuestion: "We're ready to order tile. Which option would you like?", decisionOptions: ['White subway', 'Hex marble', 'Slate grey', 'Penny round'] },
    { templateId: kitchenTemplate.id, phaseId: kp('Pre-construction'), title: 'Approve faucet finish', order: 3, isDecisionPoint: true, decisionType: 'single', decisionQuestion: 'Please confirm your preferred faucet finish for the kitchen sink.', decisionOptions: ['Brushed nickel', 'Matte black', 'Polished chrome'] },
    // Demolition
    { templateId: kitchenTemplate.id, phaseId: kp('Demolition'), title: 'Existing cabinets removed', order: 0 },
    { templateId: kitchenTemplate.id, phaseId: kp('Demolition'), title: 'Old flooring removed', order: 1 },
    { templateId: kitchenTemplate.id, phaseId: kp('Demolition'), title: 'Demo old tile and prep walls', order: 2 },
    // Rough-in
    { templateId: kitchenTemplate.id, phaseId: kp('Rough-in'), title: 'Plumbing rough-in', order: 0 },
    { templateId: kitchenTemplate.id, phaseId: kp('Rough-in'), title: 'Electrical updates', order: 1 },
    { templateId: kitchenTemplate.id, phaseId: kp('Rough-in'), title: 'Inspection', order: 2, description: 'City inspector — schedule 48h in advance.' },
    { templateId: kitchenTemplate.id, phaseId: kp('Rough-in'), title: 'Approve cabinet stain color', order: 3, isDecisionPoint: true, decisionType: 'single', decisionQuestion: 'Cabinets are ready for finishing. Which stain would you like?', decisionOptions: ['Walnut', 'Honey oak', 'Espresso'] },
    { templateId: kitchenTemplate.id, phaseId: kp('Rough-in'), title: 'Confirm cabinet hardware', order: 4, isDecisionPoint: true, decisionType: 'single', decisionQuestion: 'Choose your cabinet hardware style.', decisionOptions: ['Matte black pulls', 'Brushed brass knobs', 'Stainless bar pulls'] },
    // Cabinets & tile
    { templateId: kitchenTemplate.id, phaseId: kp('Cabinets & tile'), title: 'Install new tile backsplash', order: 0 },
    { templateId: kitchenTemplate.id, phaseId: kp('Cabinets & tile'), title: 'Cabinet install', order: 1 },
    { templateId: kitchenTemplate.id, phaseId: kp('Cabinets & tile'), title: 'Countertop template & fabrication', order: 2 },
    // Final
    { templateId: kitchenTemplate.id, phaseId: kp('Final'), title: 'Plumbing fixtures install', order: 0 },
    { templateId: kitchenTemplate.id, phaseId: kp('Final'), title: 'Final paint touch-ups', order: 1 },
    { templateId: kitchenTemplate.id, phaseId: kp('Final'), title: 'Punch list walkthrough', order: 2, description: 'Walk every room with the homeowner. Document any remaining items.' },
    { templateId: kitchenTemplate.id, phaseId: kp('Final'), title: 'Project handoff', order: 3, description: 'Final walkthrough, warranty documents, and keys.' },
  ]);

  // --- Bathroom Refresh template (phase-based) ---
  const [bathroomTemplate] = await db
    .insert(projectTemplates)
    .values({ name: 'Bathroom refresh', type: 'remodel', description: 'Guest bathroom update — new vanity, tile, and fixtures.', usesPhases: true })
    .returning();

  const bathroomPhases = await db
    .insert(templatePhases)
    .values([
      { templateId: bathroomTemplate.id, title: 'Planning', order: 0 },
      { templateId: bathroomTemplate.id, title: 'Demolition', order: 1 },
      { templateId: bathroomTemplate.id, title: 'Rough-in', order: 2 },
      { templateId: bathroomTemplate.id, title: 'Install', order: 3 },
      { templateId: bathroomTemplate.id, title: 'Completion', order: 4 },
    ])
    .returning();

  const bp = (title: string) => bathroomPhases.find((p) => p.title === title)!.id;

  await db.insert(templateMilestones).values([
    { templateId: bathroomTemplate.id, phaseId: bp('Planning'), title: 'Design finalized', order: 0 },
    { templateId: bathroomTemplate.id, phaseId: bp('Planning'), title: 'Materials ordered', order: 1, description: 'Vanity (4-week lead time), tile, fixtures.' },
    { templateId: bathroomTemplate.id, phaseId: bp('Demolition'), title: 'Demo existing bathroom', order: 0 },
    { templateId: bathroomTemplate.id, phaseId: bp('Rough-in'), title: 'Plumbing rough-in', order: 0 },
    { templateId: bathroomTemplate.id, phaseId: bp('Install'), title: 'Tile installation', order: 0 },
    { templateId: bathroomTemplate.id, phaseId: bp('Install'), title: 'Vanity & fixtures install', order: 1 },
    { templateId: bathroomTemplate.id, phaseId: bp('Completion'), title: 'Final walkthrough', order: 0 },
  ]);

  // --- Annual Maintenance template (phase-based) ---
  const [maintenanceTemplate] = await db
    .insert(projectTemplates)
    .values({ name: 'Annual maintenance plan', type: 'maintenance', description: 'Year-long comprehensive home care — quarterly inspections across HVAC, plumbing, and electrical.', usesPhases: true })
    .returning();

  const maintenancePhases = await db
    .insert(templatePhases)
    .values([
      { templateId: maintenanceTemplate.id, title: 'HVAC', order: 0 },
      { templateId: maintenanceTemplate.id, title: 'Plumbing', order: 1 },
      { templateId: maintenanceTemplate.id, title: 'Electrical', order: 2 },
    ])
    .returning();

  const mp = (title: string) => maintenancePhases.find((p) => p.title === title)!.id;

  await db.insert(templateMilestones).values([
    { templateId: maintenanceTemplate.id, phaseId: mp('HVAC'), title: 'HVAC annual service', order: 0 },
    { templateId: maintenanceTemplate.id, phaseId: mp('Plumbing'), title: 'Spring plumbing check', order: 0 },
    { templateId: maintenanceTemplate.id, phaseId: mp('HVAC'), title: 'Summer system inspection', order: 1, description: 'Full AC performance check before peak heat.' },
    { templateId: maintenanceTemplate.id, phaseId: mp('Electrical'), title: 'Fall electrical & weatherization', order: 0, description: 'Panel inspection, outdoor outlet covers, window seal check.' },
    { templateId: maintenanceTemplate.id, phaseId: mp('HVAC'), title: 'Winter system check', order: 2, description: 'Heating system tune-up and filter replacement.' },
  ]);

  console.log('  Templates: 3 (Kitchen remodel, Bathroom refresh, Annual maintenance)');

  // =========================================================================
  // PROJECTS — created then instantiated from templates
  // =========================================================================

  const [annualPlan] = await db
    .insert(projects)
    .values({ propertyId: larkinSt.id, name: 'Annual maintenance plan 2026', type: 'maintenance', status: 'active', startDate: '2026-01-01', endDate: '2026-12-31', progress: 0, description: 'Year-long comprehensive home care' })
    .returning();

  const [kitchenRemodel] = await db
    .insert(projects)
    .values({ propertyId: larkinSt.id, name: 'Kitchen remodel', type: 'remodel', status: 'active', startDate: '2026-03-10', endDate: '2026-07-15', progress: 0, description: 'Full kitchen renovation — custom cabinets, new tile, updated plumbing and electrical.', contractCents: 18500000, changesCents: 1240000, paidCents: 7896000 })
    .returning();

  const [bathroomRefresh] = await db
    .insert(projects)
    .values({ propertyId: tahoeCabin.id, name: 'Bathroom refresh', type: 'remodel', status: 'active', startDate: '2026-05-01', endDate: '2026-07-30', progress: 0, description: 'Guest bathroom update — new vanity, tile, and fixtures.', contractCents: 4200000, changesCents: 0, paidCents: 1050000 })
    .returning();

  // --- Instantiate from templates ---
  console.log('  Instantiating milestones from templates...');
  await applyTemplateToProject(annualPlan.id, maintenanceTemplate.id);
  await applyTemplateToProject(kitchenRemodel.id, kitchenTemplate.id);
  await applyTemplateToProject(bathroomRefresh.id, bathroomTemplate.id);

  // =========================================================================
  // LAYER ON per-milestone state (applyTemplateToProject sets all to
  // pending/upcoming — we now set real statuses, dates, vendors, responses)
  // =========================================================================

  // --- Annual Maintenance Plan ---
  await patchMs(annualPlan.id, 'HVAC annual service', { status: 'complete', dueDate: '2026-01-15', vendorId: bayAir.id });
  await patchMs(annualPlan.id, 'Spring plumbing check', { status: 'complete', dueDate: '2026-04-20', vendorId: sfPlumbing.id });
  await patchMs(annualPlan.id, 'Summer system inspection', { dueDate: '2026-07-20', vendorId: bayAir.id });
  await patchMs(annualPlan.id, 'Fall electrical & weatherization', { dueDate: '2026-10-15', vendorId: bayElectric.id });
  await patchMs(annualPlan.id, 'Winter system check', { dueDate: '2026-12-15', vendorId: bayAir.id });
  await db.update(projects).set({ progress: 40 }).where(eq(projects.id, annualPlan.id)); // 2/5

  // --- Kitchen Remodel ---
  // Pre-construction
  await patchMs(kitchenRemodel.id, 'Final design walkthrough', { status: 'complete', dueDate: '2026-04-05' });
  await patchMs(kitchenRemodel.id, 'Permit pulled', { status: 'complete', dueDate: '2026-04-08' });
  await patchMs(kitchenRemodel.id, 'Select backsplash tile', {
    status: 'awaiting_client', dueDate: '2026-04-18',
    clientResponse: 'White subway', respondedAt: new Date('2026-04-18T14:30:00Z'),
  });
  await patchMs(kitchenRemodel.id, 'Approve faucet finish', {
    status: 'awaiting_client', dueDate: '2026-04-22',
    clientResponse: 'Brushed nickel', respondedAt: new Date('2026-04-22T10:15:00Z'),
  });
  // Demolition
  await patchMs(kitchenRemodel.id, 'Existing cabinets removed', { status: 'complete', dueDate: '2026-05-05', vendorId: bayAreaCabinets.id });
  await patchMs(kitchenRemodel.id, 'Old flooring removed', { status: 'complete', dueDate: '2026-05-06' });
  await patchMs(kitchenRemodel.id, 'Demo old tile and prep walls', {
    status: 'in_progress', dueDate: '2026-05-12', vendorId: eliteTile.id,
    notes: 'Target completion May 15. Dust barriers in place.',
  });
  // Rough-in
  await patchMs(kitchenRemodel.id, 'Plumbing rough-in', { dueDate: '2026-05-20', vendorId: sfPlumbing.id });
  await patchMs(kitchenRemodel.id, 'Electrical updates', { dueDate: '2026-05-24', vendorId: bayElectric.id });
  await patchMs(kitchenRemodel.id, 'Inspection', { dueDate: '2026-05-27' });
  await patchMs(kitchenRemodel.id, 'Approve cabinet stain color', { status: 'awaiting_client', dueDate: '2026-05-28' });
  await patchMs(kitchenRemodel.id, 'Confirm cabinet hardware', {
    status: 'awaiting_client', dueDate: '2026-05-01',
    clientResponse: 'Matte black pulls', respondedAt: new Date('2026-05-01T16:00:00Z'),
  });
  // Cabinets & tile
  await patchMs(kitchenRemodel.id, 'Install new tile backsplash', { dueDate: '2026-06-04', vendorId: eliteTile.id });
  await patchMs(kitchenRemodel.id, 'Cabinet install', { dueDate: '2026-06-12', vendorId: bayAreaCabinets.id });
  await patchMs(kitchenRemodel.id, 'Countertop template & fabrication', { dueDate: '2026-06-17' });
  // Final
  await patchMs(kitchenRemodel.id, 'Plumbing fixtures install', { dueDate: '2026-06-24', vendorId: sfPlumbing.id });
  await patchMs(kitchenRemodel.id, 'Final paint touch-ups', { dueDate: '2026-06-28' });
  await patchMs(kitchenRemodel.id, 'Punch list walkthrough', { dueDate: '2026-07-05' });
  await patchMs(kitchenRemodel.id, 'Project handoff', { dueDate: '2026-07-15' });
  // 6 of 19 complete (4 work + 2 responded decisions count as "done" visually but
  // status stays awaiting_client). Using 6/19 non-decision complete = ~31%.
  await db.update(projects).set({ progress: 35 }).where(eq(projects.id, kitchenRemodel.id));

  // --- Bathroom Refresh ---
  await patchMs(bathroomRefresh.id, 'Design finalized', { status: 'complete', dueDate: '2026-05-05' });
  await patchMs(bathroomRefresh.id, 'Materials ordered', { dueDate: '2026-05-10' });
  await patchMs(bathroomRefresh.id, 'Demo existing bathroom', { dueDate: '2026-06-02' });
  await patchMs(bathroomRefresh.id, 'Plumbing rough-in', { dueDate: '2026-06-08', vendorId: sfPlumbing.id });
  await patchMs(bathroomRefresh.id, 'Tile installation', { dueDate: '2026-06-18', vendorId: eliteTile.id });
  await patchMs(bathroomRefresh.id, 'Vanity & fixtures install', { dueDate: '2026-07-01', vendorId: sfPlumbing.id });
  await patchMs(bathroomRefresh.id, 'Final walkthrough', { dueDate: '2026-07-15' });
  await db.update(projects).set({ progress: 14 }).where(eq(projects.id, bathroomRefresh.id)); // 1/7

  // =========================================================================
  // Photos — linked to specific milestones by title lookup
  // =========================================================================

  const kitchenDesignId = await msId(kitchenRemodel.id, 'Final design walkthrough');
  const kitchenCabinetsId = await msId(kitchenRemodel.id, 'Existing cabinets removed');
  const kitchenFlooringId = await msId(kitchenRemodel.id, 'Old flooring removed');
  const kitchenTileDemoId = await msId(kitchenRemodel.id, 'Demo old tile and prep walls');
  const bathroomDesignId = await msId(bathroomRefresh.id, 'Design finalized');

  await db.insert(photos).values([
    { propertyId: larkinSt.id, projectId: kitchenRemodel.id, milestoneId: kitchenDesignId, tag: 'before', category: 'Kitchen', caption: 'Existing kitchen — north wall', status: 'categorized', storagePath: `photos/${andersons.id}/${larkinSt.id}/seed-kitchen-before-1.jpg` },
    { propertyId: larkinSt.id, projectId: kitchenRemodel.id, milestoneId: kitchenDesignId, tag: 'before', category: 'Kitchen', caption: 'Existing kitchen — south wall and island', status: 'categorized', storagePath: `photos/${andersons.id}/${larkinSt.id}/seed-kitchen-before-2.jpg` },
    { propertyId: larkinSt.id, projectId: kitchenRemodel.id, milestoneId: kitchenCabinetsId, tag: 'during', category: 'Kitchen', caption: 'Cabinets removed — framing exposed', status: 'categorized', storagePath: `photos/${andersons.id}/${larkinSt.id}/seed-kitchen-demo-1.jpg` },
    { propertyId: larkinSt.id, projectId: kitchenRemodel.id, milestoneId: kitchenFlooringId, tag: 'during', category: 'Kitchen', caption: 'Flooring removed — subfloor prep', status: 'categorized', storagePath: `photos/${andersons.id}/${larkinSt.id}/seed-kitchen-demo-2.jpg` },
    { propertyId: larkinSt.id, projectId: kitchenRemodel.id, milestoneId: kitchenTileDemoId, tag: 'during', category: 'Kitchen', caption: 'Wall tile removal in progress', status: 'categorized', storagePath: `photos/${andersons.id}/${larkinSt.id}/seed-kitchen-tile-demo-1.jpg` },
    { propertyId: tahoeCabin.id, projectId: bathroomRefresh.id, milestoneId: bathroomDesignId, tag: 'before', category: 'Bathroom', caption: 'Existing guest bathroom', status: 'categorized', storagePath: `photos/${andersons.id}/${tahoeCabin.id}/seed-bathroom-before-1.jpg` },
    { propertyId: tahoeCabin.id, projectId: bathroomRefresh.id, milestoneId: bathroomDesignId, tag: 'before', category: 'Bathroom', caption: 'Existing vanity and mirror', status: 'categorized', storagePath: `photos/${andersons.id}/${tahoeCabin.id}/seed-bathroom-before-2.jpg` },
  ]);

  // =========================================================================
  // Appointments
  // =========================================================================

  await db.insert(appointments).values({
    propertyId: larkinSt.id, projectId: annualPlan.id, title: 'HVAC filter replacement',
    vendorId: bayAir.id, date: localDateString(), startTime: '09:00:00', endTime: '10:00:00',
    status: 'confirmed', davidOnSite: true, scopeOfWork: 'Replace main filter, inspect compressor.',
    assignedPmId: david.id,
  });

  const inFiveDays = new Date();
  inFiveDays.setDate(inFiveDays.getDate() + 5);
  await db.insert(appointments).values({
    propertyId: larkinSt.id, projectId: kitchenRemodel.id, title: 'Tile prep site check',
    vendorId: eliteTile.id, date: localDateString(inFiveDays), startTime: '10:00:00', endTime: '11:30:00',
    status: 'scheduled', davidOnSite: false, scopeOfWork: 'Verify wall prep is ready for tile. Confirm layout.',
    assignedPmId: sarah.id,
  });

  const inTenDays = new Date();
  inTenDays.setDate(inTenDays.getDate() + 10);
  await db.insert(appointments).values({
    propertyId: tahoeCabin.id, projectId: bathroomRefresh.id, title: 'Pre-demo measurement check',
    date: localDateString(inTenDays), startTime: '14:00:00', endTime: '15:00:00',
    status: 'scheduled', davidOnSite: true, scopeOfWork: 'Final measurements before demo starts.',
    assignedPmId: david.id,
  });

  // =========================================================================
  // Invoices
  // =========================================================================

  const inTwoWeeks = new Date();
  inTwoWeeks.setDate(inTwoWeeks.getDate() + 14);
  await db.insert(invoices).values({
    clientId: andersons.id, propertyId: larkinSt.id, projectId: kitchenRemodel.id,
    invoiceNumber: '#0042', description: 'Kitchen remodel — draw 2',
    amountCents: 4625000, invoiceDate: localDateString(), dueDate: localDateString(inTwoWeeks),
    status: 'unpaid', storagePath: 'invoices/placeholder.pdf',
  });

  // =========================================================================
  // Audit log
  // =========================================================================

  await db.insert(auditLog).values([
    { actorName: david.name, action: 'marked milestone complete', targetType: 'milestone', targetLabel: 'HVAC annual service', clientId: andersons.id },
    { actorName: david.name, action: 'marked milestone complete', targetType: 'milestone', targetLabel: 'Spring plumbing check', clientId: andersons.id },
    { actorName: sarah.name, action: 'created project', targetType: 'project', targetLabel: 'Kitchen remodel', clientId: andersons.id },
    { actorName: david.name, action: 'marked milestone complete', targetType: 'milestone', targetLabel: 'Final design walkthrough', clientId: andersons.id },
    { actorName: david.name, action: 'marked milestone complete', targetType: 'milestone', targetLabel: 'Permit pulled', clientId: andersons.id },
    { actorName: sarah.name, action: 'created project', targetType: 'project', targetLabel: 'Bathroom refresh', clientId: andersons.id },
  ]);

  // =========================================================================
  // Summary
  // =========================================================================

  console.log('Seed complete.');
  console.log('  Properties: 2 (Larkin St, Tahoe cabin)');
  console.log('  Templates: 3 (Kitchen remodel, Bathroom refresh, Annual maintenance)');
  console.log('  Projects: 3 (instantiated from templates)');
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

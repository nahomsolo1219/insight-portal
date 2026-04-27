// Drizzle schema for the Insight HM admin portal.
//
// Conventions:
//   - All ids are uuid with defaultRandom().
//   - Every table has createdAt + updatedAt (timestamp, notNull, defaultNow).
//   - Money is stored as integer cents to avoid float drift; convert at the UI edge.
//   - Foreign keys use onDelete: 'cascade' where the child has no meaning without
//     the parent (property/project/milestone chain, weekly_updates,
//     template_milestones, documents). Optional or audit-style FKs are left as
//     restrict-default so rows aren't silently lost.
//
// Auth.users is owned by Supabase Auth; we mirror it as `authUsers` only so we
// can declare a real foreign key from `profiles.id`. Drizzle won't try to
// migrate the auth schema.

import { relations, sql } from 'drizzle-orm';
import {
  boolean,
  date,
  integer,
  index,
  jsonb,
  numeric,
  pgEnum,
  pgSchema,
  pgTable,
  primaryKey,
  text,
  time,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

// ---------- External: Supabase auth.users ----------

const authSchema = pgSchema('auth');
export const authUsers = authSchema.table('users', {
  id: uuid('id').primaryKey(),
});

// ---------- Enums ----------

export const userRoleEnum = pgEnum('user_role', ['admin', 'client', 'field_staff']);
export const projectTypeEnum = pgEnum('project_type', ['maintenance', 'remodel']);
export const projectStatusEnum = pgEnum('project_status', ['active', 'completed', 'on_hold']);
export const milestoneStatusEnum = pgEnum('milestone_status', [
  'complete',
  'in_progress',
  'upcoming',
  'pending',
  'awaiting_client',
]);
export const appointmentStatusEnum = pgEnum('appointment_status', [
  'scheduled',
  'confirmed',
  'completed',
  'cancelled',
]);
export const photoStatusEnum = pgEnum('photo_status', ['pending', 'categorized', 'rejected']);
export const photoTagEnum = pgEnum('photo_tag', ['before', 'during', 'after']);
export const invoiceStatusEnum = pgEnum('invoice_status', ['paid', 'unpaid', 'partial']);
export const questionTypeEnum = pgEnum('question_type', [
  'single',
  'multi',
  'approval',
  'open',
  'acknowledge',
]);
// `field_lead` and `field_tech` were collapsed to a single `field_staff`
// HR role in migration 0007 — the auth role enum already only had one
// `field_staff` value, so the distinction was generating noise without a
// payoff. Old rows are migrated in the same migration.
export const staffRoleEnum = pgEnum('staff_role', [
  'founder',
  'project_manager',
  'field_staff',
  'admin_assistant',
]);
export const staffStatusEnum = pgEnum('staff_status', ['active', 'pending', 'inactive']);
export const vendorDocumentTypeEnum = pgEnum('vendor_document_type', [
  'insurance',
  'w9',
  'license',
  'contract',
  'certificate',
  'other',
]);

// ---------- Shared timestamp columns ----------

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
};

// ---------- Tables ----------
// Order: tables with no FKs first, then dependents. The ordering only matters
// for readability — Drizzle resolves dependencies on its own.

// staff (referenced by profiles, clients, weekly_updates, etc.)
export const staff = pgTable('staff', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  role: staffRoleEnum('role').notNull(),
  email: text('email').notNull(),
  phone: text('phone'),
  status: staffStatusEnum('status').notNull().default('active'),
  ...timestamps,
}, (table) => ({
  emailIdx: uniqueIndex('staff_email_idx').on(table.email),
}));

// membership_tiers (referenced by clients)
export const membershipTiers = pgTable('membership_tiers', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  annualPriceCents: integer('annual_price_cents').notNull(),
  description: text('description'),
  ...timestamps,
});

// clients
export const clients = pgTable('clients', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  // email + phone are optional — for the wealthiest HNW clients the household
  // office sometimes handles every inbound channel. Keep these nullable so an
  // empty contact field persists as NULL (queryable) rather than '' (looks
  // valid but breaks mailto:/tel: links).
  email: text('email'),
  phone: text('phone'),
  membershipTierId: uuid('membership_tier_id').references(() => membershipTiers.id, {
    onDelete: 'set null',
  }),
  assignedPmId: uuid('assigned_pm_id').references(() => staff.id, {
    onDelete: 'set null',
  }),
  memberSince: date('member_since'),
  status: text('status').notNull().default('active'),
  /** Storage path (not a URL) — sign at read time to render. The client
   *  represents the household, so the avatar belongs on the client row
   *  rather than on a single profile. Profile avatars (admin / staff)
   *  live on `profiles.avatarUrl` (legacy column name; also a path). */
  avatarStoragePath: text('avatar_storage_path'),
  ...timestamps,
});

// profiles — links a Supabase auth.users row to its role and (for clients/staff)
// to the corresponding domain row.
export const profiles = pgTable('profiles', {
  id: uuid('id')
    .primaryKey()
    .references(() => authUsers.id, { onDelete: 'cascade' }),
  email: text('email').notNull(),
  fullName: text('full_name'),
  role: userRoleEnum('role').notNull(),
  phone: text('phone'),
  avatarUrl: text('avatar_url'),
  clientId: uuid('client_id').references(() => clients.id, { onDelete: 'set null' }),
  staffId: uuid('staff_id').references(() => staff.id, { onDelete: 'set null' }),
  ...timestamps,
});

// properties
export const properties = pgTable('properties', {
  id: uuid('id').primaryKey().defaultRandom(),
  clientId: uuid('client_id')
    .notNull()
    .references(() => clients.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  address: text('address').notNull(),
  city: text('city'),
  state: text('state'),
  zipcode: text('zipcode'),
  sqft: integer('sqft'),
  yearBuilt: integer('year_built'),
  gateCode: text('gate_code'),
  accessNotes: text('access_notes'),
  emergencyContact: text('emergency_contact'),
  ...timestamps,
});

// vendors
export const vendors = pgTable('vendors', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  category: text('category').notNull(),
  phone: text('phone'),
  email: text('email'),
  active: boolean('active').notNull().default(true),
  jobsCompleted: integer('jobs_completed').notNull().default(0),
  notes: text('notes'),
  ...timestamps,
});

// vendor_documents — admin-uploaded paperwork (insurance, W-9, licenses)
// per vendor. Cascades on vendor delete so we don't strand orphan rows;
// the storage objects themselves stay until the cleanup helper runs.
export const vendorDocuments = pgTable('vendor_documents', {
  id: uuid('id').primaryKey().defaultRandom(),
  vendorId: uuid('vendor_id')
    .notNull()
    .references(() => vendors.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  type: vendorDocumentTypeEnum('type').notNull(),
  storagePath: text('storage_path').notNull(),
  /** Insurance + license docs expire — populated for those types, null
   *  for W-9 / contract / certificate / other. UI surfaces a colour-coded
   *  status badge derived from this date. */
  expirationDate: date('expiration_date'),
  notes: text('notes'),
  ...timestamps,
});

// project_templates
export const projectTemplates = pgTable('project_templates', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  type: projectTypeEnum('type').notNull(),
  description: text('description'),
  duration: text('duration'),
  // When true, milestones belong to phases (new visual builder model).
  // When false, milestones hang directly off the template (legacy flat list).
  // Lets existing templates keep working while new ones adopt phases.
  usesPhases: boolean('uses_phases').notNull().default(false),
  ...timestamps,
});

// template_phases — ordered groups of milestones shown as sections on the
// client-facing timeline. Only populated when the parent template has
// `uses_phases = true`.
export const templatePhases = pgTable('template_phases', {
  id: uuid('id').primaryKey().defaultRandom(),
  templateId: uuid('template_id')
    .notNull()
    .references(() => projectTemplates.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  /** Client-facing description shown on the portal timeline for this phase. */
  description: text('description'),
  order: integer('order').notNull().default(0),
  /** Human-readable: "2 weeks", "3-4 days" — free text for display. */
  estimatedDuration: text('estimated_duration'),
  /** Numeric duration for scheduling math (e.g. auto-set milestone due dates). */
  estimatedDays: integer('estimated_days'),
  /** Photo docs expected during this phase: 'none' | 'before_after' | 'before_during_after' | 'during_only'. */
  photoDocumentation: text('photo_documentation').default('before_during_after'),
  ...timestamps,
});

// template_phase_dependencies — phase-to-phase "can't start until X is
// complete" edges. Stored as a separate table so a phase can depend on
// multiple predecessors and the builder UI can render a proper DAG.
export const templatePhaseDependencies = pgTable('template_phase_dependencies', {
  id: uuid('id').primaryKey().defaultRandom(),
  phaseId: uuid('phase_id')
    .notNull()
    .references(() => templatePhases.id, { onDelete: 'cascade' }),
  dependsOnPhaseId: uuid('depends_on_phase_id')
    .notNull()
    .references(() => templatePhases.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// template_milestones
export const templateMilestones = pgTable('template_milestones', {
  id: uuid('id').primaryKey().defaultRandom(),
  templateId: uuid('template_id')
    .notNull()
    .references(() => projectTemplates.id, { onDelete: 'cascade' }),
  // Set only for phase-based templates. Null for legacy flat milestones.
  // Cascade delete so rewriting a phase's milestones (delete-and-reinsert)
  // stays clean.
  phaseId: uuid('phase_id').references(() => templatePhases.id, {
    onDelete: 'cascade',
  }),
  title: text('title').notNull(),
  category: text('category'),
  offset: text('offset'),
  order: integer('order').notNull().default(0),
  /** Optional admin-facing detail for the milestone. */
  description: text('description'),
  /** Flags a milestone as a client-decision gate (same shape as `milestones.questionType` on live projects). */
  isDecisionPoint: boolean('is_decision_point').notNull().default(false),
  decisionQuestion: text('decision_question'),
  decisionType: questionTypeEnum('decision_type'),
  /** Canonical shape: string[] for single/multi questions; null for approval/open/acknowledge. */
  decisionOptions: jsonb('decision_options'),
  ...timestamps,
});

// projects
export const projects = pgTable('projects', {
  id: uuid('id').primaryKey().defaultRandom(),
  propertyId: uuid('property_id')
    .notNull()
    .references(() => properties.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  type: projectTypeEnum('type').notNull(),
  status: projectStatusEnum('status').notNull().default('active'),
  startDate: date('start_date'),
  endDate: date('end_date'),
  progress: integer('progress').notNull().default(0),
  description: text('description'),
  contractCents: integer('contract_cents'),
  changesCents: integer('changes_cents').notNull().default(0),
  paidCents: integer('paid_cents').notNull().default(0),
  ...timestamps,
});

// project_assignments — many-to-many between projects and field-staff
// users (profiles.id == auth.users.id). Drives what each technician can
// see in the field app: properties surface only when they have at least
// one assigned project on them. Composite PK prevents duplicate
// assignments; index on userId speeds the field-side scoping queries.
export const projectAssignments = pgTable(
  'project_assignments',
  {
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    assignedAt: timestamp('assigned_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.projectId, t.userId] }),
    index('project_assignments_user_id_idx').on(t.userId),
  ],
);

// milestones
export const milestones = pgTable('milestones', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  category: text('category'),
  dueDate: date('due_date'),
  status: milestoneStatusEnum('status').notNull().default('pending'),
  vendorId: uuid('vendor_id').references(() => vendors.id, { onDelete: 'set null' }),
  notes: text('notes'),
  order: integer('order').notNull().default(0),
  // Decision-oriented fields — only populated when status = awaiting_client
  questionType: questionTypeEnum('question_type'),
  questionBody: text('question_body'),
  options: jsonb('options'),
  clientResponse: text('client_response'),
  respondedAt: timestamp('responded_at', { withTimezone: true }),
  respondedBy: uuid('responded_by').references(() => profiles.id, { onDelete: 'set null' }),
  ...timestamps,
});

// appointments
export const appointments = pgTable('appointments', {
  id: uuid('id').primaryKey().defaultRandom(),
  propertyId: uuid('property_id')
    .notNull()
    .references(() => properties.id, { onDelete: 'cascade' }),
  projectId: uuid('project_id').references(() => projects.id, { onDelete: 'set null' }),
  milestoneId: uuid('milestone_id').references(() => milestones.id, {
    onDelete: 'set null',
  }),
  title: text('title').notNull(),
  vendorId: uuid('vendor_id').references(() => vendors.id, { onDelete: 'set null' }),
  date: date('date').notNull(),
  startTime: time('start_time'),
  endTime: time('end_time'),
  status: appointmentStatusEnum('status').notNull().default('scheduled'),
  davidOnSite: boolean('david_on_site').notNull().default(false),
  scopeOfWork: text('scope_of_work'),
  assignedPmId: uuid('assigned_pm_id').references(() => staff.id, { onDelete: 'set null' }),
  ...timestamps,
});

// photos
export const photos = pgTable('photos', {
  id: uuid('id').primaryKey().defaultRandom(),
  propertyId: uuid('property_id').references(() => properties.id, { onDelete: 'set null' }),
  projectId: uuid('project_id').references(() => projects.id, { onDelete: 'set null' }),
  milestoneId: uuid('milestone_id').references(() => milestones.id, {
    onDelete: 'set null',
  }),
  appointmentId: uuid('appointment_id').references(() => appointments.id, {
    onDelete: 'set null',
  }),
  uploadedByUserId: uuid('uploaded_by_user_id').references(() => profiles.id, {
    onDelete: 'set null',
  }),
  uploadedByName: text('uploaded_by_name'),
  uploadedAt: timestamp('uploaded_at', { withTimezone: true }).defaultNow().notNull(),
  gpsLat: numeric('gps_lat'),
  gpsLng: numeric('gps_lng'),
  // Reading accuracy in meters at the moment of capture. Stored alongside
  // the coords so we can later debug bad pins without re-shooting them.
  // Field upload writes this when a fix arrives with accuracy ≤ 100m.
  gpsAccuracy: numeric('gps_accuracy', { precision: 8, scale: 2 }),
  tag: photoTagEnum('tag'),
  category: text('category'),
  caption: text('caption'),
  status: photoStatusEnum('status').notNull().default('pending'),
  storagePath: text('storage_path').notNull(),
  ...timestamps,
});

// reports
export const reports = pgTable('reports', {
  id: uuid('id').primaryKey().defaultRandom(),
  propertyId: uuid('property_id')
    .notNull()
    .references(() => properties.id, { onDelete: 'cascade' }),
  projectId: uuid('project_id').references(() => projects.id, { onDelete: 'set null' }),
  appointmentId: uuid('appointment_id').references(() => appointments.id, {
    onDelete: 'set null',
  }),
  name: text('name').notNull(),
  date: date('date').notNull(),
  vendorId: uuid('vendor_id').references(() => vendors.id, { onDelete: 'set null' }),
  type: text('type').notNull(),
  storagePath: text('storage_path').notNull(),
  isNew: boolean('is_new').notNull().default(true),
  ...timestamps,
});

// documents
export const documents = pgTable('documents', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  date: date('date').notNull(),
  type: text('type').notNull(),
  storagePath: text('storage_path').notNull(),
  ...timestamps,
});

// invoices
export const invoices = pgTable('invoices', {
  id: uuid('id').primaryKey().defaultRandom(),
  clientId: uuid('client_id')
    .notNull()
    .references(() => clients.id, { onDelete: 'cascade' }),
  propertyId: uuid('property_id').references(() => properties.id, { onDelete: 'set null' }),
  projectId: uuid('project_id').references(() => projects.id, { onDelete: 'set null' }),
  invoiceNumber: text('invoice_number').notNull(),
  description: text('description'),
  amountCents: integer('amount_cents').notNull(),
  invoiceDate: date('invoice_date').notNull(),
  dueDate: date('due_date').notNull(),
  status: invoiceStatusEnum('status').notNull().default('unpaid'),
  storagePath: text('storage_path').notNull(),
  ...timestamps,
});

// weekly_updates
export const weeklyUpdates = pgTable('weekly_updates', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  weekOf: date('week_of').notNull(),
  authorId: uuid('author_id').references(() => staff.id, { onDelete: 'set null' }),
  note: text('note').notNull(),
  ...timestamps,
});

// audit_log — append-only, no updatedAt
export const auditLog = pgTable('audit_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  actorId: uuid('actor_id').references(() => profiles.id, { onDelete: 'set null' }),
  actorName: text('actor_name'),
  action: text('action').notNull(),
  targetType: text('target_type'),
  targetId: uuid('target_id'),
  targetLabel: text('target_label'),
  clientId: uuid('client_id').references(() => clients.id, { onDelete: 'set null' }),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// email_templates
export const emailTemplates = pgTable('email_templates', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  subject: text('subject').notNull(),
  body: text('body').notNull(),
  lastEditedBy: uuid('last_edited_by').references(() => staff.id, { onDelete: 'set null' }),
  ...timestamps,
});

// ---------- Relations ----------
// Drizzle's `relations()` are runtime metadata for the query API
// (db.query.x.findMany({ with: { ... } })). They do not create FKs — those
// live on the column definitions above.

export const profilesRelations = relations(profiles, ({ one, many }) => ({
  client: one(clients, {
    fields: [profiles.clientId],
    references: [clients.id],
  }),
  staff: one(staff, {
    fields: [profiles.staffId],
    references: [staff.id],
  }),
  uploadedPhotos: many(photos),
  decisionResponses: many(milestones, { relationName: 'milestone_responder' }),
  auditEntries: many(auditLog),
}));

export const staffRelations = relations(staff, ({ many }) => ({
  profiles: many(profiles),
  assignedClients: many(clients),
  assignedAppointments: many(appointments),
  weeklyUpdatesAuthored: many(weeklyUpdates),
  emailTemplatesEdited: many(emailTemplates),
}));

export const membershipTiersRelations = relations(membershipTiers, ({ many }) => ({
  clients: many(clients),
}));

export const clientsRelations = relations(clients, ({ one, many }) => ({
  membershipTier: one(membershipTiers, {
    fields: [clients.membershipTierId],
    references: [membershipTiers.id],
  }),
  assignedPm: one(staff, {
    fields: [clients.assignedPmId],
    references: [staff.id],
  }),
  properties: many(properties),
  invoices: many(invoices),
  profiles: many(profiles),
  auditEntries: many(auditLog),
}));

export const propertiesRelations = relations(properties, ({ one, many }) => ({
  client: one(clients, {
    fields: [properties.clientId],
    references: [clients.id],
  }),
  projects: many(projects),
  appointments: many(appointments),
  photos: many(photos),
  reports: many(reports),
  invoices: many(invoices),
}));

export const vendorsRelations = relations(vendors, ({ many }) => ({
  milestones: many(milestones),
  appointments: many(appointments),
  reports: many(reports),
  documents: many(vendorDocuments),
}));

export const vendorDocumentsRelations = relations(vendorDocuments, ({ one }) => ({
  vendor: one(vendors, {
    fields: [vendorDocuments.vendorId],
    references: [vendors.id],
  }),
}));

export const projectTemplatesRelations = relations(projectTemplates, ({ many }) => ({
  templateMilestones: many(templateMilestones),
  phases: many(templatePhases),
}));

export const templatePhasesRelations = relations(templatePhases, ({ one, many }) => ({
  template: one(projectTemplates, {
    fields: [templatePhases.templateId],
    references: [projectTemplates.id],
  }),
  milestones: many(templateMilestones),
  // Two relations to the same join table — one for each side of the edge.
  // Both sides need `relationName` so Drizzle can disambiguate.
  dependencies: many(templatePhaseDependencies, {
    relationName: 'phaseDependencies',
  }),
  dependedOnBy: many(templatePhaseDependencies, {
    relationName: 'phaseDependedOnBy',
  }),
}));

export const templatePhaseDependenciesRelations = relations(
  templatePhaseDependencies,
  ({ one }) => ({
    phase: one(templatePhases, {
      fields: [templatePhaseDependencies.phaseId],
      references: [templatePhases.id],
      relationName: 'phaseDependencies',
    }),
    dependsOnPhase: one(templatePhases, {
      fields: [templatePhaseDependencies.dependsOnPhaseId],
      references: [templatePhases.id],
      relationName: 'phaseDependedOnBy',
    }),
  }),
);

export const templateMilestonesRelations = relations(templateMilestones, ({ one }) => ({
  template: one(projectTemplates, {
    fields: [templateMilestones.templateId],
    references: [projectTemplates.id],
  }),
  phase: one(templatePhases, {
    fields: [templateMilestones.phaseId],
    references: [templatePhases.id],
  }),
}));

export const projectsRelations = relations(projects, ({ one, many }) => ({
  property: one(properties, {
    fields: [projects.propertyId],
    references: [properties.id],
  }),
  milestones: many(milestones),
  appointments: many(appointments),
  photos: many(photos),
  reports: many(reports),
  documents: many(documents),
  invoices: many(invoices),
  weeklyUpdates: many(weeklyUpdates),
}));

export const milestonesRelations = relations(milestones, ({ one, many }) => ({
  project: one(projects, {
    fields: [milestones.projectId],
    references: [projects.id],
  }),
  vendor: one(vendors, {
    fields: [milestones.vendorId],
    references: [vendors.id],
  }),
  responder: one(profiles, {
    fields: [milestones.respondedBy],
    references: [profiles.id],
    relationName: 'milestone_responder',
  }),
  appointments: many(appointments),
  photos: many(photos),
}));

export const appointmentsRelations = relations(appointments, ({ one, many }) => ({
  property: one(properties, {
    fields: [appointments.propertyId],
    references: [properties.id],
  }),
  project: one(projects, {
    fields: [appointments.projectId],
    references: [projects.id],
  }),
  milestone: one(milestones, {
    fields: [appointments.milestoneId],
    references: [milestones.id],
  }),
  vendor: one(vendors, {
    fields: [appointments.vendorId],
    references: [vendors.id],
  }),
  assignedPm: one(staff, {
    fields: [appointments.assignedPmId],
    references: [staff.id],
  }),
  photos: many(photos),
  reports: many(reports),
}));

export const photosRelations = relations(photos, ({ one }) => ({
  property: one(properties, {
    fields: [photos.propertyId],
    references: [properties.id],
  }),
  project: one(projects, {
    fields: [photos.projectId],
    references: [projects.id],
  }),
  milestone: one(milestones, {
    fields: [photos.milestoneId],
    references: [milestones.id],
  }),
  appointment: one(appointments, {
    fields: [photos.appointmentId],
    references: [appointments.id],
  }),
  uploader: one(profiles, {
    fields: [photos.uploadedByUserId],
    references: [profiles.id],
  }),
}));

export const reportsRelations = relations(reports, ({ one }) => ({
  property: one(properties, {
    fields: [reports.propertyId],
    references: [properties.id],
  }),
  project: one(projects, {
    fields: [reports.projectId],
    references: [projects.id],
  }),
  appointment: one(appointments, {
    fields: [reports.appointmentId],
    references: [appointments.id],
  }),
  vendor: one(vendors, {
    fields: [reports.vendorId],
    references: [vendors.id],
  }),
}));

export const documentsRelations = relations(documents, ({ one }) => ({
  project: one(projects, {
    fields: [documents.projectId],
    references: [projects.id],
  }),
}));

export const invoicesRelations = relations(invoices, ({ one }) => ({
  client: one(clients, {
    fields: [invoices.clientId],
    references: [clients.id],
  }),
  property: one(properties, {
    fields: [invoices.propertyId],
    references: [properties.id],
  }),
  project: one(projects, {
    fields: [invoices.projectId],
    references: [projects.id],
  }),
}));

export const weeklyUpdatesRelations = relations(weeklyUpdates, ({ one }) => ({
  project: one(projects, {
    fields: [weeklyUpdates.projectId],
    references: [projects.id],
  }),
  author: one(staff, {
    fields: [weeklyUpdates.authorId],
    references: [staff.id],
  }),
}));

export const auditLogRelations = relations(auditLog, ({ one }) => ({
  actor: one(profiles, {
    fields: [auditLog.actorId],
    references: [profiles.id],
  }),
  client: one(clients, {
    fields: [auditLog.clientId],
    references: [clients.id],
  }),
}));

export const emailTemplatesRelations = relations(emailTemplates, ({ one }) => ({
  lastEditor: one(staff, {
    fields: [emailTemplates.lastEditedBy],
    references: [staff.id],
  }),
}));

// Suppress an unused-import warning if nothing in this file ends up using sql.
// (Kept around for future raw-SQL helpers in this module.)
void sql;

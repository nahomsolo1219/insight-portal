// Client detail queries. `getClientDetail` drives the page header + stats +
// property switcher; `getProjectsForProperty` drives the Projects tab.
// Pure reads — the page component enforces auth before calling these.

import { and, asc, count, desc, eq, inArray, sum } from 'drizzle-orm';
import { db } from '@/db';
import {
  appointments,
  clients,
  documents,
  invoices,
  membershipTiers,
  milestones,
  photos,
  projectTemplates,
  projects,
  properties,
  reports,
  staff,
  templatePhases,
  vendors,
} from '@/db/schema';

export interface ClientDetailRow {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  status: string;
  memberSince: string | null;
  tierName: string | null;
  tierId: string | null;
  assignedPmName: string | null;
  assignedPmId: string | null;
}

export interface PropertyRow {
  id: string;
  name: string;
  address: string;
  city: string | null;
  state: string | null;
  zipcode: string | null;
  sqft: number | null;
  yearBuilt: number | null;
  gateCode: string | null;
  accessNotes: string | null;
  emergencyContact: string | null;
}

export interface ClientDetailStats {
  activeProjectCount: number;
  balanceCents: number;
  propertyCount: number;
}

/**
 * Fetch a single property's full record for the Profile tab's edit modal.
 * Returns null if the property doesn't exist.
 */
export async function getPropertyDetail(propertyId: string): Promise<PropertyRow | null> {
  const [property] = await db
    .select({
      id: properties.id,
      name: properties.name,
      address: properties.address,
      city: properties.city,
      state: properties.state,
      zipcode: properties.zipcode,
      sqft: properties.sqft,
      yearBuilt: properties.yearBuilt,
      gateCode: properties.gateCode,
      accessNotes: properties.accessNotes,
      emergencyContact: properties.emergencyContact,
    })
    .from(properties)
    .where(eq(properties.id, propertyId))
    .limit(1);

  return property ?? null;
}

export interface ClientDetailPayload {
  client: ClientDetailRow;
  properties: PropertyRow[];
  stats: ClientDetailStats;
}

/**
 * Fetch everything needed to render the client detail header + stats +
 * property switcher. Returns null when the client doesn't exist so the page
 * can route to a 404 via `notFound()`.
 */
export async function getClientDetail(clientId: string): Promise<ClientDetailPayload | null> {
  const [client] = await db
    .select({
      id: clients.id,
      name: clients.name,
      email: clients.email,
      phone: clients.phone,
      status: clients.status,
      memberSince: clients.memberSince,
      tierName: membershipTiers.name,
      tierId: membershipTiers.id,
      assignedPmName: staff.name,
      assignedPmId: staff.id,
    })
    .from(clients)
    .leftJoin(membershipTiers, eq(membershipTiers.id, clients.membershipTierId))
    .leftJoin(staff, eq(staff.id, clients.assignedPmId))
    .where(eq(clients.id, clientId))
    .limit(1);

  if (!client) return null;

  const clientProperties = await db
    .select({
      id: properties.id,
      name: properties.name,
      address: properties.address,
      city: properties.city,
      state: properties.state,
      zipcode: properties.zipcode,
      sqft: properties.sqft,
      yearBuilt: properties.yearBuilt,
      gateCode: properties.gateCode,
      accessNotes: properties.accessNotes,
      emergencyContact: properties.emergencyContact,
    })
    .from(properties)
    .where(eq(properties.clientId, clientId))
    .orderBy(asc(properties.name));

  const propertyIds = clientProperties.map((p) => p.id);

  // Active project count across all of this client's properties.
  let activeProjectCount = 0;
  if (propertyIds.length > 0) {
    const [row] = await db
      .select({ count: count() })
      .from(projects)
      .where(and(eq(projects.status, 'active'), inArray(projects.propertyId, propertyIds)));
    activeProjectCount = Number(row?.count ?? 0);
  }

  // Outstanding balance: sum of unpaid + partial invoice cents.
  const [balanceRow] = await db
    .select({ total: sum(invoices.amountCents).mapWith(Number) })
    .from(invoices)
    .where(and(eq(invoices.clientId, clientId), inArray(invoices.status, ['unpaid', 'partial'])));

  return {
    client,
    properties: clientProperties,
    stats: {
      activeProjectCount,
      balanceCents: balanceRow?.total ?? 0,
      propertyCount: clientProperties.length,
    },
  };
}

/**
 * Fetch projects for a specific property, each with its milestones.
 * One round-trip for projects, one for all of their milestones, then
 * grouped in memory. O(projects + milestones) — fast.
 */
export async function getProjectsForProperty(propertyId: string) {
  const projectRows = await db
    .select({
      id: projects.id,
      name: projects.name,
      type: projects.type,
      status: projects.status,
      startDate: projects.startDate,
      endDate: projects.endDate,
      progress: projects.progress,
      description: projects.description,
      contractCents: projects.contractCents,
      changesCents: projects.changesCents,
      paidCents: projects.paidCents,
    })
    .from(projects)
    .where(eq(projects.propertyId, propertyId))
    .orderBy(desc(projects.startDate));

  if (projectRows.length === 0) return [];

  const projectIds = projectRows.map((p) => p.id);

  const allMilestones = await db
    .select({
      id: milestones.id,
      projectId: milestones.projectId,
      title: milestones.title,
      category: milestones.category,
      dueDate: milestones.dueDate,
      status: milestones.status,
      vendorName: vendors.name,
      order: milestones.order,
      questionType: milestones.questionType,
      questionBody: milestones.questionBody,
    })
    .from(milestones)
    .leftJoin(vendors, eq(vendors.id, milestones.vendorId))
    .where(inArray(milestones.projectId, projectIds))
    .orderBy(asc(milestones.order), asc(milestones.dueDate));

  type MilestoneRow = (typeof allMilestones)[number];
  const byProject = new Map<string, MilestoneRow[]>();
  for (const m of allMilestones) {
    const existing = byProject.get(m.projectId);
    if (existing) existing.push(m);
    else byProject.set(m.projectId, [m]);
  }

  return projectRows.map((p) => {
    const ms = byProject.get(p.id) ?? [];
    return {
      ...p,
      milestones: ms,
      milestoneStats: {
        total: ms.length,
        completed: ms.filter((m) => m.status === 'complete').length,
      },
    };
  });
}

export type ProjectWithMilestones = Awaited<ReturnType<typeof getProjectsForProperty>>[number];
export type MilestoneRow = ProjectWithMilestones['milestones'][number];

// ---------------------------------------------------------------------------
// Documents tab
// ---------------------------------------------------------------------------

export interface DocumentRow {
  id: string;
  name: string;
  /** YYYY-MM-DD string from the DB. */
  date: string;
  /** 'contract' | 'drawing' | 'permit' | 'spec_sheet' | 'warranty' | 'other' */
  type: string;
  storagePath: string;
  projectId: string;
  projectName: string;
  createdAt: Date;
}

/**
 * Every document attached to any project on this property. Sorted by
 * document date descending (then createdAt as a tiebreaker for same-day
 * uploads). Grouping by project happens on the client.
 */
export async function getDocumentsForProperty(propertyId: string): Promise<DocumentRow[]> {
  return db
    .select({
      id: documents.id,
      name: documents.name,
      date: documents.date,
      type: documents.type,
      storagePath: documents.storagePath,
      projectId: documents.projectId,
      projectName: projects.name,
      createdAt: documents.createdAt,
    })
    .from(documents)
    .innerJoin(projects, eq(projects.id, documents.projectId))
    .where(eq(projects.propertyId, propertyId))
    .orderBy(desc(documents.date), desc(documents.createdAt));
}

export interface ProjectOption {
  id: string;
  name: string;
  type: 'maintenance' | 'remodel';
}

/**
 * Light project list for the "which project?" picker in the upload modal.
 * Ordered newest-first so the most recently-started project is the
 * default selection.
 */
export async function getProjectsForPropertySelect(propertyId: string): Promise<ProjectOption[]> {
  return db
    .select({ id: projects.id, name: projects.name, type: projects.type })
    .from(projects)
    .where(eq(projects.propertyId, propertyId))
    .orderBy(desc(projects.startDate));
}

// ---------------------------------------------------------------------------
// Reports tab
// ---------------------------------------------------------------------------

export interface ReportRow {
  id: string;
  name: string;
  /** YYYY-MM-DD string from the DB. */
  date: string;
  /** 'inspection' | 'assessment' | 'update' | 'year_end' */
  type: string;
  storagePath: string;
  isNew: boolean;
  propertyId: string;
  /** Reports can optionally be linked to a specific project. */
  projectId: string | null;
  projectName: string | null;
  /** Reports can optionally be authored by a vendor. */
  vendorName: string | null;
  createdAt: Date;
}

/**
 * Every report attached to this property. Date descending, createdAt as
 * tiebreaker. Vendor + project joins are LEFT JOINs — both fields are
 * optional on the report.
 */
export async function getReportsForProperty(propertyId: string): Promise<ReportRow[]> {
  return db
    .select({
      id: reports.id,
      name: reports.name,
      date: reports.date,
      type: reports.type,
      storagePath: reports.storagePath,
      isNew: reports.isNew,
      propertyId: reports.propertyId,
      projectId: reports.projectId,
      projectName: projects.name,
      vendorName: vendors.name,
      createdAt: reports.createdAt,
    })
    .from(reports)
    .leftJoin(projects, eq(projects.id, reports.projectId))
    .leftJoin(vendors, eq(vendors.id, reports.vendorId))
    .where(eq(reports.propertyId, propertyId))
    .orderBy(desc(reports.date), desc(reports.createdAt));
}

export interface VendorOption {
  id: string;
  name: string;
  category: string;
}

/**
 * Active vendors for the "vendor" dropdown in the report upload modal.
 * Name-ordered so the picker is alphabetical.
 */
export async function getVendorsForSelect(): Promise<VendorOption[]> {
  return db
    .select({ id: vendors.id, name: vendors.name, category: vendors.category })
    .from(vendors)
    .where(eq(vendors.active, true))
    .orderBy(asc(vendors.name));
}

// ---------------------------------------------------------------------------
// Invoices tab
// ---------------------------------------------------------------------------

export interface InvoiceRow {
  id: string;
  invoiceNumber: string;
  description: string | null;
  amountCents: number;
  invoiceDate: string;
  dueDate: string;
  /** 'paid' | 'unpaid' | 'partial' */
  status: 'paid' | 'unpaid' | 'partial';
  storagePath: string;
  projectId: string | null;
  projectName: string | null;
  propertyId: string | null;
  propertyName: string | null;
  createdAt: Date;
}

/**
 * Every invoice for this client — across all properties. Invoices are
 * client-scoped (not property-scoped like documents/reports), so switching
 * the property tab does NOT filter this list. Date descending with
 * createdAt as tiebreaker.
 */
export async function getInvoicesForClient(clientId: string): Promise<InvoiceRow[]> {
  return db
    .select({
      id: invoices.id,
      invoiceNumber: invoices.invoiceNumber,
      description: invoices.description,
      amountCents: invoices.amountCents,
      invoiceDate: invoices.invoiceDate,
      dueDate: invoices.dueDate,
      status: invoices.status,
      storagePath: invoices.storagePath,
      projectId: invoices.projectId,
      projectName: projects.name,
      propertyId: invoices.propertyId,
      propertyName: properties.name,
      createdAt: invoices.createdAt,
    })
    .from(invoices)
    .leftJoin(projects, eq(projects.id, invoices.projectId))
    .leftJoin(properties, eq(properties.id, invoices.propertyId))
    .where(eq(invoices.clientId, clientId))
    .orderBy(desc(invoices.invoiceDate), desc(invoices.createdAt));
}

export interface InvoiceSummary {
  totalInvoiced: number;
  totalPaid: number;
  totalOutstanding: number;
  invoiceCount: number;
}

/**
 * Grouped invoice totals for the summary bar above the table.
 * `totalOutstanding` = unpaid + partial combined — David just wants to see
 * "how much money is still owed", regardless of whether it's fully or
 * partially outstanding.
 */
export async function getInvoiceSummaryForClient(clientId: string): Promise<InvoiceSummary> {
  const rows = await db
    .select({
      status: invoices.status,
      total: sum(invoices.amountCents).mapWith(Number),
      count: count(),
    })
    .from(invoices)
    .where(eq(invoices.clientId, clientId))
    .groupBy(invoices.status);

  let totalInvoiced = 0;
  let totalPaid = 0;
  let totalOutstanding = 0;
  let invoiceCount = 0;

  for (const row of rows) {
    const amount = row.total ?? 0;
    invoiceCount += Number(row.count);
    totalInvoiced += amount;
    if (row.status === 'paid') totalPaid += amount;
    else totalOutstanding += amount;
  }

  return { totalInvoiced, totalPaid, totalOutstanding, invoiceCount };
}

export interface ProjectOptionWithProperty {
  id: string;
  name: string;
  type: 'maintenance' | 'remodel';
  propertyId: string;
  propertyName: string;
}

/**
 * Every project belonging to any of this client's properties, plus each
 * project's property name. Drives the property→project cascade in the
 * invoice upload modal. One round-trip; beats N+1-ing
 * `getProjectsForPropertySelect` per property.
 */
export async function getAllProjectsForClient(
  clientId: string,
): Promise<ProjectOptionWithProperty[]> {
  return db
    .select({
      id: projects.id,
      name: projects.name,
      type: projects.type,
      propertyId: projects.propertyId,
      propertyName: properties.name,
    })
    .from(projects)
    .innerJoin(properties, eq(properties.id, projects.propertyId))
    .where(eq(properties.clientId, clientId))
    .orderBy(asc(properties.name), desc(projects.startDate));
}

// ---------------------------------------------------------------------------
// Appointments tab
// ---------------------------------------------------------------------------

export interface AppointmentRow {
  id: string;
  title: string;
  date: string;
  startTime: string | null;
  endTime: string | null;
  /** 'scheduled' | 'confirmed' | 'completed' | 'cancelled' */
  status: 'scheduled' | 'confirmed' | 'completed' | 'cancelled';
  davidOnSite: boolean;
  scopeOfWork: string | null;
  projectId: string | null;
  projectName: string | null;
  milestoneId: string | null;
  milestoneTitle: string | null;
  vendorId: string | null;
  vendorName: string | null;
  pmId: string | null;
  pmName: string | null;
  createdAt: Date;
}

export interface AppointmentsPayload {
  upcoming: AppointmentRow[];
  past: AppointmentRow[];
  /** Needed in client code because we may want to re-split after optimistic updates. */
  all: AppointmentRow[];
}

/**
 * Every appointment scheduled against this property, pre-split into
 * upcoming and past. An appointment drops into "past" once its status is
 * completed/cancelled OR its date is strictly before today — so a
 * confirmed appointment today stays in "upcoming" until it's marked done,
 * which matches how David actually uses the list.
 *
 * Sorting: upcoming is chronological (soonest first); past is reverse
 * (most recent first). We sort client-side after splitting so the two
 * lists can have different orderings without two DB round-trips.
 */
export async function getAppointmentsForProperty(
  propertyId: string,
): Promise<AppointmentsPayload> {
  const rows = await db
    .select({
      id: appointments.id,
      title: appointments.title,
      date: appointments.date,
      startTime: appointments.startTime,
      endTime: appointments.endTime,
      status: appointments.status,
      davidOnSite: appointments.davidOnSite,
      scopeOfWork: appointments.scopeOfWork,
      projectId: appointments.projectId,
      projectName: projects.name,
      milestoneId: appointments.milestoneId,
      milestoneTitle: milestones.title,
      vendorId: appointments.vendorId,
      vendorName: vendors.name,
      pmId: appointments.assignedPmId,
      pmName: staff.name,
      createdAt: appointments.createdAt,
    })
    .from(appointments)
    .leftJoin(projects, eq(projects.id, appointments.projectId))
    .leftJoin(milestones, eq(milestones.id, appointments.milestoneId))
    .leftJoin(vendors, eq(vendors.id, appointments.vendorId))
    .leftJoin(staff, eq(staff.id, appointments.assignedPmId))
    .where(eq(appointments.propertyId, propertyId));

  const today = new Date().toISOString().slice(0, 10);

  const upcoming = rows
    .filter((r) => r.date >= today && r.status !== 'completed' && r.status !== 'cancelled')
    .sort((a, b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      return (a.startTime ?? '').localeCompare(b.startTime ?? '');
    });

  const past = rows
    .filter((r) => r.date < today || r.status === 'completed' || r.status === 'cancelled')
    .sort((a, b) => {
      if (a.date !== b.date) return b.date.localeCompare(a.date);
      return (b.startTime ?? '').localeCompare(a.startTime ?? '');
    });

  return { upcoming, past, all: rows };
}

export interface PmOption {
  id: string;
  name: string;
}

/**
 * Active staff who can be assigned as the PM on an appointment — founder
 * and project managers only. Field staff/techs don't belong here.
 */
export async function getActivePmsForSelect(): Promise<PmOption[]> {
  return db
    .select({ id: staff.id, name: staff.name })
    .from(staff)
    .where(and(eq(staff.status, 'active'), inArray(staff.role, ['founder', 'project_manager'])))
    .orderBy(asc(staff.name));
}

// ---------------------------------------------------------------------------
// Photos tab
// ---------------------------------------------------------------------------

export interface PhotoRow {
  id: string;
  caption: string | null;
  /** 'before' | 'during' | 'after' | null */
  tag: 'before' | 'during' | 'after' | null;
  category: string | null;
  /** 'pending' | 'categorized' | 'rejected' */
  status: 'pending' | 'categorized' | 'rejected';
  storagePath: string;
  uploadedByName: string | null;
  uploadedAt: Date;
  /** `numeric` columns round-trip as strings in pg — keep them as-is for display. */
  gpsLat: string | null;
  gpsLng: string | null;
  projectId: string | null;
  projectName: string | null;
  milestoneId: string | null;
  milestoneTitle: string | null;
}

/**
 * Every photo attached to this property. No server-side filters — all
 * filtering (status, project, tag) happens client-side so toggles feel
 * instant. If a property ever has thousands of photos we'd move filters
 * to the DB, but typical counts are <100.
 */
export async function getPhotosForProperty(propertyId: string): Promise<PhotoRow[]> {
  return db
    .select({
      id: photos.id,
      caption: photos.caption,
      tag: photos.tag,
      category: photos.category,
      status: photos.status,
      storagePath: photos.storagePath,
      uploadedByName: photos.uploadedByName,
      uploadedAt: photos.uploadedAt,
      gpsLat: photos.gpsLat,
      gpsLng: photos.gpsLng,
      projectId: photos.projectId,
      projectName: projects.name,
      milestoneId: photos.milestoneId,
      milestoneTitle: milestones.title,
    })
    .from(photos)
    .leftJoin(projects, eq(projects.id, photos.projectId))
    .leftJoin(milestones, eq(milestones.id, photos.milestoneId))
    .where(eq(photos.propertyId, propertyId))
    .orderBy(desc(photos.uploadedAt));
}

export interface PhotoStats {
  total: number;
  pending: number;
  categorized: number;
  rejected: number;
}

/**
 * Status rollup for the stats bar. One GROUP BY round-trip beats counting
 * the same rows the client already has — keeps the tab responsive to
 * filter changes without re-reading the full set.
 */
export async function getPhotoStats(propertyId: string): Promise<PhotoStats> {
  const rows = await db
    .select({
      status: photos.status,
      count: count(),
    })
    .from(photos)
    .where(eq(photos.propertyId, propertyId))
    .groupBy(photos.status);

  const stats: PhotoStats = { total: 0, pending: 0, categorized: 0, rejected: 0 };
  for (const row of rows) {
    const c = Number(row.count);
    stats.total += c;
    if (row.status === 'pending') stats.pending = c;
    if (row.status === 'categorized') stats.categorized = c;
    if (row.status === 'rejected') stats.rejected = c;
  }
  return stats;
}

// ---------- Templates (for the Create-Project modal) ----------

export interface TemplateOption {
  id: string;
  name: string;
  type: 'maintenance' | 'remodel';
  description: string | null;
  duration: string | null;
  usesPhases: boolean;
  /** Sum of all phase `estimated_days` for phased templates; null for flat. */
  totalEstimatedDays: number | null;
  /** Phase count; null for flat templates. */
  phaseCount: number | null;
}

/**
 * Templates listed in the Create-Project modal. We attach a precomputed
 * total-days estimate for phase-based templates so the UI can auto-fill
 * the new project's end date when David picks a template, without an
 * extra round-trip per selection.
 */
export async function getTemplatesForSelect(): Promise<TemplateOption[]> {
  const templates = await db
    .select({
      id: projectTemplates.id,
      name: projectTemplates.name,
      type: projectTemplates.type,
      description: projectTemplates.description,
      duration: projectTemplates.duration,
      usesPhases: projectTemplates.usesPhases,
    })
    .from(projectTemplates)
    .orderBy(asc(projectTemplates.name));

  if (templates.length === 0) return [];

  // Aggregate phase counts + estimated_day totals in a single grouped
  // round-trip rather than N queries (one per template).
  const phasedTemplateIds = templates.filter((t) => t.usesPhases).map((t) => t.id);
  const totalsByTemplate = new Map<string, { count: number; days: number }>();

  if (phasedTemplateIds.length > 0) {
    const phaseRows = await db
      .select({
        templateId: templatePhases.templateId,
        estimatedDays: templatePhases.estimatedDays,
      })
      .from(templatePhases)
      .where(inArray(templatePhases.templateId, phasedTemplateIds));

    for (const row of phaseRows) {
      const entry = totalsByTemplate.get(row.templateId) ?? { count: 0, days: 0 };
      entry.count += 1;
      entry.days += row.estimatedDays ?? 0;
      totalsByTemplate.set(row.templateId, entry);
    }
  }

  return templates.map((t) => {
    if (!t.usesPhases) {
      return {
        ...t,
        totalEstimatedDays: null,
        phaseCount: null,
      };
    }
    const totals = totalsByTemplate.get(t.id);
    return {
      ...t,
      totalEstimatedDays: totals && totals.days > 0 ? totals.days : null,
      phaseCount: totals?.count ?? 0,
    };
  });
}

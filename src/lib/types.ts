// Central type definitions for Insight HM admin portal.
// All data model interfaces live here — do not scatter types across feature files.

// ---------- Core data model ----------

export type ClientStatus = 'active' | 'inactive' | 'paused';

export interface Client {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  initials: string;
  membershipTier: string | null; // free-form tag, resolves to MembershipTier.name
  assignedPM: string | null;
  memberSince: string | null; // ISO date
  status: ClientStatus;
  properties: Property[];
}

export interface Property {
  id: string;
  clientId: string;
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
  projects: Project[];
}

export type ProjectType = 'maintenance' | 'remodel';

export type ProjectStatus = 'planning' | 'in-progress' | 'on-hold' | 'complete' | 'awaiting-client';

export interface ProjectBudget {
  contract: number;
  changes: number;
  paid: number;
  remaining: number;
}

export interface Project {
  id: string;
  propertyId: string;
  name: string;
  type: ProjectType;
  status: ProjectStatus;
  startDate: string; // ISO date
  endDate: string; // ISO date
  progress: number; // 0-100
  description: string;
  budget?: ProjectBudget;
  milestones: Milestone[];
  weeklyUpdates?: WeeklyUpdate[];
  documents?: Document[];
}

export type MilestoneStatus =
  | 'complete'
  | 'in-progress'
  | 'upcoming'
  | 'pending'
  | 'awaiting-client';

export type QuestionType = 'single' | 'multi' | 'approval' | 'open' | 'acknowledge';

export interface Milestone {
  id: string;
  projectId: string;
  title: string;
  category: string;
  dueDate: string; // ISO date
  status: MilestoneStatus;
  vendor: string;
  notes?: string;
  // Decision-oriented fields (only populated when status === 'awaiting-client')
  questionType?: QuestionType;
  questionBody?: string;
  options?: string[];
  clientResponse?: string;
  respondedAt?: string; // ISO datetime
}

// ---------- Appointments ----------

export type AppointmentStatus =
  | 'scheduled'
  | 'in-progress'
  | 'complete'
  | 'cancelled'
  | 'rescheduled';

export interface Appointment {
  id: string;
  propertyId: string;
  projectId?: string;
  milestoneId?: string;
  title: string;
  vendor: string;
  date: string; // ISO date
  startTime: string; // "09:00"
  endTime: string; // "11:00"
  status: AppointmentStatus;
  davidOnSite: boolean;
  scopeOfWork: string;
  assignedPM: string;
}

// ---------- Photos ----------

export type PhotoTag = 'before' | 'during' | 'after';

export type PhotoStatus = 'pending' | 'categorized' | 'rejected';

export interface Photo {
  id: string;
  propertyId: string;
  projectId?: string;
  milestoneId?: string;
  uploadedBy: string;
  uploadedAt: string; // ISO datetime
  gpsLat?: number;
  gpsLng?: number;
  tag: PhotoTag;
  category: string;
  caption: string;
  status: PhotoStatus;
  color: string; // placeholder swatch (hex) until real image URLs exist
}

// ---------- Invoices ----------

export type InvoiceStatus = 'paid' | 'unpaid' | 'partial';

export interface Invoice {
  id: string;
  clientId: string;
  clientName: string;
  propertyId: string;
  propertyName: string;
  projectId?: string;
  projectName?: string;
  invoiceNumber: string;
  description: string;
  amount: number;
  invoiceDate: string; // ISO date
  dueDate: string; // ISO date
  status: InvoiceStatus;
}

// ---------- Vendors ----------

export interface Vendor {
  id: string;
  name: string;
  category: string;
  phone: string;
  email: string;
  active: boolean;
  jobsCompleted: number;
  notes?: string;
}

// ---------- Staff ----------

export type StaffStatus = 'active' | 'pending';

export interface Staff {
  id: string;
  name: string;
  role: string;
  email: string;
  phone: string;
  initials: string;
  clientsAssigned: number;
  status: StaffStatus;
}

// ---------- Templates ----------

export interface ProjectTemplate {
  id: string;
  name: string;
  type: ProjectType;
  description: string;
  duration: string; // e.g. "4-6 weeks"
  milestones: string[]; // just titles at template level
}

// ---------- Membership tiers ----------

export interface MembershipTier {
  id: string;
  name: string;
  annualPrice: number;
  description: string;
  clientCount: number;
}

// ---------- Auxiliary ----------

export interface WeeklyUpdate {
  date: string; // ISO date
  author: string;
  note: string;
  photoCount: number;
}

export interface Document {
  name: string;
  date: string; // ISO date
  type: string; // "PDF" | "Image" | ...
}

export interface AuditLogEntry {
  id: string;
  actor: string;
  action: string;
  target: string;
  client: string;
  time: string; // ISO datetime or relative string
}

export interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  lastEdited: string; // ISO date
}

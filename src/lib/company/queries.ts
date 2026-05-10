// Singleton company-settings reader. Called by AdminHeader, PortalSidebar,
// and any surface that needs the firm name, logo URLs, or brand overrides.
//
// Returns the single row from company_settings with signed URLs for any
// uploaded logos. Falls back to sensible defaults when the table is empty
// (shouldn't happen after migration 0013 seeds the row, but belt + suspenders).

import { db } from '@/db';
import { companySettings } from '@/db/schema';

export interface CompanySettings {
  id: string;
  firmName: string;
  firmTagline: string | null;
  firmEmail: string | null;
  firmPhone: string | null;
  firmAddress: string | null;
  firmWebsite: string | null;
  businessHours: string | null;
  logoLightUrl: string | null;
  logoDarkUrl: string | null;
  brandPrimaryColor: string | null;
  brandAccentColor: string | null;
  defaultInvoiceCategories: string[];
  emailFromName: string | null;
  emailFromAddress: string | null;
  emailReplyTo: string | null;
}

const DEFAULTS: CompanySettings = {
  id: '',
  firmName: 'Insight Home Maintenance',
  firmTagline: null,
  firmEmail: null,
  firmPhone: null,
  firmAddress: null,
  firmWebsite: null,
  businessHours: 'Mon–Fri, 8 AM – 5 PM',
  logoLightUrl: null,
  logoDarkUrl: null,
  brandPrimaryColor: null,
  brandAccentColor: null,
  defaultInvoiceCategories: ['Remodel', 'Maintenance', 'Repair', 'Other'],
  emailFromName: null,
  emailFromAddress: null,
  emailReplyTo: null,
};

/**
 * Fetch the company settings singleton. Never returns null — falls back
 * to coded defaults if the table is somehow empty. Safe to call from any
 * server context (Server Component, Server Action, API route).
 */
export async function getCompanySettings(): Promise<CompanySettings> {
  const [row] = await db.select().from(companySettings).limit(1);
  if (!row) return DEFAULTS;

  return {
    id: row.id,
    firmName: row.firmName || DEFAULTS.firmName,
    firmTagline: row.firmTagline,
    firmEmail: row.firmEmail,
    firmPhone: row.firmPhone,
    firmAddress: row.firmAddress,
    firmWebsite: row.firmWebsite,
    businessHours: row.businessHours,
    logoLightUrl: row.logoLightUrl,
    logoDarkUrl: row.logoDarkUrl,
    brandPrimaryColor: row.brandPrimaryColor,
    brandAccentColor: row.brandAccentColor,
    defaultInvoiceCategories: parseCategories(row.defaultInvoiceCategories),
    emailFromName: row.emailFromName,
    emailFromAddress: row.emailFromAddress,
    emailReplyTo: row.emailReplyTo,
  };
}

function parseCategories(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.filter((v): v is string => typeof v === 'string');
  }
  return DEFAULTS.defaultInvoiceCategories;
}

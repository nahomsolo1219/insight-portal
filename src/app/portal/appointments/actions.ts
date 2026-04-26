'use server';

import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { appointments, projects, properties } from '@/db/schema';
import { requireUser } from '@/lib/auth/current-user';

type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

/**
 * Build a single-event iCalendar (.ics) string the client can download
 * from the browser and double-click to import into Apple Calendar / Google
 * Calendar / Outlook.
 *
 * Floating-time semantics: we emit DTSTART/DTEND without a timezone so the
 * calendar app interprets them in the user's local zone — appropriate for
 * an at-home appointment where "9 AM Pacific" is just "9 AM" to the
 * household. Date-only appointments fall back to VALUE=DATE / all-day.
 *
 * Auth: client-only. Admin and field staff have richer surfaces; this one
 * exists for the client portal alone, and re-checks even though
 * `getClientAppointments` already filters by RLS — defence in depth.
 */
export async function generateIcsFile(
  appointmentId: string,
): Promise<ActionResult<{ icsContent: string; filename: string }>> {
  const user = await requireUser();
  if (user.role !== 'client' || !user.clientId) {
    return { success: false, error: 'Not authorized.' };
  }

  const [row] = await db
    .select({
      id: appointments.id,
      title: appointments.title,
      date: appointments.date,
      startTime: appointments.startTime,
      endTime: appointments.endTime,
      scopeOfWork: appointments.scopeOfWork,
      propertyName: properties.name,
      propertyAddress: properties.address,
      propertyCity: properties.city,
      propertyState: properties.state,
      propertyClientId: properties.clientId,
      projectName: projects.name,
    })
    .from(appointments)
    .innerJoin(properties, eq(properties.id, appointments.propertyId))
    .leftJoin(projects, eq(projects.id, appointments.projectId))
    .where(eq(appointments.id, appointmentId))
    .limit(1);

  if (!row || row.propertyClientId !== user.clientId) {
    return { success: false, error: 'Appointment not found.' };
  }

  const dateStr = row.date.replace(/-/g, '');
  const start = formatTimeForIcs(row.startTime);
  const end = formatTimeForIcs(row.endTime);

  const dtStart = start ? `DTSTART:${dateStr}T${start}` : `DTSTART;VALUE=DATE:${dateStr}`;
  // All-day events in iCalendar are half-open: DTEND is the day after.
  const dtEnd = end
    ? `DTEND:${dateStr}T${end}`
    : `DTEND;VALUE=DATE:${nextDay(row.date)}`;

  const location = [row.propertyName, row.propertyAddress, row.propertyCity, row.propertyState]
    .filter((part): part is string => Boolean(part && part.trim()))
    .join(', ');

  const description = [
    row.projectName ? `Project: ${row.projectName}` : null,
    row.scopeOfWork ?? null,
    'Scheduled by Insight Home Maintenance',
  ]
    .filter((part): part is string => Boolean(part && part.trim()))
    .join('\n');

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Insight Home Maintenance//Portal//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${row.id}@insighthm.com`,
    `DTSTAMP:${formatNowForIcs()}`,
    dtStart,
    dtEnd,
    `SUMMARY:${escapeIcsText(row.title)}`,
    `DESCRIPTION:${escapeIcsText(description)}`,
    `LOCATION:${escapeIcsText(location)}`,
    'STATUS:CONFIRMED',
    'END:VEVENT',
    'END:VCALENDAR',
  ];

  // RFC 5545 requires CRLF line endings.
  return {
    success: true,
    data: {
      icsContent: lines.join('\r\n'),
      filename: buildFilename(row.title, row.date),
    },
  };
}

/** "HH:MM" or "HH:MM:SS" → "HHMMSS" (zero-padded). Returns null on null. */
function formatTimeForIcs(time: string | null): string | null {
  if (!time) return null;
  return time.replace(/:/g, '').padEnd(6, '0').slice(0, 6);
}

function formatNowForIcs(): string {
  // `2026-04-26T14:30:22.123Z` → `20260426T143022Z`
  return new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
}

/** Add one day to a "YYYY-MM-DD" string, returning the same shape. */
function nextDay(iso: string): string {
  const [yStr, mStr, dStr] = iso.split('-');
  const date = new Date(Date.UTC(Number(yStr), Number(mStr) - 1, Number(dStr) + 1));
  return date.toISOString().slice(0, 10).replace(/-/g, '');
}

/** Per RFC 5545: escape backslash, semicolon, comma; encode newlines as \n. */
function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

/** Polite filename for the browser download dialog. */
function buildFilename(title: string, date: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return `${date}${slug ? `-${slug}` : ''}.ics`;
}

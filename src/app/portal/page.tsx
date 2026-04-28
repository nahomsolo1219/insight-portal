import { ArrowRight, Plus } from 'lucide-react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { PropertyCover } from '@/components/portal/PropertyCover';
import { requireUser } from '@/lib/auth/current-user';
import { cn, formatDate } from '@/lib/utils';
import { selectHeroCopy } from './heroCopy';
import {
  getClientPropertyLandingCards,
  getMyClientProfile,
  type PropertyLandingCard,
} from './queries';

const STATUS_CHIP: Record<NonNullable<PropertyLandingCard['statusTone']>, string> = {
  green: 'bg-[var(--green-100)] text-[var(--green-700)]',
  amber: 'bg-[var(--amber-100)] text-[var(--amber-600)]',
  neutral: 'border-line border bg-paper text-ink-700',
  rose: 'bg-[var(--rose-100)] text-[var(--rose-700)]',
};

/**
 * Editorial landing page for the client portal. Three branches:
 *
 *  - 0 properties → empty state ("we'll have your home set up shortly").
 *  - 1 property  → auto-redirect to that property's dashboard. The grid
 *    visual would feel silly with one card and the propertyId-scoped
 *    chrome is the canonical view.
 *  - 2+          → grid of editorial cards with cover + region + meta
 *    line + optional status chip. Each card is a single Link straight
 *    to that property's dashboard.
 *
 * Auth gate happens in `layout.tsx` — by the time we run, `user.role`
 * is `client` and `user.clientId` is set.
 */
export default async function PortalLandingPage() {
  const user = await requireUser();
  if (user.role !== 'client' || !user.clientId) redirect('/');

  const [cards, profile] = await Promise.all([
    getClientPropertyLandingCards(user.clientId),
    getMyClientProfile(user.clientId),
  ]);

  if (cards.length === 1) {
    redirect(`/portal/p/${cards[0]!.id}/dashboard`);
  }

  const firstName = pickFirstName(user.fullName, profile?.name);

  return (
    <div className="bg-cream min-h-screen">
      <Wordmark />
      <main className="mx-auto max-w-[1100px] px-6 pb-24 pt-10">
        <Hero firstName={firstName} subtitle={selectHeroCopy(cards).text} />
        {cards.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="mt-12 grid grid-cols-1 gap-8 md:grid-cols-2">
            {cards.map((card) => (
              <PropertyLandingCardItem key={card.id} card={card} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

function Wordmark() {
  return (
    <header className="border-line border-b bg-paper">
      <div className="mx-auto flex max-w-[1100px] items-center justify-between px-6 py-5">
        <Link href="/portal" className="inline-flex items-center text-2xl font-light tracking-tight text-ink-900">
          Insight
          <span className="ml-0.5 text-amber-600">.</span>
        </Link>
        <form action="/logout" method="POST">
          <button
            type="submit"
            className="text-ink-500 hover:text-ink-700 text-xs uppercase tracking-wider transition-colors"
          >
            Sign out
          </button>
        </form>
      </div>
    </header>
  );
}

function Hero({ firstName, subtitle }: { firstName: string; subtitle: string }) {
  return (
    <section className="max-w-2xl">
      <p className="eyebrow">Your homes</p>
      <h1 className="text-ink-900 mt-3 text-4xl font-light tracking-tighter leading-tight md:text-5xl">
        Welcome back, {firstName}.
      </h1>
      <p className="text-ink-500 mt-4 text-base italic leading-relaxed md:text-lg">
        {subtitle}
      </p>
    </section>
  );
}

function EmptyState() {
  return (
    <div className="border-line bg-paper mt-12 rounded-3xl border p-10 text-center">
      <div className="bg-cream text-ink-400 mx-auto inline-flex h-12 w-12 items-center justify-center rounded-full">
        <Plus size={20} strokeWidth={1.5} />
      </div>
      <h2 className="text-ink-900 mt-4 text-xl font-light tracking-tight">No homes on file yet</h2>
      <p className="text-ink-500 mx-auto mt-2 max-w-md text-sm">
        Your project manager will add your home shortly. Once it’s on file, this is where
        your visits, photos, and invoices will live.
      </p>
    </div>
  );
}

function PropertyLandingCardItem({ card }: { card: PropertyLandingCard }) {
  return (
    <Link
      href={`/portal/p/${card.id}/dashboard`}
      className="group border-line bg-paper hover:border-line-2 block overflow-hidden rounded-3xl border transition-all hover:-translate-y-0.5"
      style={{ boxShadow: 'var(--shadow-soft-md)' }}
    >
      <PropertyCover
        propertyId={card.id}
        coverPhotoUrl={card.coverPhotoUrl}
        uploadedAt={card.coverPhotoUploadedAt}
        alt={`Cover photo for ${card.name}`}
        className="relative aspect-[16/10] w-full"
      />
      <div className="p-6">
        {(card.region || card.statusLabel) && (
          <div className="flex items-center justify-between gap-3">
            {card.region && <span className="eyebrow">{card.region}</span>}
            {card.statusLabel && card.statusTone && (
              <span
                className={cn(
                  'inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium',
                  STATUS_CHIP[card.statusTone],
                )}
              >
                {card.statusLabel}
              </span>
            )}
          </div>
        )}
        <h2 className="text-ink-900 mt-2 text-2xl font-light tracking-tight">{card.name}</h2>
        <p className="text-ink-500 mt-1 text-sm">{formatAddress(card)}</p>
        <p className="text-ink-400 mt-3 text-xs">{formatMeta(card)}</p>
        <div className="border-line-2 mt-5 flex items-center justify-between border-t pt-4 text-sm">
          <span className="text-ink-500">{formatActivity(card)}</span>
          <span className="text-ink-700 inline-flex items-center gap-1 font-medium transition-transform group-hover:translate-x-0.5">
            Open
            <ArrowRight size={14} strokeWidth={1.75} />
          </span>
        </div>
      </div>
    </Link>
  );
}

function formatAddress(card: PropertyLandingCard): string {
  const parts: string[] = [card.address];
  if (card.city) parts.push(card.city);
  if (card.state) parts.push(card.state);
  return parts.join(', ');
}

function formatMeta(card: PropertyLandingCard): string {
  const parts: string[] = [];
  if (card.bedrooms != null) {
    parts.push(`${card.bedrooms} ${card.bedrooms === 1 ? 'bed' : 'beds'}`);
  }
  if (card.bathrooms) {
    const value = Number(card.bathrooms);
    if (Number.isFinite(value)) {
      parts.push(`${value} ${value === 1 ? 'bath' : 'baths'}`);
    }
  }
  if (card.sqft != null) parts.push(`${card.sqft.toLocaleString('en-US')} sqft`);
  return parts.join(' · ') || '—';
}

function formatActivity(card: PropertyLandingCard): string {
  if (card.pendingDecisionCount > 0) {
    return `${card.pendingDecisionCount} ${card.pendingDecisionCount === 1 ? 'decision' : 'decisions'} awaiting`;
  }
  if (card.activeProjectCount > 0) {
    return `${card.activeProjectCount} ${card.activeProjectCount === 1 ? 'project' : 'projects'} in flight`;
  }
  if (card.nextAppointmentDate) {
    return `Next visit ${formatDate(card.nextAppointmentDate)}`;
  }
  return 'No active work';
}

function pickFirstName(fullName: string | null, clientName: string | undefined): string {
  const source = (fullName || clientName || '').trim();
  if (!source) return 'there';
  return source.split(/\s+/)[0] ?? 'there';
}

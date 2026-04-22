'use client';

import {
  Briefcase,
  Calendar,
  Camera,
  DollarSign,
  FileBox,
  FileText,
  MapPin,
  User,
} from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import type { PropertyRow } from './queries';

const TABS = [
  { id: 'projects', label: 'Projects', icon: Briefcase },
  { id: 'appointments', label: 'Appointments', icon: Calendar },
  { id: 'photos', label: 'Photos', icon: Camera },
  { id: 'reports', label: 'Reports', icon: FileText },
  { id: 'documents', label: 'Documents', icon: FileBox },
  { id: 'invoices', label: 'Invoices', icon: DollarSign },
  { id: 'profile', label: 'Profile', icon: User },
] as const;

type TabId = (typeof TABS)[number]['id'];

interface ClientDetailTabsProps {
  clientId: string;
  properties: PropertyRow[];
  activePropertyId: string | null;
  /**
   * Server-rendered tab content. Slots live on the server so data fetching
   * happens during the same render pass as the page; tab switching stays a
   * cheap client interaction that just swaps which slot we render.
   */
  projectsSlot: React.ReactNode;
  documentsSlot: React.ReactNode;
  reportsSlot: React.ReactNode;
  appointmentsSlot: React.ReactNode;
  photosSlot: React.ReactNode;
  invoicesSlot: React.ReactNode;
  profileSlot: React.ReactNode;
}

export function ClientDetailTabs({
  clientId,
  properties,
  activePropertyId,
  projectsSlot,
  documentsSlot,
  reportsSlot,
  appointmentsSlot,
  photosSlot,
  invoicesSlot,
  profileSlot,
}: ClientDetailTabsProps) {
  const [activeTab, setActiveTab] = useState<TabId>('projects');

  const activeProperty = activePropertyId
    ? properties.find((p) => p.id === activePropertyId)
    : null;

  return (
    <div>
      {/* Property switcher */}
      {properties.length > 1 ? (
        <div className="mb-6 flex items-center gap-2 overflow-x-auto">
          <MapPin size={16} strokeWidth={1.5} className="flex-shrink-0 text-gray-400" />
          {properties.map((p) => {
            const isActive = activePropertyId === p.id;
            return (
              <Link
                key={p.id}
                href={`/admin/clients/${clientId}?property=${p.id}`}
                scroll={false}
                className={cn(
                  'whitespace-nowrap rounded-xl px-4 py-2 text-sm font-medium transition-all',
                  isActive
                    ? 'bg-brand-teal-50 text-brand-teal-500 border-brand-teal-500/10 border'
                    : 'hover:text-brand-teal-500 hover:bg-brand-warm-50 border border-transparent text-gray-500',
                )}
              >
                {p.name}
              </Link>
            );
          })}
        </div>
      ) : activeProperty ? (
        <div className="mb-6 flex items-center gap-2 text-sm text-gray-500">
          <MapPin size={16} strokeWidth={1.5} className="text-gray-400" />
          {[activeProperty.address, activeProperty.city, activeProperty.state]
            .filter(Boolean)
            .join(', ')}
        </div>
      ) : (
        <div className="mb-6 flex items-center gap-2 text-sm text-amber-600">
          <MapPin size={16} strokeWidth={1.5} />
          No properties yet — add one to start scheduling work
        </div>
      )}

      {/* Tab bar */}
      <div className="bg-brand-warm-200 mb-6 inline-flex max-w-full gap-1 overflow-x-auto rounded-xl p-1">
        {TABS.map((t) => {
          const Icon = t.icon;
          const isActive = activeTab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setActiveTab(t.id)}
              className={cn(
                'inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium whitespace-nowrap transition-all',
                isActive
                  ? 'text-brand-teal-500 shadow-soft bg-white'
                  : 'hover:text-brand-teal-500 text-gray-500',
              )}
            >
              <Icon size={14} strokeWidth={1.5} />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      {activeTab === 'projects' && (
        activeProperty
          ? projectsSlot
          : <EmptyTab message="No properties yet. Add a property first." />
      )}
      {activeTab === 'documents' && (
        activeProperty
          ? documentsSlot
          : <EmptyTab message="No properties yet. Add a property first." />
      )}
      {activeTab === 'reports' && (
        activeProperty
          ? reportsSlot
          : <EmptyTab message="No properties yet. Add a property first." />
      )}
      {activeTab === 'appointments' && (
        activeProperty
          ? appointmentsSlot
          : <EmptyTab message="No properties yet. Add a property first." />
      )}
      {activeTab === 'photos' && (
        activeProperty
          ? photosSlot
          : <EmptyTab message="No properties yet. Add a property first." />
      )}
      {/* Invoices are client-scoped — they render even when no property is selected. */}
      {activeTab === 'invoices' && invoicesSlot}
      {activeTab === 'profile' && profileSlot}
      {activeTab !== 'projects' &&
        activeTab !== 'documents' &&
        activeTab !== 'reports' &&
        activeTab !== 'appointments' &&
        activeTab !== 'photos' &&
        activeTab !== 'invoices' &&
        activeTab !== 'profile' && (
          <ComingSoon tabLabel={TABS.find((t) => t.id === activeTab)!.label} />
        )}
    </div>
  );
}

function EmptyTab({ message }: { message: string }) {
  return (
    <div className="shadow-card rounded-2xl bg-white p-12 text-center text-sm text-gray-400">
      {message}
    </div>
  );
}

function ComingSoon({ tabLabel }: { tabLabel: string }) {
  return (
    <div className="shadow-card rounded-2xl bg-white p-12 text-center">
      <h3 className="text-base font-semibold text-gray-900">{tabLabel} tab</h3>
      <p className="mt-2 text-sm text-gray-500">Being built in a follow-up session.</p>
    </div>
  );
}

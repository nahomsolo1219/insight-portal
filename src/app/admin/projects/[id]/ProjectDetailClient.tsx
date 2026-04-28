'use client';

import { Camera, ListChecks, Settings, Users } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { DetailsTabClient } from './DetailsTabClient';
import { MilestonesTabClient } from './MilestonesTabClient';
import { ProjectPhotosTabClient } from './PhotosTabClient';
import { TeamTabClient } from './TeamTabClient';
import type {
  FieldStaffPickerRow,
  ProjectAssignmentRow,
  ProjectDetailRow,
  ProjectMilestoneRow,
  ProjectPhotoRow,
  VendorOption,
} from './queries';

type TabId = 'milestones' | 'photos' | 'team' | 'details';

const TABS: readonly { id: TabId; label: string; icon: React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }> }[] = [
  { id: 'milestones', label: 'Milestones', icon: ListChecks },
  { id: 'photos', label: 'Photos', icon: Camera },
  { id: 'team', label: 'Team', icon: Users },
  { id: 'details', label: 'Details', icon: Settings },
];

interface Props {
  project: ProjectDetailRow;
  milestones: ProjectMilestoneRow[];
  photos: ProjectPhotoRow[];
  vendors: VendorOption[];
  assignments: ProjectAssignmentRow[];
  staffPickerOptions: FieldStaffPickerRow[];
}

/**
 * Client tab switcher. Tab state is local — sharing a URL with a
 * specific tab open isn't a load-bearing requirement here, and keeping
 * it in client state avoids a Server Component round-trip per click.
 */
export function ProjectDetailClient({
  project,
  milestones,
  photos,
  vendors,
  assignments,
  staffPickerOptions,
}: Props) {
  const [tab, setTab] = useState<TabId>('milestones');

  return (
    <div>
      <div className="mb-6 flex items-center gap-1 border-b border-line-2">
        {TABS.map((t) => {
          const isActive = tab === t.id;
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={cn(
                'relative inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors',
                isActive
                  ? 'text-brand-teal-500'
                  : 'hover:text-brand-teal-500 text-gray-500',
              )}
              aria-current={isActive ? 'page' : undefined}
            >
              <Icon size={14} strokeWidth={1.75} />
              {t.label}
              {isActive && (
                <span className="bg-brand-teal-500 absolute right-3 -bottom-px left-3 h-0.5 rounded-full" />
              )}
            </button>
          );
        })}
      </div>

      {tab === 'milestones' && (
        <MilestonesTabClient
          projectId={project.id}
          clientId={project.clientId}
          milestones={milestones}
          vendors={vendors}
        />
      )}
      {tab === 'photos' && (
        <ProjectPhotosTabClient
          projectId={project.id}
          clientId={project.clientId}
          photos={photos}
        />
      )}
      {tab === 'team' && (
        <TeamTabClient
          projectId={project.id}
          assignments={assignments}
          pickerOptions={staffPickerOptions}
        />
      )}
      {tab === 'details' && <DetailsTabClient project={project} />}
    </div>
  );
}

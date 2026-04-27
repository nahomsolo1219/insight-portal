// Server-component wrapper that fetches projects for the active property
// plus the data the New Project modal needs (sibling properties, the
// template list, and the field-staff picker options). Four parallel
// reads, one client-side render.

import { getActiveFieldStaffForPicker } from '../../projects/[id]/queries';
import { getProjectsForProperty, getTemplatesForSelect } from './queries';
import { ProjectsList } from './ProjectsList';
import type { PropertyRow } from './queries';

interface ProjectsTabProps {
  clientId: string;
  propertyId: string;
  properties: PropertyRow[];
}

export async function ProjectsTab({ clientId, propertyId, properties }: ProjectsTabProps) {
  const [projects, templates, fieldStaff] = await Promise.all([
    getProjectsForProperty(propertyId),
    getTemplatesForSelect(),
    getActiveFieldStaffForPicker(),
  ]);

  return (
    <ProjectsList
      clientId={clientId}
      projects={projects}
      properties={properties}
      templates={templates}
      fieldStaff={fieldStaff}
      activePropertyId={propertyId}
    />
  );
}

// Server-component wrapper that fetches projects for the active property
// plus the data the New Project modal needs (sibling properties + the
// template list). Three parallel reads, one client-side render.

import { getProjectsForProperty, getTemplatesForSelect } from './queries';
import { ProjectsList } from './ProjectsList';
import type { PropertyRow } from './queries';

interface ProjectsTabProps {
  clientId: string;
  propertyId: string;
  properties: PropertyRow[];
}

export async function ProjectsTab({ clientId, propertyId, properties }: ProjectsTabProps) {
  const [projects, templates] = await Promise.all([
    getProjectsForProperty(propertyId),
    getTemplatesForSelect(),
  ]);

  return (
    <ProjectsList
      clientId={clientId}
      projects={projects}
      properties={properties}
      templates={templates}
      activePropertyId={propertyId}
    />
  );
}

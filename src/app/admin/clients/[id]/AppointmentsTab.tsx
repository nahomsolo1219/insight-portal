// Server wrapper for the Appointments tab. Parallelises the four reads
// the client component needs — the appointment list (pre-split into
// upcoming/past) plus three lookup tables for the New Appointment modal's
// dropdowns.

import { AppointmentsTabClient } from './AppointmentsTabClient';
import {
  getActivePmsForSelect,
  getAppointmentsForProperty,
  getProjectsForPropertySelect,
  getVendorsForSelect,
} from './queries';

interface AppointmentsTabProps {
  clientId: string;
  propertyId: string;
}

export async function AppointmentsTab({ clientId, propertyId }: AppointmentsTabProps) {
  const [appointmentData, vendors, projects, pms] = await Promise.all([
    getAppointmentsForProperty(propertyId),
    getVendorsForSelect(),
    getProjectsForPropertySelect(propertyId),
    getActivePmsForSelect(),
  ]);

  return (
    <AppointmentsTabClient
      clientId={clientId}
      propertyId={propertyId}
      upcoming={appointmentData.upcoming}
      past={appointmentData.past}
      vendors={vendors}
      projects={projects}
      pms={pms}
    />
  );
}

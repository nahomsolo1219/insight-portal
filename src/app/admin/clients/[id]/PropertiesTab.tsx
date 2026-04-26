// Server-component wrapper for the Properties tab. Pulls full property
// records + per-property project lists in one shot so the expanded card
// can show the projects inline without an extra round-trip.

import { getClientPropertiesDetailed } from './queries';
import { PropertiesTabClient } from './PropertiesTabClient';

interface Props {
  clientId: string;
  /** From the property switcher in the URL — the matching card auto-expands. */
  activePropertyId: string | null;
}

export async function PropertiesTab({ clientId, activePropertyId }: Props) {
  const properties = await getClientPropertiesDetailed(clientId);
  return (
    <PropertiesTabClient
      clientId={clientId}
      properties={properties}
      activePropertyId={activePropertyId}
    />
  );
}

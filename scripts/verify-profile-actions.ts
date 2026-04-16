// Exercise the update-client / update-property write paths directly against
// the DB. We skip the real Server Actions (they require an auth session) and
// replicate their Drizzle work so the shape of the writes matches production.
// Reverts everything on the way out so the seed stays intact.

import './_env';

import { eq } from 'drizzle-orm';
import { db } from '../src/db';
import { clients, properties } from '../src/db/schema';
import { getClientDetail, getPropertyDetail } from '../src/app/admin/clients/[id]/queries';

async function main() {
  const andersons = await db.query.clients.findFirst({
    where: (c, { eq }) => eq(c.name, 'The Andersons'),
  });
  if (!andersons) {
    console.error('Seed missing: Andersons not found. Run `npm run db:seed`.');
    process.exit(1);
  }

  const detail = await getClientDetail(andersons.id);
  if (!detail) {
    console.error('getClientDetail returned null');
    process.exit(1);
  }

  // --- Client update round-trip ---
  const originalClient = detail.client;
  console.log('\nBefore updateClient():');
  console.log(`  name=${originalClient.name}  email=${originalClient.email}  phone=${originalClient.phone}  memberSince=${originalClient.memberSince}`);

  await db
    .update(clients)
    .set({
      name: originalClient.name,
      email: 'andersons-test@example.com',
      phone: null,
      membershipTierId: originalClient.tierId,
      assignedPmId: originalClient.assignedPmId,
      memberSince: originalClient.memberSince,
      updatedAt: new Date(),
    })
    .where(eq(clients.id, andersons.id));

  const afterUpdate = await getClientDetail(andersons.id);
  console.log('After:');
  console.log(`  name=${afterUpdate?.client.name}  email=${afterUpdate?.client.email}  phone=${afterUpdate?.client.phone}  memberSince=${afterUpdate?.client.memberSince}`);

  // Revert.
  await db
    .update(clients)
    .set({
      email: originalClient.email,
      phone: originalClient.phone,
      updatedAt: new Date(),
    })
    .where(eq(clients.id, andersons.id));
  const reverted = await getClientDetail(andersons.id);
  console.log('Reverted:');
  console.log(`  email=${reverted?.client.email}  phone=${reverted?.client.phone}`);

  // --- Property update round-trip ---
  const firstProperty = detail.properties[0];
  if (!firstProperty) {
    console.log('\nNo property to exercise updateProperty() against — skipping.');
    return;
  }

  const beforeProp = await getPropertyDetail(firstProperty.id);
  console.log('\nBefore updateProperty():');
  console.log(`  name=${beforeProp?.name}  sqft=${beforeProp?.sqft}  gate=${beforeProp?.gateCode}  emergency=${beforeProp?.emergencyContact}`);

  await db
    .update(properties)
    .set({
      name: beforeProp!.name,
      address: beforeProp!.address,
      city: beforeProp!.city ?? '',
      state: beforeProp!.state ?? '',
      zipcode: beforeProp!.zipcode,
      sqft: 9999, // test write
      yearBuilt: beforeProp!.yearBuilt,
      gateCode: 'TEST-GATE',
      accessNotes: 'Temporary test note — will be reverted.',
      emergencyContact: beforeProp!.emergencyContact,
      updatedAt: new Date(),
    })
    .where(eq(properties.id, firstProperty.id));

  const afterProp = await getPropertyDetail(firstProperty.id);
  console.log('After:');
  console.log(`  name=${afterProp?.name}  sqft=${afterProp?.sqft}  gate=${afterProp?.gateCode}  notes="${afterProp?.accessNotes}"`);

  // Revert.
  await db
    .update(properties)
    .set({
      sqft: beforeProp!.sqft,
      gateCode: beforeProp!.gateCode,
      accessNotes: beforeProp!.accessNotes,
      updatedAt: new Date(),
    })
    .where(eq(properties.id, firstProperty.id));
  const revertedProp = await getPropertyDetail(firstProperty.id);
  console.log('Reverted:');
  console.log(`  sqft=${revertedProp?.sqft}  gate=${revertedProp?.gateCode}  notes="${revertedProp?.accessNotes}"`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });

import { requireAdmin } from '@/lib/auth/current-user';
import { StaffClient } from './StaffClient';
import { listStaff } from './queries';

export default async function StaffPage() {
  await requireAdmin();
  const members = await listStaff();

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-brand-teal-500 text-3xl">Staff</h1>
        <p className="mt-1 text-sm text-[#737373]">
          Internal team. {members.length} {members.length === 1 ? 'member' : 'members'}.
        </p>
      </header>

      <StaffClient members={members} />
    </div>
  );
}

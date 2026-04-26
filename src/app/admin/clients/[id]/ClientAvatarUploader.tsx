'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { AvatarUpload } from '@/components/admin/AvatarUpload';
import { useToast } from '@/components/admin/ToastProvider';
import { uploadClientAvatar } from './actions';

/**
 * Client component bridge that binds `uploadClientAvatar` to a specific
 * clientId so the underlying AvatarUpload (which is generic) can stay
 * domain-agnostic. Also re-renders on success so the upload's optimistic
 * preview is replaced by the server's freshly-signed URL.
 */
export function ClientAvatarUploader({
  clientId,
  initials,
  currentUrl,
}: {
  clientId: string;
  initials: string;
  currentUrl: string | null;
}) {
  const router = useRouter();
  const { showToast } = useToast();
  // Hold the most recent successful URL locally so the new image appears
  // instantly even before the router refetch completes.
  const [latestUrl, setLatestUrl] = useState<string | null>(currentUrl);

  return (
    <AvatarUpload
      currentUrl={latestUrl}
      initials={initials}
      size="md"
      ariaLabel="Change client avatar"
      onUpload={async (formData) => {
        const result = await uploadClientAvatar(clientId, formData);
        if (!result.success) {
          showToast(result.error, 'error');
          return { success: false, error: result.error };
        }
        setLatestUrl(result.url);
        showToast('Avatar updated');
        router.refresh();
        return { success: true };
      }}
    />
  );
}

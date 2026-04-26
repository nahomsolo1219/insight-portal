import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // iPhone photos run 3-8MB; field staff often upload several at once.
  // 25MB matches the Supabase storage bucket per-file ceiling.
  experimental: {
    serverActions: {
      bodySizeLimit: '25mb',
    },
  },
};

export default nextConfig;

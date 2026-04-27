import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // iPhone photos run 3-8MB; field staff often upload several at once.
  // 25MB matches the Supabase storage bucket per-file ceiling.
  experimental: {
    serverActions: {
      bodySizeLimit: '25mb',
    },
  },
  // Allow Next/Image to optimize images served from Supabase Storage's
  // public-bucket endpoint. We constrain by pathname to `/public/**` so
  // signed URLs from private buckets (which change per request) don't
  // get matched here — they'd fail Next/Image's deduplication anyway.
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
        pathname: '/storage/v1/object/public/**',
      },
    ],
  },
};

export default nextConfig;

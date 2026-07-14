import type { Metadata } from 'next';
import { DM_Serif_Display, Inter } from 'next/font/google';
import './globals.css';

// Two font families coexist — see docs/DESIGN_SYSTEM.md:
// - Inter is the body sans across every surface (admin / client / field) and
//   is also what page titles + hero headlines use, with `font-light` +
//   `tracking-tight` (or `tracking-tighter` at the very largest sizes) for
//   the editorial feel that the brand spec (Helvetica Neue / Inter only)
//   allows.
// - DM Serif Display is loaded but no longer used after the admin sweep;
//   removing the import is a separate cleanup.
const inter = Inter({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  variable: '--font-inter',
  display: 'swap',
});

const dmSerif = DM_Serif_Display({
  subsets: ['latin'],
  weight: '400',
  variable: '--font-dm-serif',
  display: 'swap',
});

// Neutral default title — this covers the public / auth surfaces (login,
// password-set, the `/` role dispatcher). Each route group overrides it with
// its own audience-appropriate title via `metadata` in its layout, so a
// logged-in client no longer sees "Admin Portal" in their tab.
export const metadata: Metadata = {
  title: 'Insight HM',
  description:
    'Insight Home Maintenance — luxury home maintenance and remodel for SF Bay Area homeowners.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} ${dmSerif.variable} h-full antialiased`}>
      <body className="bg-brand-warm-100 min-h-full text-[#444]">{children}</body>
    </html>
  );
}

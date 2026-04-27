import type { Metadata } from 'next';
import { DM_Serif_Display, Fraunces, Inter } from 'next/font/google';
import './globals.css';

// Three font families coexist intentionally — see docs/DESIGN_SYSTEM.md:
// - Inter is the body sans across every surface (admin / client / field).
// - DM Serif Display is the admin portal's display face — page titles only.
// - Fraunces is the client portal's editorial serif. Italics and multiple
//   weights are loaded so the redesigned client portal can use the variable
//   font for greetings, hero copy, and editorial accents.
// Field-staff app inherits Inter only (no display face).
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

const fraunces = Fraunces({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  style: ['normal', 'italic'],
  variable: '--font-fraunces',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Insight HM — Admin Portal',
  description:
    'Internal operations hub for Insight Home Maintenance — luxury home maintenance and remodel.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} ${dmSerif.variable} ${fraunces.variable} h-full antialiased`}>
      <body className="bg-brand-warm-100 min-h-full text-[#444]">{children}</body>
    </html>
  );
}

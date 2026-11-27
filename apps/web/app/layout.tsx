import type { Metadata } from 'next';
import { Manrope } from 'next/font/google';
import '@/styles/glass.css';
import '@/styles/tokens.css';

const manrope = Manrope({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  variable: '--font-manrope',
});

export const metadata: Metadata = {
  title: 'Energy Orchestration Centre · Globe Medicare',
  description: 'jouleWise ergOS demand response and demand ceiling for Globe Medicare, Lucknow.',
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-IN" className={manrope.variable}>
      <body>{children}</body>
    </html>
  );
}

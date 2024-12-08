import './globals.css';
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { Shell } from '@/components/shell';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Video Editor',
  description: 'A modern web-based video editor',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>
        <Shell>{children}</Shell>
      </body>
    </html>
  );
}
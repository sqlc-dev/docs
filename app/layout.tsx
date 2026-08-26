import { Inter } from 'next/font/google';
import { Provider } from '@/components/provider';
import type { Metadata } from 'next';
import './global.css';

const inter = Inter({
  subsets: ['latin'],
});

export const metadata: Metadata = {
  metadataBase: new URL(
    `https://docs.sqlc.dev${process.env.NEXT_PUBLIC_BASE_PATH ?? ''}`,
  ),
  title: {
    template: '%s — sqlc',
    default: 'sqlc Documentation',
  },
  // Versioned snapshots must never outrank the current docs in search
  // engines: only the root (latest) build is indexable.
  ...(process.env.NEXT_PUBLIC_BASE_PATH
    ? { robots: { index: false, follow: false } }
    : {}),
};

export default function Layout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en" className={inter.className} suppressHydrationWarning>
      <body className="flex flex-col min-h-screen">
        <Provider>{children}</Provider>
      </body>
    </html>
  );
}

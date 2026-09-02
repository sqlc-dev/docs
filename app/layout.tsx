import { Inter } from 'next/font/google';
import { Provider } from '@/components/provider';
import type { Metadata } from 'next';
import './global.css';

const inter = Inter({
  subsets: ['latin'],
});

// Resolved (with default) via next.config.mjs `env`.
const basePath = process.env.NEXT_PUBLIC_BASE_PATH;

export const metadata: Metadata = {
  metadataBase: new URL(`https://docs.sqlc.dev${basePath}`),
  title: {
    template: '%s — sqlc',
    default: 'sqlc Documentation',
  },
  // Versioned snapshots must never outrank the current docs in search
  // engines: only the /en/latest build is indexable.
  ...(basePath === '/en/latest'
    ? {}
    : { robots: { index: false, follow: false } }),
};

export default function Layout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en" className={inter.className} suppressHydrationWarning>
      <head>
        {/* Plausible analytics, self-proxied (see the privacy guide). A plain
            tag rather than next/script so it lands in every exported page's
            HTML, as it did in the old Sphinx docs/_templates/layout.html. */}
        <script
          defer
          data-domain="docs.sqlc.dev"
          data-api="https://proxy.sqlc.dev/api/event"
          src="https://proxy.sqlc.dev/js/script.js"
        />
      </head>
      <body className="flex flex-col min-h-screen">
        <Provider>{children}</Provider>
      </body>
    </html>
  );
}

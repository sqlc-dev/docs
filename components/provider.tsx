'use client';
import SearchDialog from '@/components/search';
import { RootProvider } from 'fumadocs-ui/provider/next';
import NextLink from 'next/link';
import { type ComponentProps, type ReactNode } from 'react';

// Every Fumadocs link (sidebar, page body, breadcrumb, prev/next footer)
// renders through the framework Link supplied here. Prefetching is disabled
// site-wide: this is a static export whose .html routes can't ship Next's
// per-segment payloads (see scripts/fix-html-ext.mjs), so each prefetch would
// only cost a HEAD to the page plus a 404 for its __next._tree.txt.
function Link({ href = '#', ...props }: ComponentProps<'a'> & { prefetch?: boolean }) {
  return <NextLink {...props} href={href} prefetch={false} />;
}

export function Provider({ children }: { children: ReactNode }) {
  return (
    <RootProvider search={{ SearchDialog }} components={{ Link }}>
      {children}
    </RootProvider>
  );
}

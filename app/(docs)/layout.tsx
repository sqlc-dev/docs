import { source } from '@/lib/source';
import { DocsLayout } from 'fumadocs-ui/layouts/docs';
import { baseOptions } from '@/lib/layout.shared';
import { VersionSwitcher } from '@/components/version-switcher';

export default function Layout({ children }: LayoutProps<'/'>) {
  return (
    <DocsLayout
      tree={source.getPageTree()}
      sidebar={{ banner: <VersionSwitcher /> }}
      {...baseOptions()}
    >
      {children}
    </DocsLayout>
  );
}

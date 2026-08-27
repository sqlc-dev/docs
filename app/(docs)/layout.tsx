import { source } from '@/lib/source';
import { DocsLayout } from 'fumadocs-ui/layouts/docs';
import { baseOptions } from '@/lib/layout.shared';
import { VersionSwitcher } from '@/components/version-switcher';
import { VersionBanner } from '@/components/version-banner';

export default function Layout({ children }: LayoutProps<'/'>) {
  return (
    <>
      <VersionBanner />
      <DocsLayout
        tree={source.getPageTree()}
        sidebar={{ banner: <VersionSwitcher /> }}
        {...baseOptions()}
      >
        {children}
      </DocsLayout>
    </>
  );
}

import { getPageImageUrl, getPageMarkdownUrl, source } from '@/lib/source';
import {
  DocsBody,
  DocsDescription,
  DocsPage,
  DocsTitle,
  MarkdownCopyButton,
  ViewOptionsPopover,
} from 'fumadocs-ui/layouts/docs/page';
import { notFound } from 'next/navigation';
import { getMDXComponents } from '@/components/mdx';
import type { Metadata } from 'next';
import { createRelativeLink } from '@/lib/relative-link';
import { gitConfig } from '@/lib/shared';

// Routes carry the .html suffix of the legacy Read the Docs URLs
// (/howto/select.html); page slugs in the source do not.
function toSlugs(slug: string[] | undefined): string[] | undefined {
  if (!slug || slug.length === 0) return slug;
  const last = slug[slug.length - 1];
  if (!last.endsWith('.html')) return slug;
  return [...slug.slice(0, -1), last.slice(0, -'.html'.length)];
}

export default async function Page(props: PageProps<'/[[...slug]]'>) {
  const params = await props.params;
  const page = source.getPage(toSlugs(params.slug));
  if (!page) notFound();

  const MDX = page.data.body;
  const markdownUrl = getPageMarkdownUrl(page).url;
  // Per-release changelog pages are split out of reference/changelog.md by
  // the ingest step; their upstream source is that one file.
  const sourcePath = page.path.startsWith('reference/changelog/')
    ? 'reference/changelog.md'
    : page.path;

  return (
    <DocsPage toc={page.data.toc} full={page.data.full}>
      <DocsTitle>{page.data.title}</DocsTitle>
      <DocsDescription className="mb-0">{page.data.description}</DocsDescription>
      <div className="flex flex-row gap-2 items-center border-b pb-6">
        <MarkdownCopyButton markdownUrl={markdownUrl} />
        <ViewOptionsPopover
          markdownUrl={markdownUrl}
          githubUrl={`https://github.com/${gitConfig.user}/${gitConfig.repo}/blob/${gitConfig.branch}/docs/${sourcePath}`}
        />
      </div>
      <DocsBody>
        <MDX
          components={getMDXComponents({
            // this allows you to link to other pages with relative file paths
            a: createRelativeLink(source, page),
          })}
        />
      </DocsBody>
    </DocsPage>
  );
}

export async function generateStaticParams() {
  return source.generateParams().map(({ slug }) => {
    if (!slug || slug.length === 0) return { slug };
    return { slug: [...slug.slice(0, -1), `${slug[slug.length - 1]}.html`] };
  });
}

export async function generateMetadata(props: PageProps<'/[[...slug]]'>): Promise<Metadata> {
  const params = await props.params;
  const page = source.getPage(toSlugs(params.slug));
  if (!page) notFound();

  return {
    title: page.data.title,
    description: page.data.description,
    openGraph: {
      images: getPageImageUrl(page).url,
    },
  };
}

import { getPageImageUrl, source } from '@/lib/source';
import {
  DocsBody,
  DocsDescription,
  DocsPage,
  DocsTitle,
} from 'fumadocs-ui/layouts/docs/page';
import { notFound } from 'next/navigation';
import { getMDXComponents } from '@/components/mdx';
import type { Metadata } from 'next';
import { createRelativeLink } from '@/lib/relative-link';

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

  return (
    <DocsPage toc={page.data.toc} full={page.data.full}>
      <DocsTitle>{page.data.title}</DocsTitle>
      <DocsDescription>{page.data.description}</DocsDescription>
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

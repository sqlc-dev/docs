import type { AnchorHTMLAttributes } from 'react';
import defaultMdxComponents from 'fumadocs-ui/mdx';
import type { source } from '@/lib/source';

type Source = typeof source;

// Absolute URLs, schemes (https:, mailto:), in-page anchors, and already
// explicit relative paths pass through untouched.
const PASSTHROUGH = /^(?:[a-z][a-z0-9+.-]*:|\/|#|\.{1,2}\/)/i;

/**
 * Resolves relative `.md` links from the content contract
 * (`../reference/config.md#database`, `generate.md`) to page routes at render
 * time. Fumadocs' own `createRelativeLink` only handles `./`- and
 * `../`-prefixed hrefs; the contract also allows bare ones, so normalize
 * before resolving.
 */
export function createRelativeLink(src: Source, page: NonNullable<ReturnType<Source['getPage']>>) {
  const DefaultLink = defaultMdxComponents.a;

  return function RelativeLink({ href, ...props }: AnchorHTMLAttributes<HTMLAnchorElement>) {
    let resolved = href;
    if (href && !PASSTHROUGH.test(href)) resolved = `./${href}`;
    if (resolved && (resolved.startsWith('./') || resolved.startsWith('../'))) {
      resolved = src.resolveHref(resolved, page);
    }
    return <DefaultLink href={resolved} {...props} />;
  };
}

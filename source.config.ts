import { defineConfig } from 'fumadocs-mdx/config';
import { remarkGithubAlerts } from './lib/remark-github-alerts';

export default defineConfig({
  mdxOptions: {
    // The ingested pages are plain CommonMark + GFM (.md, never .mdx): the
    // sqlc content contract allows literal `{...}` and `<...>` in prose, which
    // MDX would reject. fumadocs-mdx picks the md parser from the file
    // extension; this config only adds plugins on top of the defaults.
    remarkPlugins: (v) => [remarkGithubAlerts, ...v],
  },
});

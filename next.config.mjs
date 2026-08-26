import { createMDX } from 'fumadocs-mdx/next';

const withMDX = createMDX();

// Versioned builds are mounted under a path prefix (e.g. /v1.32.0). Static
// export bakes absolute asset/link/search paths, so the prefix must be set at
// build time. NEXT_PUBLIC_ so client components (version switcher) see it too.
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

/** @type {import('next').NextConfig} */
const config = {
  output: 'export',
  reactStrictMode: true,
  ...(basePath === '' ? {} : { basePath }),
};

export default withMDX(config);

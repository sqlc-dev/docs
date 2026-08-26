import { createMDX } from 'fumadocs-mdx/next';

const withMDX = createMDX();

// The whole site keeps the Read the Docs URL scheme: the latest build is
// mounted at /en/latest, versioned builds at /en/vX.Y.Z (set
// NEXT_PUBLIC_BASE_PATH). Static export bakes absolute asset/link/search
// paths, so the prefix must be set at build time.
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? '/en/latest';

/** @type {import('next').NextConfig} */
const config = {
  output: 'export',
  reactStrictMode: true,
  basePath,
  env: {
    // Inline the resolved value (default included) for server and client
    // alike — components must never see the raw, possibly-unset variable.
    NEXT_PUBLIC_BASE_PATH: basePath,
  },
};

export default withMDX(config);

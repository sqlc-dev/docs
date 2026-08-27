// The URL prefix this build was mounted under; resolved (with default) via
// next.config.mjs `env`.
const CURRENT = process.env.NEXT_PUBLIC_BASE_PATH ?? '/en/latest';

/**
 * Old-version notice baked into versioned snapshots (/en/vX.Y.Z builds) at
 * build time. The /en/latest build renders nothing. Legacy Sphinx snapshots
 * get the equivalent banner injected by scripts/assemble-site.mjs.
 */
export function VersionBanner() {
  if (CURRENT === '/en/latest') return null;
  const version = CURRENT.replace(/^\/en\//, '');
  return (
    <div className="bg-amber-100 px-4 py-2 text-center text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">
      You are viewing the documentation for <strong>{version}</strong>, an older release of sqlc.{' '}
      {/* Plain <a>: the link leaves this build's basePath, so it must be a
          full page load, not a Next.js client navigation. */}
      <a href="/en/latest/" className="font-semibold underline">
        View the latest documentation.
      </a>
    </div>
  );
}

'use client';

import { useEffect, useState } from 'react';

interface VersionsFile {
  latest?: string;
  versions?: string[];
}

// The URL prefix this build was mounted under, following the Read the Docs
// scheme: /en/latest for the current docs, /en/vX.Y.Z for snapshots.
// Resolved (with default) via next.config.mjs `env`.
const CURRENT = process.env.NEXT_PUBLIC_BASE_PATH ?? '/en/latest';
const LATEST = '/en/latest';

/**
 * Version dropdown driven by /versions.json at the domain root. The file is
 * appended to by each release workflow and fetched at runtime, so old
 * versioned snapshots list versions released after them.
 */
export function VersionSwitcher() {
  const [versions, setVersions] = useState<string[]>([]);

  useEffect(() => {
    // Absolute path on purpose: from an /en/vX.Y.Z page this still hits the
    // domain root, where versions.json lives.
    fetch('/versions.json')
      .then((res) => (res.ok ? (res.json() as Promise<VersionsFile>) : null))
      .then((data) => {
        if (data && Array.isArray(data.versions)) setVersions(data.versions);
      })
      .catch(() => {
        // No versions.json (e.g. local dev): hide the switcher.
      });
  }, []);

  if (versions.length === 0 && CURRENT === LATEST) return null;

  function switchTo(prefix: string) {
    const path = window.location.pathname.slice(CURRENT.length);
    window.location.href = `${prefix}${path}${window.location.hash}`;
  }

  return (
    <select
      aria-label="Documentation version"
      className="w-full rounded-md border bg-fd-secondary p-2 text-sm text-fd-secondary-foreground"
      value={CURRENT}
      onChange={(e) => switchTo(e.target.value)}
    >
      <option value={LATEST}>latest</option>
      {versions.map((v) => (
        <option key={v} value={`/en/${v}`}>
          {v}
        </option>
      ))}
      {/* Keep the baked-in version selectable even if versions.json is
          unreachable or does not list it. */}
      {CURRENT !== LATEST && !versions.some((v) => `/en/${v}` === CURRENT) && (
        <option value={CURRENT}>{CURRENT.replace('/en/', '')}</option>
      )}
    </select>
  );
}

'use client';

import { useEffect, useState } from 'react';

interface VersionsFile {
  latest?: string;
  versions?: string[];
}

// The version prefix this build was mounted under ('' for latest).
const CURRENT = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

/**
 * Version dropdown driven by /versions.json at the domain root. The file is
 * appended to by each release workflow and fetched at runtime, so old
 * versioned snapshots list versions released after them.
 */
export function VersionSwitcher() {
  const [versions, setVersions] = useState<string[]>([]);

  useEffect(() => {
    // Absolute path on purpose: from a /vX.Y.Z page this still hits the
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

  if (versions.length === 0 && CURRENT === '') return null;

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
      <option value="">latest</option>
      {versions.map((v) => (
        <option key={v} value={`/${v}`}>
          {v}
        </option>
      ))}
      {/* Keep the baked-in version selectable even if versions.json is
          unreachable or does not list it. */}
      {CURRENT !== '' && !versions.includes(CURRENT.slice(1)) && (
        <option value={CURRENT}>{CURRENT.slice(1)}</option>
      )}
    </select>
  );
}

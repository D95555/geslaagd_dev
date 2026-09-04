import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { getChangelog } from '@workspace/api-client-react';

export function VersionBadge() {
  const [, setLocation] = useLocation();
  const [version, setVersion] = useState<string | null>(null);

  useEffect(() => {
    void getChangelog()
      .then((result) => setVersion(result.entries[0]?.version ?? null))
      .catch(() => setVersion(null));
  }, []);

  if (!version) return null;
  return (
    <button type="button" className="version-badge" onClick={() => setLocation('/changelog')}>
      {version}
    </button>
  );
}

import { useEffect, useRef } from 'react';

/**
 * Keeps a page current without the reader having to ask for it.
 *
 * Polling pauses while the tab is hidden so a forgotten tab does not keep
 * hitting the API, and stops entirely once a refresh throws — at that point the
 * page's own refresh button is the way back, rather than a loop that keeps
 * failing quietly.
 */
export function useLivePoll(
  refresh: () => Promise<unknown>,
  options: { intervalMs?: number; enabled?: boolean } = {},
): void {
  const { intervalMs = 5_000, enabled = true } = options;

  // Held in a ref so a re-created callback does not restart the interval.
  const refreshRef = useRef(refresh);
  useEffect(() => {
    refreshRef.current = refresh;
  }, [refresh]);

  useEffect(() => {
    if (!enabled) return;

    let stopped = false;
    let running = false;

    const tick = async () => {
      if (stopped || running || document.hidden) return;
      running = true;
      try {
        await refreshRef.current();
      } catch {
        // Leave the last good data on screen and stop; the page offers a retry.
        stopped = true;
      } finally {
        running = false;
      }
    };

    const timer = setInterval(() => {
      void tick();
    }, intervalMs);

    // Catch up immediately when the reader comes back to the tab.
    const onVisible = () => {
      if (!document.hidden) void tick();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      stopped = true;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [enabled, intervalMs]);
}

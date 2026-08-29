import {
  createContext,
  useContext,
  useEffect,
  useId,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

type RailContextValue = {
  setContent: (id: string, node: ReactNode | null) => void;
};

const RailContext = createContext<RailContextValue | null>(null);

/**
 * Lets a page fill the shell's right-hand context column without prop
 * drilling through the router. A stack rather than a single slot, same
 * reasoning as the theme provider: during a route transition the incoming
 * page can mount before the outgoing one unmounts, and removal-by-id keeps
 * that order-independent.
 */
export function RailProvider({ children }: { children: ReactNode }) {
  const [entries, setEntries] = useState<Record<string, ReactNode>>({});

  const setContent = useMemo(
    () => (id: string, node: ReactNode | null) => {
      setEntries((current) => {
        if (node === null) {
          if (!(id in current)) return current;
          const next = { ...current };
          delete next[id];
          return next;
        }
        return { ...current, [id]: node };
      });
    },
    [],
  );

  const ids = Object.keys(entries);
  const content = ids.length > 0 ? entries[ids[ids.length - 1]] : null;

  return (
    <RailContext.Provider value={{ setContent }}>
      <RailSlotContext.Provider value={content}>{children}</RailSlotContext.Provider>
    </RailContext.Provider>
  );
}

const RailSlotContext = createContext<ReactNode>(null);

/** What the shell should render in its context column right now, if anything. */
export function useRailSlotContent(): ReactNode {
  return useContext(RailSlotContext);
}

/**
 * Registers `node` as this page's context-rail content for as long as it's
 * mounted. Pass `null` to contribute nothing (the column then collapses if no
 * other page is contributing either).
 */
export function useContextRail(node: ReactNode | null): void {
  const ctx = useContext(RailContext);
  const id = useId();

  useEffect(() => {
    if (!ctx) return;
    ctx.setContent(id, node);
    return () => ctx.setContent(id, null);
  }, [ctx, id, node]);
}

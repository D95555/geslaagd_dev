import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type Theme = "light" | "dark";

type ThemeContextValue = {
  theme: Theme;
  requestSurface: (id: string, theme: Theme) => void;
  releaseSurface: (id: string) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

/**
 * Applies the active theme to the document root.
 *
 * The theme is a property of the *surface* rather than a user setting: the
 * learning environment is deep ink, the public site is paper. Shells declare
 * which one they are with `useSurfaceTheme`, and the most recently mounted
 * declaration wins.
 */
export function ThemeProvider({
  children,
  defaultTheme = "light",
}: {
  children: ReactNode;
  defaultTheme?: Theme;
}) {
  // A stack rather than a single value: on a route change the incoming shell
  // may mount before the outgoing one unmounts, so "last write wins" would
  // leave the wrong theme behind. Removing by id is order-independent.
  const [stack, setStack] = useState<Array<{ id: string; theme: Theme }>>([]);

  const requestSurface = useCallback((id: string, theme: Theme) => {
    setStack((current) => [...current.filter((entry) => entry.id !== id), { id, theme }]);
  }, []);

  const releaseSurface = useCallback((id: string) => {
    setStack((current) => current.filter((entry) => entry.id !== id));
  }, []);

  const theme = stack.at(-1)?.theme ?? defaultTheme;

  useEffect(() => {
    const root = document.documentElement;
    // The dark variant is `&:is(.dark *)`, and Radix renders dialogs, sheets
    // and popovers through a portal on document.body -- outside any wrapper
    // element. Marking the root is what keeps those in the same theme.
    root.classList.toggle("dark", theme === "dark");
    // Lets the browser theme native controls, scrollbars and form widgets.
    root.style.colorScheme = theme;
  }, [theme]);

  const value = useMemo(
    () => ({ theme, requestSurface, releaseSurface }),
    [theme, requestSurface, releaseSurface],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

/** The theme currently applied to the document. */
export function useTheme(): Theme {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used inside a ThemeProvider");
  }
  return context.theme;
}

/**
 * Declares the theme this surface renders in, for as long as it is mounted.
 * The previous surface's theme is restored on unmount.
 */
export function useSurfaceTheme(theme: Theme): void {
  const context = useContext(ThemeContext);
  const id = useId();
  const requestSurface = context?.requestSurface;
  const releaseSurface = context?.releaseSurface;

  useEffect(() => {
    if (!requestSurface || !releaseSurface) return;
    requestSurface(id, theme);
    return () => releaseSurface(id);
  }, [id, theme, requestSurface, releaseSurface]);
}

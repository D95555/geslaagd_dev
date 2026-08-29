import { useEffect, useRef } from 'react';

export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  return target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT';
}

export type Hotkey = {
  /** Matched case-insensitively against `event.key`. */
  key: string;
  /** Require Cmd (Mac) or Ctrl (other platforms). */
  meta?: boolean;
  shift?: boolean;
  /** Fire even while focus is in an input/textarea/select/contenteditable. */
  allowInEditable?: boolean;
  handler: (event: KeyboardEvent) => void;
};

/**
 * Registers global keyboard shortcuts on `window`, guarded by default
 * against firing while the user is typing in a form field -- the gap the
 * sidebar primitive's own Cmd+B binding doesn't have (see
 * `useSuppressSidebarHotkeyInEditable` below).
 */
export function useHotkeys(hotkeys: Hotkey[]): void {
  const hotkeysRef = useRef(hotkeys);
  hotkeysRef.current = hotkeys;

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const match = hotkeysRef.current.find(
        (hotkey) =>
          event.key.toLowerCase() === hotkey.key.toLowerCase() &&
          Boolean(hotkey.meta) === (event.metaKey || event.ctrlKey) &&
          Boolean(hotkey.shift) === event.shiftKey,
      );
      if (!match) return;
      if (!match.allowInEditable && isEditableTarget(event.target)) return;
      event.preventDefault();
      match.handler(event);
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);
}

/**
 * The sidebar primitive (`@workspace/geslaagd-momentum/components/ui/sidebar`)
 * binds its own Cmd/Ctrl+B toggle on `window` at the default bubble phase,
 * with no input-field guard, and it can't be patched without forking it. A
 * capture-phase listener for the same combo runs before that bubble
 * listener does, so it can swallow the event first -- but only while focus
 * is in an editable element; otherwise the built-in toggle should still work.
 */
export function useSuppressSidebarHotkeyInEditable(): void {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key.toLowerCase() !== 'b') return;
      if (!(event.metaKey || event.ctrlKey)) return;
      if (isEditableTarget(event.target)) event.stopPropagation();
    }
    window.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', handleKeyDown, { capture: true });
  }, []);
}

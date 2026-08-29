import type { RefObject } from 'react';
import { useHotkeys } from './use-hotkeys';

/**
 * j/k move DOM focus through a list of button refs (skipping disabled
 * entries), starting from `activeIndex` when none of them currently has
 * focus. Native Enter/Space then activates whichever button ends up
 * focused -- no separate Enter binding needed, so this can't interfere with
 * Enter/Space activating some other focused control elsewhere on the page.
 */
export function useArrowKeyListFocus(
  itemsRef: RefObject<(HTMLElement | null)[]>,
  activeIndex: number,
): void {
  function move(direction: 1 | -1) {
    const items = itemsRef.current;
    const focusedIndex = items.findIndex((item) => item === document.activeElement);
    let next = (focusedIndex !== -1 ? focusedIndex : activeIndex) + direction;
    while (next >= 0 && next < items.length && items[next]?.hasAttribute('disabled')) {
      next += direction;
    }
    items[next]?.focus();
  }

  useHotkeys([
    { key: 'j', handler: () => move(1) },
    { key: 'k', handler: () => move(-1) },
  ]);
}

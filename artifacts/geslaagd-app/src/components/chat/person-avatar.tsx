import type { ReactNode } from 'react';

const TINT_COUNT = 5;

/** Deterministic per-id color, so the same person (or conversation) always
 * gets the same avatar tint across the app without the server tracking one. */
export function tintFor(id: string | null): number {
  if (!id) return TINT_COUNT - 1; // the AI always gets the same, distinct tint
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return hash % (TINT_COUNT - 1);
}

export function initialFor(label: string): string {
  return label.trim().slice(0, 1).toUpperCase() || '?';
}

export function PersonAvatar({
  id,
  label,
  size = 'md',
  icon,
  imageUrl,
  className = '',
}: {
  id: string | null;
  label: string;
  size?: 'md' | 'lg';
  /** Overrides the initial-letter fallback, e.g. a group icon. */
  icon?: ReactNode;
  /** When set, shows a real avatar image instead of the tint+initial fallback. */
  imageUrl?: string | null;
  className?: string;
}) {
  const sizeClass = size === 'lg' ? 'person-avatar-lg' : '';
  if (imageUrl) {
    return (
      <img
        src={imageUrl}
        alt=""
        className={`person-avatar person-avatar-img ${sizeClass} ${className}`}
        aria-hidden="true"
      />
    );
  }
  return (
    <span
      className={`person-avatar tint-${tintFor(id)} ${sizeClass} ${className}`}
      aria-hidden="true"
    >
      {icon ?? initialFor(label)}
    </span>
  );
}

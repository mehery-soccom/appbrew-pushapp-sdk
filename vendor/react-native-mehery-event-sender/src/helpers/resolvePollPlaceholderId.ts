/**
 * WS/poll often sends `event.event_data.compare` as `[]` (truthy in JS).
 * That blocks the `|| style.placeholder_id` fallback and breaks container matching.
 */
export function normalizePlaceholderId(raw: unknown): string {
  if (typeof raw === 'string') {
    return raw.trim();
  }
  if (Array.isArray(raw)) {
    for (const item of raw) {
      const nested = normalizePlaceholderId(item);
      if (nested) {
        return nested;
      }
    }
    return '';
  }
  if (raw == null) {
    return '';
  }
  if (typeof raw === 'number' || typeof raw === 'boolean') {
    return String(raw);
  }
  return '';
}

/** Prefer journey compare; fall back to template `placeholder_id`. */
export function resolvePollPlaceholderId(
  compare: unknown,
  stylePlaceholder?: unknown
): string {
  return (
    normalizePlaceholderId(compare) ||
    normalizePlaceholderId(stylePlaceholder) ||
    ''
  );
}

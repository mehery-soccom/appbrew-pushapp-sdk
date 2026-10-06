/** Attach `p_id` for the profile PUT body when non-empty. */
export function withOptionalProfileId<T extends object>(
  payload: T,
  pId: string | null | undefined
): T & { p_id?: string } {
  const trimmed = typeof pId === 'string' ? pId.trim() : '';
  if (!trimmed) return payload;
  return { ...payload, p_id: trimmed };
}

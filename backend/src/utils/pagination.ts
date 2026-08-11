export function getPagination(page?: string, limit?: string) {
  const p = Math.max(1, parseInt(page || '1', 10));
  const l = Math.min(100, Math.max(1, parseInt(limit || '20', 10)));
  const offset = (p - 1) * l;
  return { page: p, limit: l, offset };
}

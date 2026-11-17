export function evolutionMessagePageBody(pageSize: number, page = 1) {
  const offset = Math.min(500, Math.max(1, Math.trunc(pageSize) || 50));
  return {
    where: {},
    page: Math.max(1, Math.trunc(page) || 1),
    offset,
  };
}

export interface CursorPage<T> {
  items: T[];
  nextCursor: string | null;
}

export async function collectCursorPages<T>(
  load: (cursor: string | null) => Promise<CursorPage<T>>,
  maxPages = 100,
): Promise<T[]> {
  const items: T[] = [];
  const seen = new Set<string>();
  let cursor: string | null = null;
  for (let pageNumber = 0; pageNumber < maxPages; pageNumber += 1) {
    const page = await load(cursor);
    items.push(...page.items);
    if (!page.nextCursor || seen.has(page.nextCursor)) break;
    seen.add(page.nextCursor);
    cursor = page.nextCursor;
  }
  return items;
}

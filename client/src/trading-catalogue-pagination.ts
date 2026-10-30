export function getPageCount(totalItems: number, pageSize: number): number {
  if (!Number.isSafeInteger(totalItems) || totalItems < 0) throw new RangeError("totalItems must be a non-negative safe integer");
  if (!Number.isSafeInteger(pageSize) || pageSize < 1) throw new RangeError("pageSize must be a positive safe integer");
  return Math.max(1, Math.ceil(totalItems / pageSize));
}

export function paginateItems<T>(items: readonly T[], pageIndex: number, pageSize: number): T[] {
  if (!Number.isSafeInteger(pageSize) || pageSize < 1) throw new RangeError("pageSize must be a positive safe integer");
  const pageCount = getPageCount(items.length, pageSize);
  const normalizedPage = Number.isSafeInteger(pageIndex) ? Math.min(Math.max(0, pageIndex), pageCount - 1) : 0;
  const start = normalizedPage * pageSize;
  return items.slice(start, start + pageSize);
}

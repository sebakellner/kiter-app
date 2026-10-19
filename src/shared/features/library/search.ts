export const MAX_CATALOG_SEARCH_LENGTH = 500

export function normalizeCatalogSearch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .normalize('NFC')
    .toLowerCase()
    .replaceAll('\\', '/')
    .replace(/\s+/gu, ' ')
    .trim()
}

export function effectiveCatalogSearch(value: string): string {
  const normalized = normalizeCatalogSearch(value)
  return Array.from(normalized).length >= 2 ? normalized : ''
}

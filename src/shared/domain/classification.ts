import { requireName } from './validation.ts'

export interface Category {
  id: string
  name: string
}

export interface Author {
  id: string
  name: string
}

export function normalizeName(value: unknown): string {
  return requireName(value).normalize('NFC').toLowerCase()
}

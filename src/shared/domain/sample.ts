export type OriginAssignment = 'automatic' | 'manual'

export interface Sample {
  id: string
  displayName: string | null
  notes: string | null
  favorite: boolean
  packId: string | null
  originAssignment: OriginAssignment
}

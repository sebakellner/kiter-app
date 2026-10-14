export interface Collection {
  id: string
  name: string
  description: string | null
  coverAssetId: string | null
}

export interface CollectionMembership {
  collectionId: string
  sampleId: string
  position: number
}

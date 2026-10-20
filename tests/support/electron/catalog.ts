import type { Page } from '@playwright/test'

// Setup uses the real bridge, worker and database. The interaction under test
// stays in the journey; these helpers do not replace application dependencies.
export async function seedCollection(
  page: Page,
  name: string,
  members: string[],
): Promise<void> {
  await page.evaluate(
    async ({ name, members }) => {
      const catalog = await window.api.library.list({ limit: 100 })
      const collection = await window.api.collections.create({ name })
      if (!catalog.ok || !collection.ok) {
        throw new Error('Unable to prepare the Collection fixture.')
      }
      for (const relativePath of members) {
        const sample = catalog.data.items.find(
          (item) => item.relativePath === relativePath,
        )
        if (!sample) {
          throw new Error(`Missing fixture Sample: ${relativePath}`)
        }
        const result = await window.api.collections.setMembership({
          collectionId: collection.data.id,
          sampleId: sample.id,
          assigned: true,
        })
        if (!result.ok) {
          throw new Error('Unable to prepare a Collection membership.')
        }
      }
    },
    { name, members },
  )
}

export async function seedClassifiedSample(
  page: Page,
  relativePath: string,
): Promise<void> {
  await page.evaluate(async (relativePath) => {
    const catalog = await window.api.library.list()
    if (!catalog.ok) {
      throw new Error('Unable to read the fixture catalog.')
    }
    const sample = catalog.data.items.find(
      (item) => item.relativePath === relativePath,
    )
    const instrument = await window.api.instruments.create({ name: 'Kick' })
    const genres = await window.api.genres.list({ search: 'House' })
    if (!sample || !instrument.ok || !genres.ok) {
      throw new Error('Unable to prepare classification fixtures.')
    }
    const house = genres.data.items.find((genre) => genre.name === 'House')
    if (!house) {
      throw new Error('Missing House fixture Genre.')
    }
    const instruments = await window.api.instruments.readSample({
      sampleId: sample.id,
    })
    const savedGenres = await window.api.genres.readSample({
      sampleId: sample.id,
    })
    const type = await window.api.classification.readSampleType({
      sampleId: sample.id,
    })
    if (!instruments.ok || !savedGenres.ok || !type.ok) {
      throw new Error('Unable to read classification fixture tokens.')
    }
    const results = [
      await window.api.instruments.saveSample({
        sampleId: sample.id,
        token: instruments.data.token,
        instrumentIds: [instrument.data.id],
      }),
      await window.api.genres.saveSample({
        sampleId: sample.id,
        token: savedGenres.data.token,
        genreIds: [house.id],
      }),
      await window.api.classification.saveSampleType({
        sampleId: sample.id,
        token: type.data.token,
        sampleType: 'one-shot',
      }),
      await window.api.library.setFavorite(sample.id, true),
    ]
    if (results.some((result) => !result.ok)) {
      throw new Error('Unable to save classification fixtures.')
    }
  }, relativePath)
}

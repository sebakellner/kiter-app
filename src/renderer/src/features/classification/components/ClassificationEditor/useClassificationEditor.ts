import { useEffect, useRef, useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { classificationSelectionSchemas } from '../../schemas'
import type { ClassificationSelection } from '../../schemas'
import type { Category } from '@shared/domain/classification'
import type { CategoryPage } from '@shared/ipc/categories'
import { unwrapIpcResult } from '@shared/ipc/result'

type AssignmentSnapshot = {
  sampleId: string
  token: string
  categories: Category[]
}

async function readAssignments(
  sampleId: string,
  dimension: 'category' | 'genre',
): Promise<AssignmentSnapshot> {
  if (dimension === 'category') {
    return unwrapIpcResult(await window.api.categories.readSample({ sampleId }))
  }
  const snapshot = unwrapIpcResult(
    await window.api.genres.readSample({ sampleId }),
  )
  return {
    sampleId: snapshot.sampleId,
    token: snapshot.token,
    categories: snapshot.genres,
  }
}

export function useClassificationEditor(
  sampleId: string,
  onSaved: () => void,
  dimension: 'category' | 'genre',
): {
  saved: AssignmentSnapshot | null
  selected: Category[]
  search: string
  offset: number
  page: CategoryPage | null
  loading: boolean
  searching: boolean
  pending: boolean
  error: string | null
  listError: string | null
  needsReload: boolean
  dirty: boolean
  validationError: string | undefined
  save: () => Promise<boolean>
  reload: () => Promise<void>
  toggle: (category: Category) => void
  query: (value: string) => void
  move: (value: number) => void
  retryList: () => void
} {
  const [saved, setSaved] = useState<AssignmentSnapshot | null>(null)
  const plural = dimension === 'category' ? 'categories' : 'genres'
  const { control, getValues, setValue, reset, handleSubmit, formState } =
    useForm<ClassificationSelection>({
      resolver: zodResolver(classificationSelectionSchemas[dimension]),
      defaultValues: { ids: [] },
      mode: 'onBlur',
      reValidateMode: 'onChange',
    })
  const categoryIds = useWatch({ control, name: 'ids' })
  const [knownCategories, setKnownCategories] = useState(
    new Map<string, Category>(),
  )
  const selected = categoryIds.flatMap((id) => {
    const category = knownCategories.get(id)
    return category ? [category] : []
  })
  const [search, setSearch] = useState('')
  const [offset, setOffset] = useState(0)
  const [page, setPage] = useState<CategoryPage | null>(null)
  const [loading, setLoading] = useState(true)
  const [searching, setSearching] = useState(true)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [listError, setListError] = useState<string | null>(null)
  const [needsReload, setNeedsReload] = useState(false)
  const [version, setVersion] = useState(0)
  const active = useRef(true)
  const saving = useRef(false)
  const dirty = saved !== null && formState.isDirty

  useEffect(() => {
    active.current = true
    return () => {
      active.current = false
    }
  }, [])

  useEffect(() => {
    let current = true
    void readAssignments(sampleId, dimension)
      .then((snapshot) => {
        if (current) {
          setSaved(snapshot)
          setKnownCategories(
            new Map(
              snapshot.categories.map((category) => [category.id, category]),
            ),
          )
          reset({ ids: snapshot.categories.map(({ id }) => id).sort() })
          setLoading(false)
        }
      })
      .catch((reason: unknown) => {
        if (current) {
          setError(
            reason instanceof Error
              ? reason.message
              : `Unable to load saved ${plural}.`,
          )
          setLoading(false)
        }
      })
    return () => {
      current = false
    }
  }, [sampleId, reset, dimension, plural])

  useEffect(() => {
    let current = true
    void window.api[plural]
      .list({ search, offset, limit: 50 })
      .then(unwrapIpcResult)
      .then((result) => {
        if (current) {
          setPage(result)
          setSearching(false)
        }
      })
      .catch((reason: unknown) => {
        if (current) {
          setListError(
            reason instanceof Error
              ? reason.message
              : `Unable to list ${plural}.`,
          )
          setSearching(false)
        }
      })
    return () => {
      current = false
    }
  }, [search, offset, version, plural])

  async function reload(): Promise<void> {
    if (saving.current) {
      return
    }
    setPending(true)
    try {
      const snapshot = await readAssignments(sampleId, dimension)
      if (active.current) {
        // Keep the user's intended selection visible for explicit reconciliation.
        const draftIds = getValues('ids')
        setKnownCategories(
          (current) =>
            new Map([
              ...draftIds.flatMap((id) => {
                const category = current.get(id)
                return category ? [[id, category] as const] : []
              }),
              ...snapshot.categories.map(
                (category) => [category.id, category] as const,
              ),
            ]),
        )
        reset({ ids: snapshot.categories.map(({ id }) => id).sort() })
        setSaved(snapshot)
        if (saved) {
          setValue('ids', draftIds, {
            shouldDirty: true,
            shouldValidate: true,
          })
        }
        setError(null)
        setNeedsReload(false)
        setLoading(false)
      }
    } catch (reason) {
      if (active.current) {
        setError(
          reason instanceof Error
            ? reason.message
            : `Unable to reload saved ${plural}.`,
        )
      }
    } finally {
      if (active.current) {
        setPending(false)
      }
    }
  }

  async function save(): Promise<boolean> {
    if (!saved || saving.current || pending || needsReload || loading) {
      return false
    }
    let succeeded = false
    await handleSubmit(async (values) => {
      if (saving.current) {
        return
      }
      saving.current = true
      setPending(true)
      setError(null)
      try {
        const snapshot =
          dimension === 'category'
            ? unwrapIpcResult(
                await window.api.categories.saveSample({
                  sampleId,
                  token: saved.token,
                  categoryIds: values.ids,
                }),
              )
            : await (async (): Promise<AssignmentSnapshot> => {
                const result = unwrapIpcResult(
                  await window.api.genres.saveSample({
                    sampleId,
                    token: saved.token,
                    genreIds: values.ids,
                  }),
                )
                return {
                  sampleId: result.sampleId,
                  token: result.token,
                  categories: result.genres,
                }
              })()
        if (!active.current) {
          return
        }
        setSaved(snapshot)
        reset({ ids: snapshot.categories.map(({ id }) => id).sort() })
        onSaved()
        succeeded = true
      } catch (reason) {
        if (active.current) {
          setError(
            reason instanceof Error
              ? reason.message
              : `Unable to save ${plural}. Reload saved ${plural} before retrying.`,
          )
          setNeedsReload(true)
        }
      } finally {
        saving.current = false
        if (active.current) {
          setPending(false)
        }
      }
    })()
    return succeeded
  }

  return {
    saved,
    selected,
    search,
    offset,
    page,
    loading,
    searching,
    pending,
    error,
    listError,
    needsReload,
    dirty,
    validationError:
      formState.errors.ids?.message ?? formState.errors.ids?.root?.message,
    save,
    reload,
    toggle(category: Category) {
      const ids = getValues('ids')
      setKnownCategories(
        (current) =>
          new Map([
            ...ids.flatMap((id) => {
              const item = current.get(id)
              return item ? [[id, item] as const] : []
            }),
            [category.id, category],
          ]),
      )
      setValue(
        'ids',
        (ids.includes(category.id)
          ? ids.filter((id) => id !== category.id)
          : [...ids, category.id]
        ).sort(),
        { shouldDirty: true, shouldValidate: true },
      )
    },
    query(value: string) {
      setSearch(value)
      setOffset(0)
      setSearching(true)
      setListError(null)
    },
    move(value: number) {
      setOffset(value)
      setSearching(true)
      setListError(null)
    },
    retryList() {
      setVersion((value) => value + 1)
      setSearching(true)
      setListError(null)
    },
  }
}

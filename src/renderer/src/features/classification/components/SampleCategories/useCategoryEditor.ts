import { useEffect, useRef, useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { sampleCategorySelectionSchema } from '../../schemas'
import type { SampleCategorySelection } from '../../schemas'
import type { Category } from '@shared/domain/classification'
import type { CategoryPage } from '@shared/ipc/categories'
import type { SampleCategoriesSnapshot } from '@shared/ipc/sampleCategories'
import { unwrapIpcResult } from '@shared/ipc/result'

export function useCategoryEditor(
  sampleId: string,
  onSaved: () => void,
): {
  saved: SampleCategoriesSnapshot | null
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
  const [saved, setSaved] = useState<SampleCategoriesSnapshot | null>(null)
  const { control, getValues, setValue, reset, handleSubmit, formState } =
    useForm<SampleCategorySelection>({
      resolver: zodResolver(sampleCategorySelectionSchema),
      defaultValues: { categoryIds: [] },
      mode: 'onBlur',
      reValidateMode: 'onChange',
    })
  const categoryIds = useWatch({ control, name: 'categoryIds' })
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
    void window.api.categories
      .readSample({ sampleId })
      .then(unwrapIpcResult)
      .then((snapshot) => {
        if (current) {
          setSaved(snapshot)
          setKnownCategories(
            new Map(
              snapshot.categories.map((category) => [category.id, category]),
            ),
          )
          reset({ categoryIds: snapshot.categories.map(({ id }) => id).sort() })
          setLoading(false)
        }
      })
      .catch((reason: unknown) => {
        if (current) {
          setError(
            reason instanceof Error
              ? reason.message
              : 'Unable to load saved categories.',
          )
          setLoading(false)
        }
      })
    return () => {
      current = false
    }
  }, [sampleId, reset])

  useEffect(() => {
    let current = true
    void window.api.categories
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
              : 'Unable to list categories.',
          )
          setSearching(false)
        }
      })
    return () => {
      current = false
    }
  }, [search, offset, version])

  async function reload(): Promise<void> {
    if (saving.current) {
      return
    }
    setPending(true)
    try {
      const snapshot = unwrapIpcResult(
        await window.api.categories.readSample({ sampleId }),
      )
      if (active.current) {
        // Keep the user's intended selection visible for explicit reconciliation.
        const draftIds = getValues('categoryIds')
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
        reset({ categoryIds: snapshot.categories.map(({ id }) => id).sort() })
        setSaved(snapshot)
        if (saved) {
          setValue('categoryIds', draftIds, {
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
            : 'Unable to reload saved categories.',
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
        const snapshot = unwrapIpcResult(
          await window.api.categories.saveSample({
            sampleId,
            token: saved.token,
            categoryIds: values.categoryIds,
          }),
        )
        if (!active.current) {
          return
        }
        setSaved(snapshot)
        reset({ categoryIds: snapshot.categories.map(({ id }) => id).sort() })
        onSaved()
        succeeded = true
      } catch (reason) {
        if (active.current) {
          setError(
            reason instanceof Error
              ? reason.message
              : 'Unable to save categories. Reload saved categories before retrying.',
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
      formState.errors.categoryIds?.message ??
      formState.errors.categoryIds?.root?.message,
    save,
    reload,
    toggle(category: Category) {
      const ids = getValues('categoryIds')
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
        'categoryIds',
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

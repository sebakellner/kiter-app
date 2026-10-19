export const LIFECYCLE_CHANNELS = {
  closeRequested: 'lifecycle:close-requested',
} as const

export interface LifecycleApi {
  onCloseRequested: (listener: () => void) => () => void
}

import {
  render,
  type RenderOptions,
  type RenderResult,
} from '@testing-library/react'
import type { ReactNode } from 'react'
import { ToastProvider } from '../../../src/renderer/src/components/ui/Toast'

export function renderWithToasts(
  ui: ReactNode,
  options?: Omit<RenderOptions, 'wrapper'>,
): RenderResult {
  return render(ui, { ...options, wrapper: ToastProvider })
}

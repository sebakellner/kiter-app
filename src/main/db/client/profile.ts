import type { ClientRequest } from './core.ts'
import type { WorkerTransport } from './worker-transport.ts'
import type {
  LocalProfile,
  ProfileUpdateRequest,
  UserProfile,
  UserPreferences,
} from '../../../shared/domain/profile.ts'
import {
  requirePreviewVolume,
  requireProfileUpdate,
} from '../../../shared/domain/profile.ts'

export interface ProfileCommands {
  getLocalProfile(): Promise<LocalProfile>
  updateLocalProfile(input: ProfileUpdateRequest): Promise<UserProfile>
  setPreviewVolume(volume: number): Promise<UserPreferences>
}

export function profileCommands(
  request: ClientRequest,
  transport: WorkerTransport,
): ProfileCommands {
  return {
    async getLocalProfile(): Promise<LocalProfile> {
      return request({ action: 'profile' })
    },

    // Shutdown state outranks argument validation, so these three commands assert
    // the transport is open before their own validators run. `setFavorite` in
    // `library.ts` is the third.
    async updateLocalProfile(
      input: ProfileUpdateRequest,
    ): Promise<UserProfile> {
      transport.assertOpen()
      return request({
        action: 'update-profile',
        input: requireProfileUpdate(input),
      })
    },

    async setPreviewVolume(volume: number): Promise<UserPreferences> {
      transport.assertOpen()
      return request({
        action: 'volume',
        volume: requirePreviewVolume(volume),
      })
    },
  }
}

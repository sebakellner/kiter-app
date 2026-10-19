import { ipcMain } from 'electron'
import {
  COLLECTION_CHANNELS,
  requireCollectionCreateRequest,
  requireCollectionGetRequest,
  requireCollectionDestinationsRequest,
  requireCollectionMembershipRequest,
  requireCollectionMoveRequest,
  requireCollectionPlaceRequest,
} from '../../shared/ipc/collections'
import { requireCollectionPage } from '../../shared/domain/collection'
import type { DbClient } from '../db'
import { requireMainFrameWindow } from './authorize'
import { invokeResult } from './result'

export function registerCollectionsIpc(database: DbClient): void {
  ipcMain.handle(COLLECTION_CHANNELS.placeSample, (event, request: unknown) =>
    invokeResult(
      'collections.place-sample',
      {
        code: 'STORAGE_FAILED',
        message:
          'Unable to save the dropped Sample position. Refresh the Collection before dragging again.',
      },
      () => {
        requireMainFrameWindow(event)
        return database.placeCollectionSample(
          requireCollectionPlaceRequest(request),
        )
      },
    ),
  )
  ipcMain.handle(COLLECTION_CHANNELS.moveSample, (event, request: unknown) =>
    invokeResult(
      'collections.move-sample',
      {
        code: 'STORAGE_FAILED',
        message:
          'Unable to save the Collection order. Refresh the Collection before repeating the move.',
      },
      () => {
        requireMainFrameWindow(event)
        return database.moveCollectionSample(
          requireCollectionMoveRequest(request),
        )
      },
    ),
  )
  ipcMain.handle(COLLECTION_CHANNELS.destinations, (event, request: unknown) =>
    invokeResult(
      'collections.destinations',
      {
        code: 'STORAGE_FAILED',
        message:
          'Unable to load Collection destinations. Retry to check database storage.',
      },
      () => {
        requireMainFrameWindow(event)
        return database.listCollectionDestinations(
          requireCollectionDestinationsRequest(request),
        )
      },
    ),
  )
  ipcMain.handle(COLLECTION_CHANNELS.setMembership, (event, request: unknown) =>
    invokeResult(
      'collections.set-membership',
      {
        code: 'STORAGE_FAILED',
        message:
          'Unable to change Collection membership. Retry to check database storage.',
      },
      () => {
        requireMainFrameWindow(event)
        return database.setCollectionMembership(
          requireCollectionMembershipRequest(request),
        )
      },
    ),
  )
  ipcMain.handle(COLLECTION_CHANNELS.create, (event, request: unknown) =>
    invokeResult(
      'collections.create',
      {
        code: 'STORAGE_FAILED',
        message:
          'Unable to create the Collection. Your draft was preserved; check database storage before retrying.',
      },
      () => {
        requireMainFrameWindow(event)
        return database.createCollection(
          requireCollectionCreateRequest(request),
        )
      },
    ),
  )
  ipcMain.handle(COLLECTION_CHANNELS.list, (event, request: unknown) =>
    invokeResult(
      'collections.list',
      {
        code: 'STORAGE_FAILED',
        message: 'Unable to load Collections. Retry to check database storage.',
      },
      () => {
        requireMainFrameWindow(event)
        return database.listCollectionSummaries(requireCollectionPage(request))
      },
    ),
  )
  ipcMain.handle(COLLECTION_CHANNELS.get, (event, request: unknown) =>
    invokeResult(
      'collections.get',
      {
        code: 'STORAGE_FAILED',
        message:
          'Unable to load the Collection. Retry to check database storage.',
      },
      () => {
        requireMainFrameWindow(event)
        return database.getCollectionSummary(
          requireCollectionGetRequest(request).id,
        )
      },
    ),
  )
}

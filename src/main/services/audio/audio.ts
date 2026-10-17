import { createHmac, randomUUID, randomBytes } from 'node:crypto'
import { realpath, stat } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { net, protocol } from 'electron'
import type { LibrarySample, AudioSample } from '../../../shared/ipc'
import { parseByteRange } from './audioRange'
import type { CatalogSample } from '../../../shared/ipc/library'
import { isCatalogSample } from '../../../shared/ipc/library'
import type { DbClient } from '../../db'
import { verifyCatalogSource, verifyCatalogSourceSync } from '../library'

const sessionKey = randomBytes(32)
let catalog: Pick<DbClient, 'getCatalogSample'> | undefined

export function configureCatalogAudio(
  database: Pick<DbClient, 'getCatalogSample'>,
): void {
  catalog = database
}

export function catalogAudioUrl(sample: CatalogSample): string {
  const payload = Buffer.from(
    JSON.stringify({ ...sample, favorite: false }),
  ).toString('base64url')
  const signature = createHmac('sha256', sessionKey)
    .update(payload)
    .digest('hex')
  return `sample://audio/catalog/${signature}/${payload}`
}

function catalogSource(audioUrl: string): CatalogSample | undefined {
  const url = new URL(audioUrl)
  const [, kind, signature, payload] = url.pathname.split('/')
  if (
    url.protocol !== 'sample:' ||
    url.hostname !== 'audio' ||
    kind !== 'catalog' ||
    !payload ||
    signature !== createHmac('sha256', sessionKey).update(payload).digest('hex')
  ) {
    return undefined
  }
  // Only payloads signed by this main-process session reach JSON parsing.
  const sample: unknown = JSON.parse(
    Buffer.from(payload, 'base64url').toString(),
  )
  return isCatalogSample(sample) ? sample : undefined
}

const sources = new Map<string, string>()
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, HEAD',
  'Access-Control-Allow-Headers': 'Range',
  'Access-Control-Expose-Headers': 'Content-Range, Accept-Ranges',
}

export function registerAudioSources(files: LibrarySample[]): AudioSample[] {
  sources.clear()
  return files.map((file) => {
    const id = randomUUID()
    sources.set(id, file.path)
    return { ...file, audioUrl: `sample://audio/${id}` }
  })
}

export function getAudioSource(audioUrl: string): string | undefined {
  const sample = catalogSource(audioUrl)
  if (sample) {
    verifyCatalogSourceSync(sample)
    return sample.path
  }
  const url = new URL(audioUrl)
  return url.protocol === 'sample:' && url.hostname === 'audio'
    ? sources.get(url.pathname.slice(1))
    : undefined
}

export function registerAudioProtocol(): void {
  protocol.handle('sample', async (request) => {
    let source: string | undefined
    try {
      const signed = catalogSource(request.url)
      if (signed && catalog) {
        const current = await catalog.getCatalogSample(signed.id)
        if (
          current.path === signed.path &&
          current.sourceRevision === signed.sourceRevision &&
          current.rootPath === signed.rootPath
        ) {
          await verifyCatalogSource(current)
          source = current.path
        }
      } else {
        source = getAudioSource(request.url)
      }
    } catch {
      /* Unavailable catalog sources never grant audio access. */
    }
    if (!source) {
      return new Response('Unauthorized sample', {
        status: 403,
        headers: corsHeaders,
      })
    }
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders })
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Method not allowed', {
        status: 405,
        headers: corsHeaders,
      })
    }

    try {
      const info = await stat(source)
      if ((await realpath(source)) !== source || !info.isFile()) {
        return new Response('Sample unavailable', {
          status: 403,
          headers: corsHeaders,
        })
      }
      const rangeHeader =
        request.method === 'GET' ? request.headers.get('Range') : null
      const range = rangeHeader ? parseByteRange(rangeHeader, info.size) : null
      if (rangeHeader && !range) {
        return new Response('Range not satisfiable', {
          status: 416,
          headers: { ...corsHeaders, 'Content-Range': `bytes */${info.size}` },
        })
      }
      const requestHeaders = new Headers(request.headers)
      requestHeaders.delete('Range')
      if (range) {
        requestHeaders.set('Range', `bytes=${range.start}-${range.end}`)
      }
      const response = await net.fetch(pathToFileURL(source).toString(), {
        method: request.method,
        headers: requestHeaders,
      })
      const headers = new Headers(response.headers)
      for (const [name, value] of Object.entries(corsHeaders)) {
        headers.set(name, value)
      }
      headers.set('Cache-Control', 'no-store')
      headers.set('Accept-Ranges', 'bytes')
      headers.set(
        'Content-Length',
        String(range ? range.end - range.start + 1 : info.size),
      )
      if (range) {
        headers.set(
          'Content-Range',
          `bytes ${range.start}-${range.end}/${info.size}`,
        )
      }
      return new Response(response.body, {
        status: range && response.ok ? 206 : response.status,
        headers,
      })
    } catch (error) {
      const code =
        error instanceof Error &&
        'code' in error &&
        typeof error.code === 'string'
          ? error.code
          : 'AUDIO_READ_FAILED'
      console.error('Unable to open sample:', code)
      return new Response('Unable to open sample', {
        status: 404,
        headers: corsHeaders,
      })
    }
  })
}

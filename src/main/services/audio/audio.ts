import { randomUUID } from 'node:crypto'
import { realpath, stat } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { net, protocol } from 'electron'
import type { LibrarySample, AudioSample } from '../../../shared/ipc'
import { parseByteRange } from './audioRange'

const sources = new Map<string, string>()
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, HEAD',
  'Access-Control-Allow-Headers': 'Range',
  'Access-Control-Expose-Headers': 'Content-Range, Accept-Ranges'
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
  const url = new URL(audioUrl)
  return url.protocol === 'sample:' && url.hostname === 'audio'
    ? sources.get(url.pathname.slice(1))
    : undefined
}

export function registerAudioProtocol(): void {
  protocol.handle('sample', async (request) => {
    const source = getAudioSource(request.url)
    if (!source) {
      return new Response('Unauthorized sample', { status: 403, headers: corsHeaders })
    }
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders })
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Method not allowed', { status: 405, headers: corsHeaders })
    }

    try {
      const info = await stat(source)
      if ((await realpath(source)) !== source || !info.isFile()) {
        return new Response('Sample unavailable', { status: 403, headers: corsHeaders })
      }
      const rangeHeader = request.method === 'GET' ? request.headers.get('Range') : null
      const range = rangeHeader ? parseByteRange(rangeHeader, info.size) : null
      if (rangeHeader && !range) {
        return new Response('Range not satisfiable', {
          status: 416,
          headers: { ...corsHeaders, 'Content-Range': `bytes */${info.size}` }
        })
      }
      const requestHeaders = new Headers(request.headers)
      requestHeaders.delete('Range')
      if (range) requestHeaders.set('Range', `bytes=${range.start}-${range.end}`)
      const response = await net.fetch(pathToFileURL(source).toString(), {
        method: request.method,
        headers: requestHeaders
      })
      const headers = new Headers(response.headers)
      for (const [name, value] of Object.entries(corsHeaders)) headers.set(name, value)
      headers.set('Cache-Control', 'no-store')
      headers.set('Accept-Ranges', 'bytes')
      headers.set('Content-Length', String(range ? range.end - range.start + 1 : info.size))
      if (range) headers.set('Content-Range', `bytes ${range.start}-${range.end}/${info.size}`)
      return new Response(response.body, {
        status: range && response.ok ? 206 : response.status,
        headers
      })
    } catch (error) {
      const code =
        error instanceof Error && 'code' in error && typeof error.code === 'string'
          ? error.code
          : 'AUDIO_READ_FAILED'
      console.error('Unable to open sample:', code)
      return new Response('Unable to open sample', { status: 404, headers: corsHeaders })
    }
  })
}

// Local-only bridge between the Figma plugin and tokens/**/*.json.
// Binds to 127.0.0.1 and answers the plugin iframe, whose origin is null.
import { createServer } from 'node:http'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { applyPull } from './pull.mjs'
import { projectTokens } from './project.mjs'

const PORT = Number(process.env.KITER_TOKENS_PORT ?? 4747)
const HOST = '127.0.0.1'
const REPO_ROOT = process.cwd()
const TOKEN_FOLDERS = ['primitives', 'semantic']
const MAX_BODY_BYTES = 5 * 1024 * 1024

function countLeaves(node) {
  let total = 0
  for (const value of Object.values(node)) {
    if (value === null || typeof value !== 'object') {
      continue
    }
    if ('$value' in value) {
      total += 1
      continue
    }
    total += countLeaves(value)
  }
  return total
}

function summarizeTokens() {
  const summary = {}
  for (const folder of TOKEN_FOLDERS) {
    const directory = join(REPO_ROOT, 'tokens', folder)
    let total = 0
    for (const file of readdirSync(directory)) {
      if (!file.endsWith('.json')) {
        continue
      }
      total += countLeaves(
        JSON.parse(readFileSync(join(directory, file), 'utf8')),
      )
    }
    summary[folder] = total
  }
  return summary
}

function send(response, status, body) {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
  })
  response.end(`${JSON.stringify(body, null, 2)}\n`)
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    let tooLarge = false
    request.on('data', (chunk) => {
      size += chunk.length
      if (size > MAX_BODY_BYTES) {
        tooLarge = true
        return
      }
      chunks.push(chunk)
    })
    request.on('end', () => {
      if (tooLarge) {
        reject(new Error('request body exceeds 5 MB'))
        return
      }
      resolve(Buffer.concat(chunks).toString('utf8'))
    })
    request.on('error', reject)
  })
}

async function pullTokens(request, response) {
  let raw
  try {
    raw = await readBody(request)
  } catch (error) {
    send(response, 413, { ok: false, error: messageOf(error) })
    return
  }

  let body
  try {
    body = JSON.parse(raw)
  } catch {
    send(response, 400, { ok: false, error: 'invalid JSON body' })
    return
  }

  const payload = {
    primitives: body?.primitives,
    semantic: body?.semantic,
  }
  if (!isPlainObject(payload.primitives) || !isPlainObject(payload.semantic)) {
    send(response, 400, {
      ok: false,
      error: 'body must include primitives and semantic objects',
    })
    return
  }

  try {
    const { report, written } = await applyPull({
      repoRoot: REPO_ROOT,
      payload,
    })
    send(response, 200, { ok: true, report, written })
  } catch (error) {
    send(response, 500, { ok: false, error: messageOf(error) })
  }
}

function messageOf(error) {
  return error instanceof Error ? error.message : String(error)
}

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

const server = createServer((request, response) => {
  const startedAt = Date.now()
  response.on('finish', () => {
    console.log(
      `${request.method} ${request.url} -> ${response.statusCode} (${Date.now() - startedAt}ms)`,
    )
  })

  response.setHeader('access-control-allow-origin', '*')
  response.setHeader('access-control-allow-methods', 'GET, POST, OPTIONS')
  response.setHeader('access-control-allow-headers', 'content-type')

  if (request.method === 'OPTIONS') {
    response.writeHead(204)
    response.end()
    return
  }

  if (request.method === 'GET' && request.url === '/health') {
    send(response, 200, {
      ok: true,
      repoRoot: REPO_ROOT,
      tokens: summarizeTokens(),
    })
    return
  }

  if (request.method === 'GET' && request.url === '/push') {
    send(response, 200, projectTokens(REPO_ROOT))
    return
  }

  if (request.method === 'POST' && request.url === '/pull') {
    pullTokens(request, response).catch((error) => {
      console.error(error)
      if (!response.headersSent) {
        send(response, 500, { ok: false, error: messageOf(error) })
      }
    })
    return
  }

  if (request.method !== 'GET' && request.method !== 'POST') {
    send(response, 405, { ok: false, error: 'method not allowed' })
    return
  }

  send(response, 404, { ok: false, error: 'not found' })
})

server.listen(PORT, HOST, () => {
  console.log(`Kiter token bridge en http://${HOST}:${PORT}`)
  console.log(`Repo: ${REPO_ROOT}`)
  console.log(
    'En Figma: Plugins → Development → Import plugin from manifest → figma/tokens-bridge/manifest.json',
  )
})

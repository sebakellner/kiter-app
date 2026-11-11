// Local-only bridge between the Figma plugin and tokens/**/*.json.
// Binds to 127.0.0.1 and answers the plugin iframe, whose origin is null.
import { createServer } from 'node:http'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const PORT = Number(process.env.KITER_TOKENS_PORT ?? 4747)
const HOST = '127.0.0.1'
const REPO_ROOT = process.cwd()
const TOKEN_FOLDERS = ['primitives', 'semantic']

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

const server = createServer((request, response) => {
  const startedAt = Date.now()
  response.on('finish', () => {
    console.log(
      `${request.method} ${request.url} -> ${response.statusCode} (${Date.now() - startedAt}ms)`,
    )
  })

  response.setHeader('access-control-allow-origin', '*')
  response.setHeader('access-control-allow-methods', 'GET, POST, OPTIONS')

  if (request.method === 'OPTIONS') {
    response.writeHead(204)
    response.end()
    return
  }

  if (request.method !== 'GET') {
    send(response, 405, { ok: false, error: 'method not allowed' })
    return
  }

  if (request.url === '/health') {
    send(response, 200, {
      ok: true,
      repoRoot: REPO_ROOT,
      tokens: summarizeTokens(),
    })
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

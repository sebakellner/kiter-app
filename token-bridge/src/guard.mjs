// The plugin iframe's null origin is the only origin this bridge answers: never
// a wildcard. Residual risk: a sandboxed web iframe also has a null origin, so
// this narrows the attack surface without closing it; closing it fully needs a
// shared secret. A JSON-only POST forces a preflight a web page cannot pass.
export const ALLOWED_ORIGIN = 'null'

const JSON_TYPE = /^application\/json\b/i

export function rejectionOf(request) {
  const origin = request.headers.origin
  if (origin !== undefined && origin !== ALLOWED_ORIGIN) {
    return { status: 403, error: 'origin not allowed' }
  }
  if (
    request.method === 'POST' &&
    !JSON_TYPE.test(request.headers['content-type'] ?? '')
  ) {
    return { status: 415, error: 'content-type must be application/json' }
  }
  return undefined
}

// A failed pull reports what the build rolled back, never a guessed state.
export function failedBody(error) {
  return {
    ok: false,
    error: error instanceof Error ? error.message : String(error),
    rolledBack: error.rolledBack ?? [],
  }
}

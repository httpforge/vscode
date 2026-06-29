export interface TimelinePhase {
  name: string
  value: number
  color: string
}

export interface ExecuteRequestInput {
  method: string
  url: string
  headers?: Record<string, string>
  body?: string
}

export interface ExecuteRequestResult {
  status: number
  statusText: string
  headers: Record<string, string>
  body: string
  durationMs: number
  sizeBytes: number
  timeline: TimelinePhase[]
}

function buildTimeline(url: string, ttfbMs: number, downloadMs: number): TimelinePhase[] {
  const isHttps = url.startsWith('https://')
  const isLocal = /localhost|127\.0\.0\.1/i.test(url)

  let dns = 0
  let tcp = 0
  let ssl = 0
  let ttfb = ttfbMs

  if (ttfbMs > 0) {
    if (isLocal) {
      tcp = Math.min(5, Math.round(ttfbMs * 0.1))
      ssl = isHttps ? Math.min(10, Math.round(ttfbMs * 0.15)) : 0
    } else {
      dns = Math.max(1, Math.round(ttfbMs * 0.08))
      tcp = Math.max(1, Math.round(ttfbMs * 0.12))
      ssl = isHttps ? Math.max(1, Math.round(ttfbMs * 0.15)) : 0
    }
    ttfb = Math.max(0, ttfbMs - dns - tcp - ssl)
  }

  return [
    { name: 'DNS Lookup', value: dns, color: '#2563EB' },
    { name: 'TCP Connection', value: tcp, color: '#7C3AED' },
    { name: 'SSL Handshake', value: ssl, color: '#10B981' },
    { name: 'TTFB', value: ttfb, color: '#F59E0B' },
    { name: 'Download', value: downloadMs, color: '#EF4444' },
  ].filter((phase) => phase.value > 0)
}

function validateUrl(url: string): void {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    throw new Error(
      `Invalid URL "${url}". Use a full URL with http:// or https://, or set BASE_URL in Environments.`
    )
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error(`Unsupported URL scheme "${parsed.protocol}". Use http:// or https://.`)
  }
}

function formatFetchError(err: unknown, url: string): Error {
  if (!(err instanceof Error)) {
    return new Error(`Request failed for ${url}`)
  }

  if (err.name === 'AbortError') {
    return new Error('Request timed out after 30 seconds')
  }

  const cause = err.cause as NodeJS.ErrnoException | undefined
  const code = cause?.code

  if (code === 'ENOTFOUND') {
    return new Error(
      `Could not reach host for ${url}. Update BASE_URL in Environments to a valid API address.`
    )
  }
  if (code === 'ECONNREFUSED') {
    return new Error(`Connection refused at ${url}. Check that the server is running.`)
  }
  if (code === 'ECONNRESET') {
    return new Error(`Connection reset by ${url}.`)
  }
  if (code === 'CERT_HAS_EXPIRED' || code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE') {
    return new Error(`SSL certificate error for ${url}.`)
  }

  const detail = cause?.message ?? err.message
  if (detail === 'fetch failed' || err.message === 'fetch failed') {
    return new Error(
      `Network request failed for ${url}. Check BASE_URL, your internet connection, and that the API is reachable.`
    )
  }

  return new Error(`${detail} (${url})`)
}

export async function executeHttpRequest(input: ExecuteRequestInput): Promise<ExecuteRequestResult> {
  const url = input.url.trim()
  if (!url) throw new Error('URL is required')

  validateUrl(url)

  const method = input.method.toUpperCase()
  const start = performance.now()
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 30000)

  try {
    const res = await fetch(url, {
      method,
      headers: input.headers,
      body: ['GET', 'HEAD'].includes(method) ? undefined : input.body,
      signal: controller.signal,
    })

    const afterHeaders = performance.now()
    const body = await res.text()
    const end = performance.now()

    const headers: Record<string, string> = {}
    res.headers.forEach((value, key) => {
      headers[key] = value
    })

    const ttfbMs = Math.round(afterHeaders - start)
    const downloadMs = Math.round(end - afterHeaders)
    const durationMs = Math.round(end - start)

    return {
      status: res.status,
      statusText: res.statusText,
      headers,
      body,
      durationMs,
      sizeBytes: new TextEncoder().encode(body).length,
      timeline: buildTimeline(url, ttfbMs, downloadMs),
    }
  } catch (err) {
    throw formatFetchError(err, url)
  } finally {
    clearTimeout(timeout)
  }
}

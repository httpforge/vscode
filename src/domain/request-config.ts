export type AuthType = 'none' | 'bearer' | 'api-key' | 'basic' | 'oauth2' | 'jwt-bearer' | 'digest' | 'oauth1' | 'hawk' | 'aws' | 'ntlm' | 'akamai'
export type BodyType = 'none' | 'json' | 'text' | 'xml' | 'form-urlencoded'
export type SoapContentType = 'text/xml' | 'application/soap+xml'

export interface KeyValueRow {
  id: string
  key: string
  value: string
  description: string
  enabled: boolean
}

export interface RequestAuth {
  type: AuthType
  bearerToken: string
  apiKeyName: string
  apiKeyValue: string
  apiKeyIn: 'header' | 'query'
  basicUsername: string
  basicPassword: string
  oauthToken: string
}

export interface RequestSettings {
  followRedirects: boolean
  validateSsl: boolean
  timeoutMs: number
}

export interface RequestConfig {
  params: KeyValueRow[]
  headers: KeyValueRow[]
  auth: RequestAuth
  bodyType: BodyType
  body: string
  soapAction: string
  soapContentType: SoapContentType
  preRequestScript: string
  testScript: string
  cookies: KeyValueRow[]
  settings: RequestSettings
}

export const DEFAULT_REQUEST_SETTINGS: RequestSettings = {
  followRedirects: true,
  validateSsl: true,
  timeoutMs: 0,
}

export const DEFAULT_REQUEST_AUTH: RequestAuth = {
  type: 'none',
  bearerToken: '{{ACCESS_TOKEN}}',
  apiKeyName: 'X-API-Key',
  apiKeyValue: '{{API_KEY}}',
  apiKeyIn: 'header',
  basicUsername: '',
  basicPassword: '',
  oauthToken: '{{ACCESS_TOKEN}}',
}

export const DEFAULT_REQUEST_CONFIG: RequestConfig = {
  params: [createKeyValueRow()],
  headers: [createKeyValueRow()],
  auth: { ...DEFAULT_REQUEST_AUTH },
  bodyType: 'none',
  body: '',
  soapAction: '',
  soapContentType: 'text/xml',
  preRequestScript: '',
  testScript: '',
  cookies: [],
  settings: { ...DEFAULT_REQUEST_SETTINGS },
}

export function createKeyValueRow(partial?: Partial<KeyValueRow>): KeyValueRow {
  return {
    id: crypto.randomUUID(),
    key: '',
    value: '',
    description: '',
    enabled: true,
    ...partial,
  }
}

function mapKeyValueRows(rows: KeyValueRow[] | undefined): KeyValueRow[] {
  if (!Array.isArray(rows) || rows.length === 0) return [createKeyValueRow()]
  return rows.map((r) => ({ ...createKeyValueRow(), ...r, id: r.id ?? crypto.randomUUID() }))
}

/** Always keep at least one editable row for params/headers/cookies editors. */
export function ensureKeyValueRows(rows: KeyValueRow[] | undefined): KeyValueRow[] {
  if (!Array.isArray(rows) || rows.length === 0) return [createKeyValueRow()]
  return rows
}

export function parseRequestConfig(raw: unknown): RequestConfig {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_REQUEST_CONFIG, auth: { ...DEFAULT_REQUEST_AUTH } }
  const doc = raw as Partial<RequestConfig>
  return {
    params: mapKeyValueRows(doc.params),
    headers: mapKeyValueRows(doc.headers),
    auth: { ...DEFAULT_REQUEST_AUTH, ...(doc.auth ?? {}) },
    bodyType: doc.bodyType ?? DEFAULT_REQUEST_CONFIG.bodyType,
    body: doc.body ?? '',
    soapAction: doc.soapAction ?? '',
    soapContentType: doc.soapContentType ?? 'text/xml',
    preRequestScript: doc.preRequestScript ?? '',
    testScript: doc.testScript ?? '',
    cookies: Array.isArray(doc.cookies) ? doc.cookies.map((r) => ({ ...createKeyValueRow(), ...r, id: r.id ?? crypto.randomUUID() })) : [],
    settings: { ...DEFAULT_REQUEST_SETTINGS, ...(doc.settings ?? {}) },
  }
}

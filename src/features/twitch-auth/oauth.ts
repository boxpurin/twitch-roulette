export interface AuthConfig {
  clientId: string
  redirectUri: string
}

export interface AuthUser {
  clientId: string
  userId: string
  login: string
  expiresIn: number
}

export type AuthStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>
const REQUEST_KEY = 'twitch-roulette.oauth-request'
const REQUEST_LIFETIME = 10 * 60 * 1000

export function getAuthConfig(clientId?: string, redirectUri?: string): AuthConfig {
  if (!clientId?.trim() || !/^[a-zA-Z0-9]+$/.test(clientId.trim())) {
    throw new Error('VITE_TWITCH_CLIENT_ID に Twitch アプリの Client ID を設定してください。')
  }
  let url: URL
  try {
    url = new URL(redirectUri ?? '')
  } catch {
    throw new Error('VITE_TWITCH_REDIRECT_URI に登録済みの戻り先 URL を設定してください。')
  }
  const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]'
  if ((url.protocol !== 'https:' && !(local && url.protocol === 'http:')) || url.username || url.password || url.search || url.hash) {
    throw new Error('戻り先 URL は HTTPS（ローカル開発は HTTP 可）で、クエリやフラグメントを含めず設定してください。')
  }
  return { clientId: clientId.trim(), redirectUri: url.href }
}

export function clearLoginRequest(storage: AuthStorage) {
  storage.removeItem(REQUEST_KEY)
}

export function beginLogin(config: AuthConfig, storage: AuthStorage, now = Date.now()): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  const state = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
  storage.setItem(REQUEST_KEY, JSON.stringify({ state, expiresAt: now + REQUEST_LIFETIME }))
  const url = new URL('https://id.twitch.tv/oauth2/authorize')
  url.search = new URLSearchParams({
    client_id: config.clientId, redirect_uri: config.redirectUri,
    response_type: 'token', scope: 'channel:read:redemptions', state,
  }).toString()
  return url.href
}

// Also clean unexpected code/token query parameters, without rendering or logging them.
const CALLBACK_KEYS = ['access_token', 'token_type', 'scope', 'state', 'error', 'error_description', 'code']

export function cleanCallbackUrl(url: URL): URL {
  const clean = new URL(url)
  for (const key of CALLBACK_KEYS) clean.searchParams.delete(key)
  const fragment = new URLSearchParams(clean.hash.slice(1))
  if (CALLBACK_KEYS.some((key) => fragment.has(key))) clean.hash = ''
  return clean
}

export function consumeCallback(url: URL, storage: AuthStorage, now = Date.now()): { token: string } | null {
  const params = new URLSearchParams(url.hash.slice(1))
  if (!CALLBACK_KEYS.some((key) => params.has(key) || url.searchParams.has(key))) return null

  const stored = storage.getItem(REQUEST_KEY)
  clearLoginRequest(storage)
  let request: unknown
  try { request = JSON.parse(stored ?? 'null') } catch { request = null }
  const state = params.get('state') ?? url.searchParams.get('state')
  if (!request || typeof request !== 'object' || !('state' in request) || !('expiresAt' in request) ||
      typeof request.state !== 'string' || !state || request.state !== state ||
      typeof request.expiresAt !== 'number' || !Number.isFinite(request.expiresAt) ||
      request.expiresAt <= now || request.expiresAt > now + REQUEST_LIFETIME) {
    throw new Error('ログイン要求が一致しないか、有効期限が切れています。もう一度ログインしてください。')
  }
  if (params.has('error') || url.searchParams.has('error')) {
    throw new Error('Twitch の認証がキャンセルされたか、許可されませんでした。')
  }
  const token = params.get('access_token')
  if (!token || !/^[a-zA-Z0-9_-]+$/.test(token) || params.get('token_type') !== 'bearer' ||
      params.getAll('access_token').length !== 1 || params.getAll('state').length !== 1) {
    throw new Error('Twitch の認証応答が不正です。もう一度ログインしてください。')
  }
  return { token }
}

export async function validateToken(
  token: string, config: AuthConfig, signal: AbortSignal, transport: typeof fetch = fetch,
): Promise<AuthUser> {
  let response: Response
  let data: unknown
  try {
    response = await transport('https://id.twitch.tv/oauth2/validate', {
      headers: { Authorization: `OAuth ${token}` }, signal, cache: 'no-store',
    })
    if (!response.ok) {
      if (response.status === 401) throw new Error('invalid-token')
      throw new Error('request-failed')
    }
    data = await response.json()
  } catch {
    throw new Error('Twitch の認証を確認できませんでした。通信状況を確認して再ログインしてください。')
  }
  if (!data || typeof data !== 'object' || !('client_id' in data) || data.client_id !== config.clientId ||
      !('user_id' in data) || typeof data.user_id !== 'string' || !data.user_id ||
      !('login' in data) || typeof data.login !== 'string' || !data.login ||
      !('scopes' in data) || !Array.isArray(data.scopes) || !data.scopes.includes('channel:read:redemptions') ||
      !('expires_in' in data) || typeof data.expires_in !== 'number' || !Number.isSafeInteger(data.expires_in) || data.expires_in <= 0) {
    throw new Error('トークンの Client ID・ユーザー・権限・有効期限を確認できません。設定を確認して再ログインしてください。')
  }
  return { clientId: data.client_id, userId: data.user_id, login: data.login, expiresIn: data.expires_in }
}

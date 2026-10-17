import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import App from './App'
import { beginLogin } from './features/twitch-auth/oauth'
import { createAuthSession } from './features/twitch-auth/session'

const config = { clientId: 'client123', redirectUri: 'http://localhost:5173/' }

function fixture(configured: boolean, callback = false, pending = false) {
  let request: string | null = null
  const storage = {
    getItem: () => request,
    setItem: (_key: string, value: string) => { request = value },
    removeItem: () => { request = null },
  }
  const state = new URL(beginLogin(config, storage)).searchParams.get('state')
  const session = createAuthSession({
    config: configured ? config : undefined,
    storage: () => storage,
    readUrl: () => new URL(callback ? `${config.redirectUri}#access_token=secret-token&token_type=bearer&state=${state}` : config.redirectUri),
    replaceUrl: () => {}, navigate: () => {},
    transport: async () => pending ? new Promise<Response>(() => {}) : Response.json({
      client_id: 'client123', user_id: '42', login: 'streamer', scopes: ['channel:read:redemptions'], expires_in: 7200,
    }),
  })
  return session
}

describe('authentication screen', () => {
  it('explains missing configuration and disables login', () => {
    const session = fixture(false)
    const html = renderToStaticMarkup(<App session={session} />)
    expect(html).toContain('VITE_TWITCH_CLIENT_ID')
    expect(html).toContain('disabled=""')
  })

  it('shows the login action and registered redirect URI', () => {
    const html = renderToStaticMarkup(<App session={fixture(true)} config={config} />)
    expect(html).toContain('Twitch でログイン')
    expect(html).toContain('http://localhost:5173/')
    expect(html).not.toContain('disabled=""')
  })

  it('shows the authenticated user and logout without exposing the token', async () => {
    const session = fixture(true, true)
    await session.start()
    const html = renderToStaticMarkup(<App session={session} config={config} />)
    expect(html).toContain('streamer')
    expect(html).toContain('42')
    expect(html).toContain('ログアウト')
    expect(html).not.toContain('secret-token')
    session.dispose()
  })

  it('disables login while validation is pending', () => {
    const session = fixture(true, true, true)
    void session.start()
    const html = renderToStaticMarkup(<App session={session} config={config} />)
    expect(html).toContain('認証を確認しています')
    expect(html).toContain('disabled=""')
    session.dispose()
  })
})

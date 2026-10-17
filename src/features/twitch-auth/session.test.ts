import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { beginLogin } from './oauth'
import { createAuthSession } from './session'

const config = { clientId: 'client123', redirectUri: 'http://localhost:5173/' }
const body = { client_id: 'client123', user_id: '42', login: 'streamer', scopes: ['channel:read:redemptions'], expires_in: 7200 }

function setup(response = body) {
  const data = new Map<string, string>()
  const storage = {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => { data.set(key, value) },
    removeItem: (key: string) => { data.delete(key) },
  }
  const state = new URL(beginLogin(config, storage)).searchParams.get('state')
  let url = `${config.redirectUri}#access_token=test-token&token_type=bearer&state=${state}`
  const transport = vi.fn<typeof fetch>().mockImplementation(async () => Response.json(response))
  const options = {
    config, storage: () => storage,
    readUrl: () => new URL(url),
    replaceUrl: (value: string) => { url = value },
    navigate: (value: string) => { url = value }, transport,
  }
  const session = createAuthSession(options)
  return { session, options, transport, data, getUrl: () => url }
}

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-17T00:00:00Z')) })
afterEach(() => { vi.useRealTimers() })

describe('authentication lifecycle', () => {
  it('cleans the callback before requesting validation and exposes only the identity', async () => {
    const { session, transport, getUrl, data } = setup()
    transport.mockImplementation(async () => {
      expect(getUrl()).toBe(config.redirectUri)
      return Response.json(body)
    })
    await session.start()
    expect(session.getSnapshot()).toEqual({ status: 'authenticated', user: { clientId: 'client123', userId: '42', login: 'streamer', expiresIn: 7200 } })
    expect(JSON.stringify(session.getSnapshot())).not.toContain('test-token')
    expect(data.size).toBe(0)
    await session.start()
    expect(transport).toHaveBeenCalledTimes(1)
    session.dispose()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('rejects callback state mismatch and never calls Twitch', async () => {
    const { options, transport } = setup()
    const session = createAuthSession({ ...options, readUrl: () => new URL(`${config.redirectUri}#access_token=x&state=bad&token_type=bearer`) })
    await session.start()
    expect(session.getSnapshot().status).toBe('error')
    expect(transport).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('revalidates hourly and clears authentication after revocation', async () => {
    const { session, transport } = setup()
    await session.start()
    transport.mockResolvedValue(new Response('', { status: 401 }))
    await vi.advanceTimersByTimeAsync(3600000)
    expect(transport).toHaveBeenCalledTimes(2)
    expect(session.getSnapshot().status).toBe('error')
    expect(vi.getTimerCount()).toBe(0)
  })

  it('keeps validating a live session on successive hours and stops after logout', async () => {
    const { session, transport } = setup()
    await session.start()
    await vi.advanceTimersByTimeAsync(7200000)
    expect(transport).toHaveBeenCalledTimes(3)
    expect(session.getSnapshot().status).toBe('authenticated')
    session.logout()
    await vi.advanceTimersByTimeAsync(7200000)
    expect(transport).toHaveBeenCalledTimes(3)
    expect(session.getSnapshot().status).toBe('signedOut')
    expect(vi.getTimerCount()).toBe(0)
  })

  it('expires short-lived tokens without further requests', async () => {
    const { session, transport } = setup({ ...body, expires_in: 2 })
    await session.start()
    await vi.advanceTimersByTimeAsync(2000)
    expect(session.getSnapshot().status).toBe('error')
    expect(transport).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('detects expiration after a suspended tab resumes', async () => {
    const { session } = setup()
    await session.start()
    vi.setSystemTime(new Date('2026-10-17T03:00:00Z'))
    await session.refresh()
    expect(session.getSnapshot().status).toBe('error')
    expect(vi.getTimerCount()).toBe(0)
  })

  it.each(['logout', 'dispose'] as const)('aborts pending work on %s and ignores its late response', async (action) => {
    const { session, transport } = setup()
    let finish: ((value: Response) => void) | undefined
    let requestSignal: AbortSignal | null | undefined
    transport.mockImplementation((_url, init) => {
      requestSignal = init?.signal
      return new Promise((resolve) => { finish = resolve })
    })
    const started = session.start()
    expect(session.getSnapshot().status).toBe('loading')
    session[action]()
    expect(requestSignal?.aborted).toBe(true)
    finish?.(Response.json(body))
    await started
    expect(session.getSnapshot().status).toBe('signedOut')
    expect(vi.getTimerCount()).toBe(0)
  })

  it('bounds a stalled validation request and leaves no timers', async () => {
    const { session, transport } = setup()
    transport.mockImplementation((_url, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new Error('SECRET')), { once: true })
    }))
    const started = session.start()
    await vi.advanceTimersByTimeAsync(15000)
    await started
    expect(session.getSnapshot().status).toBe('error')
    expect(JSON.stringify(session.getSnapshot())).not.toContain('SECRET')
    expect(vi.getTimerCount()).toBe(0)
  })

  it('cleans sensitive URL values even if configuration or sessionStorage is unavailable', async () => {
    const { options, getUrl } = setup()
    const session = createAuthSession({ ...options, config: undefined, configurationError: '設定不足', storage: () => { throw new Error('SECRET') } })
    await session.start()
    expect(getUrl()).toBe(config.redirectUri)
    expect(session.getSnapshot().status).toBe('error')
    expect(JSON.stringify(session.getSnapshot())).not.toContain('SECRET')
  })

  it('starts a new authorization request on login and reports inaccessible storage', () => {
    const { session, getUrl, options } = setup()
    session.login()
    expect(new URL(getUrl()).origin).toBe('https://id.twitch.tv')
    const unavailable = createAuthSession({ ...options, storage: () => { throw new Error('SECRET') } })
    unavailable.login()
    expect(unavailable.getSnapshot().status).toBe('error')
    expect(JSON.stringify(unavailable.getSnapshot())).not.toContain('SECRET')
  })
})

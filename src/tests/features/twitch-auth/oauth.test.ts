import { describe, expect, it, vi } from "vitest";
import {
  beginLogin,
  cleanCallbackUrl,
  consumeCallback,
  getAuthConfig,
  validateToken,
} from "../../../features/twitch-auth/oauth";

export function memoryStorage() {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
    removeItem: (key: string) => {
      data.delete(key);
    },
  };
}

const config = { clientId: "client123", redirectUri: "http://localhost:5173/" };
const validUser = {
  client_id: "client123",
  user_id: "42",
  login: "streamer",
  scopes: ["channel:read:redemptions"],
  expires_in: 7200,
};

describe("OAuth boundary", () => {
  it("requires a Client ID and a safe registered redirect URI", () => {
    expect(() => getAuthConfig("", config.redirectUri)).toThrow();
    expect(() => getAuthConfig("client123", "")).toThrow();
    for (const uri of [
      "http://example.com/",
      "javascript:alert(1)",
      "https://a.test/#token",
      "https://a.test/?token=x",
      "https://user:pass@a.test/",
    ]) {
      expect(() => getAuthConfig("client123", uri)).toThrow();
    }
    expect(getAuthConfig(" client123 ", config.redirectUri)).toEqual(config);
    expect(getAuthConfig("client123", "https://app.example/")).toEqual({
      clientId: "client123",
      redirectUri: "https://app.example/",
    });
  });

  it("builds Twitch authorization with the minimum scope and unpredictable per-request state", () => {
    const storage = memoryStorage();
    const first = new URL(beginLogin(config, storage));
    const second = new URL(beginLogin(config, storage));
    expect(first.origin + first.pathname).toBe(
      "https://id.twitch.tv/oauth2/authorize",
    );
    expect(first.searchParams.get("client_id")).toBe("client123");
    expect(first.searchParams.get("redirect_uri")).toBe(
      "http://localhost:5173/",
    );
    expect(first.searchParams.get("response_type")).toBe("token");
    expect(first.searchParams.get("scope")).toBe("channel:read:redemptions");
    expect(first.searchParams.get("state")).toMatch(/^[a-f0-9]{64}$/);
    expect(first.searchParams.get("state")).not.toBe(
      second.searchParams.get("state"),
    );
  });

  it("accepts a matching callback only once", () => {
    const storage = memoryStorage();
    const state = new URL(beginLogin(config, storage)).searchParams.get(
      "state",
    );
    const url = new URL(
      `${config.redirectUri}#access_token=test-token&token_type=bearer&state=${state}`,
    );
    expect(consumeCallback(url, storage)).toEqual({ token: "test-token" });
    expect(() => consumeCallback(url, storage)).toThrow();
  });

  it("rejects missing, mismatched, expired and malformed requests", () => {
    const storage = memoryStorage();
    expect(consumeCallback(new URL(config.redirectUri), storage)).toBeNull();
    beginLogin(config, storage, 0);
    expect(() =>
      consumeCallback(
        new URL(
          `${config.redirectUri}#access_token=x&state=wrong&token_type=bearer`,
        ),
        storage,
        1,
      ),
    ).toThrow();
    const state = new URL(beginLogin(config, storage, 0)).searchParams.get(
      "state",
    );
    expect(() =>
      consumeCallback(
        new URL(
          `${config.redirectUri}#access_token=x&state=${state}&token_type=bearer`,
        ),
        storage,
        600001,
      ),
    ).toThrow();
    const freshState = new URL(beginLogin(config, storage)).searchParams.get(
      "state",
    );
    expect(() =>
      consumeCallback(
        new URL(
          `${config.redirectUri}#access_token=x&state=${freshState}&token_type=mac`,
        ),
        storage,
      ),
    ).toThrow();
  });

  it("handles rejected authorization without echoing external descriptions", () => {
    const storage = memoryStorage();
    const state = new URL(beginLogin(config, storage)).searchParams.get(
      "state",
    );
    expect(() =>
      consumeCallback(
        new URL(
          `${config.redirectUri}?error=access_denied&error_description=SECRET&state=${state}`,
        ),
        storage,
      ),
    ).toThrow(/キャンセル/);
  });

  it("removes callback credentials while preserving unrelated URL parameters", () => {
    const url = new URL(
      "http://localhost:5173/?view=setup&code=secret&state=request#access_token=secret&token_type=bearer",
    );
    expect(cleanCallbackUrl(url).href).toBe(
      "http://localhost:5173/?view=setup",
    );
    expect(
      cleanCallbackUrl(new URL("http://localhost:5173/?view=setup#help")).href,
    ).toBe("http://localhost:5173/?view=setup#help");
  });

  it("validates the token through the Authorization header and returns the authenticated identity", async () => {
    const transport = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json(validUser));
    const signal = new AbortController().signal;
    await expect(
      validateToken("test-token", config, signal, transport),
    ).resolves.toEqual({
      clientId: "client123",
      userId: "42",
      login: "streamer",
      expiresIn: 7200,
    });
    expect(transport).toHaveBeenCalledWith(
      "https://id.twitch.tv/oauth2/validate",
      {
        headers: { Authorization: "OAuth test-token" },
        signal,
        cache: "no-store",
      },
    );
  });

  it.each([
    { ...validUser, client_id: "other" },
    { ...validUser, user_id: null, login: null },
    { ...validUser, scopes: [] },
    { ...validUser, expires_in: 0 },
    { ...validUser, expires_in: "7200" },
    { ...validUser, scopes: null },
    null,
  ])(
    "rejects mismatched, expired, app-only and malformed tokens: %j",
    async (body) => {
      const transport = vi
        .fn<typeof fetch>()
        .mockResolvedValue(Response.json(body));
      await expect(
        validateToken(
          "test-token",
          config,
          new AbortController().signal,
          transport,
        ),
      ).rejects.toThrow();
    },
  );

  it("sanitizes authentication and network errors", async () => {
    for (const status of [401, 429, 500]) {
      const transport = vi
        .fn<typeof fetch>()
        .mockResolvedValue(new Response("SECRET", { status }));
      await expect(
        validateToken(
          "test-token",
          config,
          new AbortController().signal,
          transport,
        ),
      ).rejects.not.toThrow("SECRET");
    }
    const transport = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new Error("SECRET"));
    await expect(
      validateToken(
        "test-token",
        config,
        new AbortController().signal,
        transport,
      ),
    ).rejects.not.toThrow("SECRET");
  });
});

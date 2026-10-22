import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { beginLogin } from "../../../features/twitch-auth/oauth";
import { createAuthSession } from "../../../features/twitch-auth/session";

const config = { clientId: "client123", redirectUri: "http://localhost:5173/" };
const body = {
  client_id: "client123",
  user_id: "42",
  login: "streamer",
  scopes: ["channel:read:redemptions"],
  expires_in: 7200,
};

function setup(response = body) {
  const data = new Map<string, string>();
  const storage = {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
    removeItem: (key: string) => {
      data.delete(key);
    },
  };
  const state = new URL(beginLogin(config, storage)).searchParams.get("state");
  let url = `${config.redirectUri}#access_token=test-token&token_type=bearer&state=${state}`;
  const transport = vi
    .fn<typeof fetch>()
    .mockImplementation(async () => Response.json(response));
  const options = {
    config,
    storage: () => storage,
    readUrl: () => new URL(url),
    replaceUrl: (value: string) => {
      url = value;
    },
    navigate: (value: string) => {
      url = value;
    },
    transport,
  };
  const session = createAuthSession(options);
  return { session, options, transport, data, getUrl: () => url };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-17T00:00:00Z"));
});
afterEach(() => {
  vi.useRealTimers();
});

describe("authentication lifecycle", () => {
  it("cleans the callback before requesting validation and exposes only the identity", async () => {
    const { session, transport, getUrl, data } = setup();
    transport.mockImplementation(async () => {
      expect(getUrl()).toBe(config.redirectUri);
      return Response.json(body);
    });
    await session.start();
    expect(session.getSnapshot()).toEqual({
      status: "authenticated",
      user: {
        clientId: "client123",
        userId: "42",
        login: "streamer",
        expiresIn: 7200,
      },
    });
    expect(JSON.stringify(session.getSnapshot())).not.toContain("test-token");
    expect(data.size).toBe(0);
    await session.start();
    expect(transport).toHaveBeenCalledTimes(1);
    session.dispose();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("rejects callback state mismatch and never calls Twitch", async () => {
    const { options, transport } = setup();
    const session = createAuthSession({
      ...options,
      readUrl: () =>
        new URL(
          `${config.redirectUri}#access_token=x&state=bad&token_type=bearer`,
        ),
    });
    await session.start();
    expect(session.getSnapshot().status).toBe("error");
    expect(transport).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("revalidates hourly and clears authentication after revocation", async () => {
    const { session, transport } = setup();
    await session.start();
    transport.mockResolvedValue(new Response("", { status: 401 }));
    await vi.advanceTimersByTimeAsync(3600000);
    expect(transport).toHaveBeenCalledTimes(2);
    expect(session.getSnapshot().status).toBe("error");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("keeps validating a live session on successive hours and stops after logout", async () => {
    const { session, transport } = setup();
    await session.start();
    await vi.advanceTimersByTimeAsync(7200000);
    expect(transport).toHaveBeenCalledTimes(3);
    expect(session.getSnapshot().status).toBe("authenticated");
    session.logout();
    await vi.advanceTimersByTimeAsync(7200000);
    expect(transport).toHaveBeenCalledTimes(3);
    expect(session.getSnapshot().status).toBe("signedOut");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("expires short-lived tokens without further requests", async () => {
    const { session, transport } = setup({ ...body, expires_in: 2 });
    await session.start();
    await vi.advanceTimersByTimeAsync(2000);
    expect(session.getSnapshot().status).toBe("error");
    expect(transport).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("detects expiration after a suspended tab resumes", async () => {
    const { session } = setup();
    await session.start();
    vi.setSystemTime(new Date("2026-10-17T03:00:00Z"));
    await session.refresh();
    expect(session.getSnapshot().status).toBe("error");
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(["logout", "dispose"] as const)(
    "aborts pending work on %s and ignores its late response",
    async (action) => {
      const { session, transport } = setup();
      let finish: ((value: Response) => void) | undefined;
      let requestSignal: AbortSignal | null | undefined;
      transport.mockImplementation((_url, init) => {
        requestSignal = init?.signal;
        return new Promise((resolve) => {
          finish = resolve;
        });
      });
      const started = session.start();
      expect(session.getSnapshot().status).toBe("loading");
      session[action]();
      expect(requestSignal?.aborted).toBe(true);
      finish?.(Response.json(body));
      await started;
      expect(session.getSnapshot().status).toBe("signedOut");
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  it("bounds a stalled validation request and leaves no timers", async () => {
    const { session, transport } = setup();
    transport.mockImplementation(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener(
            "abort",
            () => reject(new Error("SECRET")),
            { once: true },
          );
        }),
    );
    const started = session.start();
    await vi.advanceTimersByTimeAsync(15000);
    await started;
    expect(session.getSnapshot().status).toBe("error");
    expect(JSON.stringify(session.getSnapshot())).not.toContain("SECRET");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("cleans sensitive URL values even if configuration or sessionStorage is unavailable", async () => {
    const { options, getUrl } = setup();
    const session = createAuthSession({
      ...options,
      config: undefined,
      configurationError: "設定不足",
      storage: () => {
        throw new Error("SECRET");
      },
    });
    await session.start();
    expect(getUrl()).toBe(config.redirectUri);
    expect(session.getSnapshot().status).toBe("error");
    expect(JSON.stringify(session.getSnapshot())).not.toContain("SECRET");
  });

  it("starts a new authorization request on login and reports inaccessible storage", () => {
    const { session, getUrl, options } = setup();
    session.login();
    expect(new URL(getUrl()).origin).toBe("https://id.twitch.tv");
    const unavailable = createAuthSession({
      ...options,
      storage: () => {
        throw new Error("SECRET");
      },
    });
    unavailable.login();
    expect(unavailable.getSnapshot().status).toBe("error");
    expect(JSON.stringify(unavailable.getSnapshot())).not.toContain("SECRET");
  });
});

describe("authenticated redemption subscriptions", () => {
  it("uses memory-only credentials and the authenticated broadcaster for Helix", async () => {
    const { session, transport, data } = setup();
    await session.start();
    transport.mockResolvedValue(
      Response.json(
        { data: [{ id: "subscription", status: "enabled" }] },
        { status: 202 },
      ),
    );
    await session.subscribeRedemptions(
      "session-id",
      "reward-id",
      new AbortController().signal,
    );
    const [url, init] = transport.mock.calls[1]!;
    expect(url).toBe("https://api.twitch.tv/helix/eventsub/subscriptions");
    expect(init?.headers).toMatchObject({
      Authorization: "Bearer test-token",
      "Client-Id": "client123",
    });
    expect(JSON.parse(String(init?.body))).toEqual({
      type: "channel.channel_points_custom_reward_redemption.add",
      version: "1",
      condition: { broadcaster_user_id: "42", reward_id: "reward-id" },
      transport: { method: "websocket", session_id: "session-id" },
    });
    expect(data.size).toBe(0);
    session.logout();
    await expect(
      session.subscribeRedemptions("s", "r", new AbortController().signal),
    ).rejects.toThrow();
  });
  it("clears expired authentication on a Helix 401", async () => {
    const { session, transport } = setup();
    await session.start();
    transport.mockResolvedValue(new Response(null, { status: 401 }));
    await expect(
      session.subscribeRedemptions("s", "r", new AbortController().signal),
    ).rejects.toThrow();
    expect(session.getSnapshot().status).toBe("error");
    session.dispose();
  });
});

describe("authenticated reward listing", () => {
  it("fetches all custom rewards for the authenticated broadcaster with existing credentials", async () => {
    const { session, transport, data } = setup();
    await session.start();
    transport.mockResolvedValue(
      Response.json({ data: [{ id: "reward", title: "参加券", cost: 100 }] }),
    );
    const rewards = await session.listRewards(new AbortController().signal);
    expect(rewards).toEqual([{ id: "reward", title: "参加券", cost: 100 }]);
    const [url, init] = transport.mock.calls[1]!;
    const target = new URL(String(url));
    expect(target.origin + target.pathname).toBe(
      "https://api.twitch.tv/helix/channel_points/custom_rewards",
    );
    expect(target.searchParams.get("broadcaster_id")).toBe("42");
    expect(target.searchParams.get("only_manageable_rewards")).toBe("false");
    expect(init?.headers).toMatchObject({
      Authorization: "Bearer test-token",
      "Client-Id": "client123",
    });
    expect(data.size).toBe(0);
    expect(JSON.stringify(session.getSnapshot())).not.toContain("test-token");
    session.dispose();
  });
  it.each([401, 403, 500])(
    "handles HTTP %s without disclosing server response contents",
    async (status) => {
      const { session, transport } = setup();
      await session.start();
      transport.mockResolvedValue(
        Response.json({ message: "private-response" }, { status }),
      );
      await expect(
        session.listRewards(new AbortController().signal),
      ).rejects.not.toThrow("private-response");
      expect(session.getSnapshot().status).toBe(
        status === 401 ? "error" : "authenticated",
      );
      session.dispose();
    },
  );
  it("ignores a response delivered after logout", async () => {
    const { session, transport } = setup();
    await session.start();
    let resolve: ((value: Response) => void) | undefined;
    transport.mockImplementation(
      () =>
        new Promise<Response>((finish) => {
          resolve = finish;
        }),
    );
    const pending = session.listRewards(new AbortController().signal);
    session.logout();
    resolve?.(Response.json({ data: [{ id: "r", title: "R", cost: 1 }] }));
    await expect(pending).rejects.toThrow();
    expect(session.getSnapshot().status).toBe("signedOut");
  });
});

describe("authenticated user lookup", () => {
  const viewer = {
    id: "123",
    login: "viewer",
    display_name: "視聴者",
    profile_image_url: "https://static-cdn.jtvnw.net/viewer.png",
  };
  it("resolves a login name with existing memory-only credentials", async () => {
    const { session, transport, data } = setup();
    await session.start();
    transport.mockResolvedValue(Response.json({ data: [viewer] }));
    const user = await session.lookupUser(
      "  Viewer  ",
      new AbortController().signal,
    );
    expect(user).toEqual({
      id: "123",
      login: "viewer",
      displayName: "視聴者",
      profileImageUrl: viewer.profile_image_url,
    });
    const [url, init] = transport.mock.calls[1]!;
    expect(url).toBe("https://api.twitch.tv/helix/users?login=viewer");
    expect(init?.headers).toMatchObject({
      Authorization: "Bearer test-token",
      "Client-Id": "client123",
    });
    expect(data.size).toBe(0);
    expect(JSON.stringify(session.getSnapshot())).not.toContain("test-token");
    session.dispose();
  });
  it.each([
    { data: [] },
    { data: [{ ...viewer, id: "" }] },
    { data: [{ ...viewer, login: "other" }] },
    { data: null },
  ])("rejects absent, invalid or mismatched users: %j", async (response) => {
    const { session, transport } = setup();
    await session.start();
    transport.mockResolvedValue(Response.json(response));
    await expect(
      session.lookupUser("viewer", new AbortController().signal),
    ).rejects.toThrow();
    expect(session.getSnapshot().status).toBe("authenticated");
    session.dispose();
  });
  it.each([401, 429, 500])(
    "handles HTTP %s without exposing response bodies",
    async (status) => {
      const { session, transport } = setup();
      await session.start();
      transport.mockResolvedValue(
        Response.json({ message: "private-response" }, { status }),
      );
      await expect(
        session.lookupUser("viewer", new AbortController().signal),
      ).rejects.not.toThrow("private-response");
      expect(session.getSnapshot().status).toBe(
        status === 401 ? "error" : "authenticated",
      );
      session.dispose();
    },
  );
  it.each(["abort", "logout"])(
    "ignores a late result after %s",
    async (action) => {
      const { session, transport } = setup();
      await session.start();
      let finish: ((response: Response) => void) | undefined;
      let pendingSignal: AbortSignal | null | undefined;
      transport.mockImplementation((_url, init) => {
        pendingSignal = init?.signal;
        return new Promise<Response>((resolve) => {
          finish = resolve;
        });
      });
      const controller = new AbortController();
      const pending = session.lookupUser("viewer", controller.signal);
      if (action === "abort") controller.abort();
      else session.logout();
      expect(pendingSignal?.aborted).toBe(true);
      finish?.(Response.json({ data: [viewer] }));
      await expect(pending).rejects.toThrow();
      session.dispose();
    },
  );
  it("times out stalled searches without exposing transport errors", async () => {
    const { session, transport } = setup();
    await session.start();
    transport.mockImplementation(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener(
            "abort",
            () => reject(new Error("private-response")),
            { once: true },
          );
        }),
    );
    const pending = expect(
      session.lookupUser("viewer", new AbortController().signal),
    ).rejects.toThrow("タイムアウト");
    await vi.advanceTimersByTimeAsync(15000);
    await pending;
    expect(session.getSnapshot().status).toBe("authenticated");
    session.dispose();
    expect(vi.getTimerCount()).toBe(0);
  });
  it("rejects blank logins and expired sessions before fetching", async () => {
    const { session, transport } = setup();
    await session.start();
    await expect(
      session.lookupUser(" ", new AbortController().signal),
    ).rejects.toThrow();
    vi.setSystemTime(new Date("2026-10-17T03:00:00Z"));
    await expect(
      session.lookupUser("viewer", new AbortController().signal),
    ).rejects.toThrow();
    expect(transport).toHaveBeenCalledTimes(1);
    expect(session.getSnapshot().status).toBe("error");
    session.dispose();
  });
});

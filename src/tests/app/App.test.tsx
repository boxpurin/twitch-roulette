import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import App from "../../app/App";
import { beginLogin } from "../../features/twitch-auth/oauth";
import { createAuthSession } from "../../features/twitch-auth/session";

const config = { clientId: "client123", redirectUri: "http://localhost:5173/" };

function fixture(configured: boolean, callback = false, pending = false) {
  let request: string | null = null;
  const storage = {
    getItem: () => request,
    setItem: (_key: string, value: string) => {
      request = value;
    },
    removeItem: () => {
      request = null;
    },
  };
  const state = new URL(beginLogin(config, storage)).searchParams.get("state");
  const session = createAuthSession({
    config: configured ? config : undefined,
    storage: () => storage,
    readUrl: () =>
      new URL(
        callback
          ? `${config.redirectUri}#access_token=secret-token&token_type=bearer&state=${state}`
          : config.redirectUri,
      ),
    replaceUrl: () => {},
    navigate: () => {},
    transport: async () =>
      pending
        ? new Promise<Response>(() => {})
        : Response.json({
            client_id: "client123",
            user_id: "42",
            login: "streamer",
            scopes: ["channel:read:redemptions"],
            expires_in: 7200,
          }),
  });
  return session;
}

describe("authentication screen", () => {
  it("explains missing configuration and disables login", () => {
    const session = fixture(false);
    const html = renderToStaticMarkup(<App session={session} />);
    expect(html).toContain("VITE_TWITCH_CLIENT_ID");
    expect(html).toContain('disabled=""');
  });

  it("shows the login action and registered redirect URI", () => {
    const html = renderToStaticMarkup(
      <App session={fixture(true)} config={config} />,
    );
    expect(html).toContain("Twitch でログイン");
    expect(html).toContain("http://localhost:5173/");
    expect(html).not.toContain('disabled=""');
    expect(html).not.toContain("<canvas");
    expect(html).not.toContain("項目を追加");
  });

  it("shows the authenticated user and logout without exposing the token", async () => {
    const session = fixture(true, true);
    await session.start();
    const html = renderToStaticMarkup(
      <App session={session} config={config} />,
    );
    expect(html).toContain("streamer");
    expect(html).toContain("42");
    expect(html).toContain("ログアウト");
    expect(html).not.toContain("secret-token");
    expect(html).toContain("<canvas");
    expect(html).toContain("参加者を待っています");
    expect(html).toContain("項目を追加");
    expect(html).toContain("対象報酬");
    expect(html).toContain("<select");
    expect(html).toContain("受付を開始");
    expect(html).toContain("履歴をリセット");
    expect(html).toContain("localStorage");
    expect(html).toContain("まだ項目がありません");
    expect(html).toContain("0 件");
    expect(html).toMatch(
      /<button[^>]*disabled=""[^>]*>ルーレットを回す<\/button>/,
    );
    session.dispose();
  });

  it("disables login while validation is pending", () => {
    const session = fixture(true, true, true);
    void session.start();
    const html = renderToStaticMarkup(
      <App session={session} config={config} />,
    );
    expect(html).toContain("認証を確認しています");
    expect(html).not.toContain("<canvas");
    expect(html).toContain('disabled=""');
    session.dispose();
  });
});

describe("roulette visibility", () => {
  it("hides the roulette after logout", async () => {
    const session = fixture(true, true);
    try {
      await session.start();
      expect(
        renderToStaticMarkup(<App session={session} config={config} />),
      ).toContain("<canvas");
      session.logout();
      expect(
        renderToStaticMarkup(<App session={session} config={config} />),
      ).not.toContain("<canvas");
    } finally {
      session.dispose();
    }
  });

  it("hides the roulette when authentication expires", async () => {
    vi.useFakeTimers();
    const session = fixture(true, true);
    try {
      await session.start();
      expect(
        renderToStaticMarkup(<App session={session} config={config} />),
      ).toContain("<canvas");
      vi.setSystemTime(Date.now() + 7200000);
      await session.refresh();
      const html = renderToStaticMarkup(
        <App session={session} config={config} />,
      );
      expect(html).toContain("認証の有効期限が切れました");
      expect(html).not.toContain("<canvas");
    } finally {
      session.dispose();
      vi.useRealTimers();
    }
  });
});

describe("all excluded roulette", () => {
  it("disables drawing and describes an empty eligible wheel while keeping the item", async () => {
    const raw = JSON.stringify({
      version: 1,
      resetAt: 0,
      redemptionIds: [],
      messageIds: [],
      items: [{ id: "m", name: "保存済み手動", excluded: true }],
    });
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (key: string) =>
          key.startsWith("twitch-roulette.history.") ? raw : null,
        setItem: () => {},
      },
    });
    const session = fixture(true, true);
    try {
      await session.start();
      const html = renderToStaticMarkup(
        <App session={session} config={config} />,
      );
      expect(html).toContain("抽選対象の項目がありません");
      expect(html).toContain("抽選対象 0 件のルーレット（待機中）");
      expect(html).toContain("保存済み手動");
      expect(html).toMatch(
        /<button[^>]*disabled=""[^>]*>ルーレットを回す<\/button>/,
      );
    } finally {
      session.dispose();
      vi.unstubAllGlobals();
    }
  });
});

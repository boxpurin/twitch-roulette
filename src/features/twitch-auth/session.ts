import { parseRewards } from "../twitch-rewards/rewards";
import { isRecord, isText } from "../../shared/validation";
import {
  beginLogin,
  cleanCallbackUrl,
  clearLoginRequest,
  consumeCallback,
  validateToken,
} from "./oauth";
import type { AuthConfig, AuthStorage, AuthUser } from "./oauth";

export type AuthState =
  | { status: "signedOut" | "loading" }
  | { status: "authenticated"; user: AuthUser }
  | { status: "error"; message: string };

interface SessionOptions {
  config?: AuthConfig;
  configurationError?: string;
  storage: () => AuthStorage;
  readUrl: () => URL;
  replaceUrl: (url: string) => void;
  navigate: (url: string) => void;
  transport?: typeof fetch;
}

const HOUR = 3600000;
const EXPIRED =
  "認証の有効期限が切れました。もう一度 Twitch でログインしてください。";

export function createAuthSession(options: SessionOptions) {
  let state: AuthState = options.config
    ? { status: "signedOut" }
    : {
        status: "error",
        message:
          options.configurationError ??
          "Twitch の Client ID と戻り先 URL を設定してください。",
      };
  let token: string | null = null;
  let expiresAt = 0;
  let lastValidated = 0;
  let started = false;
  let generation = 0;
  let request: AbortController | undefined;
  let requestTimeout: ReturnType<typeof setTimeout> | undefined;
  let expiryTimer: ReturnType<typeof setTimeout> | undefined;
  let validationTimer: ReturnType<typeof setTimeout> | undefined;
  const listeners = new Set<() => void>();
  const rewardRequests = new Set<AbortController>();

  function publish(next: AuthState) {
    state = next;
    listeners.forEach((listener) => listener());
  }

  function cancel() {
    generation++;
    rewardRequests.forEach((controller) => controller.abort());
    rewardRequests.clear();
    request?.abort();
    request = undefined;
    clearTimeout(requestTimeout);
    clearTimeout(expiryTimer);
    clearTimeout(validationTimer);
    requestTimeout = expiryTimer = validationTimer = undefined;
    token = null;
    expiresAt = lastValidated = 0;
  }

  function fail(message: string) {
    cancel();
    publish({ status: "error", message });
  }

  function armExpiry() {
    clearTimeout(expiryTimer);
    expiryTimer = setTimeout(
      () => {
        if (Date.now() >= expiresAt) fail(EXPIRED);
        else armExpiry();
      },
      Math.min(expiresAt - Date.now(), 2147483647),
    );
  }

  async function check() {
    if (!token || !options.config || request) return;
    const id = ++generation;
    const controller = new AbortController();
    request = controller;
    const requestedAt = Date.now();
    requestTimeout = setTimeout(() => {
      if (generation === id)
        fail(
          "Twitch への接続がタイムアウトしました。もう一度ログインしてください。",
        );
    }, 15000);
    try {
      const user = await validateToken(
        token,
        options.config,
        controller.signal,
        options.transport,
      );
      if (generation !== id) return;
      const deadline = requestedAt + user.expiresIn * 1000;
      if (deadline <= Date.now()) {
        fail(EXPIRED);
        return;
      }
      expiresAt = deadline;
      lastValidated = requestedAt;
      publish({ status: "authenticated", user });
      armExpiry();
      clearTimeout(validationTimer);
      validationTimer = setTimeout(() => {
        void refresh();
      }, HOUR);
    } catch (error) {
      if (generation === id)
        fail(
          error instanceof Error
            ? error.message
            : "認証を確認できませんでした。再ログインしてください。",
        );
    } finally {
      if (generation === id) {
        clearTimeout(requestTimeout);
        requestTimeout = undefined;
        request = undefined;
      }
    }
  }

  async function refresh() {
    if (!token) return;
    if (expiresAt && Date.now() >= expiresAt) {
      fail(EXPIRED);
      return;
    }
    if (Date.now() - lastValidated >= HOUR) await check();
  }

  async function start() {
    if (started) return;
    started = true;
    // Remove secrets before touching storage, configuration, network or React.
    let callback: { token: string } | null;
    try {
      const url = options.readUrl();
      const clean = cleanCallbackUrl(url);
      if (clean.href !== url.href) options.replaceUrl(clean.href);
      callback = consumeCallback(url, options.storage());
      if (!callback) return;
      if (!options.config) return;
      const redirect = new URL(options.config.redirectUri);
      if (
        url.origin !== redirect.origin ||
        url.pathname !== redirect.pathname
      ) {
        fail(
          "戻り先 URL が設定と一致しません。設定を確認してログインしてください。",
        );
        return;
      }
    } catch {
      fail(
        "ログイン要求が無効、拒否、または期限切れです。ブラウザの保存設定を確認して再ログインしてください。",
      );
      return;
    }
    token = callback.token;
    publish({ status: "loading" });
    await check();
  }

  function login() {
    if (!options.config) return;
    cancel();
    try {
      const current = options.readUrl();
      const target = new URL(options.config.redirectUri);
      if (
        current.origin !== target.origin ||
        current.pathname !== target.pathname
      ) {
        fail(
          "設定した戻り先 URL でこのアプリを開いてからログインしてください。",
        );
        return;
      }
      options.navigate(beginLogin(options.config, options.storage()));
    } catch {
      fail(
        "ログインを開始できません。ブラウザの保存設定と接続を確認してください。",
      );
    }
  }

  function logout() {
    cancel();
    try {
      clearLoginRequest(options.storage());
    } catch {
      publish({
        status: "error",
        message: "認証を終了しました。ブラウザの保存領域にアクセスできません。",
      });
      return;
    }
    publish({ status: "signedOut" });
  }

  async function listRewards(signal: AbortSignal) {
    if (
      state.status !== "authenticated" ||
      !token ||
      !options.config ||
      signal.aborted
    )
      throw new Error(EXPIRED);
    if (Date.now() >= expiresAt) {
      fail(EXPIRED);
      throw new Error(EXPIRED);
    }
    const credential = token;
    const controller = new AbortController();
    const abort = () => controller.abort();
    signal.addEventListener("abort", abort, { once: true });
    rewardRequests.add(controller);
    try {
      const url = new URL(
        "https://api.twitch.tv/helix/channel_points/custom_rewards",
      );
      url.search = new URLSearchParams({
        broadcaster_id: state.user.userId,
        only_manageable_rewards: "false",
      }).toString();
      const response = await (options.transport ?? fetch)(url.href, {
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${credential}`,
          "Client-Id": options.config.clientId,
        },
      });
      if (controller.signal.aborted || token !== credential)
        throw new Error("報酬一覧の取得を中止しました。");
      if (response.status === 401) {
        fail(EXPIRED);
        throw new Error(EXPIRED);
      }
      if (response.status === 403)
        throw new Error(
          "報酬一覧を取得できません。このチャンネルでカスタムチャンネルポイント報酬が利用できるか確認してください。",
        );
      if (!response.ok)
        throw new Error(
          `報酬一覧を取得できません（HTTP ${response.status}）。もう一度取得してください。`,
        );
      const body: unknown = await response.json();
      if (controller.signal.aborted || token !== credential)
        throw new Error("報酬一覧の取得を中止しました。");
      return parseRewards(body);
    } finally {
      signal.removeEventListener("abort", abort);
      rewardRequests.delete(controller);
    }
  }

  async function subscribeRedemptions(
    sessionId: string,
    rewardId: string,
    signal: AbortSignal,
  ): Promise<void> {
    if (
      state.status !== "authenticated" ||
      !token ||
      !options.config ||
      signal.aborted
    )
      throw new Error(EXPIRED);
    if (Date.now() >= expiresAt) {
      fail(EXPIRED);
      throw new Error(EXPIRED);
    }
    const credential = token;
    const response = await (options.transport ?? fetch)(
      "https://api.twitch.tv/helix/eventsub/subscriptions",
      {
        method: "POST",
        signal,
        headers: {
          Authorization: `Bearer ${credential}`,
          "Client-Id": options.config.clientId,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          type: "channel.channel_points_custom_reward_redemption.add",
          version: "1",
          condition: {
            broadcaster_user_id: state.user.userId,
            reward_id: rewardId,
          },
          transport: { method: "websocket", session_id: sessionId },
        }),
      },
    );
    if (signal.aborted || token !== credential)
      throw new Error("購読を中止しました。");
    if (response.status === 401) {
      fail(EXPIRED);
      throw new Error(EXPIRED);
    }
    if (response.status !== 202)
      throw new Error(
        `報酬交換を購読できません（HTTP ${response.status}）。報酬 ID と権限を確認してください。`,
      );
    const body: unknown = await response.json();
    if (
      !isRecord(body) ||
      !Array.isArray(body.data) ||
      !body.data.some(
        (value) =>
          isRecord(value) && isText(value.id) && value.status === "enabled",
      )
    ) {
      throw new Error(
        "Twitch の購読応答が不正です。受付を開始し直してください。",
      );
    }
  }

  return {
    start,
    login,
    logout,
    refresh,
    subscribeRedemptions,
    listRewards,
    dispose() {
      cancel();
      publish({ status: "signedOut" });
    },
    getSnapshot: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

export type AuthSession = ReturnType<typeof createAuthSession>;

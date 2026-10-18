import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { connectRedemptions } from "./client";
import type { EventSocket, ReceptionStatus, ReceptionOptions } from "./client";
import type { Redemption } from "../roulette/history";

class Socket implements EventSocket {
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  closed = false;
  close() {
    this.closed = true;
  }
  send(value: unknown) {
    this.onmessage?.({ data: JSON.stringify(value) });
  }
  welcome(id = "s1") {
    this.send({
      metadata: { message_type: "session_welcome" },
      payload: { session: { id, keepalive_timeout_seconds: 10 } },
    });
  }
}
function notification(reward = "reward", broadcaster = "42") {
  return {
    metadata: {
      message_type: "notification",
      message_id: "msg",
      subscription_type: "channel.channel_points_custom_reward_redemption.add",
      subscription_version: "1",
    },
    payload: {
      subscription: {
        type: "channel.channel_points_custom_reward_redemption.add",
        version: "1",
      },
      event: {
        id: "redemption",
        broadcaster_user_id: broadcaster,
        user_id: "viewer",
        user_name: "視聴者",
        reward: { id: reward },
        redeemed_at: "2026-10-18T00:00:00Z",
      },
    },
  };
}
function fixture(
  subscribe: ReceptionOptions["subscribe"] = vi.fn(async () => {}),
) {
  const sockets: Socket[] = [];
  const urls: string[] = [];
  const events: Redemption[] = [];
  const statuses: ReceptionStatus[] = [];
  const client = connectRedemptions({
    userId: "42",
    rewardId: "reward",
    subscribe,
    openSocket: (url) => {
      urls.push(url);
      const socket = new Socket();
      sockets.push(socket);
      return socket;
    },
    onEvent: (event) => events.push(event),
    onStatus: (status) => statuses.push(status),
  });
  return { client, sockets, urls, events, statuses, subscribe };
}
beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("EventSub reception", () => {
  it("subscribes after welcome, maps valid events and filters other rewards/accounts", async () => {
    const f = fixture();
    const socket = f.sockets[0]!;
    socket.welcome();
    await Promise.resolve();
    expect(f.subscribe).toHaveBeenCalledWith(
      "s1",
      "reward",
      expect.any(AbortSignal),
    );
    expect(f.statuses.at(-1)?.phase).toBe("connected");
    socket.send(notification("other"));
    socket.send(notification("reward", "other"));
    socket.onmessage?.({ data: "{bad" });
    socket.send(notification());
    expect(f.events).toEqual([
      {
        userId: "viewer",
        name: "視聴者",
        redemptionId: "redemption",
        messageId: "msg",
        redeemedAt: Date.parse("2026-10-18T00:00:00Z"),
      },
    ]);
    f.client.stop();
    expect(socket.closed).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });
  it("refreshes keepalive and reconnects/resubscribes after timeout", async () => {
    const f = fixture();
    f.sockets[0]!.welcome();
    await vi.advanceTimersByTimeAsync(9000);
    f.sockets[0]!.send({
      metadata: { message_type: "session_keepalive" },
      payload: {},
    });
    await vi.advanceTimersByTimeAsync(9000);
    expect(f.sockets).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(4000);
    expect(f.sockets).toHaveLength(2);
    f.sockets[1]!.welcome("s2");
    await Promise.resolve();
    expect(f.subscribe).toHaveBeenCalledTimes(2);
    f.client.stop();
    expect(vi.getTimerCount()).toBe(0);
  });
  it("retains old connection until reconnect welcome, without resubscribing", async () => {
    const f = fixture();
    const old = f.sockets[0]!;
    old.welcome();
    await Promise.resolve();
    old.send({
      metadata: { message_type: "session_reconnect" },
      payload: {
        session: {
          reconnect_url: "wss://eventsub.wss.twitch.tv/ws?reconnect=abc",
        },
      },
    });
    expect(old.closed).toBe(false);
    old.send(notification());
    expect(f.events).toHaveLength(1);
    f.sockets[1]!.welcome("s2");
    expect(old.closed).toBe(true);
    expect(f.urls[1]).toBe("wss://eventsub.wss.twitch.tv/ws?reconnect=abc");
    expect(f.subscribe).toHaveBeenCalledTimes(1);
    f.client.stop();
  });
  it("allows a delayed handoff welcome after the old heartbeat expires", async () => {
    const f = fixture();
    const old = f.sockets[0]!;
    old.welcome();
    await vi.advanceTimersByTimeAsync(9000);
    old.send({
      metadata: { message_type: "session_reconnect" },
      payload: {
        session: {
          reconnect_url: "wss://eventsub.wss.twitch.tv/ws?reconnect=slow",
        },
      },
    });
    await vi.advanceTimersByTimeAsync(2000);
    expect(old.closed).toBe(false);
    expect(f.sockets[1]!.closed).toBe(false);
    f.sockets[1]!.welcome("new");
    expect(old.closed).toBe(true);
    expect(f.subscribe).toHaveBeenCalledTimes(1);
    f.client.stop();
  });
  it("keeps the candidate alive if the old socket closes during handoff", async () => {
    const f = fixture();
    const old = f.sockets[0]!;
    old.welcome();
    await Promise.resolve();
    old.send({
      metadata: { message_type: "session_reconnect" },
      payload: {
        session: {
          reconnect_url: "wss://eventsub.wss.twitch.tv/ws?reconnect=abc",
        },
      },
    });
    old.onclose?.();
    expect(f.sockets[1]!.closed).toBe(false);
    f.sockets[1]!.welcome("new");
    expect(f.subscribe).toHaveBeenCalledTimes(1);
    expect(f.statuses.at(-1)?.phase).toBe("connected");
    f.client.stop();
  });
  it("reports subscription failure and revocation without retry loops", async () => {
    const f = fixture(
      vi.fn(async () => {
        throw new Error("購読失敗");
      }),
    );
    f.sockets[0]!.welcome();
    await Promise.resolve();
    await Promise.resolve();
    expect(f.statuses.at(-1)?.phase).toBe("error");
    expect(vi.getTimerCount()).toBe(0);
    const g = fixture();
    g.sockets[0]!.welcome();
    await Promise.resolve();
    g.sockets[0]!.send({
      metadata: { message_type: "revocation" },
      payload: {},
    });
    expect(g.statuses.at(-1)?.phase).toBe("error");
    expect(g.sockets[0]!.closed).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });
  it("aborts pending subscriptions and ignores late events/responses on disposal", async () => {
    let finish: (() => void) | undefined;
    let signal: AbortSignal | undefined;
    const f = fixture(
      vi.fn((_id: string, _reward: string, value: AbortSignal) => {
        signal = value;
        return new Promise<void>((resolve) => {
          finish = resolve;
        });
      }),
    );
    const socket = f.sockets[0]!;
    socket.welcome();
    const callback = socket.onmessage;
    f.client.stop();
    expect(signal?.aborted).toBe(true);
    callback?.({ data: JSON.stringify(notification()) });
    finish?.();
    await Promise.resolve();
    expect(f.events).toEqual([]);
    expect(f.statuses.at(-1)?.phase).not.toBe("connected");
    expect(vi.getTimerCount()).toBe(0);
  });
  it("retries ordinary disconnects and can stop pending retries", async () => {
    const f = fixture();
    f.sockets[0]!.onclose?.();
    await vi.advanceTimersByTimeAsync(2000);
    expect(f.sockets).toHaveLength(2);
    f.sockets[1]!.onerror?.();
    f.client.stop();
    await vi.advanceTimersByTimeAsync(60000);
    expect(f.sockets).toHaveLength(2);
    expect(vi.getTimerCount()).toBe(0);
  });
});

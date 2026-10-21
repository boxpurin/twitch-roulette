import { afterEach, describe, expect, it, vi } from "vitest";
import { createRewardList } from "../../../features/twitch-rewards/list";
import type { Reward } from "../../../features/twitch-rewards/rewards";

const rewards = [{ id: "r", title: "参加", cost: 100 }];
afterEach(() => vi.useRealTimers());

describe("reward list lifecycle", () => {
  it("loads names, handles empty lists, and retries failures", async () => {
    let fail = true;
    const list = createRewardList(async () => {
      if (fail) throw new Error("一時的な失敗");
      return rewards;
    });
    expect(list.getSnapshot().status).toBe("loading");
    await list.reload();
    expect(list.getSnapshot()).toMatchObject({
      status: "error",
      message: "一時的な失敗",
    });
    fail = false;
    await list.reload();
    expect(list.getSnapshot()).toEqual({ status: "ready", rewards });
    const empty = createRewardList(async () => []);
    await empty.reload();
    expect(empty.getSnapshot()).toEqual({ status: "ready", rewards: [] });
  });
  it("ignores old responses after retry and cancellation", async () => {
    const requests: {
      signal: AbortSignal;
      finish: (rewards: Reward[]) => void;
    }[] = [];
    const list = createRewardList(
      (signal) =>
        new Promise((resolve) => {
          requests.push({ signal, finish: resolve });
        }),
    );
    const first = list.reload();
    const second = list.reload();
    expect(requests[0]?.signal.aborted).toBe(true);
    requests[1]?.finish(rewards);
    await second;
    requests[0]?.finish([{ id: "old", title: "古い", cost: 1 }]);
    await first;
    expect(list.getSnapshot()).toEqual({ status: "ready", rewards });
    const third = list.reload();
    list.cancel();
    requests[2]?.finish(rewards);
    await third;
    expect(list.getSnapshot().status).toBe("loading");
  });
  it("reports a timed-out request even if the transport ignores abort, then allows retry", async () => {
    vi.useFakeTimers();
    let aborted = false;
    let finish: ((value: Reward[]) => void) | undefined;
    const list = createRewardList((signal) => {
      signal.addEventListener("abort", () => {
        aborted = true;
      });
      return new Promise((resolve) => {
        finish = resolve;
      });
    });
    const pending = list.reload();
    await vi.advanceTimersByTimeAsync(15000);
    expect(aborted).toBe(true);
    expect(list.getSnapshot()).toMatchObject({
      status: "error",
      message: expect.stringContaining("タイムアウト"),
    });
    finish?.(rewards);
    await pending;
    expect(list.getSnapshot().status).toBe("error");
    expect(vi.getTimerCount()).toBe(0);
  });
});

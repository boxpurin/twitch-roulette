import { describe, expect, it } from "vitest";
import { createRouletteController } from "../../app/controller";
import type { ReceptionOptions } from "../../features/twitch-eventsub/client";
import { loadHistory, saveHistory } from "../../features/participants/storage";
import { emptyHistory } from "../../features/participants/history";

function fixture() {
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
  let reception: ReceptionOptions | undefined;
  let stopped = 0;
  const options = {
    userId: "streamer",
    storage: () => storage,
    subscribe: async () => {},
    now: () => 200,
    connect: (value: ReceptionOptions) => {
      reception = value;
      return {
        stop: () => {
          stopped++;
        },
      };
    },
  };
  const controller = createRouletteController(options);
  const redeem = (id: string, at = 100) =>
    reception?.onEvent({
      userId: "42",
      name: "視聴者",
      redemptionId: id,
      messageId: id,
      redeemedAt: at,
    });
  return {
    controller,
    storage,
    values,
    options,
    redeem,
    reception: () => reception,
    stopped: () => stopped,
  };
}

describe("roulette coordination", () => {
  it("receives and persists repeat weights, restores the selected reward after reload", () => {
    const f = fixture();
    f.controller.selectReward("reward");
    f.controller.start();
    f.redeem("1");
    f.redeem("2");
    const reloaded = createRouletteController(f.options);
    expect(reloaded.getSnapshot().rewardId).toBe("reward");
    expect(reloaded.getSnapshot().items[0]).toMatchObject({
      weight: 2,
      redemptions: 2,
    });
    f.controller.stop();
    f.redeem("3");
    expect(f.controller.getSnapshot().items[0]?.weight).toBe(2);
  });
  it("freezes the draw and saves arrivals during a spin, then applies them", () => {
    const f = fixture();
    f.controller.selectReward("r");
    f.controller.start();
    f.redeem("1");
    const winner = f.controller.beginSpin(() => 0);
    expect(winner?.weight).toBe(1);
    expect(f.controller.beginSpin()).toBeUndefined();
    f.redeem("2");
    expect(f.controller.getSnapshot().items[0]?.weight).toBe(1);
    expect(
      loadHistory(f.storage, "streamer", "r").history.items[0]?.weight,
    ).toBe(2);
    f.controller.edit({ type: "weight", id: "twitch:42", weight: 9 });
    expect(f.controller.reset()).toBe(false);
    expect(f.controller.selectReward("other")).toBe(false);
    f.controller.finishSpin(winner!);
    expect(f.controller.getSnapshot().items[0]?.weight).toBe(2);
    expect(f.controller.getSnapshot().winner?.weight).toBe(1);
  });
  it("resets only the current scope and rejects old callbacks and old redeliveries", () => {
    const f = fixture();
    saveHistory(f.storage, "other", "r", {
      ...emptyHistory(),
      items: [{ id: "manual", name: "保護" }],
    });
    f.controller.selectReward("r");
    f.controller.start();
    f.redeem("1");
    const old = f.reception();
    expect(f.controller.reset()).toBe(true);
    old?.onEvent({
      userId: "42",
      name: "遅延",
      redemptionId: "late",
      messageId: "late",
      redeemedAt: 300,
    });
    expect(f.controller.getSnapshot().items).toEqual([]);
    expect(f.controller.getSnapshot().accepting).toBe(false);
    expect(f.stopped()).toBe(1);
    f.controller.start();
    f.redeem("2", 100);
    expect(f.controller.getSnapshot().items).toEqual([]);
    f.redeem("3", 201);
    expect(f.controller.getSnapshot().items[0]?.weight).toBe(1);
    expect(loadHistory(f.storage, "other", "r").history.items[0]?.name).toBe(
      "保護",
    );
    expect(
      createRouletteController(f.options).getSnapshot().items[0]?.weight,
    ).toBe(1);
  });
  it("switches histories without leaking old callbacks or manual items across accounts/rewards", () => {
    const f = fixture();
    f.controller.edit({ type: "add", id: "manual", name: "手動" });
    f.controller.selectReward("a");
    expect(f.controller.getSnapshot().items).toEqual([]);
    f.controller.start();
    f.redeem("1");
    const old = f.reception();
    f.controller.selectReward("b");
    old?.onStatus({ phase: "connected", message: "old" });
    expect(f.controller.getSnapshot().reception.phase).toBe("stopped");
    expect(f.controller.getSnapshot().items).toEqual([]);
    f.controller.selectReward("a");
    expect(f.controller.getSnapshot().items).toHaveLength(1);
    const other = createRouletteController({ ...f.options, userId: "other" });
    expect(other.getSnapshot().items).toEqual([]);
  });
  it("protects invalid stored history until explicit reset and supports unavailable storage", () => {
    const f = fixture();
    saveHistory(f.storage, "streamer", "r", emptyHistory());
    const key = [...f.values.keys()][0]!;
    f.values.set(key, "{bad");
    f.controller.selectReward("r");
    expect(f.controller.getSnapshot().storageError).toBeTruthy();
    f.controller.edit({ type: "add", id: "a", name: "A" });
    expect(f.values.get(key)).toBe("{bad");
    f.controller.reset();
    expect(loadHistory(f.storage, "streamer", "r").error).toBeNull();
    const unavailable = createRouletteController({
      ...f.options,
      storage: () => {
        throw new Error("blocked");
      },
    });
    unavailable.edit({ type: "add", id: "a", name: "A" });
    expect(unavailable.getSnapshot().items).toHaveLength(1);
    expect(unavailable.getSnapshot().storageError).toBeTruthy();
  });
});

describe("exclusion coordination", () => {
  it("retains Twitch exclusions on repeat exchanges and across reloads and reward switches", () => {
    const f = fixture();
    f.controller.selectReward("r");
    f.controller.start();
    f.redeem("1");
    f.controller.edit({ type: "exclude", id: "twitch:42", excluded: true });
    f.redeem("2");
    expect(f.controller.getSnapshot().items[0]).toMatchObject({
      excluded: true,
      weight: 2,
      redemptions: 2,
    });
    expect(f.controller.beginSpin(() => 0)).toBeUndefined();
    expect(f.controller.getSnapshot().spinning).toBe(false);
    const reloaded = createRouletteController(f.options);
    expect(reloaded.getSnapshot().items[0]?.excluded).toBe(true);
    f.controller.selectReward("other");
    expect(f.controller.getSnapshot().items).toEqual([]);
    f.controller.selectReward("r");
    expect(f.controller.getSnapshot().items[0]?.excluded).toBe(true);
    f.controller.edit({ type: "exclude", id: "twitch:42", excluded: false });
    expect(f.controller.beginSpin(() => 0)?.id).toBe("twitch:42");
  });
  it("keeps manual items, rejects changes during spins and clears stale winners on exclusion", () => {
    const f = fixture();
    f.controller.edit({ type: "add", id: "m", name: "手動" });
    const winner = f.controller.beginSpin(() => 0);
    f.controller.edit({ type: "exclude", id: "m", excluded: true });
    expect(f.controller.getSnapshot().items[0]?.excluded).toBeUndefined();
    f.controller.finishSpin(winner ?? null);
    expect(f.controller.getSnapshot().winner?.id).toBe("m");
    f.controller.edit({ type: "exclude", id: "m", excluded: true });
    expect(f.controller.getSnapshot().winner).toBeNull();
    expect(createRouletteController(f.options).getSnapshot().items).toEqual([
      { id: "m", name: "手動", excluded: true },
    ]);
    expect(f.controller.beginSpin(() => 0)).toBeUndefined();
  });
});

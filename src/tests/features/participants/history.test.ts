import { describe, expect, it } from "vitest";
import {
  emptyHistory,
  historyReducer,
} from "../../../features/participants/history";
import {
  loadHistory,
  saveHistory,
} from "../../../features/participants/storage";

const event = {
  userId: "42",
  name: "視聴者",
  redemptionId: "r1",
  messageId: "m1",
  redeemedAt: 100,
};
const redeem = (value = event) => ({ type: "redeem" as const, event: value });

describe("redemption history", () => {
  it("registers once per Twitch ID, increments repeats, keeps manual adjustments", () => {
    let state = historyReducer(emptyHistory(), redeem());
    expect(state.items).toEqual([
      {
        id: "twitch:42",
        userId: "42",
        name: "視聴者",
        weight: 1,
        redemptions: 1,
      },
    ]);
    state = historyReducer(
      state,
      redeem({ ...event, redemptionId: "r2", messageId: "m2" }),
    );
    expect(state.items[0]?.weight).toBe(2);
    state = historyReducer(state, {
      type: "weight",
      id: "twitch:42",
      weight: 5,
    });
    state = historyReducer(
      state,
      redeem({
        ...event,
        redemptionId: "r3",
        messageId: "m3",
        name: "新しい名前",
      }),
    );
    expect(state.items[0]).toMatchObject({
      weight: 6,
      redemptions: 3,
      name: "新しい名前",
    });
    state = historyReducer(
      state,
      redeem({ ...event, userId: "43", redemptionId: "r4", messageId: "m4" }),
    );
    expect(state.items).toHaveLength(2);
  });
  it("deduplicates redemption IDs and message IDs, including after deletion", () => {
    let state = historyReducer(emptyHistory(), redeem());
    expect(
      historyReducer(state, redeem({ ...event, messageId: "other" })),
    ).toBe(state);
    expect(
      historyReducer(state, redeem({ ...event, redemptionId: "other" })),
    ).toBe(state);
    state = historyReducer(state, { type: "remove", id: "twitch:42" });
    expect(historyReducer(state, redeem()).items).toEqual([]);
    expect(
      historyReducer(
        state,
        redeem({ ...event, redemptionId: "new", messageId: "new" }),
      ).items[0]?.weight,
    ).toBe(1);
  });
  it.each([0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])(
    "rejects weight %s",
    (weight) => {
      const state = historyReducer(emptyHistory(), redeem());
      expect(
        historyReducer(state, { type: "weight", id: "twitch:42", weight }),
      ).toBe(state);
    },
  );
  it("resets items but rejects pre-reset redeliveries after reload", () => {
    const state = historyReducer(historyReducer(emptyHistory(), redeem()), {
      type: "reset",
      at: 200,
    });
    expect(state.items).toEqual([]);
    expect(historyReducer(state, redeem()).items).toEqual([]);
    expect(
      historyReducer(state, redeem({ ...event, redeemedAt: 201 })).items[0]
        ?.weight,
    ).toBe(1);
  });
});

describe("persistent history", () => {
  function fixture() {
    const values = new Map<string, string>();
    return {
      values,
      storage: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => {
          values.set(key, value);
        },
      },
    };
  }
  it("restores items, weights, counts and deduplication, isolated per account/reward", () => {
    const { storage } = fixture();
    const state = historyReducer(emptyHistory(), redeem());
    expect(saveHistory(storage, "a", "reward", state)).toBeNull();
    const loaded = loadHistory(storage, "a", "reward");
    expect(loaded.error).toBeNull();
    expect(loaded.history).toEqual(state);
    expect(historyReducer(loaded.history, redeem())).toEqual(state);
    expect(loadHistory(storage, "b", "reward").history.items).toEqual([]);
    expect(loadHistory(storage, "a", "other").history.items).toEqual([]);
  });
  it("rejects malformed/unsupported data without overwriting it", () => {
    const { storage, values } = fixture();
    saveHistory(storage, "a", "r", emptyHistory());
    const key = [...values.keys()][0]!;
    for (const value of [
      "{",
      '{"version":2}',
      JSON.stringify({
        ...emptyHistory(),
        items: [{ id: "a", name: "A", weight: 0 }],
      }),
    ]) {
      values.set(key, value);
      expect(loadHistory(storage, "a", "r").error).toBeTruthy();
      expect(values.get(key)).toBe(value);
    }
  });
  it("reports blocked reads and quota failures", () => {
    const storage = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("quota");
      },
    };
    expect(loadHistory(storage, "a", "r").error).toBeTruthy();
    expect(saveHistory(storage, "a", "r", emptyHistory())).toBeTruthy();
  });
});

describe("saved exclusion", () => {
  it("preserves exclusion through repeat redemption and reload", () => {
    let state = historyReducer(emptyHistory(), redeem());
    state = historyReducer(state, {
      type: "exclude",
      id: "twitch:42",
      excluded: true,
    });
    state = historyReducer(
      state,
      redeem({ ...event, redemptionId: "r2", messageId: "m2" }),
    );
    expect(state.items[0]).toMatchObject({
      excluded: true,
      weight: 2,
      redemptions: 2,
    });
    let raw: string | null = null;
    const storage = {
      getItem: () => raw,
      setItem: (_key: string, value: string) => {
        raw = value;
      },
    };
    saveHistory(storage, "a", "r", state);
    expect(loadHistory(storage, "a", "r").history.items[0]).toMatchObject({
      excluded: true,
      weight: 2,
      redemptions: 2,
    });
  });
  it("loads older items and explicit false but rejects nonboolean exclusion", () => {
    for (const excluded of [undefined, false, true, "true", 1, null]) {
      const raw = JSON.stringify({
        ...emptyHistory(),
        items: [{ id: "m", name: "手動", excluded }],
      });
      const loaded = loadHistory(
        { getItem: () => raw, setItem: () => {} },
        "a",
        "r",
      );
      if (excluded === undefined || typeof excluded === "boolean") {
        expect(loaded.error).toBeNull();
        expect(loaded.history.items[0]?.excluded).toBe(excluded);
      } else {
        expect(loaded.blocked).toBe(true);
      }
    }
  });
});

describe("legacy winner history is no longer restored", () => {
  it.each([
    undefined,
    null,
    {
      entries: [
        { itemId: "a", name: "過去の当選者", spunAt: 100, winNumber: 2 },
      ],
      counts: [{ itemId: "a", count: 2 }],
    },
    { entries: "old malformed data", counts: null },
  ])(
    "preserves participant history and drops old winner fields: %j",
    (winnerHistory) => {
      let raw = JSON.stringify({
        ...emptyHistory(),
        items: [{ id: "a", name: "保存済み" }],
        winnerHistory,
      });
      const storage = {
        getItem: () => raw,
        setItem: (_key: string, value: string) => {
          raw = value;
        },
      };
      const result = loadHistory(storage, "a", "r");
      expect(result.error).toBeNull();
      expect(result.history.items[0].name).toBe("保存済み");
      expect(result.history).not.toHaveProperty("winnerHistory");
      saveHistory(storage, "a", "r", result.history);
      expect(JSON.parse(raw)).not.toHaveProperty("winnerHistory");
    },
  );
});

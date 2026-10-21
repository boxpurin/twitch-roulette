import { describe, expect, it, vi } from "vitest";
import { getSectors, getStopAngle, selectWinner } from "./spin";

const items = [
  { id: "a", name: "A賞" },
  { id: "b", name: "B賞" },
];

describe("winner selection", () => {
  it("does not draw from an empty wheel", () => {
    const random = vi.fn(() => 0);
    expect(selectWinner([], random)).toBeUndefined();
    expect(random).not.toHaveBeenCalled();
  });

  it.each([0, 0.499, 0.999])(
    "selects the only item with random %s",
    (value) => {
      expect(selectWinner(items.slice(0, 1), () => value)).toEqual(items[0]);
    },
  );

  it.each([
    [0, "a"],
    [0.499, "a"],
    [0.5, "b"],
    [0.999, "b"],
  ] as const)("selects the correct equal slice for random %s", (value, id) => {
    expect(selectWinner(items, () => value)?.id).toBe(id);
  });
});

describe("stopping under the top pointer", () => {
  it.each([
    [0, 2, 1.5],
    [1, 2, 0.5],
    [0, 1, 1],
    [0, 4, 1.75],
    [3, 4, 0.25],
  ])("aligns item %s of %s at %sπ", (index, count, multiplier) => {
    const angle = getStopAngle(index, count, 0);
    expect(angle % (Math.PI * 2)).toBeCloseTo(multiplier * Math.PI);
    expect(angle).toBeGreaterThanOrEqual(Math.PI * 10);
  });

  it("moves forward by at least five turns when spinning again", () => {
    const current = 19 * Math.PI;
    const stop = getStopAngle(1, 2, current);
    expect(stop - current).toBeGreaterThanOrEqual(10 * Math.PI);
    expect(stop % (2 * Math.PI)).toBeCloseTo(Math.PI / 2);
  });
});

describe("weighted wheel", () => {
  const weighted = [
    { id: "a", name: "A", weight: 1 },
    { id: "b", name: "B", weight: 3 },
  ];
  it.each([
    [0, "a"],
    [0.249999, "a"],
    [0.25, "b"],
    [0.99999, "b"],
  ] as const)("draws 1:3 with random %s", (random, id) => {
    expect(selectWinner(weighted, () => random)?.id).toBe(id);
  });
  it("stops at the weighted sector midpoint", () => {
    expect(getStopAngle(0, weighted, 0) % (2 * Math.PI)).toBeCloseTo(
      1.75 * Math.PI,
    );
    expect(getStopAngle(1, weighted, 0) % (2 * Math.PI)).toBeCloseTo(
      0.75 * Math.PI,
    );
  });
  it("normalizes large weights without overflow", () => {
    const large = weighted.map((item) => ({
      ...item,
      weight: Number.MAX_SAFE_INTEGER,
    }));
    expect(selectWinner(large, () => 0.5)?.id).toBe("b");
  });
  it.each([-1, NaN, 1, Infinity])(
    "rejects invalid random value %s",
    (random) => {
      expect(() => selectWinner(weighted, () => random)).toThrow();
    },
  );
});

describe("excluded sectors", () => {
  const entries = [
    { id: "x", name: "除外", weight: 100, excluded: true },
    { id: "a", name: "A", weight: 1 },
    { id: "y", name: "除外2", weight: 100, excluded: true },
    { id: "b", name: "B", weight: 3, excluded: false },
  ];
  it("calculates probabilities and stop positions only for eligible items", () => {
    const sectors = getSectors(entries);
    expect(sectors.map((s) => [s.item.id, s.probability])).toEqual([
      ["a", 0.25],
      ["b", 0.75],
    ]);
    expect(getStopAngle(1, entries, 0) % (2 * Math.PI)).toBeCloseTo(
      0.75 * Math.PI,
    );
  });
  it.each([
    [0, "a"],
    [0.249, "a"],
    [0.25, "b"],
    [0.999, "b"],
  ] as const)("never selects excluded items for %s", (value, id) => {
    expect(selectWinner(entries, () => value)?.id).toBe(id);
  });
  it("does not consume randomness when all items are excluded", () => {
    const random = vi.fn(() => 0);
    expect(selectWinner([entries[0]!], random)).toBeUndefined();
    expect(random).not.toHaveBeenCalled();
    expect(getSectors([entries[0]!])).toEqual([]);
  });
  it("draws the only eligible item", () => {
    expect(selectWinner(entries.slice(0, 2), () => 0)?.id).toBe("a");
    expect(selectWinner(entries.slice(0, 2), () => 0.999)?.id).toBe("a");
  });
});

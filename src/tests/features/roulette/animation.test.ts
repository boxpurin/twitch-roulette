import { describe, expect, it } from "vitest";
import { createSpinAnimation } from "../../../features/roulette/animation";

function fixture(initialAngle = 0) {
  let nextId = 0;
  const frames = new Map<number, FrameRequestCallback>();
  const draws: { angle: number; spinning: boolean }[] = [];
  let completions = 0;
  const animation = createSpinAnimation(
    (angle, spinning) => draws.push({ angle, spinning }),
    {
      request: (callback) => {
        frames.set(++nextId, callback);
        return nextId;
      },
      cancel: (id) => {
        frames.delete(id);
      },
    },
    initialAngle,
  );
  function tick(time: number) {
    const callbacks = [...frames.values()];
    frames.clear();
    callbacks.forEach((callback) => callback(time));
  }
  return {
    animation,
    frames,
    draws,
    tick,
    start: (index = 0, count = 2) =>
      animation.spin(index, count, () => {
        completions++;
      }),
    completions: () => completions,
  };
}

describe("spin animation lifecycle", () => {
  it("does not request frames while idle or for an empty wheel", () => {
    const f = fixture();
    expect(f.frames.size).toBe(0);
    expect(f.start(0, 0)).toBe(false);
    expect(f.frames.size).toBe(0);
    expect(f.completions()).toBe(0);
  });

  it("rejects another spin until the result is drawn, then allows another", () => {
    const f = fixture();
    expect(f.start()).toBe(true);
    expect(f.start(1)).toBe(false);
    expect(f.frames.size).toBe(1);
    f.tick(100);
    f.tick(2100);
    const midway = f.draws.at(-1)?.angle ?? 0;
    expect(midway).toBeGreaterThan(0);
    expect(f.completions()).toBe(0);
    expect(f.draws.at(-1)?.spinning).toBe(true);
    f.tick(4100);
    expect(f.draws.at(-1)?.angle).toBeCloseTo(11.5 * Math.PI);
    expect(f.draws.at(-1)?.spinning).toBe(false);
    expect(f.completions()).toBe(1);
    expect(f.frames.size).toBe(0);
    expect(f.start(1)).toBe(true);
    f.tick(5000);
    f.tick(9000);
    expect(f.draws.at(-1)?.angle).toBeCloseTo(22.5 * Math.PI);
    expect(f.completions()).toBe(2);
    expect(f.frames.size).toBe(0);
  });

  it("completes a one-item spin even when frames are delayed", () => {
    const f = fixture();
    f.start(0, 1);
    f.tick(0);
    f.tick(60000);
    expect(f.draws.at(-1)?.angle).toBeCloseTo(11 * Math.PI);
    expect(f.completions()).toBe(1);
    expect(f.frames.size).toBe(0);
  });

  it("cancels frames on disposal and ignores an already delivered callback", () => {
    const f = fixture();
    f.start();
    const callback = [...f.frames.values()][0];
    f.animation.dispose();
    expect(f.frames.size).toBe(0);
    callback?.(4000);
    expect(f.draws).toEqual([]);
    expect(f.completions()).toBe(0);
    expect(f.start()).toBe(false);
  });
});

describe("restored wheel orientation", () => {
  it("starts a subsequent spin from the visible restored result angle", () => {
    const f = fixture(1.75 * Math.PI);
    f.start();
    f.tick(0);
    expect(f.draws.at(-1)?.angle).toBeCloseTo(1.75 * Math.PI);
    f.tick(4000);
    expect(f.frames.size).toBe(0);
  });
});

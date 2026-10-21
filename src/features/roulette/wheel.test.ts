import { afterEach, describe, expect, it, vi } from "vitest";
import { createWheel } from "./wheel";

function fixture() {
  const labels: string[] = [];
  const angles: number[] = [];
  const frames = new Map<number, FrameRequestCallback>();
  let nextFrame = 0;
  const context = {
    beginPath() {},
    moveTo() {},
    lineTo() {},
    arc() {},
    closePath() {},
    fill() {},
    stroke() {},
    save() {},
    restore() {},
    translate() {},
    rotate(angle: number) {
      angles.push(angle);
    },
    clearRect() {},
    drawImage() {},
    fillText(label: string) {
      labels.push(label);
    },
    measureText() {
      return { width: 20 };
    },
  };
  // Only browser drawing and scheduling are replaced; exercise the real wheel
  // and animation together, without introducing a DOM/canvas dependency.
  const canvasDocument = {
    createElement: () => ({
      width: 0,
      height: 0,
      ownerDocument: canvasDocument,
      getContext: () => context,
    }),
  };
  vi.stubGlobal("document", canvasDocument);
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    frames.set(++nextFrame, callback);
    return nextFrame;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => {
    frames.delete(id);
  });
  return {
    canvas: document.createElement("canvas"),
    labels,
    angles,
    frames,
    tick(time: number) {
      const pending = [...frames.values()];
      frames.clear();
      pending.forEach((callback) => callback(time));
    },
  };
}

const items = [
  { id: "excluded", name: "除外した名前", excluded: true, weight: 100 },
  { id: "a", name: "A", weight: 1 },
  { id: "b", name: "B", weight: 3 },
];

afterEach(() => vi.unstubAllGlobals());

describe("wheel exclusion and animation lifecycle", () => {
  it("draws only eligible names and stops at their weighted winner index", () => {
    const f = fixture();
    const wheel = createWheel(f.canvas, items);
    expect(wheel).toBeDefined();
    expect(f.labels).toContain("A");
    expect(f.labels).toContain("B");
    expect(f.labels).not.toContain("除外した名前");
    expect(f.frames.size).toBe(0);
    const complete = vi.fn();
    expect(wheel?.spin(1, complete)).toBe(true);
    f.tick(0);
    f.tick(4000);
    expect(f.angles.at(-1)! % (2 * Math.PI)).toBeCloseTo(0.75 * Math.PI);
    expect(complete).toHaveBeenCalledOnce();
    expect(f.frames.size).toBe(0);
    wheel?.dispose();
  });
  it("restores the eligible winner orientation and cancels a running wheel on disposal", () => {
    const f = fixture();
    const wheel = createWheel(f.canvas, items, "b");
    expect(f.angles.at(-1)).toBeCloseTo(0.75 * Math.PI);
    const complete = vi.fn();
    wheel?.spin(0, complete);
    const pending = [...f.frames.values()][0];
    wheel?.dispose();
    expect(f.frames.size).toBe(0);
    const draws = f.angles.length;
    pending?.(4000);
    expect(f.angles).toHaveLength(draws);
    expect(complete).not.toHaveBeenCalled();
  });
  it("does not schedule frames when all items are excluded", () => {
    const f = fixture();
    const wheel = createWheel(f.canvas, items.slice(0, 1));
    expect(wheel?.spin(0, () => {})).toBe(false);
    expect(f.labels).not.toContain("除外した名前");
    expect(f.frames.size).toBe(0);
    wheel?.dispose();
  });
});

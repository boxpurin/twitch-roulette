import { getStopAngle } from "./spin";
import type { RouletteItem } from "./items";

interface FrameScheduler {
  request(callback: FrameRequestCallback): number;
  cancel(id: number): void;
}

export function createSpinAnimation(
  draw: (angle: number, spinning: boolean) => void,
  scheduler: FrameScheduler = {
    request: (callback) => requestAnimationFrame(callback),
    cancel: (id) => cancelAnimationFrame(id),
  },
  initialAngle = 0,
) {
  let angle = initialAngle;
  let frame: number | undefined;
  let spinning = false;
  let disposed = false;

  return {
    spin(
      index: number,
      source: number | readonly RouletteItem[],
      onComplete: () => void,
    ): boolean {
      const count = typeof source === "number" ? source : source.length;
      if (disposed || spinning || count === 0 || index < 0 || index >= count)
        return false;
      spinning = true;
      const from = angle;
      const to = getStopAngle(index, source, from);
      let start: number | undefined;
      function tick(time: number) {
        if (disposed) return;
        start ??= time;
        const progress = Math.min(1, Math.max(0, (time - start) / 4000));
        angle =
          progress === 1 ? to : from + (to - from) * (1 - (1 - progress) ** 3);
        draw(angle, progress < 1);
        if (progress < 1) {
          frame = scheduler.request(tick);
        } else {
          frame = undefined;
          spinning = false;
          onComplete();
        }
      }
      frame = scheduler.request(tick);
      return true;
    },
    dispose() {
      disposed = true;
      spinning = false;
      if (frame !== undefined) scheduler.cancel(frame);
      frame = undefined;
    },
  };
}

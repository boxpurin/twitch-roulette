import type { RouletteItem } from "./items";
import { getEligibleItems } from "./items";
import { createSpinAnimation } from "./animation";
import { getSectors, getStopAngle } from "./spin";

export const WHEEL_SIZE = 640;
const COLORS = ["#9146ff", "#c4a1ff", "#6d28d9", "#ddd0ff"];

function drawDisk(
  context: CanvasRenderingContext2D,
  items: readonly RouletteItem[],
) {
  const center = WHEEL_SIZE / 2;
  const count = items.length || 8;
  const sectors = getSectors(items);

  for (let index = 0; index < count; index++) {
    const sector = sectors[index];
    const start =
      -Math.PI / 2 +
      (sector ? sector.start * Math.PI * 2 : (index * Math.PI * 2) / count);
    const slice = sector
      ? sector.probability * Math.PI * 2
      : (Math.PI * 2) / count;
    context.beginPath();
    context.moveTo(center, center);
    context.arc(center, center, 280, start, start + slice);
    context.closePath();
    context.fillStyle = COLORS[index % COLORS.length] ?? "#9146ff";
    context.fill();
    context.strokeStyle = "#ffffff";
    context.lineWidth = 2;
    context.stroke();

    const item = items[index];
    if (item && slice >= 0.04) {
      context.save();
      context.translate(center, center);
      context.rotate(start + slice / 2);
      context.font = "bold 18px system-ui, sans-serif";
      context.textAlign = "right";
      context.textBaseline = "middle";
      const fullName = Array.from(item.name);
      const characters = fullName.slice(0, 20);
      let label =
        characters.join("") + (characters.length < fullName.length ? "…" : "");
      while (context.measureText(label).width > 172 && characters.length > 0) {
        characters.pop();
        label = characters.join("") + "…";
      }
      context.fillStyle = index % 2 === 0 ? "#ffffff" : "#2e1065";
      context.fillText(label, 258, 0);
      context.restore();
    }
  }
}

export function createWheel(
  canvas: HTMLCanvasElement,
  items: readonly RouletteItem[],
  winnerId?: string,
) {
  items = getEligibleItems(items);
  const context = canvas.getContext("2d");
  const disk = canvas.ownerDocument.createElement("canvas");
  disk.width = WHEEL_SIZE;
  disk.height = WHEEL_SIZE;
  const diskContext = disk.getContext("2d");
  if (!context || !diskContext) return undefined;
  drawDisk(diskContext, items);

  function draw(angle: number, spinning: boolean) {
    if (!context) return;
    const center = WHEEL_SIZE / 2;
    context.clearRect(0, 0, WHEEL_SIZE, WHEEL_SIZE);
    context.save();
    context.translate(center, center);
    context.rotate(angle);
    context.drawImage(disk, -center, -center);
    context.restore();
    drawOverlay(context, spinning ? "回転中" : "待機中");
  }

  const winnerIndex = items.findIndex((item) => item.id === winnerId);
  const initialAngle =
    winnerIndex < 0 ? 0 : getStopAngle(winnerIndex, items, 0) % (2 * Math.PI);
  draw(initialAngle, false);
  const animation = createSpinAnimation(draw, undefined, initialAngle);
  return {
    spin: (index: number, onComplete: () => void) =>
      animation.spin(index, items, onComplete),
    dispose: () => animation.dispose(),
  };
}

function drawOverlay(context: CanvasRenderingContext2D, label: string) {
  const center = WHEEL_SIZE / 2;
  context.beginPath();
  context.arc(center, center, 64, 0, Math.PI * 2);
  context.fillStyle = "#ffffff";
  context.fill();
  context.fillStyle = "#6d28d9";
  context.font = "bold 20px system-ui, sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(label, center, center);

  context.beginPath();
  context.moveTo(center - 20, 18);
  context.lineTo(center + 20, 18);
  context.lineTo(center, 66);
  context.closePath();
  context.fillStyle = "#f59e0b";
  context.fill();
}

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import RouletteItems from "./RouletteItems";
import { createRouletteController } from "./controller";
import ReceptionControls from "./ReceptionControls";
import { createRewardList } from "../twitch-rewards/list";
import type { AuthSession } from "../twitch-auth/session";
import { createWheel, WHEEL_SIZE } from "./wheel";

export default function Roulette({
  userId,
  session,
}: {
  userId: string;
  session: AuthSession;
}) {
  const [controller] = useState(() =>
    createRouletteController({
      userId,
      storage: () => window.localStorage,
      subscribe: session.subscribeRedemptions,
    }),
  );
  const state = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );
  const [rewardList] = useState(() => createRewardList(session.listRewards));
  const rewards = useSyncExternalStore(
    rewardList.subscribe,
    rewardList.getSnapshot,
    rewardList.getSnapshot,
  );
  useEffect(() => {
    void rewardList.reload();
    return rewardList.cancel;
  }, [rewardList]);
  const { items, spinning, winner } = state;
  useEffect(() => () => controller.stop(), [controller]);
  const [error, setError] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wheelRef = useRef<ReturnType<typeof createWheel>>(undefined);

  useEffect(() => {
    if (!canvasRef.current) return;
    const wheel = createWheel(canvasRef.current, items, winner?.id);
    wheelRef.current = wheel;
    setError(!wheel);
    return () => {
      wheel?.dispose();
      wheelRef.current = undefined;
    };
  }, [items, winner]);

  function spin() {
    const wheel = wheelRef.current;
    if (spinning || !wheel) return;
    const selected = controller.beginSpin();
    if (!selected) return;
    const started = wheel.spin(
      items.findIndex((item) => item.id === selected.id),
      () => controller.finishSpin(selected),
    );
    if (!started) controller.finishSpin(null);
  }

  const status = spinning
    ? "ルーレットを回しています…"
    : winner
      ? `当選: ${winner.name}`
      : items.length === 0
        ? "参加者を待っています"
        : `${items.length} 件の項目を登録しています`;

  return (
    <section className="roulette-card" aria-labelledby="roulette-heading">
      <h2 id="roulette-heading">ルーレット</h2>
      <canvas
        ref={canvasRef}
        className="roulette-canvas"
        width={WHEEL_SIZE}
        height={WHEEL_SIZE}
        role="img"
        aria-label={
          items.length === 0
            ? "参加者未登録のルーレット（待機中）"
            : `${items.length} 件の項目が登録されたルーレット（${spinning ? "回転中" : "待機中"}）。項目名は下の一覧で確認できます。`
        }
      >
        ルーレットの表示には Canvas 2D 対応のブラウザが必要です。
      </canvas>
      <button
        className="spin-button"
        type="button"
        onClick={spin}
        disabled={items.length === 0 || spinning || error}
      >
        {spinning ? "回転中…" : "ルーレットを回す"}
      </button>
      <p role="status" aria-atomic="true" className="roulette-status">
        {status}
      </p>
      {error ? (
        <p role="alert" className="auth-error">
          Canvas 2D を初期化できません。対応ブラウザで再読み込みしてください。
        </p>
      ) : null}
      <ReceptionControls
        controller={controller}
        rewards={rewards}
        reload={() => {
          void rewardList.reload();
        }}
      />
      <RouletteItems
        key={state.rewardId}
        items={items}
        dispatch={controller.edit}
        disabled={spinning}
      />
    </section>
  );
}

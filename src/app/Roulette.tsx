import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@/shared/components/ui/card";
import { Button } from "@/shared/components/ui/button";
import WinnerHistoryModal from "./WinnerHistoryModal";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import RouletteItems from "../features/participants/RouletteItems";
import { createRouletteController } from "./controller";
import ReceptionControls from "./ReceptionControls";
import { createRewardList } from "../features/twitch-rewards/list";
import type { AuthSession } from "../features/twitch-auth/session";
import { createWheel, WHEEL_SIZE } from "../features/roulette/wheel";
import { getEligibleItems } from "../features/participants/items";

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
  const eligibleItems = useMemo(() => getEligibleItems(items), [items]);
  useEffect(() => {
    const clearHistory = () => controller.clearWinnerHistory();
    window.addEventListener("pagehide", clearHistory);
    window.addEventListener("popstate", clearHistory);
    return () => {
      window.removeEventListener("pagehide", clearHistory);
      window.removeEventListener("popstate", clearHistory);
      controller.stop();
    };
  }, [controller]);
  const [error, setError] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wheelRef = useRef<ReturnType<typeof createWheel>>(undefined);

  useEffect(() => {
    if (!canvasRef.current) return;
    const wheel = createWheel(canvasRef.current, eligibleItems, winner?.id);
    wheelRef.current = wheel;
    setError(!wheel);
    return () => {
      wheel?.dispose();
      wheelRef.current = undefined;
    };
  }, [eligibleItems, winner]);

  function spin() {
    const wheel = wheelRef.current;
    if (spinning || !wheel) return;
    const selected = controller.beginSpin();
    if (!selected) return;
    const started = wheel.spin(
      eligibleItems.findIndex((item) => item.id === selected.id),
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
        : eligibleItems.length === 0
          ? "抽選対象の項目がありません。除外のチェックを外してください。"
          : `抽選対象 ${eligibleItems.length} 件 / 全 ${items.length} 件`;

  return (
    <Card asChild className="mt-7 p-6 text-center max-[480px]:px-4">
      <section aria-labelledby="roulette-heading">
        <CardHeader className="mb-0">
          <CardTitle id="roulette-heading" className="mb-2">
            ルーレット
          </CardTitle>
        </CardHeader>
        <CardContent>
          <canvas
            ref={canvasRef}
            className="mx-auto my-4 block h-auto w-full max-w-[480px]"
            width={WHEEL_SIZE}
            height={WHEEL_SIZE}
            role="img"
            aria-label={
              items.length === 0
                ? "参加者未登録のルーレット（待機中）"
                : `抽選対象 ${eligibleItems.length} 件のルーレット（${spinning ? "回転中" : "待機中"}）。項目名は下の一覧で確認できます。`
            }
          >
            ルーレットの表示には Canvas 2D 対応のブラウザが必要です。
          </canvas>
          <Button
            size="lg"
            type="button"
            onClick={spin}
            disabled={eligibleItems.length === 0 || spinning || error}
          >
            {spinning ? "回転中…" : "ルーレットを回す"}
          </Button>
          <p
            role="status"
            aria-atomic="true"
            className="mt-4 font-semibold whitespace-pre-wrap text-foreground"
          >
            {status}
          </p>
          {error ? (
            <p role="alert" className="text-destructive">
              Canvas 2D
              を初期化できません。対応ブラウザで再読み込みしてください。
            </p>
          ) : null}
          <WinnerHistoryModal entries={state.winnerHistory.entries} />
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
            lookupUser={session.lookupUser}
            disabled={spinning}
          />
        </CardContent>
      </section>
    </Card>
  );
}

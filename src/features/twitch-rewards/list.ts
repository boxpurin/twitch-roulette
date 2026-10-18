import type { Reward } from "./rewards";

export type RewardListState =
  | { status: "loading" | "ready"; rewards: Reward[] }
  | { status: "error"; rewards: Reward[]; message: string };

export function createRewardList(
  load: (signal: AbortSignal) => Promise<Reward[]>,
) {
  let state: RewardListState = { status: "loading", rewards: [] };
  let generation = 0;
  let request: AbortController | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const listeners = new Set<() => void>();
  function publish(next: RewardListState) {
    state = next;
    listeners.forEach((listener) => listener());
  }
  function cancel() {
    generation++;
    clearTimeout(timer);
    timer = undefined;
    request?.abort();
    request = undefined;
  }
  return {
    getSnapshot: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    cancel,
    async reload() {
      cancel();
      const id = generation;
      const controller = new AbortController();
      request = controller;
      publish({ status: "loading", rewards: [] });
      timer = setTimeout(() => {
        if (generation !== id) return;
        cancel();
        publish({
          status: "error",
          rewards: [],
          message:
            "報酬一覧の取得がタイムアウトしました。もう一度取得してください。",
        });
      }, 15000);
      try {
        const rewards = await load(controller.signal);
        if (generation === id) publish({ status: "ready", rewards });
      } catch (error) {
        if (generation === id)
          publish({
            status: "error",
            rewards: [],
            message:
              error instanceof Error
                ? error.message
                : "報酬一覧を取得できません。もう一度取得してください。",
          });
      } finally {
        if (generation === id) {
          clearTimeout(timer);
          timer = undefined;
          request = undefined;
        }
      }
    },
  };
}

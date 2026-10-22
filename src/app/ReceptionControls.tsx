import { useState, useSyncExternalStore } from "react";
import type { RouletteController } from "./controller";
import type { RewardListState } from "../features/twitch-rewards/list";

export default function ReceptionControls({
  controller,
  rewards,
  reload,
}: {
  controller: RouletteController;
  rewards: RewardListState;
  reload: () => void;
}) {
  const state = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );
  const [draft, setDraft] = useState(state.rewardId);
  const [confirmReset, setConfirmReset] = useState(false);
  const selected = rewards.rewards.find(
    (reward) => reward.id === state.rewardId,
  );
  const drafted = rewards.rewards.find((reward) => reward.id === draft);
  const missingLabel =
    rewards.status === "ready"
      ? "以前選択した報酬（現在の一覧にありません）"
      : "以前選択した報酬（一覧取得後に確認します）";
  const selectedName =
    selected?.title ??
    (state.rewardId ? missingLabel : "報酬未選択（手動項目）");
  return (
    <section className="reception-controls" aria-labelledby="reception-heading">
      <h2 id="reception-heading">チャンネルポイント連携</h2>
      <form
        className="item-add"
        onSubmit={(event) => {
          event.preventDefault();
          if (rewards.status !== "ready" || (draft && !drafted)) return;
          if (controller.selectReward(draft)) setConfirmReset(false);
        }}
      >
        <fieldset
          disabled={state.spinning || state.accepting}
          className="reward-fields"
        >
          <label className="item-field">
            <span>対象報酬</span>
            <select
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              disabled={rewards.status !== "ready"}
            >
              <option value="">報酬未選択（手動項目）</option>
              {draft && !drafted ? (
                <option value={draft} disabled>
                  {missingLabel}
                </option>
              ) : null}
              {rewards.rewards.map((reward) => (
                <option key={reward.id} value={reward.id}>
                  {reward.title}（{reward.cost} ポイント）
                </option>
              ))}
            </select>
          </label>
          <button
            type="submit"
            disabled={rewards.status !== "ready" || (!!draft && !drafted)}
          >
            報酬を選択
          </button>
        </fieldset>
      </form>
      {rewards.status === "loading" ? (
        <p role="status">報酬一覧を取得しています…</p>
      ) : null}
      {rewards.status === "error" ? (
        <p role="alert" className="auth-error">
          {rewards.message}
        </p>
      ) : null}
      {rewards.status === "ready" && rewards.rewards.length === 0 ? (
        <p role="status">
          カスタム報酬がありません。Twitch で作成してから再取得してください。
        </p>
      ) : null}
      {rewards.status === "ready" && state.rewardId && !selected ? (
        <p className="caption">
          以前の報酬は一覧に見つかりません。履歴を保持しています。別の報酬を選択してください。
        </p>
      ) : null}
      <button
        type="button"
        className="secondary"
        disabled={
          rewards.status === "loading" || state.spinning || state.accepting
        }
        onClick={reload}
      >
        報酬一覧を再取得
      </button>
      <p className="caption">
        現在の保存先: {selectedName}。報酬を変更するには受付を停止してください。
      </p>
      <button
        type="button"
        onClick={() =>
          state.accepting ? controller.stop() : controller.start()
        }
        disabled={!state.accepting && (rewards.status !== "ready" || !selected)}
      >
        {state.accepting ? "受付を停止" : "受付を開始"}
      </button>
      <p
        role="status"
        className={state.reception.phase === "error" ? "auth-error" : undefined}
      >
        {state.reception.message}
      </p>
      {state.pending > 0 ? (
        <p role="status">
          回転中の交換 {state.pending}{" "}
          件を保存しました。回転終了後に反映します。
        </p>
      ) : null}
      <p className="caption">
        受付停止中・切断中の交換は自動で遡って反映されません。
      </p>
      <p className="caption">
        履歴は配信者・報酬ごとに、このブラウザの localStorage
        に保存します。再読み込み・ログアウト後も残ります。サイトデータの削除で失われます。複数タブでは同時に操作せず、一画面で利用してください。
      </p>
      {state.storageError ? (
        <p role="alert" className="auth-error">
          {state.storageError}
        </p>
      ) : null}
      {confirmReset ? (
        <div
          className="reset-confirmation"
          role="group"
          aria-label="履歴リセットの確認"
        >
          <p>
            現在の配信者の「{selectedName}
            」の項目・交換回数・倍率・当選結果・当選者履歴・累計当選回数を削除し、受付を停止します。元には戻せません。
          </p>
          <div className="item-actions">
            <button
              type="button"
              disabled={state.spinning}
              onClick={() => {
                controller.reset();
                setConfirmReset(false);
              }}
            >
              削除してリセット
            </button>
            <button
              type="button"
              className="secondary"
              onClick={() => setConfirmReset(false)}
            >
              キャンセル
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          className="secondary"
          disabled={state.spinning}
          onClick={() => setConfirmReset(true)}
        >
          履歴をリセット
        </button>
      )}
    </section>
  );
}

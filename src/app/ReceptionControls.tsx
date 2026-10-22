import { Separator } from "@/shared/components/ui/separator";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/shared/components/ui/native-select";
import { Field, FieldGroup, FieldLabel } from "@/shared/components/ui/field";
import { Button } from "@/shared/components/ui/button";
import { useId, useState, useSyncExternalStore } from "react";
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
  const fieldId = useId();
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
    <section className="mt-6 text-left" aria-labelledby="reception-heading">
      <Separator className="mb-5" />
      <h2 id="reception-heading">チャンネルポイント連携</h2>
      <form
        className="my-5 flex items-end gap-3 max-[480px]:flex-col max-[480px]:items-stretch"
        onSubmit={(event) => {
          event.preventDefault();
          if (rewards.status !== "ready" || (draft && !drafted)) return;
          if (controller.selectReward(draft)) setConfirmReset(false);
        }}
      >
        <fieldset
          disabled={state.spinning || state.accepting}
          className="m-0 w-full min-w-0 border-0 p-0"
        >
          <FieldGroup className="@container-normal flex-row items-end gap-3 max-[480px]:flex-col max-[480px]:items-stretch">
            <Field className="min-w-0 flex-1 gap-2">
              <FieldLabel htmlFor={`reward-${fieldId}`}>対象報酬</FieldLabel>
              <NativeSelect
                id={`reward-${fieldId}`}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                disabled={rewards.status !== "ready"}
              >
                <NativeSelectOption value="">
                  報酬未選択（手動項目）
                </NativeSelectOption>
                {draft && !drafted ? (
                  <NativeSelectOption value={draft} disabled>
                    {missingLabel}
                  </NativeSelectOption>
                ) : null}
                {rewards.rewards.map((reward) => (
                  <NativeSelectOption key={reward.id} value={reward.id}>
                    {reward.title}（{reward.cost} ポイント）
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </Field>
            <Button
              variant="outline"
              type="submit"
              disabled={rewards.status !== "ready" || (!!draft && !drafted)}
            >
              報酬を選択
            </Button>
          </FieldGroup>
        </fieldset>
      </form>
      {rewards.status === "loading" ? (
        <p role="status">報酬一覧を取得しています…</p>
      ) : null}
      {rewards.status === "error" ? (
        <p role="alert" className="text-destructive">
          {rewards.message}
        </p>
      ) : null}
      {rewards.status === "ready" && rewards.rewards.length === 0 ? (
        <p role="status">
          カスタム報酬がありません。Twitch で作成してから再取得してください。
        </p>
      ) : null}
      {rewards.status === "ready" && state.rewardId && !selected ? (
        <p className="text-sm">
          以前の報酬は一覧に見つかりません。履歴を保持しています。別の報酬を選択してください。
        </p>
      ) : null}
      <Button
        variant="outline"
        type="button"
        disabled={
          rewards.status === "loading" || state.spinning || state.accepting
        }
        onClick={reload}
      >
        報酬一覧を再取得
      </Button>
      <p className="text-sm">
        現在の保存先: {selectedName}。報酬を変更するには受付を停止してください。
      </p>
      <Button
        variant="outline"
        type="button"
        onClick={() =>
          state.accepting ? controller.stop() : controller.start()
        }
        disabled={!state.accepting && (rewards.status !== "ready" || !selected)}
      >
        {state.accepting ? "受付を停止" : "受付を開始"}
      </Button>
      <p
        role="status"
        className={
          state.reception.phase === "error" ? "text-destructive" : undefined
        }
      >
        {state.reception.message}
      </p>
      {state.pending > 0 ? (
        <p role="status">
          回転中の交換 {state.pending}{" "}
          件を保存しました。回転終了後に反映します。
        </p>
      ) : null}
      <p className="text-sm">
        受付停止中・切断中の交換は自動で遡って反映されません。
      </p>
      <p className="text-sm">
        項目・交換の履歴は配信者・報酬ごとに、このブラウザの localStorage
        に保存します。再読み込み・ログアウト後も残ります。サイトデータの削除で失われます。複数タブでは同時に操作せず、一画面で利用してください。
      </p>
      {state.storageError ? (
        <p role="alert" className="text-destructive">
          {state.storageError}
        </p>
      ) : null}
      {confirmReset ? (
        <div
          className="mt-4 rounded-md border p-4"
          role="group"
          aria-label="履歴リセットの確認"
        >
          <p>
            現在の配信者の「{selectedName}
            」の項目・交換回数・倍率・当選結果を削除し、受付を停止します。当選者履歴と累計当選回数は残ります。元には戻せません。
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              type="button"
              disabled={state.spinning}
              onClick={() => {
                controller.reset();
                setConfirmReset(false);
              }}
            >
              削除してリセット
            </Button>
            <Button
              variant="outline"
              type="button"
              onClick={() => setConfirmReset(false)}
            >
              キャンセル
            </Button>
          </div>
        </div>
      ) : (
        <Button
          variant="outline"
          type="button"
          disabled={state.spinning}
          onClick={() => setConfirmReset(true)}
        >
          履歴をリセット
        </Button>
      )}
    </section>
  );
}

import { useState } from "react";
import { isPositiveInteger } from "../../shared/validation";
import { getSectors } from "../roulette/spin";
import type { Dispatch } from "react";
import type { ItemsAction, RouletteItem } from "./items";
import type { AuthSession } from "../twitch-auth/session";
import ManualItemForm from "./ManualItemForm";

interface ItemsProps {
  items: readonly RouletteItem[];
  dispatch: Dispatch<ItemsAction>;
  disabled?: boolean;
  lookupUser?: AuthSession["lookupUser"];
}

function ItemRow({
  item,
  index,
  dispatch,
  probability,
}: {
  item: RouletteItem;
  index: number;
  probability: number;
  dispatch: Dispatch<ItemsAction>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(item.name);
  const [weight, setWeight] = useState(String(item.weight ?? 1));
  const validWeight = isPositiveInteger(Number(weight));
  const percentage = probability * 100;
  const chance =
    percentage > 0 && percentage < 0.01
      ? "0.01% 未満"
      : `${Number(percentage.toFixed(2))}%`;

  return (
    <li className="roulette-item">
      <label className="item-exclusion">
        <input
          type="checkbox"
          checked={item.excluded === true}
          aria-label={`項目 ${index + 1}（${item.name}）を抽選から除外`}
          onChange={(event) =>
            dispatch({
              type: "exclude",
              id: item.id,
              excluded: event.target.checked,
            })
          }
        />
        抽選から除外
      </label>
      {editing ? (
        <form
          className="item-edit"
          onSubmit={(event) => {
            event.preventDefault();
            if (!draft.trim() || !validWeight) return;
            dispatch({ type: "rename", id: item.id, name: draft });
            dispatch({ type: "weight", id: item.id, weight: Number(weight) });
            setEditing(false);
          }}
        >
          <label className="item-field">
            <span>項目 {index + 1} の名前</span>
            <input
              autoFocus
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              required
            />
          </label>
          <label className="item-field">
            <span>項目 {index + 1} の倍率</span>
            <input
              type="number"
              min="1"
              max={Number.MAX_SAFE_INTEGER}
              step="1"
              value={weight}
              onChange={(event) => setWeight(event.target.value)}
              required
            />
          </label>
          <div className="item-actions">
            <button type="submit" disabled={!draft.trim() || !validWeight}>
              保存
            </button>
            <button
              type="button"
              className="secondary"
              onClick={() => setEditing(false)}
            >
              キャンセル
            </button>
          </div>
        </form>
      ) : (
        <>
          <div className="item-name">
            {item.name}
            <p className="caption">
              倍率 {item.weight ?? 1} 倍 · 当選確率 {chance}
              {item.redemptions !== undefined
                ? ` · 交換 ${item.redemptions} 回`
                : " · 手動項目"}
              {item.excluded ? " · 抽選対象外" : null}
              {item.userId ? ` · Twitch ID: ${item.userId}` : null}
            </p>
          </div>
          <div className="item-actions">
            <button
              type="button"
              className="secondary"
              aria-label={`項目 ${index + 1} を編集`}
              onClick={() => {
                setDraft(item.name);
                setWeight(String(item.weight ?? 1));
                setEditing(true);
              }}
            >
              編集
            </button>
            <button
              type="button"
              className="secondary"
              aria-label={`項目 ${index + 1} を削除`}
              onClick={() => {
                dispatch({ type: "remove", id: item.id });
              }}
            >
              削除
            </button>
          </div>
        </>
      )}
    </li>
  );
}

export default function RouletteItems({
  items,
  dispatch,
  disabled = false,
  lookupUser,
}: ItemsProps) {
  const sectors = getSectors(items);
  const probabilities = new Map(
    sectors.map(({ item, probability }) => [item.id, probability]),
  );

  return (
    <section className="roulette-items" aria-labelledby="items-heading">
      <div className="items-heading">
        <h2 id="items-heading">ルーレットの項目</h2>
        <span>
          抽選対象 {sectors.length} 件 / 全 {items.length} 件
        </span>
      </div>
      <fieldset disabled={disabled}>
        <ManualItemForm
          items={items}
          dispatch={dispatch}
          lookupUser={lookupUser}
          disabled={disabled}
        />
        {items.length === 0 ? (
          <p className="items-empty">
            まだ項目がありません。上のフォームから追加してください。
          </p>
        ) : (
          <ol className="item-list">
            {items.map((item, index) => (
              <ItemRow
                key={item.id}
                item={item}
                index={index}
                dispatch={dispatch}
                probability={probabilities.get(item.id) ?? 0}
              />
            ))}
          </ol>
        )}
      </fieldset>
      {disabled ? (
        <p className="caption">回転中は項目を変更できません。</p>
      ) : null}
      <p className="caption">
        Twitch と紐づけた手動追加は 1 倍、登録済みなら現在の倍率へ 1
        を加えます。手動追加は交換回数に含めません。未登録のユーザーの初回交換は
        1 倍、登録済みなら交換ごとに現在の倍率へ 1
        を加えます。手動変更後も同じルールです。全員 1
        倍なら抽選対象内の当選確率は均等です。除外した項目はチェックを外すと抽選対象に戻ります。
      </p>
    </section>
  );
}

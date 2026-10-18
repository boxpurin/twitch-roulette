import { useState } from "react";
import { isPositiveInteger } from "../../shared/validation";
import { getSectors } from "./spin";
import type { Dispatch } from "react";
import type { ItemsAction, RouletteItem } from "./items";

interface ItemsProps {
  items: readonly RouletteItem[];
  dispatch: Dispatch<ItemsAction>;
  disabled?: boolean;
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
}: ItemsProps) {
  const [name, setName] = useState("");
  const sectors = getSectors(items);

  return (
    <section className="roulette-items" aria-labelledby="items-heading">
      <div className="items-heading">
        <h2 id="items-heading">ルーレットの項目</h2>
        <span>{items.length} 件</span>
      </div>
      <fieldset disabled={disabled}>
        <form
          className="item-add"
          onSubmit={(event) => {
            event.preventDefault();
            if (!name.trim()) return;
            dispatch({ type: "add", id: crypto.randomUUID(), name });
            setName("");
          }}
        >
          <label className="item-field">
            <span>項目名</span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="追加する項目の名前"
              required
            />
          </label>
          <button type="submit" disabled={!name.trim()}>
            項目を追加
          </button>
        </form>
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
                probability={sectors[index]?.probability ?? 0}
              />
            ))}
          </ol>
        )}
      </fieldset>
      {disabled ? (
        <p className="caption">回転中は項目を変更できません。</p>
      ) : null}
      <p className="caption">
        初回交換は 1 倍、再交換ごとに現在の倍率へ 1
        を加えます。手動変更後も同じルールです。全員 1
        倍なら当選確率は均等です。
      </p>
    </section>
  );
}

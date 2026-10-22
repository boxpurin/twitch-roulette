import { Separator } from "@/shared/components/ui/separator";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/shared/components/ui/table";
import { Empty } from "@/shared/components/ui/empty";
import { Input } from "@/shared/components/ui/input";
import { Field, FieldGroup, FieldLabel } from "@/shared/components/ui/field";
import { Button } from "@/shared/components/ui/button";
import { useId, useState } from "react";
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
  const fieldId = useId();
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
    <>
      <TableRow className="roulette-item">
        <TableCell className="text-center">
          <input
            className="size-[18px] accent-primary focus-visible:outline-3 focus-visible:outline-ring focus-visible:outline-offset-3"
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
        </TableCell>
        <TableCell className="whitespace-pre-wrap text-foreground [overflow-wrap:anywhere]">
          {item.name}
          <p className="text-sm">
            {item.redemptions !== undefined
              ? `交換 ${item.redemptions} 回`
              : "手動項目"}
            {item.excluded ? " · 抽選対象外" : null}
            {item.userId ? ` · Twitch ID: ${item.userId}` : null}
          </p>
        </TableCell>
        <TableCell className="tabular-nums [overflow-wrap:anywhere]">
          {item.weight ?? 1} 倍
        </TableCell>
        <TableCell className="tabular-nums [overflow-wrap:anywhere]">
          {chance}
        </TableCell>
        <TableCell>
          <Button
            type="button"
            variant="outline"
            aria-label={`項目 ${index + 1} を編集`}
            aria-expanded={editing}
            onClick={() => {
              setDraft(item.name);
              setWeight(String(item.weight ?? 1));
              setEditing(true);
            }}
          >
            編集
          </Button>
        </TableCell>
        <TableCell>
          <Button
            type="button"
            variant="outline"
            aria-label={`項目 ${index + 1} を削除`}
            onClick={() => dispatch({ type: "remove", id: item.id })}
          >
            削除
          </Button>
        </TableCell>
      </TableRow>
      {editing ? (
        <TableRow className="item-edit-row">
          <TableCell colSpan={6}>
            <form
              className="item-edit flex flex-col gap-3"
              onSubmit={(event) => {
                event.preventDefault();
                if (!draft.trim() || !validWeight) return;
                dispatch({ type: "rename", id: item.id, name: draft });
                dispatch({
                  type: "weight",
                  id: item.id,
                  weight: Number(weight),
                });
                setEditing(false);
              }}
            >
              <FieldGroup className="gap-3">
                <Field className="min-w-0 flex-1 gap-2">
                  <FieldLabel htmlFor={`edit-${fieldId}-1`}>
                    項目 {index + 1} の名前
                  </FieldLabel>
                  <Input
                    id={`edit-${fieldId}-1`}
                    autoFocus
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    required
                  />
                </Field>
                <Field className="min-w-0 flex-1 gap-2">
                  <FieldLabel htmlFor={`edit-${fieldId}-2`}>
                    項目 {index + 1} の倍率
                  </FieldLabel>
                  <Input
                    id={`edit-${fieldId}-2`}
                    type="number"
                    min="1"
                    max={Number.MAX_SAFE_INTEGER}
                    step="1"
                    value={weight}
                    onChange={(event) => setWeight(event.target.value)}
                    required
                  />
                </Field>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="submit"
                    disabled={!draft.trim() || !validWeight}
                  >
                    保存
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setEditing(false)}
                  >
                    キャンセル
                  </Button>
                </div>
              </FieldGroup>
            </form>
          </TableCell>
        </TableRow>
      ) : null}
    </>
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
    <section className="mt-6 text-left" aria-labelledby="items-heading">
      <Separator className="mb-6" />
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="m-0" id="items-heading">
          ルーレットの項目
        </h2>
        <span>
          抽選対象 {sectors.length} 件 / 全 {items.length} 件
        </span>
      </div>
      <fieldset className="min-w-0" disabled={disabled}>
        <ManualItemForm
          items={items}
          dispatch={dispatch}
          lookupUser={lookupUser}
          disabled={disabled}
        />
        {items.length === 0 ? (
          <Empty>
            まだ項目がありません。上のフォームから追加してください。
          </Empty>
        ) : (
          <Table
            containerProps={{
              role: "region",
              "aria-labelledby": "items-heading",
              tabIndex: 0,
            }}
            className="min-w-[640px]"
            aria-labelledby="items-heading"
          >
            <TableHeader>
              <TableRow>
                <TableHead className="w-[112px]" scope="col">
                  抽選から除外
                </TableHead>
                <TableHead scope="col">名前</TableHead>
                <TableHead className="w-[96px]" scope="col">
                  倍率
                </TableHead>
                <TableHead className="w-[96px]" scope="col">
                  当選確率
                </TableHead>
                <TableHead className="w-[80px]" scope="col">
                  編集
                </TableHead>
                <TableHead className="w-[80px]" scope="col">
                  削除
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item, index) => (
                <ItemRow
                  key={item.id}
                  item={item}
                  index={index}
                  dispatch={dispatch}
                  probability={probabilities.get(item.id) ?? 0}
                />
              ))}
            </TableBody>
          </Table>
        )}
      </fieldset>
      {disabled ? (
        <p className="text-sm">回転中は項目を変更できません。</p>
      ) : null}
      <p className="text-sm">
        Twitch と紐づけた手動追加は 1 倍、登録済みなら現在の倍率へ 1
        を加えます。手動追加は交換回数に含めません。未登録のユーザーの初回交換は
        1 倍、登録済みなら交換ごとに現在の倍率へ 1
        を加えます。手動変更後も同じルールです。全員 1
        倍なら抽選対象内の当選確率は均等です。除外した項目はチェックを外すと抽選対象に戻ります。
      </p>
    </section>
  );
}

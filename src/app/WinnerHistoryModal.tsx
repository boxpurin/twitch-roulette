import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/shared/components/ui/table";
import { Empty } from "@/shared/components/ui/empty";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/shared/components/ui/native-select";
import { Field, FieldGroup, FieldLabel } from "@/shared/components/ui/field";
import { Button } from "@/shared/components/ui/button";
import { useId, useRef, useState } from "react";
import type { WinnerEntry } from "../features/roulette/winnerHistory";

function formatDate(timestamp: number): string {
  const date = new Date(timestamp);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${String(date.getFullYear()).padStart(4, "0")}/${pad(date.getMonth() + 1)}/${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export default function WinnerHistoryModal({
  entries,
}: {
  entries: readonly WinnerEntry[];
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const headingId = useId();
  const [order, setOrder] = useState<"asc" | "desc">("desc");
  const direction = order === "asc" ? 1 : -1;
  const sorted = entries
    .map((entry, index) => ({ entry, index }))
    .sort(
      (a, b) =>
        direction * (a.entry.spunAt - b.entry.spunAt || a.index - b.index),
    );

  return (
    <div className="mt-4">
      <Button
        variant="outline"
        type="button"
        aria-haspopup="dialog"
        onClick={() => dialogRef.current?.showModal()}
      >
        当選者履歴
      </Button>
      <dialog
        ref={dialogRef}
        className="m-auto box-border max-h-[90dvh] w-[min(680px,calc(100%_-_32px))] overflow-y-auto rounded-xl border bg-background p-6 text-left text-muted-foreground backdrop:bg-black/60 max-[480px]:p-4"
        aria-labelledby={headingId}
      >
        <div className="flex items-center justify-between gap-4">
          <h2 className="m-0" id={headingId}>
            当選者履歴
          </h2>
          <Button
            variant="outline"
            type="button"
            autoFocus
            onClick={() => dialogRef.current?.close()}
          >
            閉じる
          </Button>
        </div>
        <p className="text-sm">
          直近20件を表示します。当選回数はこの画面を開いてからの累計です。報酬の切り替えや項目リセットでは保持し、更新・画面移動でクリアします。日時はこのブラウザの現地時刻です。
        </p>
        <FieldGroup className="my-5">
          <Field orientation="horizontal">
            <FieldLabel htmlFor={`${headingId}-order`}>表示順</FieldLabel>
            <NativeSelect
              id={`${headingId}-order`}
              value={order}
              onChange={(event) =>
                setOrder(event.target.value === "asc" ? "asc" : "desc")
              }
              disabled={entries.length === 0}
            >
              <NativeSelectOption value="desc">
                新しい順（降順）
              </NativeSelectOption>
              <NativeSelectOption value="asc">
                古い順（昇順）
              </NativeSelectOption>
            </NativeSelect>
          </Field>
        </FieldGroup>
        {entries.length === 0 ? (
          <Empty>当選者履歴はまだありません。</Empty>
        ) : (
          <Table
            containerProps={{
              role: "region",
              "aria-labelledby": headingId,
              tabIndex: 0,
            }}
            className="min-w-[440px] [&_td]:py-3 [&_td]:align-top [&_th]:py-3 [&_th]:align-top"
            aria-labelledby={headingId}
          >
            <TableHeader>
              <TableRow>
                <TableHead className="w-[180px]" scope="col">
                  回した日時
                </TableHead>
                <TableHead scope="col">名前</TableHead>
                <TableHead className="w-[80px]" scope="col">
                  当選回数
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.map(({ entry }) => (
                <TableRow key={`${entry.itemId}:${entry.winNumber}`}>
                  <TableCell>
                    <time
                      className="whitespace-nowrap tabular-nums"
                      dateTime={new Date(entry.spunAt).toISOString()}
                    >
                      {formatDate(entry.spunAt)}
                    </time>
                  </TableCell>
                  <TableCell className="whitespace-pre-wrap [overflow-wrap:anywhere]">
                    {entry.name}
                  </TableCell>
                  <TableCell>{entry.winNumber}回目</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </dialog>
    </div>
  );
}

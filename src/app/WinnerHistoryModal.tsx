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
    <div className="winner-history">
      <button
        type="button"
        aria-haspopup="dialog"
        onClick={() => dialogRef.current?.showModal()}
      >
        当選者履歴
      </button>
      <dialog
        ref={dialogRef}
        className="winner-history-modal"
        aria-labelledby={headingId}
      >
        <div className="winner-history-heading">
          <h2 id={headingId}>当選者履歴</h2>
          <button
            type="button"
            autoFocus
            onClick={() => dialogRef.current?.close()}
          >
            閉じる
          </button>
        </div>
        <p className="caption">
          直近20件を表示します。当選回数はリセット以降の累計です。日時はこのブラウザの現地時刻です。
        </p>
        <label className="winner-history-order">
          表示順
          <select
            value={order}
            onChange={(event) =>
              setOrder(event.target.value === "asc" ? "asc" : "desc")
            }
            disabled={entries.length === 0}
          >
            <option value="desc">新しい順（降順）</option>
            <option value="asc">古い順（昇順）</option>
          </select>
        </label>
        {entries.length === 0 ? (
          <p className="items-empty">当選者履歴はまだありません。</p>
        ) : (
          <div
            className="winner-history-table-scroll"
            role="region"
            aria-labelledby={headingId}
            tabIndex={0}
          >
            <table className="winner-history-table" aria-labelledby={headingId}>
              <thead>
                <tr>
                  <th scope="col">回した日時</th>
                  <th scope="col">名前</th>
                  <th scope="col">当選回数</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map(({ entry }) => (
                  <tr key={`${entry.itemId}:${entry.winNumber}`}>
                    <td>
                      <time dateTime={new Date(entry.spunAt).toISOString()}>
                        {formatDate(entry.spunAt)}
                      </time>
                    </td>
                    <td className="winner-history-name">{entry.name}</td>
                    <td>{entry.winNumber}回目</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </dialog>
    </div>
  );
}

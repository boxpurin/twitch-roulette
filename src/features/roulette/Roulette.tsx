import { useCallback, useReducer } from 'react'
import RouletteItems from './RouletteItems'
import { itemsReducer } from './items'
import { drawWheel, WHEEL_SIZE } from './wheel'

export default function Roulette() {
  const [items, dispatch] = useReducer(itemsReducer, [])
  const canvasRef = useCallback((canvas: HTMLCanvasElement | null) => {
    if (canvas) drawWheel(canvas, items)
  }, [items])

  return (
    <section className="roulette-card" aria-labelledby="roulette-heading">
      <h2 id="roulette-heading">ルーレット</h2>
      <canvas
        ref={canvasRef}
        className="roulette-canvas"
        width={WHEEL_SIZE}
        height={WHEEL_SIZE}
        role="img"
        aria-label={items.length === 0
          ? '参加者未登録のルーレット（待機中）'
          : `${items.length} 件の項目が登録されたルーレット（待機中）。項目名は下の一覧で確認できます。`}
      >
        ルーレットの表示には Canvas 2D 対応のブラウザが必要です。
      </canvas>
      <p role="status">{items.length === 0 ? '参加者を待っています' : `${items.length} 件の項目を登録しています`}</p>
      <p className="caption">抽選・チャンネルポイント連携は準備中です。</p>
      <RouletteItems items={items} dispatch={dispatch} />
    </section>
  )
}

import { useEffect, useReducer, useRef, useState } from 'react'
import RouletteItems from './RouletteItems'
import { itemsReducer } from './items'
import type { RouletteItem } from './items'
import { selectWinner } from './spin'
import { createWheel, WHEEL_SIZE } from './wheel'

export default function Roulette() {
  const [items, dispatch] = useReducer(itemsReducer, [])
  const [spinning, setSpinning] = useState(false)
  const [winner, setWinner] = useState<RouletteItem | null>(null)
  const [error, setError] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wheelRef = useRef<ReturnType<typeof createWheel>>(undefined)

  useEffect(() => {
    if (!canvasRef.current) return
    const wheel = createWheel(canvasRef.current, items)
    wheelRef.current = wheel
    setError(!wheel)
    setWinner(null)
    return () => {
      wheel?.dispose()
      wheelRef.current = undefined
    }
  }, [items])

  function spin() {
    if (spinning || !wheelRef.current) return
    const selected = selectWinner(items)
    if (!selected) return
    const started = wheelRef.current.spin(items.findIndex(item => item.id === selected.id), () => {
      setWinner(selected)
      setSpinning(false)
    })
    if (started) {
      setWinner(null)
      setSpinning(true)
    }
  }

  const status = spinning ? 'ルーレットを回しています…'
    : winner ? `当選: ${winner.name}`
      : items.length === 0 ? '参加者を待っています' : `${items.length} 件の項目を登録しています`

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
          : `${items.length} 件の項目が登録されたルーレット（${spinning ? '回転中' : '待機中'}）。項目名は下の一覧で確認できます。`}
      >
        ルーレットの表示には Canvas 2D 対応のブラウザが必要です。
      </canvas>
      <button className="spin-button" type="button" onClick={spin} disabled={items.length === 0 || spinning || error}>
        {spinning ? '回転中…' : 'ルーレットを回す'}
      </button>
      <p role="status" aria-atomic="true" className="roulette-status">{status}</p>
      {error ? <p role="alert" className="auth-error">Canvas 2D を初期化できません。対応ブラウザで再読み込みしてください。</p> : null}
      <p className="caption">チャンネルポイント連携は準備中です。</p>
      <RouletteItems items={items} dispatch={dispatch} disabled={spinning} />
    </section>
  )
}

const SIZE = 640
const COLORS = ['#9146ff', '#c4a1ff', '#6d28d9', '#ddd0ff']

function drawWheel(canvas: HTMLCanvasElement | null) {
  const context = canvas?.getContext('2d')
  if (!context) return

  context.clearRect(0, 0, SIZE, SIZE)
  const center = SIZE / 2
  const radius = 280
  const slice = Math.PI / 4

  for (let index = 0; index < 8; index++) {
    const start = -Math.PI / 2 + index * slice
    context.beginPath()
    context.moveTo(center, center)
    context.arc(center, center, radius, start, start + slice)
    context.closePath()
    context.fillStyle = COLORS[index % COLORS.length] ?? '#9146ff'
    context.fill()
    context.strokeStyle = '#ffffff'
    context.lineWidth = 2
    context.stroke()
  }

  context.beginPath()
  context.arc(center, center, 64, 0, Math.PI * 2)
  context.fillStyle = '#ffffff'
  context.fill()
  context.fillStyle = '#6d28d9'
  context.font = 'bold 20px system-ui, sans-serif'
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.fillText('待機中', center, center)

  context.beginPath()
  context.moveTo(center - 20, 18)
  context.lineTo(center + 20, 18)
  context.lineTo(center, 66)
  context.closePath()
  context.fillStyle = '#f59e0b'
  context.fill()
}

export default function Roulette() {
  return (
    <section className="roulette-card" aria-labelledby="roulette-heading">
      <h2 id="roulette-heading">ルーレット</h2>
      <canvas
        ref={drawWheel}
        className="roulette-canvas"
        width={SIZE}
        height={SIZE}
        role="img"
        aria-label="参加者未登録のルーレット（待機中）"
      >
        ルーレットの表示には Canvas 2D 対応のブラウザが必要です。
      </canvas>
      <p role="status">参加者を待っています</p>
      <p className="caption">現在は表示のみ対応しています。参加者登録・抽選・チャンネルポイント連携は準備中です。</p>
    </section>
  )
}

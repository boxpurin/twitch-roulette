import type { RouletteItem } from './items'

export const WHEEL_SIZE = 640
const COLORS = ['#9146ff', '#c4a1ff', '#6d28d9', '#ddd0ff']

export function drawWheel(canvas: HTMLCanvasElement, items: readonly RouletteItem[]) {
  const context = canvas.getContext('2d')
  if (!context) return

  context.clearRect(0, 0, WHEEL_SIZE, WHEEL_SIZE)
  const center = WHEEL_SIZE / 2
  const count = items.length || 8
  const slice = Math.PI * 2 / count

  for (let index = 0; index < count; index++) {
    const start = -Math.PI / 2 + index * slice
    context.beginPath()
    context.moveTo(center, center)
    context.arc(center, center, 280, start, start + slice)
    context.closePath()
    context.fillStyle = COLORS[index % COLORS.length] ?? '#9146ff'
    context.fill()
    context.strokeStyle = '#ffffff'
    context.lineWidth = 2
    context.stroke()

    const item = items[index]
    if (item) {
      context.save()
      context.translate(center, center)
      context.rotate(start + slice / 2)
      context.font = 'bold 18px system-ui, sans-serif'
      context.textAlign = 'right'
      context.textBaseline = 'middle'
      const fullName = Array.from(item.name)
      const characters = fullName.slice(0, 20)
      let label = characters.join('') + (characters.length < fullName.length ? '…' : '')
      while (context.measureText(label).width > 172 && characters.length > 0) {
        characters.pop()
        label = characters.join('') + '…'
      }
      context.fillStyle = index % 2 === 0 ? '#ffffff' : '#2e1065'
      context.fillText(label, 258, 0)
      context.restore()
    }
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

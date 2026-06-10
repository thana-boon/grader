'use client'

import { useEffect, useRef } from 'react'
import { parseDrawing } from '@/lib/turtleGrading'

// วาดภาพ turtle จาก JSON ลง canvas — แกนแบบ turtle (จุดกำเนิดกลางจอ, y ขึ้นบน)
// ย่อ/ขยายอัตโนมัติให้ภาพพอดีกรอบ
export default function TurtleCanvas({
  drawing,
  size = 320,
  emptyText = 'ยังไม่มีภาพ',
}: {
  drawing: string | null
  size?: number
  emptyText?: string
}) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const d = parseDrawing(drawing)
    ctx.clearRect(0, 0, size, size)

    // พื้นหลัง
    ctx.fillStyle = d?.bg && d.bg !== 'white' ? d.bg : '#ffffff'
    ctx.fillRect(0, 0, size, size)

    if (!d || d.events.length === 0) {
      ctx.fillStyle = '#9ca3af'
      ctx.font = '13px sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText(emptyText, size / 2, size / 2)
      return
    }

    // หาขอบเขตภาพเพื่อ scale ให้พอดี
    let minX = -10, maxX = 10, minY = -10, maxY = 10
    const seen = (x: number, y: number) => {
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
    }
    for (const ev of d.events) {
      const t = ev[0]
      if (t === 'seg') {
        seen(Number(ev[1]), Number(ev[2]))
        seen(Number(ev[3]), Number(ev[4]))
      } else if (t === 'dot' || t === 'text') {
        seen(Number(ev[1]), Number(ev[2]))
      } else if (t === 'fill') {
        const pts = ev[2] as number[]
        for (let i = 0; i + 1 < pts.length; i += 2) seen(pts[i], pts[i + 1])
      }
    }
    const pad = 20
    const scale = Math.min(
      (size - pad * 2) / Math.max(maxX - minX, 1),
      (size - pad * 2) / Math.max(maxY - minY, 1),
      2 // ไม่ขยายเกิน 2 เท่า กันภาพเล็กๆ ดูบวม
    )
    const cx = (minX + maxX) / 2
    const cy = (minY + maxY) / 2
    const tx = (x: number) => size / 2 + (x - cx) * scale
    const ty = (y: number) => size / 2 - (y - cy) * scale

    for (const ev of d.events) {
      const t = ev[0]
      if (t === 'seg') {
        ctx.strokeStyle = String(ev[5])
        ctx.lineWidth = Math.max(1, Number(ev[6]) * scale)
        ctx.lineCap = 'round'
        ctx.beginPath()
        ctx.moveTo(tx(Number(ev[1])), ty(Number(ev[2])))
        ctx.lineTo(tx(Number(ev[3])), ty(Number(ev[4])))
        ctx.stroke()
      } else if (t === 'fill') {
        const pts = ev[2] as number[]
        if (pts.length < 6) continue
        ctx.fillStyle = String(ev[1])
        ctx.beginPath()
        ctx.moveTo(tx(pts[0]), ty(pts[1]))
        for (let i = 2; i + 1 < pts.length; i += 2) ctx.lineTo(tx(pts[i]), ty(pts[i + 1]))
        ctx.closePath()
        ctx.fill()
      } else if (t === 'dot') {
        ctx.fillStyle = String(ev[4])
        ctx.beginPath()
        ctx.arc(tx(Number(ev[1])), ty(Number(ev[2])), Math.max(1, (Number(ev[3]) / 2) * scale), 0, Math.PI * 2)
        ctx.fill()
      } else if (t === 'text') {
        ctx.fillStyle = String(ev[4])
        ctx.font = `${Math.max(10, 12 * scale)}px sans-serif`
        ctx.textAlign = 'left'
        ctx.fillText(String(ev[3]), tx(Number(ev[1])), ty(Number(ev[2])))
      }
    }
  }, [drawing, size, emptyText])

  return (
    <canvas
      ref={ref}
      width={size}
      height={size}
      className="border border-gray-200 rounded-lg bg-white"
    />
  )
}

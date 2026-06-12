'use client'

// นาฬิกานับถอยหลังของการแข่งขัน — หมดเวลาแล้ว refresh หน้าให้สถานะเปลี่ยนเป็น "จบ"

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

export default function Countdown({ endsAt }: { endsAt: number }) {
  const router = useRouter()
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])

  const remainMs = endsAt - now

  useEffect(() => {
    if (remainMs <= 0) router.refresh()
  }, [remainMs <= 0]) // eslint-disable-line react-hooks/exhaustive-deps

  const remain = Math.max(0, Math.floor(remainMs / 1000))
  const h = Math.floor(remain / 3600)
  const m = Math.floor((remain % 3600) / 60)
  const s = remain % 60
  const p = (n: number) => String(n).padStart(2, '0')
  const lastMinutes = remain <= 5 * 60 // 5 นาทีสุดท้าย — เปลี่ยนเป็นสีแดงเตือน

  return (
    <span
      className={`font-mono font-bold tabular-nums ${
        lastMinutes ? 'text-red-600' : 'text-indigo-700'
      }`}
    >
      {h > 0 ? `${p(h)}:` : ''}
      {p(m)}:{p(s)}
    </span>
  )
}

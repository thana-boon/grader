'use client'

// เฝ้าดู session ฝั่งเบราว์เซอร์ (ฝังอยู่ใน Navbar = ทุกหน้าที่ล็อกอินแล้ว)
// - ขยับเมาส์/พิมพ์/แตะจอ = ยังใช้งานอยู่ → ต่ออายุ token ฝั่งเซิร์ฟเวอร์เป็นระยะ
// - เงียบครบ 30 นาที → ออกจากระบบแล้วพากลับหน้า login

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

const IDLE_MS = 30 * 60 * 1000 // ต้องเท่ากับ SESSION_MINUTES ใน src/lib/jwt.ts
const PING_MS = 5 * 60 * 1000 // ต่ออายุ token ทุก 5 นาทีระหว่างยังใช้งาน
const CHECK_MS = 60 * 1000

export default function SessionGuard() {
  const router = useRouter()

  useEffect(() => {
    let lastActivity = Date.now()
    let lastPing = Date.now()
    const onActivity = () => {
      lastActivity = Date.now()
    }
    const events: (keyof WindowEventMap)[] = [
      'mousemove',
      'mousedown',
      'keydown',
      'scroll',
      'touchstart',
    ]
    events.forEach((ev) =>
      window.addEventListener(ev, onActivity, { passive: true, capture: true })
    )

    const interval = window.setInterval(async () => {
      if (Date.now() - lastActivity >= IDLE_MS) {
        await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {})
        router.replace('/login')
        return
      }
      if (Date.now() - lastPing >= PING_MS) {
        lastPing = Date.now()
        const r = await fetch('/api/auth/refresh', { method: 'POST' }).catch(() => null)
        if (r && r.status === 401) router.replace('/login')
      }
    }, CHECK_MS)

    return () => {
      clearInterval(interval)
      events.forEach((ev) =>
        window.removeEventListener(ev, onActivity, { capture: true })
      )
    }
  }, [router])

  return null
}

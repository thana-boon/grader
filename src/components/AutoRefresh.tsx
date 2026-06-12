'use client'

// รีเฟรชข้อมูลหน้าเป็นระยะ — ใช้กับหน้ารอเริ่มแข่ง/ตารางคะแนนสด

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function AutoRefresh({ seconds }: { seconds: number }) {
  const router = useRouter()
  useEffect(() => {
    const t = window.setInterval(() => router.refresh(), seconds * 1000)
    return () => clearInterval(t)
  }, [router, seconds])
  return null
}

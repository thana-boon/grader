import { NextRequest, NextResponse } from 'next/server'
import { verifyJWT, renewJWT, COOKIE_SECURE } from '@/lib/jwt'

// ต่ออายุ session — SessionGuard เรียกเป็นระยะตอนผู้ใช้ยังใช้งานอยู่
// (เช่น นั่งพิมพ์โค้ดนานๆ โดยไม่เปลี่ยนหน้า ไม่งั้น token หมดอายุกลางคัน)
export async function POST(request: NextRequest) {
  const token = request.cookies.get('auth-token')?.value
  const user = token ? await verifyJWT(token) : null
  if (!user) {
    return NextResponse.json({ ok: false }, { status: 401 })
  }
  const res = NextResponse.json({ ok: true })
  // ไม่ตั้ง maxAge = session cookie; อายุจริงคุมด้วย token TTL + absolute timeout
  res.cookies.set('auth-token', await renewJWT(user), {
    httpOnly: true,
    secure: COOKIE_SECURE,
    sameSite: 'lax',
    path: '/',
  })
  return res
}

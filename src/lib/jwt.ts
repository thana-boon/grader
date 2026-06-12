import { SignJWT, jwtVerify } from 'jose'

export type JWTPayload = {
  userId: number
  role: 'student' | 'teacher' | 'contestant' // contestant = บัญชีชั่วคราวของผู้เข้าแข่งขัน
  name: string
  studentCode?: string
  isAdmin?: boolean
  competitionId?: number // เฉพาะ contestant — แข่งได้เฉพาะรายการนี้
}

const secret = () =>
  new TextEncoder().encode(
    process.env.JWT_SECRET ?? 'codegrader-dev-secret-change-in-production'
  )

// อายุ session: ไม่ใช้งาน 30 นาทีแล้วหมดอายุ — ระหว่างใช้งานถูกต่ออายุอัตโนมัติ
// (middleware ต่อทุกครั้งที่เปิดหน้า + SessionGuard ping /api/auth/refresh ระหว่างพิมพ์)
export const SESSION_MINUTES = 30
const EXPIRES_IN = `${SESSION_MINUTES}m`

export async function signJWT(payload: JWTPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(EXPIRES_IN)
    .sign(secret())
}

export async function verifyJWT(token: string): Promise<JWTPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secret())
    return payload as unknown as JWTPayload
  } catch {
    return null
  }
}

// ออก token ใหม่จาก payload เดิม (ตัด claim เวลาเก่าทิ้ง) — ใช้ต่ออายุ session
export async function renewJWT(user: JWTPayload): Promise<string> {
  return signJWT({
    userId: user.userId,
    role: user.role,
    name: user.name,
    studentCode: user.studentCode,
    isAdmin: user.isAdmin,
    competitionId: user.competitionId,
  })
}

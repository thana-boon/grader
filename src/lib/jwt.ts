import { SignJWT, jwtVerify } from 'jose'

export type JWTPayload = {
  userId: number
  role: 'student' | 'teacher' | 'contestant' // contestant = บัญชีชั่วคราวของผู้เข้าแข่งขัน
  name: string
  studentCode?: string
  isAdmin?: boolean
  competitionId?: number // เฉพาะ contestant — แข่งได้เฉพาะรายการนี้
  loginAt?: number // epoch (วินาที) เวลาที่ login จริง — ใช้บังคับ absolute timeout, ห้ามต่ออายุค่านี้
}

const secret = () =>
  new TextEncoder().encode(
    process.env.JWT_SECRET ?? 'codegrader-dev-secret-change-in-production'
  )

// อายุ session (idle): ไม่ใช้งาน 10 นาทีแล้วหมดอายุ — ระหว่างใช้งานถูกต่ออายุอัตโนมัติ
// (middleware ต่อทุกครั้งที่เปิดหน้า + SessionGuard ping /api/auth/refresh ระหว่างพิมพ์)
// ตั้งให้สั้นเพราะเป็นห้องคอมใช้เครื่องร่วมกัน — ลดหน้าต่างเสี่ยงที่คนต่อไปจะเจอ session คนก่อน
export const SESSION_MINUTES = 10
const EXPIRES_IN = `${SESSION_MINUTES}m`

// เพดานอายุสูงสุดต่อ 1 session — บังคับหมดอายุแม้จะยัง active ตลอด (กัน session ถูกสืบทอดไม่จำกัด)
// นับจาก loginAt เดิม ไม่ถูกต่ออายุพร้อม token
export const ABSOLUTE_SESSION_HOURS = 6

// เว็บถูกเสิร์ฟผ่าน http ในวง LAN — เปิด Secure cookie ไม่ได้ (เบราว์เซอร์จะทิ้ง cookie ทำให้ login ไม่ติด)
// ถ้าวันหน้าย้ายไปใช้ https ค่อยตั้ง COOKIE_SECURE="true" ใน .env
export const COOKIE_SECURE = process.env.COOKIE_SECURE === 'true'

export async function signJWT(payload: JWTPayload): Promise<string> {
  // login ครั้งแรกยังไม่มี loginAt → ตั้งเป็นตอนนี้; ตอนต่ออายุจะส่ง loginAt เดิมมาให้คงไว้
  const loginAt = payload.loginAt ?? Math.floor(Date.now() / 1000)
  return new SignJWT({ ...payload, loginAt })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(EXPIRES_IN)
    .sign(secret())
}

export async function verifyJWT(token: string): Promise<JWTPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secret())
    const user = payload as unknown as JWTPayload
    // บังคับ absolute timeout — เกินเพดานแล้วถือว่าหมดอายุ แม้ token (idle) จะยังไม่หมด
    if (
      user.loginAt &&
      Date.now() / 1000 - user.loginAt > ABSOLUTE_SESSION_HOURS * 3600
    ) {
      return null
    }
    return user
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
    loginAt: user.loginAt, // คงเวลา login เดิม — absolute timeout นับจากค่านี้
  })
}

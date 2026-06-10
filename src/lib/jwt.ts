import { SignJWT, jwtVerify } from 'jose'

export type JWTPayload = {
  userId: number
  role: 'student' | 'teacher'
  name: string
  studentCode?: string
  isAdmin?: boolean
}

const secret = () =>
  new TextEncoder().encode(
    process.env.JWT_SECRET ?? 'codegrader-dev-secret-change-in-production'
  )

const EXPIRES_IN = '7d'

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

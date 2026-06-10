import { cookies } from 'next/headers'
import { verifyJWT, type JWTPayload } from './jwt'

export type { JWTPayload as UserPayload }

export async function getCurrentUser(): Promise<JWTPayload | null> {
  const cookieStore = await cookies()
  const token = cookieStore.get('auth-token')?.value
  if (!token) return null
  return verifyJWT(token)
}

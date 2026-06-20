// ไคลเอนต์เรียก Teacher API กลาง (192.168.200.9/teacher-api) — ใช้ตอน login ครู
// login: ตรวจ teacher_code + password (scope auth:login) แล้วคืนข้อมูลโปรไฟล์ครู
// (ออปชัน) listTeachers: ดึงรายชื่อครูทั้งหมด (scope teachers:read) — ยังไม่ได้ใช้ในเว็บ
// คอนฟิกใน .env: TEACHER_API_BASE, TEACHER_API_KEY (auth:login), TEACHER_API_TEACHERS_KEY (teachers:read)

const BASE = process.env.TEACHER_API_BASE ?? 'http://192.168.200.9/teacher-api'
const LOGIN_KEY = process.env.TEACHER_API_KEY ?? ''
const TEACHERS_KEY = process.env.TEACHER_API_TEACHERS_KEY ?? ''

export class TeacherApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string
  ) {
    super(message)
    this.name = 'TeacherApiError'
  }
}

// โปรไฟล์ครูที่ API คืนกลับมา (ไม่มี password_hash)
export type ApiTeacher = {
  id: number
  teacher_code: string
  title: string | null
  first_name: string
  last_name: string
  first_name_en: string | null
  last_name_en: string | null
  email: string | null
  created_at: string
  subject_group: number | null
}

function buildUrl(path: string): string {
  return new URL(BASE.replace(/\/+$/, '') + path).toString()
}

async function request<T>(
  path: string,
  opts: { apiKey: string; method?: string; body?: unknown }
): Promise<T> {
  const headers: Record<string, string> = { 'x-api-key': opts.apiKey }
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json'

  let res: Response
  try {
    res = await fetch(buildUrl(path), {
      method: opts.method ?? 'GET',
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      cache: 'no-store',
    })
  } catch (e) {
    throw new TeacherApiError(0, 'network_error', `เชื่อมต่อ Teacher API ไม่ได้: ${(e as Error).message}`)
  }

  const json = await res.json().catch(() => null)
  if (!res.ok) {
    const code = (json && (json.error as string)) || 'http_error'
    throw new TeacherApiError(res.status, code, code)
  }
  return json as T
}

// POST /api/auth/login — ตรวจรหัสครู+รหัสผ่าน (scope auth:login)
// คืนโปรไฟล์ครูเมื่อถูกต้อง, คืน null เมื่อ 401 (รหัสครู/รหัสผ่านไม่ถูกต้อง หรือไม่ใช่ครู)
export async function loginTeacher(teacher_code: string, password: string): Promise<ApiTeacher | null> {
  try {
    return await request<ApiTeacher>('/api/auth/login', {
      apiKey: LOGIN_KEY,
      method: 'POST',
      body: { teacher_code, password },
    })
  } catch (e) {
    if (e instanceof TeacherApiError && (e.status === 400 || e.status === 401)) return null
    throw e
  }
}

// GET /api/teachers — รายชื่อครูทั้งหมด (scope teachers:read) — ยังไม่ได้เรียกใช้ในเว็บ
export function listTeachers(): Promise<ApiTeacher[]> {
  return request<ApiTeacher[]>('/api/teachers', { apiKey: TEACHERS_KEY })
}

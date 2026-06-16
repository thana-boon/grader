// ไคลเอนต์เรียก Student API กลาง (192.168.200.9/students-api) — แทนการอ่านตรงจาก DB school_app
// อ่านอย่างเดียว: รายชื่อนักเรียน/ปีการศึกษา (read:basic) + ตรวจรหัสผ่าน login (verify)
// คอนฟิกใน .env: STUDENT_API_BASE, STUDENT_API_KEY (read:basic), STUDENT_VERIFY_KEY (verify)

const BASE = process.env.STUDENT_API_BASE ?? 'http://192.168.200.9/students-api/v1'
const READ_KEY = process.env.STUDENT_API_KEY ?? ''
const VERIFY_KEY = process.env.STUDENT_VERIFY_KEY ?? ''

export class StudentApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string
  ) {
    super(message)
    this.name = 'StudentApiError'
  }
}

type Query = Record<string, string | number | undefined>

function buildUrl(path: string, query?: Query): string {
  const url = new URL(BASE.replace(/\/+$/, '') + path)
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== '') url.searchParams.set(k, String(v))
    }
  }
  return url.toString()
}

async function request<T>(
  path: string,
  opts: { key: 'read' | 'verify'; method?: string; query?: Query; body?: unknown } = { key: 'read' }
): Promise<T> {
  const apiKey = opts.key === 'verify' ? VERIFY_KEY : READ_KEY
  const headers: Record<string, string> = { 'X-API-Key': apiKey }
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json'

  let res: Response
  try {
    res = await fetch(buildUrl(path, opts.query), {
      method: opts.method ?? 'GET',
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      cache: 'no-store', // ข้อมูลนักเรียนเปลี่ยนได้ตลอด — ไม่ cache
    })
  } catch (e) {
    // เชื่อมต่อ API ไม่ได้ (เน็ตเวิร์ก/เซิร์ฟเวอร์ล่ม)
    throw new StudentApiError(0, 'network_error', `เชื่อมต่อ Student API ไม่ได้: ${(e as Error).message}`)
  }

  if (res.status === 204) return undefined as T

  const json = await res.json().catch(() => null)
  if (!res.ok) {
    const code = (json && (json.error as string)) || 'http_error'
    const message = (json && (json.message as string)) || `HTTP ${res.status}`
    throw new StudentApiError(res.status, code, message)
  }
  return json as T
}

// ===== รูปแบบข้อมูลที่ API คืน =====

export type ApiStudent = {
  id: number
  student_code: string
  first_name: string
  last_name: string
  class_level: string
  class_room: number
  number_in_room: number
  color?: string
  citizen_id?: string | null // มีเฉพาะ GET รายคนด้วย key read:full เท่านั้น
  birth_date?: string | null
}

export type ApiStudentList = {
  data: ApiStudent[]
  meta: {
    total: number
    page: number
    limit: number
    academic_year?: { id: number; year_be: number; title: string }
  }
}

export type ApiAcademicYear = { id: number; year_be: number; title: string; is_active?: number }
export type ApiAcademicYears = {
  current: ApiAcademicYear | null
  years: ApiAcademicYear[]
}

// ===== Endpoints =====

// GET /students — รายชื่อ/ค้นหา (read:basic). list จะไม่มี citizen_id/birth_date
export function listStudents(query: {
  year_id?: number
  class_level?: string
  class_room?: number
  q?: string
  page?: number
  limit?: number
}): Promise<ApiStudentList> {
  return request<ApiStudentList>('/students', { key: 'read', query })
}

// GET /students/:code — รายคน (read:basic). คืน null เมื่อ 404
export async function getStudent(code: string): Promise<ApiStudent | null> {
  try {
    return await request<ApiStudent>(`/students/${encodeURIComponent(code)}`, { key: 'read' })
  } catch (e) {
    if (e instanceof StudentApiError && e.status === 404) return null
    throw e
  }
}

// POST /students/verify — ตรวจ student_code + citizen_id (verify)
export async function verifyStudent(student_code: string, citizen_id: string): Promise<boolean> {
  try {
    const res = await request<{ match: boolean }>('/students/verify', {
      key: 'verify',
      method: 'POST',
      body: { student_code, citizen_id },
    })
    return res.match === true
  } catch (e) {
    // 422 = รูปแบบ citizen_id ไม่ถูกต้อง → ถือว่าไม่ผ่าน (ไม่ใช่ error ของระบบ)
    if (e instanceof StudentApiError && e.status === 422) return false
    throw e
  }
}

// GET /academic-years
export function getAcademicYears(): Promise<ApiAcademicYears> {
  return request<ApiAcademicYears>('/academic-years', { key: 'read' })
}

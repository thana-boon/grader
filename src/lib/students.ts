import { listStudents, getStudent, type ApiStudent } from '@/lib/studentApi'

// นักเรียนเป็นข้อมูลกลางของโรงเรียน ดึงจาก Student API (เดิมอ่านตรงจาก DB school_app)
// citizen_id ไม่อยู่ในรายการ (list) — API ให้เฉพาะ key read:full ตอนดึงรายคน จึงเป็น null เสมอที่นี่

export type SchoolStudent = {
  id: number
  student_code: string
  first_name: string
  last_name: string
  class_level: string
  class_room: number
  number_in_room: number
  citizen_id: string | null
}

export type StudentFilter = {
  yearId: number
  q?: string // ค้นหาจากชื่อ นามสกุล หรือรหัสนักเรียน
  classLevel?: string
  classRoom?: number
  page?: number
  pageSize?: number
}

function toStudent(s: ApiStudent): SchoolStudent {
  return {
    id: s.id,
    student_code: s.student_code,
    first_name: s.first_name,
    last_name: s.last_name,
    class_level: s.class_level,
    class_room: s.class_room,
    number_in_room: s.number_in_room,
    citizen_id: s.citizen_id ?? null,
  }
}

// รหัสที่กรอกอาจเป็น 5 หลัก (มี 0 นำหน้า) แต่ API/DB เก็บแบบไม่มี 0 — ลองทุกแบบ
function codeVariants(code: string): string[] {
  const trimmed = code.trim()
  if (!trimmed) return []
  return [...new Set([trimmed, trimmed.replace(/^0+/, '') || trimmed, trimmed.padStart(5, '0')])]
}

export async function getSchoolStudents(
  filter: StudentFilter
): Promise<{ students: SchoolStudent[]; total: number }> {
  const pageSize = filter.pageSize ?? 50
  const res = await listStudents({
    year_id: filter.yearId,
    q: filter.q,
    class_level: filter.classLevel,
    class_room: filter.classRoom,
    page: Math.max(1, filter.page ?? 1),
    limit: Math.min(pageSize, 200), // API จำกัด limit สูงสุด 200/หน้า
  })
  return { students: res.data.map(toStudent), total: res.meta.total }
}

export async function countSchoolStudents(yearId: number): Promise<number> {
  const res = await listStudents({ year_id: yearId, page: 1, limit: 1 })
  return res.meta.total
}

// หาแถวของนักเรียน (ตามรหัส) ในปีการศึกษาที่กำหนด — ใช้หาชั้น/ห้องปัจจุบันของนักเรียน
// q ของ API ค้นแบบ LIKE จึงต้องกรองให้ตรงรหัสเป๊ะ (variant ใด variant หนึ่ง) อีกชั้น
export async function findSchoolStudentByCodeAndYear(
  code: string,
  yearId: number
): Promise<SchoolStudent | null> {
  const variants = codeVariants(code)
  if (variants.length === 0) return null
  // ค้นด้วยรหัสแบบไม่มี 0 นำหน้า (ตรงกับที่ API เก็บ) แล้วกรองผลให้ตรงเป๊ะ
  const res = await listStudents({ year_id: yearId, q: variants[1] ?? variants[0], limit: 50 })
  const hit = res.data.find((s) => variants.includes(s.student_code))
  return hit ? toStudent(hit) : null
}

// ดึงนักเรียนหลายคนตามรหัสในปีเดียวกัน — ใช้แสดงชื่อในหน้ามอบหมายรายคน
export async function findSchoolStudentsByCodesAndYear(
  codes: string[],
  yearId: number
): Promise<SchoolStudent[]> {
  if (codes.length === 0) return []
  const results = await Promise.all(codes.map((c) => findSchoolStudentByCodeAndYear(c, yearId)))
  return results.filter((s): s is SchoolStudent => s !== null)
}

// ตัวเลือกชั้น/ห้องสำหรับ dropdown กรอง — API ไม่มี endpoint distinct
// จึงดึงนักเรียนทั้งปี (ทีละ 200) มาสรุปเอง
export async function getStudentFilterOptions(
  yearId: number
): Promise<{ classLevels: string[]; classRooms: number[] }> {
  const levels = new Set<string>()
  const rooms = new Set<number>()

  let page = 1
  const limit = 200
  for (;;) {
    const res = await listStudents({ year_id: yearId, page, limit })
    for (const s of res.data) {
      levels.add(s.class_level)
      rooms.add(s.class_room)
    }
    if (page * limit >= res.meta.total || res.data.length === 0) break
    page++
  }

  return {
    classLevels: [...levels].sort(),
    classRooms: [...rooms].sort((a, b) => a - b),
  }
}

// ===== สำหรับ login เท่านั้น =====

// หานักเรียนตามรหัสที่กรอก (ยังไม่ตรวจรหัสผ่าน) — ลองดึงรายคนก่อน ไม่พบค่อยค้นในปีที่ใช้งาน
// การยืนยันเลขบัตรประชาชนทำผ่าน verifyStudent() ใน studentApi (POST /students/verify)
export async function findSchoolStudentForLogin(
  code: string,
  yearId?: number
): Promise<SchoolStudent | null> {
  const variants = codeVariants(code)
  if (variants.length === 0) return null
  // 1) ลองดึงรายคนตรงๆ ด้วยรหัสไม่มี 0 นำหน้า (ตรงกับที่ API เก็บ)
  const direct = await getStudent(variants[1] ?? variants[0])
  if (direct && variants.includes(direct.student_code)) return toStudent(direct)
  // 2) ค้นในปีที่ใช้งาน
  if (yearId !== undefined) {
    const inYear = await findSchoolStudentByCodeAndYear(code, yearId)
    if (inYear) return inYear
  }
  return null
}

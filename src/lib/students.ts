import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'

// นักเรียนเป็นข้อมูลกลางของโรงเรียน อยู่ใน database school_app — อ่านอย่างเดียวผ่าน raw query
// (เช่นเดียวกับปีการศึกษาใน src/lib/academicYear.ts)
// id เป็น INT UNSIGNED ซึ่ง Prisma คืนเป็น BigInt — แปลงเป็น number ก่อนใช้

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

function buildWhere({ yearId, q, classLevel, classRoom }: StudentFilter): Prisma.Sql {
  const conditions: Prisma.Sql[] = [Prisma.sql`year_id = ${yearId}`]
  if (q) {
    const like = `%${q}%`
    conditions.push(
      Prisma.sql`(first_name LIKE ${like} OR last_name LIKE ${like} OR student_code LIKE ${like})`
    )
  }
  if (classLevel) conditions.push(Prisma.sql`class_level = ${classLevel}`)
  if (classRoom !== undefined) conditions.push(Prisma.sql`class_room = ${classRoom}`)
  return Prisma.join(conditions, ' AND ')
}

export async function getSchoolStudents(
  filter: StudentFilter
): Promise<{ students: SchoolStudent[]; total: number }> {
  const where = buildWhere(filter)
  const pageSize = filter.pageSize ?? 50
  const offset = (Math.max(1, filter.page ?? 1) - 1) * pageSize

  type Row = Omit<SchoolStudent, 'id'> & { id: bigint }
  const [rows, countRows] = await Promise.all([
    prisma.$queryRaw<Row[]>`
      SELECT id, student_code, first_name, last_name, class_level, class_room, number_in_room, citizen_id
      FROM school_app.students
      WHERE ${where}
      ORDER BY class_level, class_room, number_in_room
      LIMIT ${pageSize} OFFSET ${offset}
    `,
    prisma.$queryRaw<{ c: bigint }[]>`
      SELECT COUNT(*) AS c FROM school_app.students WHERE ${where}
    `,
  ])

  return {
    students: rows.map((r) => ({ ...r, id: Number(r.id) })),
    total: Number(countRows[0]?.c ?? 0),
  }
}

export async function countSchoolStudents(yearId: number): Promise<number> {
  const rows = await prisma.$queryRaw<{ c: bigint }[]>`
    SELECT COUNT(*) AS c FROM school_app.students WHERE year_id = ${yearId}
  `
  return Number(rows[0]?.c ?? 0)
}

export type SchoolStudentWithYear = SchoolStudent & { year_id: number; year_be: number }

// หานักเรียนสำหรับ login — รหัสที่กรอกอาจเป็นแบบ 5 หลัก (มี 0 นำหน้า) แต่ใน DB เก็บแบบไม่มี 0
// นักเรียนคนเดียวกันมีแถวซ้ำกันได้หลายปีการศึกษา จึงคืนทุกแถวเรียงปีล่าสุดก่อน ให้ผู้เรียกเลือกเอง
export async function findSchoolStudentsByCode(code: string): Promise<SchoolStudentWithYear[]> {
  const trimmed = code.trim()
  if (!trimmed) return []
  const variants = [...new Set([trimmed, trimmed.replace(/^0+/, '') || trimmed, trimmed.padStart(5, '0')])]

  type Row = Omit<SchoolStudentWithYear, 'id' | 'year_id'> & { id: bigint; year_id: bigint }
  const rows = await prisma.$queryRaw<Row[]>`
    SELECT s.id, s.year_id, s.student_code, s.first_name, s.last_name,
           s.class_level, s.class_room, s.number_in_room, s.citizen_id, y.year_be
    FROM school_app.students s
    JOIN school_app.academic_years y ON y.id = s.year_id
    WHERE s.student_code IN (${Prisma.join(variants)})
    ORDER BY y.year_be DESC
  `
  return rows.map((r) => ({ ...r, id: Number(r.id), year_id: Number(r.year_id) }))
}

// หาแถวของนักเรียน (ตามรหัส) ในปีการศึกษาที่กำหนด — ใช้หาชั้น/ห้องปัจจุบันของนักเรียน
export async function findSchoolStudentByCodeAndYear(
  code: string,
  yearId: number
): Promise<SchoolStudent | null> {
  const trimmed = code.trim()
  if (!trimmed) return null
  const variants = [...new Set([trimmed, trimmed.replace(/^0+/, '') || trimmed, trimmed.padStart(5, '0')])]

  type Row = Omit<SchoolStudent, 'id'> & { id: bigint }
  const rows = await prisma.$queryRaw<Row[]>`
    SELECT id, student_code, first_name, last_name, class_level, class_room, number_in_room, citizen_id
    FROM school_app.students
    WHERE student_code IN (${Prisma.join(variants)}) AND year_id = ${yearId}
    LIMIT 1
  `
  if (rows.length === 0) return null
  return { ...rows[0], id: Number(rows[0].id) }
}

// ดึงนักเรียนหลายคนตามรหัสในปีเดียวกัน — ใช้แสดงชื่อในหน้ามอบหมายรายคน
export async function findSchoolStudentsByCodesAndYear(
  codes: string[],
  yearId: number
): Promise<SchoolStudent[]> {
  if (codes.length === 0) return []
  type Row = Omit<SchoolStudent, 'id'> & { id: bigint }
  const rows = await prisma.$queryRaw<Row[]>`
    SELECT id, student_code, first_name, last_name, class_level, class_room, number_in_room, citizen_id
    FROM school_app.students
    WHERE year_id = ${yearId} AND student_code IN (${Prisma.join(codes)})
  `
  return rows.map((r) => ({ ...r, id: Number(r.id) }))
}

// ตัวเลือกชั้น/ห้องสำหรับ dropdown กรอง — เอาเฉพาะที่มีจริงในปีนั้น
export async function getStudentFilterOptions(
  yearId: number
): Promise<{ classLevels: string[]; classRooms: number[] }> {
  const [levels, rooms] = await Promise.all([
    prisma.$queryRaw<{ class_level: string }[]>`
      SELECT DISTINCT class_level FROM school_app.students
      WHERE year_id = ${yearId} ORDER BY class_level
    `,
    prisma.$queryRaw<{ class_room: number }[]>`
      SELECT DISTINCT class_room FROM school_app.students
      WHERE year_id = ${yearId} ORDER BY class_room
    `,
  ])
  return {
    classLevels: levels.map((r) => r.class_level),
    classRooms: rooms.map((r) => r.class_room),
  }
}

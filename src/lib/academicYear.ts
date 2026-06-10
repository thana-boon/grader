import { prisma } from '@/lib/prisma'

// ปีการศึกษาเป็นข้อมูลกลางของโรงเรียน อยู่ใน database school_app (คนละ DB กับ codegrader)
// Prisma ผูก datasource ได้ทีละ database จึงอ่านข้าม DB ผ่าน raw query — อ่านอย่างเดียวเท่านั้น

export type SchoolAcademicYear = {
  id: number
  year_be: number
  title: string
}

// id ของตารางเป็น INT UNSIGNED ซึ่ง Prisma คืนเป็น BigInt — แปลงเป็น number ก่อนใช้
type RawYearRow = { id: number | bigint; year_be: number; title: string }

function toYear(row: RawYearRow): SchoolAcademicYear {
  return { id: Number(row.id), year_be: row.year_be, title: row.title }
}

export async function getSchoolAcademicYears(): Promise<SchoolAcademicYear[]> {
  const rows = await prisma.$queryRaw<RawYearRow[]>`
    SELECT id, year_be, title
    FROM school_app.academic_years
    ORDER BY year_be DESC
  `
  return rows.map(toYear)
}

export type ActiveAcademicSetting = {
  academicYearId: number
  semester: number
  year: SchoolAcademicYear
  label: string // เช่น "ปีการศึกษา 2567 ภาคเรียนที่ 2"
}

export async function getActiveSetting(): Promise<ActiveAcademicSetting | null> {
  const setting = await prisma.activeSetting.findUnique({ where: { id: 1 } })
  if (!setting) return null

  const rows = await prisma.$queryRaw<RawYearRow[]>`
    SELECT id, year_be, title
    FROM school_app.academic_years
    WHERE id = ${setting.academicYearId}
  `
  if (rows.length === 0) return null
  const year = toYear(rows[0])

  return {
    academicYearId: setting.academicYearId,
    semester: setting.semester,
    year,
    label: `${year.title} ภาคเรียนที่ ${setting.semester}`,
  }
}

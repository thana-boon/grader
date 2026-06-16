import { prisma } from '@/lib/prisma'
import { getAcademicYears } from '@/lib/studentApi'

// ปีการศึกษาเป็นข้อมูลกลางของโรงเรียน ดึงจาก Student API (เดิมอ่านตรงจาก school_app)
// เว็บนี้เก็บแค่ "ปี/เทอมที่เลือกใช้งาน" (active_setting แถวเดียว id=1) ใน DB ของ codegrader เอง

export type SchoolAcademicYear = {
  id: number
  year_be: number
  title: string
}

export async function getSchoolAcademicYears(): Promise<SchoolAcademicYear[]> {
  const { years } = await getAcademicYears()
  return years
    .map((y) => ({ id: y.id, year_be: y.year_be, title: y.title }))
    .sort((a, b) => b.year_be - a.year_be)
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

  const { years } = await getAcademicYears()
  const match = years.find((y) => y.id === setting.academicYearId)
  if (!match) return null
  const year = { id: match.id, year_be: match.year_be, title: match.title }

  return {
    academicYearId: setting.academicYearId,
    semester: setting.semester,
    year,
    label: `${year.title} ภาคเรียนที่ ${setting.semester}`,
  }
}

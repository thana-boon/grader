'use server'

import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth'
import { getSchoolAcademicYears } from '@/lib/academicYear'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

async function requireTeacher() {
  const user = await getCurrentUser()
  if (!user || user.role !== 'teacher') redirect('/login')
  return user
}

// เลือกปี/เทอมที่ใช้งานจากรายการของ school_app เท่านั้น — เว็บนี้เพิ่ม/ลบปีการศึกษาไม่ได้
export async function setActiveAcademicYear(academicYearId: number, semester: number) {
  await requireTeacher()

  if (semester !== 1 && semester !== 2) return

  const years = await getSchoolAcademicYears()
  if (!years.some((y) => y.id === academicYearId)) return

  await prisma.activeSetting.upsert({
    where: { id: 1 },
    update: { academicYearId, semester },
    create: { id: 1, academicYearId, semester },
  })

  revalidatePath('/academic_year')
  revalidatePath('/dashboard/teacher')
  revalidatePath('/dashboard/student')
}

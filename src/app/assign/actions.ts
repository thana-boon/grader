'use server'

import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth'
import { getActiveSetting } from '@/lib/academicYear'
import { findSchoolStudentsByCodesAndYear } from '@/lib/students'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

export type ActionResult = { error?: string }

async function requireTeacher() {
  const user = await getCurrentUser()
  if (!user || user.role !== 'teacher') redirect('/login')
  return user
}

function parseDue(formData: FormData): Date | null {
  const raw = (formData.get('dueAt') as string)?.trim()
  return raw ? new Date(raw) : null
}

// สร้างการมอบหมาย — mode 'room' (ทั้งห้อง/ทั้งชั้น) หรือ 'student' (รายคน หลายคนได้)
export async function createAssignments(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  await requireTeacher()

  const active = await getActiveSetting()
  if (!active) return { error: 'ต้องตั้งปีการศึกษาที่ใช้งานก่อน' }

  const problemId = parseInt(formData.get('problemId') as string)
  if (!problemId) return { error: 'กรุณาเลือกโจทย์' }
  const problem = await prisma.problem.findUnique({ where: { id: problemId } })
  if (!problem) return { error: 'ไม่พบโจทย์ที่เลือก' }

  const mode = formData.get('mode') as string
  const dueAt = parseDue(formData)
  const base = {
    problemId,
    academicYearId: active.academicYearId,
    semester: active.semester,
    dueAt,
  }

  if (mode === 'room') {
    const classLevel = (formData.get('classLevel') as string)?.trim()
    if (!classLevel) return { error: 'กรุณาเลือกชั้น' }
    const roomRaw = (formData.get('classRoom') as string)?.trim()
    const classRoom = roomRaw ? parseInt(roomRaw) : null

    const dup = await prisma.assignment.findFirst({
      where: {
        problemId,
        academicYearId: active.academicYearId,
        semester: active.semester,
        studentCode: null,
        classLevel,
        classRoom,
      },
    })
    if (dup) return { error: 'โจทย์นี้ถูกมอบหมายให้ห้องนี้ในเทอมนี้แล้ว' }

    await prisma.assignment.create({
      data: { ...base, classLevel, classRoom, studentCode: null },
    })
  } else if (mode === 'student') {
    let codes: unknown
    try {
      codes = JSON.parse((formData.get('studentCodes') as string) ?? '[]')
    } catch {
      return { error: 'รายชื่อนักเรียนไม่ถูกต้อง' }
    }
    if (!Array.isArray(codes) || codes.length === 0) {
      return { error: 'กรุณาเลือกนักเรียนอย่างน้อย 1 คน' }
    }

    // เอาเฉพาะรหัสที่มีจริงในปีที่ใช้งาน
    const students = await findSchoolStudentsByCodesAndYear(
      codes.map(String),
      active.academicYearId
    )
    if (students.length === 0) return { error: 'ไม่พบนักเรียนที่เลือกในปีการศึกษานี้' }

    // ข้ามคนที่ถูกมอบหมายโจทย์นี้แบบรายคนไปแล้ว
    const existing = await prisma.assignment.findMany({
      where: {
        problemId,
        academicYearId: active.academicYearId,
        semester: active.semester,
        studentCode: { in: students.map((s) => s.student_code) },
      },
      select: { studentCode: true },
    })
    const skip = new Set(existing.map((e) => e.studentCode))
    const toCreate = students.filter((s) => !skip.has(s.student_code))
    if (toCreate.length === 0) {
      return { error: 'นักเรียนที่เลือกได้รับมอบหมายโจทย์นี้แล้วทุกคน' }
    }

    await prisma.assignment.createMany({
      data: toCreate.map((s) => ({
        ...base,
        classLevel: s.class_level,
        classRoom: s.class_room,
        studentCode: s.student_code,
      })),
    })
  } else {
    return { error: 'รูปแบบการมอบหมายไม่ถูกต้อง' }
  }

  revalidatePath('/assign')
  redirect('/assign')
}

export async function deleteAssignment(id: number): Promise<ActionResult> {
  await requireTeacher()
  // ลบการมอบหมายแล้ว ผลการส่งงานของรายการนี้หายด้วย (cascade)
  await prisma.assignment.delete({ where: { id } }).catch(() => {})
  revalidatePath('/assign')
  return {}
}

export async function updateAssignmentDue(id: number, formData: FormData) {
  await requireTeacher()
  const dueAt = parseDue(formData)
  await prisma.assignment.update({ where: { id }, data: { dueAt } }).catch(() => {})
  revalidatePath(`/assign/${id}`)
  revalidatePath('/assign')
}

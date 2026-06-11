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

type RoomTarget = { type: 'room'; level: string; room: number }
type StudentTarget = { type: 'student'; code: string }
type TargetInput = RoomTarget | StudentTarget

// สร้างงาน — ชื่องาน + โจทย์หลายข้อ + เป้าหมายหลายห้อง/หลายคน
export async function createTask(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  await requireTeacher()

  const active = await getActiveSetting()
  if (!active) return { error: 'ต้องตั้งปีการศึกษาที่ใช้งานก่อน' }

  const title = (formData.get('title') as string)?.trim()
  if (!title) return { error: 'กรุณาตั้งชื่องาน เช่น "แบบฝึกหัดครั้งที่ 1"' }

  const dueRaw = (formData.get('dueAt') as string)?.trim()
  const dueAt = dueRaw ? new Date(dueRaw) : null

  // โจทย์ที่เลือก (เรียงตามลำดับที่ครูเลือก = ลำดับข้อ)
  let problemIds: unknown
  try {
    problemIds = JSON.parse((formData.get('problemIds') as string) ?? '[]')
  } catch {
    return { error: 'รายการโจทย์ไม่ถูกต้อง' }
  }
  if (!Array.isArray(problemIds) || problemIds.length === 0) {
    return { error: 'กรุณาเลือกโจทย์อย่างน้อย 1 ข้อ' }
  }
  const ids = problemIds.map(Number).filter((n) => Number.isInteger(n) && n > 0)
  const found = await prisma.problem.findMany({
    where: { id: { in: ids } },
    select: { id: true },
  })
  const foundIds = new Set(found.map((p) => p.id))
  const validIds = ids.filter((id) => foundIds.has(id))
  if (validIds.length === 0) return { error: 'ไม่พบโจทย์ที่เลือก' }

  // เป้าหมาย — ห้อง และ/หรือ รายคน
  let targetsRaw: unknown
  try {
    targetsRaw = JSON.parse((formData.get('targets') as string) ?? '[]')
  } catch {
    return { error: 'ข้อมูลเป้าหมายไม่ถูกต้อง' }
  }
  if (!Array.isArray(targetsRaw) || targetsRaw.length === 0) {
    return { error: 'กรุณาเลือกห้องหรือนักเรียนอย่างน้อย 1 รายการ' }
  }

  const roomTargets: { classLevel: string; classRoom: number; studentCode: null }[] = []
  const studentCodes: string[] = []
  for (const t of targetsRaw as TargetInput[]) {
    if (t?.type === 'room' && typeof t.level === 'string' && Number.isInteger(Number(t.room))) {
      roomTargets.push({ classLevel: t.level, classRoom: Number(t.room), studentCode: null })
    } else if (t?.type === 'student' && typeof t.code === 'string') {
      studentCodes.push(t.code)
    }
  }

  // รายคน: เอาเฉพาะที่มีจริงในปีที่ใช้งาน พร้อมชั้น/ห้องไว้แสดงผล
  const students = await findSchoolStudentsByCodesAndYear(studentCodes, active.academicYearId)
  // ตัดรายคนที่ห้องของเขาถูกมอบทั้งห้องอยู่แล้ว (ซ้ำซ้อน)
  const roomKey = new Set(roomTargets.map((r) => `${r.classLevel}|${r.classRoom}`))
  const studentTargets = students
    .filter((s) => !roomKey.has(`${s.class_level}|${s.class_room}`))
    .map((s) => ({
      classLevel: s.class_level,
      classRoom: s.class_room,
      studentCode: s.student_code,
    }))

  const targets = [...roomTargets, ...studentTargets]
  if (targets.length === 0) return { error: 'ไม่พบห้องหรือนักเรียนที่เลือก' }

  await prisma.assignment.create({
    data: {
      title,
      academicYearId: active.academicYearId,
      semester: active.semester,
      dueAt,
      problems: { create: validIds.map((problemId, i) => ({ problemId, sortOrder: i })) },
      targets: { create: targets },
    },
  })

  revalidatePath('/assign')
  redirect('/assign')
}

export async function deleteAssignment(id: number): Promise<ActionResult> {
  await requireTeacher()
  // ลบงานแล้ว โจทย์ในงาน/เป้าหมาย/ผลการส่ง หายตามด้วย (cascade) — ตัวโจทย์ในคลังไม่หาย
  await prisma.assignment.delete({ where: { id } }).catch(() => {})
  revalidatePath('/assign')
  return {}
}

export async function updateAssignmentDue(id: number, formData: FormData) {
  await requireTeacher()
  const raw = (formData.get('dueAt') as string)?.trim()
  const dueAt = raw ? new Date(raw) : null
  await prisma.assignment.update({ where: { id }, data: { dueAt } }).catch(() => {})
  revalidatePath(`/assign/${id}`)
  revalidatePath('/assign')
}

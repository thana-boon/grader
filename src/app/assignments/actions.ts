'use server'

import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth'
import { getActiveSetting } from '@/lib/academicYear'
import { findSchoolStudentByCodeAndYear } from '@/lib/students'
import { assignmentMatchesStudent } from '@/lib/assignments'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

export type SubmitResult = {
  error?: string
  passed?: number
  total?: number
}

// ผลตรวจ turtle — % ความเหมือนของภาพ + ภาพที่นักเรียนวาด (เก็บให้ครูดู)
export type TurtleResult = { percent: number; drawing: string | null }

// รับผลตรวจจากเบราว์เซอร์นักเรียน (ตรวจด้วย Pyodide ฝั่ง client ตามที่ออกแบบ)
// server ตรวจสิทธิ์/เงื่อนไขซ้ำทั้งหมด ยกเว้นผลรันโค้ดซึ่งต้องเชื่อ client
export async function submitAssignment(
  assignmentId: number,
  code: string,
  results: boolean[] | TurtleResult
): Promise<SubmitResult> {
  const user = await getCurrentUser()
  if (!user || user.role !== 'student') redirect('/login')

  if (!code.trim()) return { error: 'ยังไม่ได้เขียนโค้ด' }
  if (code.length > 50_000) return { error: 'โค้ดยาวเกินไป' }

  const active = await getActiveSetting()
  if (!active) return { error: 'ระบบยังไม่ได้ตั้งปีการศึกษาที่ใช้งาน' }

  const assignment = await prisma.assignment.findUnique({
    where: { id: assignmentId },
    include: {
      problem: { select: { id: true, language: true, testCases: { select: { id: true } } } },
    },
  })
  if (!assignment) return { error: 'ไม่พบงานนี้' }
  if (
    assignment.academicYearId !== active.academicYearId ||
    assignment.semester !== active.semester
  ) {
    return { error: 'งานนี้ไม่อยู่ในภาคเรียนปัจจุบัน' }
  }

  const student = await findSchoolStudentByCodeAndYear(
    user.studentCode ?? '',
    active.academicYearId
  )
  if (!student) return { error: 'ไม่พบข้อมูลนักเรียนในปีการศึกษานี้' }
  if (!assignmentMatchesStudent(assignment, student)) {
    return { error: 'งานนี้ไม่ได้มอบหมายให้คุณ' }
  }
  if (assignment.dueAt && new Date() > assignment.dueAt) {
    return { error: 'เลยกำหนดส่งแล้ว ไม่สามารถส่งงานได้' }
  }

  let passed: number
  let total: number
  let details: string | null

  if (assignment.problem.language === 'turtle') {
    // turtle: คะแนน = % ความเหมือนของภาพ (0-100), details = ภาพที่นักเรียนวาด
    if (Array.isArray(results) || typeof results?.percent !== 'number') {
      return { error: 'ผลการตรวจไม่ถูกต้อง กรุณากดส่งใหม่' }
    }
    passed = Math.max(0, Math.min(100, Math.round(results.percent)))
    total = 100
    details =
      typeof results.drawing === 'string' && results.drawing.length <= 1_000_000
        ? results.drawing
        : null
  } else {
    total = assignment.problem.testCases.length
    if (
      !Array.isArray(results) ||
      results.length !== total ||
      results.some((r) => typeof r !== 'boolean')
    ) {
      return { error: 'ผลการตรวจไม่ถูกต้อง กรุณากดส่งใหม่' }
    }
    passed = results.filter(Boolean).length
    details = JSON.stringify(results)
  }

  await prisma.submission.create({
    data: {
      assignmentId,
      studentCode: student.student_code,
      code,
      passed,
      total,
      details,
    },
  })

  revalidatePath('/dashboard/student')
  revalidatePath(`/assignments/${assignmentId}`)
  return { passed, total }
}

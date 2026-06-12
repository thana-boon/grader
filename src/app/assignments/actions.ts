'use server'

import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth'
import { getActiveSetting } from '@/lib/academicYear'
import { findSchoolStudentByCodeAndYear } from '@/lib/students'
import { targetsMatchStudent } from '@/lib/assignments'
import { attemptMultiplier, submissionScore } from '@/lib/scoring'
import { checkResults, type SubmittedResults } from '@/lib/submissionCheck'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

export type SubmitResult = {
  error?: string
  passed?: number
  total?: number
  // คะแนนของการส่งครั้งนี้ (หักตามนโยบายส่งซ้ำแล้ว)
  score?: number
  points?: number
  attempt?: number
  multiplier?: number
}

export type { TurtleResult, ScratchResult, SubmittedResults } from '@/lib/submissionCheck'

// รับผลตรวจจากเบราว์เซอร์นักเรียน (ตรวจด้วย Pyodide ฝั่ง client ตามที่ออกแบบ)
// server ตรวจสิทธิ์/เงื่อนไขซ้ำทั้งหมด ยกเว้นผลรันโค้ดซึ่งต้องเชื่อ client
export async function submitAssignment(
  assignmentId: number,
  problemId: number,
  code: string,
  results: SubmittedResults
): Promise<SubmitResult> {
  const user = await getCurrentUser()
  if (!user || user.role !== 'student') redirect('/login')

  if (!code.trim()) return { error: 'ยังไม่ได้เขียนโค้ด' }
  if (code.length > 50_000) return { error: 'โค้ดยาวเกินไป' }

  const active = await getActiveSetting()
  if (!active) return { error: 'ระบบยังไม่ได้ตั้งปีการศึกษาที่ใช้งาน' }

  // โจทย์ข้อนี้ต้องอยู่ในงานนี้จริง
  const taskProblem = await prisma.assignmentProblem.findUnique({
    where: { assignmentId_problemId: { assignmentId, problemId } },
    include: {
      assignment: { include: { targets: true } },
      problem: { select: { language: true, testCases: { select: { id: true } } } },
    },
  })
  if (!taskProblem) return { error: 'ไม่พบโจทย์ข้อนี้ในงาน' }

  const task = taskProblem.assignment
  if (task.academicYearId !== active.academicYearId || task.semester !== active.semester) {
    return { error: 'งานนี้ไม่อยู่ในภาคเรียนปัจจุบัน' }
  }

  const student = await findSchoolStudentByCodeAndYear(
    user.studentCode ?? '',
    active.academicYearId
  )
  if (!student) return { error: 'ไม่พบข้อมูลนักเรียนในปีการศึกษานี้' }
  if (!targetsMatchStudent(task.targets, student)) {
    return { error: 'งานนี้ไม่ได้มอบหมายให้คุณ' }
  }
  if (task.dueAt && new Date() > task.dueAt) {
    return { error: 'เลยกำหนดส่งแล้ว ไม่สามารถส่งงานได้' }
  }

  const checked = await checkResults(
    taskProblem.problem.language,
    taskProblem.problem.testCases.length,
    results
  )
  if (!checked.ok) return { error: checked.error }
  const { passed, total, details } = checked

  // ครั้งที่ส่ง = จำนวนที่เคยส่งแล้ว + 1 — ใช้คิดตัวหักตามนโยบายส่งซ้ำของงาน
  const attempt =
    (await prisma.submission.count({
      where: { assignmentId, problemId, studentCode: student.student_code },
    })) + 1
  const multiplier = attemptMultiplier(attempt, task)
  const score = submissionScore(passed, total, taskProblem.points, multiplier)

  await prisma.submission.create({
    data: {
      assignmentId,
      problemId,
      studentCode: student.student_code,
      code,
      passed,
      total,
      details,
    },
  })

  revalidatePath('/dashboard/student')
  revalidatePath(`/assignments/${assignmentId}`)
  return { passed, total, score, points: taskProblem.points, attempt, multiplier }
}

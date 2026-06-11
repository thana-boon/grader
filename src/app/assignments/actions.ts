'use server'

import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth'
import { getActiveSetting } from '@/lib/academicYear'
import { findSchoolStudentByCodeAndYear } from '@/lib/students'
import { targetsMatchStudent } from '@/lib/assignments'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

export type SubmitResult = {
  error?: string
  passed?: number
  total?: number
}

// ผลตรวจ turtle — % ความเหมือนของภาพ + ภาพที่นักเรียนวาด (เก็บให้ครูดู)
export type TurtleResult = { percent: number; drawing: string | null }

// ผลตรวจ scratch — ผ่าน/ไม่ผ่านรายเกณฑ์ + token ไฟล์ .sb3 ที่อัปโหลดไว้ + สถิติ
export type ScratchResult = {
  flags: boolean[]
  fileToken: string | null
  stats?: { spriteCount: number; totalBlocks: number }
}

// รับผลตรวจจากเบราว์เซอร์นักเรียน (ตรวจด้วย Pyodide ฝั่ง client ตามที่ออกแบบ)
// server ตรวจสิทธิ์/เงื่อนไขซ้ำทั้งหมด ยกเว้นผลรันโค้ดซึ่งต้องเชื่อ client
export async function submitAssignment(
  assignmentId: number,
  problemId: number,
  code: string,
  results: boolean[] | TurtleResult | ScratchResult
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

  let passed: number
  let total: number
  let details: string | null

  if (taskProblem.problem.language === 'scratch') {
    // scratch: ผ่าน/ไม่ผ่านรายเกณฑ์ + เก็บ token ไฟล์ .sb3 ไว้ให้ครูดาวน์โหลด
    if (Array.isArray(results) || !('flags' in results) || !Array.isArray(results.flags)) {
      return { error: 'ผลการตรวจไม่ถูกต้อง กรุณากดส่งใหม่' }
    }
    total = taskProblem.problem.testCases.length
    if (results.flags.length !== total || results.flags.some((f) => typeof f !== 'boolean')) {
      return { error: 'ผลการตรวจไม่ถูกต้อง กรุณากดส่งใหม่' }
    }
    const { SCRATCH_TOKEN_PATTERN } = await import('@/lib/scratchStorage')
    const fileToken =
      typeof results.fileToken === 'string' && SCRATCH_TOKEN_PATTERN.test(results.fileToken)
        ? results.fileToken
        : null
    passed = results.flags.filter(Boolean).length
    details = JSON.stringify({ file: fileToken, flags: results.flags, stats: results.stats ?? null })
  } else if (taskProblem.problem.language === 'turtle') {
    // turtle: คะแนน = % ความเหมือนของภาพ (0-100), details = ภาพที่นักเรียนวาด
    if (Array.isArray(results) || !('percent' in results) || typeof results.percent !== 'number') {
      return { error: 'ผลการตรวจไม่ถูกต้อง กรุณากดส่งใหม่' }
    }
    passed = Math.max(0, Math.min(100, Math.round(results.percent)))
    total = 100
    details =
      typeof results.drawing === 'string' && results.drawing.length <= 1_000_000
        ? results.drawing
        : null
  } else {
    total = taskProblem.problem.testCases.length
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
  return { passed, total }
}

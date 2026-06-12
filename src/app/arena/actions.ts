'use server'

import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth'
import { competitionState } from '@/lib/competition'
import { submissionScore } from '@/lib/scoring'
import { checkResults, type SubmittedResults } from '@/lib/submissionCheck'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import type { SubmitResult } from '@/app/assignments/actions'

// รับคำตอบจากผู้เข้าแข่ง — ตรวจในเบราว์เซอร์แล้วบันทึกผล (แบบเดียวกับงานมอบหมาย)
// ส่งซ้ำได้ไม่จำกัดระหว่างเวลาแข่ง คะแนนนับครั้งที่ดีที่สุด
export async function submitCompetition(
  problemId: number,
  code: string,
  results: SubmittedResults
): Promise<SubmitResult> {
  const user = await getCurrentUser()
  if (!user || user.role !== 'contestant' || !user.competitionId) redirect('/login')

  if (!code.trim()) return { error: 'ยังไม่ได้เขียนโค้ด' }
  if (code.length > 50_000) return { error: 'โค้ดยาวเกินไป' }

  const cp = await prisma.competitionProblem.findUnique({
    where: {
      competitionId_problemId: { competitionId: user.competitionId, problemId },
    },
    include: {
      competition: true,
      problem: { select: { language: true, testCases: { select: { id: true } } } },
    },
  })
  if (!cp) return { error: 'ไม่พบโจทย์ข้อนี้ในการแข่งขัน' }

  const state = competitionState(cp.competition)
  if (state === 'pending') return { error: 'การแข่งขันยังไม่เริ่ม' }
  if (state === 'ended') return { error: 'หมดเวลาแข่งขันแล้ว ไม่สามารถส่งได้' }

  const checked = await checkResults(cp.problem.language, cp.problem.testCases.length, results)
  if (!checked.ok) return { error: checked.error }
  const { passed, total, details } = checked

  await prisma.competitionSubmission.create({
    data: {
      competitionId: user.competitionId,
      problemId,
      contestantId: user.userId,
      code,
      passed,
      total,
      details,
    },
  })

  const score = submissionScore(passed, total, cp.points, 1)
  revalidatePath('/arena')
  return { passed, total, score, points: cp.points }
}

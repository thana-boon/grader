import { getCurrentUser } from '@/lib/auth'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import { getActiveSetting } from '@/lib/academicYear'
import { findSchoolStudentByCodeAndYear } from '@/lib/students'
import { targetsMatchStudent } from '@/lib/assignments'
import { languageLabel } from '@/lib/languages'
import { bestScore, formatScore } from '@/lib/scoring'
import Navbar from '@/components/Navbar'

export default async function TaskPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const user = await getCurrentUser()
  if (!user || user.role !== 'student') redirect('/login')

  const { id: idRaw } = await params
  const id = parseInt(idRaw)
  if (!id) notFound()

  const active = await getActiveSetting()
  if (!active) redirect('/dashboard/student')

  const student = await findSchoolStudentByCodeAndYear(
    user.studentCode ?? '',
    active.academicYearId
  )
  if (!student) redirect('/dashboard/student')

  const task = await prisma.assignment.findUnique({
    where: { id },
    include: {
      targets: true,
      problems: {
        orderBy: { sortOrder: 'asc' },
        include: { problem: { select: { id: true, title: true, language: true } } },
      },
    },
  })
  // เปิดได้เฉพาะงานที่มอบหมายถึงตัวเอง ในเทอมปัจจุบัน
  if (
    !task ||
    task.academicYearId !== active.academicYearId ||
    task.semester !== active.semester ||
    !targetsMatchStudent(task.targets, student)
  ) {
    notFound()
  }

  // การส่งทุกครั้งของแต่ละข้อ เรียงเก่า→ใหม่ (ลำดับ = ครั้งที่ส่ง ใช้คิดคะแนน)
  const submissions = await prisma.submission.findMany({
    where: { assignmentId: id, studentCode: student.student_code },
    orderBy: { createdAt: 'asc' },
  })
  const byProblem = new Map<number, typeof submissions>()
  for (const s of submissions) {
    const arr = byProblem.get(s.problemId)
    if (arr) arr.push(s)
    else byProblem.set(s.problemId, [s])
  }

  const policy = { freeAttempts: task.freeAttempts, penaltyPercent: task.penaltyPercent }
  const totalPoints = task.problems.reduce((sum, tp) => sum + tp.points, 0)
  const myScore = task.problems.reduce((sum, tp) => {
    const subs = byProblem.get(tp.problem.id)
    return sum + (subs ? bestScore(subs, tp.points, policy) : 0)
  }, 0)

  const doneCount = task.problems.filter((tp) => byProblem.has(tp.problem.id)).length
  const overdue = task.dueAt !== null && new Date() > task.dueAt

  return (
    <div className="min-h-screen bg-page">
      <Navbar user={user} />
      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-6">
        <div className="mb-6">
          <Link
            href="/dashboard/student"
            className="text-sm text-gray-500 hover:text-indigo-600"
          >
            ← กลับหน้าหลัก
          </Link>
          <div className="flex flex-wrap items-center gap-3 mt-2">
            <h1 className="text-2xl font-bold text-gray-900">{task.title}</h1>
            <span
              className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${
                doneCount === task.problems.length
                  ? 'bg-green-100 text-green-700'
                  : 'bg-gray-100 text-gray-600'
              }`}
            >
              ทำแล้ว {doneCount}/{task.problems.length} ข้อ
            </span>
            <span
              className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${
                doneCount > 0 && myScore >= totalPoints
                  ? 'bg-green-100 text-green-700'
                  : 'bg-indigo-100 text-indigo-700'
              }`}
            >
              ได้ {formatScore(myScore)}/{totalPoints} คะแนน
            </span>
          </div>
          <p className="text-sm text-gray-500 mt-1">
            {task.dueAt
              ? `กำหนดส่ง ${task.dueAt.toLocaleString('th-TH', {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                })}${overdue ? ' (เลยกำหนดแล้ว — ส่งงานไม่ได้)' : ''}`
              : 'ไม่มีกำหนดส่ง'}
            {task.freeAttempts > 0
              ? ` · ส่งได้ ${task.freeAttempts} ครั้งโดยไม่หักคะแนน เกินแล้วเพดานคะแนนลดครั้งละ ${task.penaltyPercent}% (คิดจากครั้งที่ดีที่สุด)`
              : ' · ส่งซ้ำได้ไม่จำกัด คะแนนคิดจากครั้งที่ดีที่สุด'}
          </p>
        </div>

        {/* รายการข้อ */}
        <div className="bg-white rounded-2xl border border-indigo-100 shadow-sm overflow-hidden">
          <ul className="divide-y divide-gray-100">
            {task.problems.map((tp, i) => {
              const subs = byProblem.get(tp.problem.id)
              const score = subs ? bestScore(subs, tp.points, policy) : null
              return (
                <li key={tp.id}>
                  <Link
                    href={`/assignments/${task.id}/${tp.problem.id}`}
                    className="flex items-center justify-between px-6 py-4 hover:bg-gray-50 transition"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${
                          score !== null && score >= tp.points
                            ? 'bg-green-100 text-green-700'
                            : score !== null
                              ? 'bg-amber-100 text-amber-700'
                              : 'bg-gray-100 text-gray-500'
                        }`}
                      >
                        {i + 1}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">
                          {tp.problem.title}
                        </p>
                        <p className="text-xs text-gray-500">
                          {languageLabel(tp.problem.language)}
                          {subs && ` · ส่งแล้ว ${subs.length} ครั้ง`}
                        </p>
                      </div>
                    </div>
                    <div className="shrink-0 ml-3">
                      {score !== null ? (
                        <span
                          className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${
                            score >= tp.points
                              ? 'bg-green-100 text-green-700'
                              : 'bg-amber-100 text-amber-700'
                          }`}
                        >
                          {formatScore(score)}/{tp.points} คะแนน
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-500">
                          ยังไม่ส่ง · {tp.points} คะแนน
                        </span>
                      )}
                    </div>
                  </Link>
                </li>
              )
            })}
          </ul>
        </div>
      </main>
    </div>
  )
}

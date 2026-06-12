import { getCurrentUser } from '@/lib/auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import { getActiveSetting } from '@/lib/academicYear'
import { findSchoolStudentByCodeAndYear } from '@/lib/students'
import { targetOrFilter } from '@/lib/assignments'
import { bestScore, formatScore } from '@/lib/scoring'
import Playground from '@/components/Playground'

export default async function StudentDashboard({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>
}) {
  const user = await getCurrentUser()
  if (!user || user.role !== 'student') redirect('/login')

  const { tab: tabParam } = await searchParams
  const tab = tabParam === 'tasks' ? 'tasks' : 'ide'

  const activeYear = await getActiveSetting()
  const student = activeYear
    ? await findSchoolStudentByCodeAndYear(user.studentCode ?? '', activeYear.academicYearId)
    : null

  // งานที่มอบหมายถึงนักเรียนคนนี้ (ทั้งห้องหรือรายคน) ในเทอมที่ใช้งานอยู่
  const tasks =
    activeYear && student
      ? await prisma.assignment.findMany({
          where: {
            academicYearId: activeYear.academicYearId,
            semester: activeYear.semester,
            targets: { some: { OR: targetOrFilter(student) } },
          },
          include: { problems: { select: { problemId: true, points: true } } },
          orderBy: { createdAt: 'desc' },
        })
      : []

  // ความคืบหน้า: การส่งทุกครั้ง เรียงเก่า→ใหม่ ต่อ (งาน, ข้อ) — ใช้คิดคะแนนครั้งที่ดีที่สุด
  const submissions =
    student && tasks.length
      ? await prisma.submission.findMany({
          where: {
            assignmentId: { in: tasks.map((t) => t.id) },
            studentCode: student.student_code,
          },
          orderBy: { createdAt: 'asc' },
        })
      : []
  const byKey = new Map<string, typeof submissions>()
  for (const s of submissions) {
    const key = `${s.assignmentId}:${s.problemId}`
    const arr = byKey.get(key)
    if (arr) arr.push(s)
    else byKey.set(key, [s])
  }
  const progress = (t: (typeof tasks)[number]) => {
    const policy = { freeAttempts: t.freeAttempts, penaltyPercent: t.penaltyPercent }
    let done = 0
    let score = 0
    let totalPoints = 0
    for (const p of t.problems) {
      totalPoints += p.points
      const subs = byKey.get(`${t.id}:${p.problemId}`)
      if (subs) {
        done++
        score += bestScore(subs, p.points, policy)
      }
    }
    return { done, score, totalPoints }
  }

  const now = new Date()

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">
          สวัสดี, {user.name} 👋
        </h1>
        <p className="text-gray-500 mt-1">
          รหัสนักเรียน: {user.studentCode}
          {student && ` · ${student.class_level} ห้อง ${student.class_room} เลขที่ ${student.number_in_room}`}
          {activeYear && ` · ${activeYear.label}`}
        </p>
      </div>

      {/* แท็บ: เขียนโค้ดอิสระ (IDE) / งานที่ได้รับมอบหมาย */}
      <div className="flex flex-wrap gap-1 border-b border-gray-200 mb-4">
        {[
          { key: 'ide', label: '💻 เขียนโค้ด' },
          { key: 'tasks', label: `📋 งานของฉัน (${tasks.length})` },
        ].map((t) => (
          <Link
            key={t.key}
            href={t.key === 'ide' ? '/dashboard/student' : '/dashboard/student?tab=tasks'}
            className={`px-4 py-2 text-sm font-medium rounded-t-lg border-b-2 -mb-px transition ${
              tab === t.key
                ? 'border-indigo-600 text-indigo-700 bg-white'
                : 'border-transparent text-gray-500 hover:text-indigo-600 hover:bg-gray-100'
            }`}
          >
            {t.label}
          </Link>
        ))}
      </div>

      {tab === 'ide' && <Playground />}

      {/* งานที่ได้รับมอบหมาย */}
      <div
        className={`bg-white rounded-2xl border border-indigo-100 shadow-sm overflow-hidden ${
          tab === 'tasks' ? '' : 'hidden'
        }`}
      >
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">
            งานของฉัน ({tasks.length})
          </h2>
        </div>

        {!activeYear || !student ? (
          <div className="px-6 py-10 text-center text-gray-400 text-sm">
            ยังไม่พบข้อมูลของคุณในปีการศึกษาปัจจุบัน
          </div>
        ) : tasks.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <svg
              className="w-12 h-12 text-gray-300 mx-auto mb-3"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"
              />
            </svg>
            <p className="text-gray-400 font-medium">ยังไม่มีงานที่ได้รับมอบหมาย</p>
            <p className="text-gray-300 text-sm mt-1">งานจากครูจะปรากฏที่นี่</p>
          </div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {tasks.map((t) => {
              const { done, score, totalPoints } = progress(t)
              const totalProblems = t.problems.length
              const overdue = t.dueAt !== null && now > t.dueAt
              return (
                <li key={t.id}>
                  <Link
                    href={`/assignments/${t.id}`}
                    className="flex items-center justify-between px-6 py-4 hover:bg-gray-50 transition"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-gray-900 truncate">
                          {t.title}
                        </p>
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-700 shrink-0">
                          {totalProblems} ข้อ
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {t.dueAt
                          ? `กำหนดส่ง ${t.dueAt.toLocaleString('th-TH', {
                              dateStyle: 'medium',
                              timeStyle: 'short',
                            })}`
                          : 'ไม่มีกำหนดส่ง'}
                        {overdue && done < totalProblems && (
                          <span className="text-red-500"> · เลยกำหนดแล้ว</span>
                        )}
                      </p>
                    </div>
                    <div className="shrink-0 ml-3">
                      {done > 0 ? (
                        <span
                          className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${
                            done === totalProblems && score >= totalPoints
                              ? 'bg-green-100 text-green-700'
                              : 'bg-amber-100 text-amber-700'
                          }`}
                        >
                          ทำแล้ว {done}/{totalProblems} ข้อ · ได้ {formatScore(score)}/
                          {totalPoints} คะแนน
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-500">
                          ยังไม่เริ่ม
                        </span>
                      )}
                    </div>
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}

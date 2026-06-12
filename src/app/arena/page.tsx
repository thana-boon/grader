import { getCurrentUser } from '@/lib/auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import { competitionState, competitionEndsAt } from '@/lib/competition'
import { bestScore, formatScore, roundScore } from '@/lib/scoring'
import { languageLabel } from '@/lib/languages'
import Navbar from '@/components/Navbar'
import Countdown from '@/components/Countdown'
import AutoRefresh from '@/components/AutoRefresh'
import LogoutButton from '@/components/LogoutButton'

// ไม่หักคะแนนส่งซ้ำในการแข่งขัน — นับครั้งที่ดีที่สุด
const NO_PENALTY = { freeAttempts: 0, penaltyPercent: 0 }

export default async function ArenaPage() {
  const user = await getCurrentUser()
  if (!user || user.role !== 'contestant' || !user.competitionId) redirect('/login')

  const contestant = await prisma.contestant.findUnique({ where: { id: user.userId } })
  const comp = contestant
    ? await prisma.competition.findUnique({
        where: { id: user.competitionId },
        include: {
          problems: {
            orderBy: { sortOrder: 'asc' },
            include: { problem: { select: { id: true, title: true, language: true } } },
          },
        },
      })
    : null

  // บัญชีถูกลบระหว่างทาง — แสดงข้อความแทน redirect (กัน loop กับ middleware)
  if (!contestant || !comp) {
    return (
      <div className="min-h-screen bg-page flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl border border-indigo-100 shadow-sm p-8 text-center max-w-sm">
          <p className="text-gray-700 mb-4">บัญชีนี้ถูกยกเลิกแล้ว — ติดต่อกรรมการ</p>
          <LogoutButton />
        </div>
      </div>
    )
  }

  const state = competitionState(comp)
  const endsAt = competitionEndsAt(comp)
  const totalPoints = comp.problems.reduce((sum, cp) => sum + cp.points, 0)

  const submissions = await prisma.competitionSubmission.findMany({
    where: { competitionId: comp.id, contestantId: contestant.id },
    orderBy: { createdAt: 'asc' },
    select: { problemId: true, passed: true, total: true },
  })
  const byProblem = new Map<number, typeof submissions>()
  for (const s of submissions) {
    const arr = byProblem.get(s.problemId)
    if (arr) arr.push(s)
    else byProblem.set(s.problemId, [s])
  }
  const myTotal = roundScore(
    comp.problems.reduce((sum, cp) => {
      const subs = byProblem.get(cp.problemId)
      return sum + (subs ? bestScore(subs, cp.points, NO_PENALTY) : 0)
    }, 0)
  )

  return (
    <div className="min-h-screen bg-page">
      <Navbar user={user} />
      {state === 'pending' && <AutoRefresh seconds={5} />}
      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">🏆 {comp.title}</h1>
          <p className="text-gray-500 mt-1">
            {comp.problems.length} ข้อ · เต็ม {totalPoints} คะแนน · เวลาแข่ง {comp.durationMinutes}{' '}
            นาที · ส่งซ้ำได้ไม่จำกัด นับครั้งที่ดีที่สุด
          </p>
        </div>

        {state === 'pending' && (
          <div className="bg-white rounded-2xl border border-indigo-100 shadow-sm p-10 text-center">
            <div className="text-5xl mb-4">⏳</div>
            <p className="text-lg font-semibold text-gray-900">รอกรรมการเปิดการแข่งขัน</p>
            <p className="text-sm text-gray-500 mt-2">
              หน้านี้จะเริ่มเองอัตโนมัติเมื่อการแข่งขันเริ่ม — ไม่ต้องรีเฟรช
            </p>
          </div>
        )}

        {state !== 'pending' && (
          <>
            <div className="bg-white rounded-2xl border border-indigo-100 shadow-sm p-5 mb-4 flex flex-wrap items-center justify-between gap-3">
              {state === 'running' && endsAt ? (
                <p className="text-gray-600 flex items-center gap-2">
                  เหลือเวลา{' '}
                  <span className="text-3xl">
                    <Countdown endsAt={endsAt.getTime()} />
                  </span>
                </p>
              ) : (
                <p className="text-lg font-semibold text-amber-700">หมดเวลาแข่งขันแล้ว</p>
              )}
              <p className="text-gray-600">
                คะแนนของฉัน:{' '}
                <span className="text-2xl font-bold text-indigo-700">
                  {formatScore(myTotal)}
                </span>
                <span className="text-gray-400"> / {totalPoints}</span>
              </p>
            </div>

            <div className="bg-white rounded-2xl border border-indigo-100 shadow-sm overflow-hidden">
              <ul className="divide-y divide-gray-100">
                {comp.problems.map((cp, i) => {
                  const subs = byProblem.get(cp.problemId)
                  const score = subs ? bestScore(subs, cp.points, NO_PENALTY) : null
                  return (
                    <li key={cp.id}>
                      <Link
                        href={`/arena/${cp.problemId}`}
                        className="flex items-center justify-between px-6 py-4 hover:bg-gray-50 transition"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div
                            className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${
                              score !== null && score >= cp.points
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
                              {cp.problem.title}
                            </p>
                            <p className="text-xs text-gray-500">
                              {languageLabel(cp.problem.language)}
                              {subs && ` · ส่งแล้ว ${subs.length} ครั้ง`}
                            </p>
                          </div>
                        </div>
                        <div className="shrink-0 ml-3">
                          {score !== null ? (
                            <span
                              className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${
                                score >= cp.points
                                  ? 'bg-green-100 text-green-700'
                                  : 'bg-amber-100 text-amber-700'
                              }`}
                            >
                              {formatScore(score)}/{cp.points} คะแนน
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-500">
                              ยังไม่ส่ง · {cp.points} คะแนน
                            </span>
                          )}
                        </div>
                      </Link>
                    </li>
                  )
                })}
              </ul>
            </div>
          </>
        )}
      </main>
    </div>
  )
}

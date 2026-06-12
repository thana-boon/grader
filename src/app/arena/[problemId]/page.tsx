import { getCurrentUser } from '@/lib/auth'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import { competitionState, competitionEndsAt } from '@/lib/competition'
import { bestScore, formatScore } from '@/lib/scoring'
import { languageLabel } from '@/lib/languages'
import Navbar from '@/components/Navbar'
import Countdown from '@/components/Countdown'
import Workspace from '@/app/assignments/[id]/Workspace'
import { submitCompetition } from '../actions'

export default async function ArenaProblemPage({
  params,
}: {
  params: Promise<{ problemId: string }>
}) {
  const user = await getCurrentUser()
  if (!user || user.role !== 'contestant' || !user.competitionId) redirect('/login')

  const { problemId: pidRaw } = await params
  const problemId = parseInt(pidRaw)
  if (!problemId) notFound()

  const cp = await prisma.competitionProblem.findUnique({
    where: {
      competitionId_problemId: { competitionId: user.competitionId, problemId },
    },
    include: {
      competition: { include: { problems: { select: { problemId: true }, orderBy: { sortOrder: 'asc' } } } },
      problem: { include: { testCases: { orderBy: { sortOrder: 'asc' } } } },
    },
  })
  if (!cp) notFound()

  const comp = cp.competition
  const state = competitionState(comp)
  if (state === 'pending') redirect('/arena') // ยังไม่เริ่ม — ห้ามเห็นโจทย์
  const endsAt = competitionEndsAt(comp)

  const problem = cp.problem
  const problemNumber = comp.problems.findIndex((p) => p.problemId === problemId) + 1

  const submissions = await prisma.competitionSubmission.findMany({
    where: { competitionId: comp.id, problemId, contestantId: user.userId },
    orderBy: { createdAt: 'asc' },
  })
  const lastSubmission = submissions.at(-1) ?? null
  const myScore =
    submissions.length > 0
      ? bestScore(submissions, cp.points, { freeAttempts: 0, penaltyPercent: 0 })
      : null

  return (
    <div className="min-h-screen bg-page">
      <Navbar user={user} />
      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
        <div className="mb-5">
          <Link href="/arena" className="text-sm text-gray-500 hover:text-indigo-600">
            ← กลับสนามแข่ง
          </Link>
          <div className="flex flex-wrap items-center gap-3 mt-2">
            <h1 className="text-2xl font-bold text-gray-900">
              ข้อ {problemNumber}: {problem.title}
            </h1>
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
              {languageLabel(problem.language)}
            </span>
            <span
              className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                myScore !== null && myScore >= cp.points
                  ? 'bg-green-100 text-green-700'
                  : myScore !== null
                    ? 'bg-amber-100 text-amber-700'
                    : 'bg-gray-100 text-gray-600'
              }`}
            >
              คะแนน {myScore !== null ? formatScore(myScore) : '—'}/{cp.points}
            </span>
            {state === 'running' && endsAt ? (
              <span className="text-lg ml-auto">
                ⏱ <Countdown endsAt={endsAt.getTime()} />
              </span>
            ) : (
              <span className="text-sm font-medium text-amber-700 ml-auto">
                หมดเวลาแล้ว — ส่งไม่ได้
              </span>
            )}
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-indigo-100 shadow-sm p-5 mb-4">
          <h2 className="text-base font-semibold text-gray-900 mb-2">คำสั่ง</h2>
          <p className="text-sm text-gray-700 whitespace-pre-wrap">{problem.description}</p>
        </div>

        <Workspace
          onSubmit={submitCompetition.bind(null, problem.id)}
          language={problem.language}
          starterCode={problem.starterCode ?? ''}
          testCases={
            problem.language === 'turtle'
              ? []
              : problem.testCases.map((tc) => ({
                  input: tc.input,
                  expectedOutput: tc.expectedOutput,
                  isHidden: tc.isHidden,
                }))
          }
          expectedDrawing={
            problem.language === 'turtle'
              ? (problem.testCases[0]?.expectedOutput ?? null)
              : null
          }
          dataset={
            problem.datasetName && problem.datasetContent
              ? { name: problem.datasetName, content: problem.datasetContent }
              : null
          }
          lastCode={lastSubmission?.code ?? null}
          canSubmit={state === 'running'}
          points={cp.points}
          attemptsUsed={submissions.length}
          freeAttempts={0}
          penaltyPercent={0}
        />
      </main>
    </div>
  )
}

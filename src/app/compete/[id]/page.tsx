import { getCurrentUser } from '@/lib/auth'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import { competitionState, competitionEndsAt } from '@/lib/competition'
import { submissionScore, formatScore, roundScore } from '@/lib/scoring'
import Navbar from '@/components/Navbar'
import Countdown from '@/components/Countdown'
import AutoRefresh from '@/components/AutoRefresh'
import DeleteCompetitionButton from '../DeleteCompetitionButton'
import { startCompetition, endCompetition } from '../actions'
import { GenerateForm, AddForm, DeleteContestantButton } from './ContestantForms'

export default async function CompetitionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const user = await getCurrentUser()
  if (!user || user.role !== 'teacher') redirect('/login')

  const { id: idRaw } = await params
  const id = parseInt(idRaw)
  if (!id) notFound()

  const comp = await prisma.competition.findUnique({
    where: { id },
    include: {
      problems: {
        orderBy: { sortOrder: 'asc' },
        include: { problem: { select: { id: true, title: true, language: true } } },
      },
      contestants: { orderBy: { username: 'asc' } },
      submissions: { orderBy: { createdAt: 'asc' } },
    },
  })
  if (!comp) notFound()

  const state = competitionState(comp)
  const endsAt = competitionEndsAt(comp)
  const totalPoints = comp.problems.reduce((sum, cp) => sum + cp.points, 0)

  // คะแนนรายคน: ข้อละครั้งที่ดีที่สุด — เสมอกันให้คนที่ทำคะแนนนั้นได้ก่อนชนะ
  const byKey = new Map<string, typeof comp.submissions>()
  for (const s of comp.submissions) {
    const key = `${s.contestantId}:${s.problemId}`
    const arr = byKey.get(key)
    if (arr) arr.push(s)
    else byKey.set(key, [s])
  }
  const rows = comp.contestants.map((c) => {
    let total = 0
    let lastBestAt = 0
    const perProblem = comp.problems.map((cp) => {
      const subs = byKey.get(`${c.id}:${cp.problemId}`)
      if (!subs) return null
      let best = 0
      let bestAt = 0
      for (const s of subs) {
        const sc = submissionScore(s.passed, s.total, cp.points, 1)
        if (sc > best) {
          best = sc
          bestAt = s.createdAt.getTime()
        }
      }
      total += best
      if (best > 0) lastBestAt = Math.max(lastBestAt, bestAt)
      return { best, tries: subs.length }
    })
    return { contestant: c, perProblem, total: roundScore(total), lastBestAt }
  })
  const ranked = [...rows].sort(
    (a, b) => b.total - a.total || a.lastBestAt - b.lastBestAt
  )

  return (
    <div className="min-h-screen bg-page">
      <Navbar user={user} />
      {state === 'running' && <AutoRefresh seconds={30} />}
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
        <div className="mb-6">
          <Link href="/compete" className="text-sm text-gray-500 hover:text-indigo-600">
            ← กลับหน้าแข่งขัน
          </Link>
          <div className="flex items-center justify-between mt-2 gap-3">
            <h1 className="text-2xl font-bold text-gray-900 min-w-0">{comp.title}</h1>
            <div className="shrink-0">
              <DeleteCompetitionButton id={comp.id} label={comp.title} redirectTo="/compete" />
            </div>
          </div>
          <p className="text-gray-500 mt-1">
            {comp.problems.length} ข้อ · เต็ม {totalPoints} คะแนน · เวลาแข่ง {comp.durationMinutes}{' '}
            นาที · ผู้เข้าแข่ง {comp.contestants.length} คน
          </p>
          <p className="text-sm text-gray-500 mt-1">
            โจทย์:{' '}
            {comp.problems.map((cp, i) => (
              <span key={cp.id}>
                {i > 0 && ' · '}
                <Link href={`/problems/${cp.problemId}`} className="text-indigo-600 hover:underline">
                  ข้อ {i + 1} {cp.problem.title} ({cp.points} คะแนน)
                </Link>
              </span>
            ))}
          </p>
        </div>

        {/* สถานะ + ปุ่มเริ่ม/จบ */}
        <div className="bg-white rounded-2xl border border-indigo-100 shadow-sm p-5 mb-6 flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm">
            {state === 'pending' && (
              <p className="text-gray-600">
                ยังไม่เริ่มแข่ง — แจกบัญชีให้ผู้เข้าแข่งล็อกอินรอไว้ แล้วกด &quot;เริ่มการแข่งขัน&quot;
              </p>
            )}
            {state === 'running' && endsAt && (
              <p className="text-gray-600 flex items-center gap-2">
                กำลังแข่ง — เหลือเวลา{' '}
                <span className="text-2xl">
                  <Countdown endsAt={endsAt.getTime()} />
                </span>
              </p>
            )}
            {state === 'ended' && (
              <p className="text-amber-700 font-medium">
                การแข่งขันจบแล้ว — ผลคะแนนอยู่ในตารางด้านล่าง
              </p>
            )}
          </div>
          <div className="flex gap-2">
            {state === 'pending' && (
              <form action={startCompetition.bind(null, comp.id)}>
                <button className="px-5 py-2.5 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 transition">
                  ▶ เริ่มการแข่งขัน
                </button>
              </form>
            )}
            {state === 'running' && (
              <form action={endCompetition.bind(null, comp.id)}>
                <button className="px-5 py-2.5 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 transition">
                  ⏹ จบการแข่งขันตอนนี้
                </button>
              </form>
            )}
            {state === 'ended' && (
              <form action={startCompetition.bind(null, comp.id)}>
                <button className="px-5 py-2.5 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 transition">
                  ▶ เริ่มแข่งรอบใหม่
                </button>
              </form>
            )}
          </div>
        </div>

        {/* บัญชีผู้เข้าแข่ง */}
        <div className="bg-white rounded-2xl border border-indigo-100 shadow-sm p-5 mb-6">
          <h2 className="text-base font-semibold text-gray-900 mb-1">
            บัญชีผู้เข้าแข่ง ({comp.contestants.length})
          </h2>
          <p className="text-xs text-gray-400 mb-4">
            บัญชีชั่วคราว — ใช้ล็อกอินที่หน้า login ปกติ เข้าได้เฉพาะสนามแข่ง
            พิมพ์ตารางนี้แจกผู้เข้าแข่งได้เลย
          </p>
          <div className="flex flex-col gap-3 mb-4">
            <GenerateForm competitionId={comp.id} />
            <AddForm competitionId={comp.id} />
          </div>
          {comp.contestants.length > 0 && (
            <div className="overflow-x-auto border border-gray-200 rounded-lg">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-left text-gray-500 border-b border-gray-200">
                    <th className="px-4 py-2.5 font-medium">username</th>
                    <th className="px-4 py-2.5 font-medium">password</th>
                    <th className="px-4 py-2.5 font-medium">ชื่อที่แสดง</th>
                    <th className="px-4 py-2.5 font-medium text-right"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {comp.contestants.map((c) => (
                    <tr key={c.id} className="hover:bg-gray-50">
                      <td className="px-4 py-2 font-mono text-gray-900">{c.username}</td>
                      <td className="px-4 py-2 font-mono text-gray-900">{c.password}</td>
                      <td className="px-4 py-2 text-gray-600">{c.displayName}</td>
                      <td className="px-4 py-2 text-right">
                        <DeleteContestantButton id={c.id} username={c.username} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ตารางคะแนน */}
        <div className="bg-white rounded-2xl border border-indigo-100 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <h2 className="text-base font-semibold text-gray-900">ตารางคะแนน</h2>
            {state === 'running' && (
              <span className="text-xs text-gray-400">อัปเดตอัตโนมัติทุก 30 วินาที</span>
            )}
          </div>
          {ranked.length === 0 ? (
            <div className="px-6 py-10 text-center text-gray-400 text-sm">
              ยังไม่มีผู้เข้าแข่ง
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-left text-gray-500 border-b border-gray-200">
                    <th className="px-4 py-3 font-medium">อันดับ</th>
                    <th className="px-4 py-3 font-medium">ผู้เข้าแข่ง</th>
                    {comp.problems.map((cp, i) => (
                      <th
                        key={cp.id}
                        className="px-4 py-3 font-medium text-center"
                        title={cp.problem.title}
                      >
                        ข้อ {i + 1}
                        <span className="block text-xs font-normal text-gray-400">
                          {cp.points} คะแนน
                        </span>
                      </th>
                    ))}
                    <th className="px-4 py-3 font-medium text-center">
                      รวม
                      <span className="block text-xs font-normal text-gray-400">
                        {totalPoints} คะแนน
                      </span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {ranked.map((row, idx) => (
                    <tr key={row.contestant.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <span
                          className={`font-bold ${
                            idx === 0 && row.total > 0 ? 'text-amber-500' : 'text-gray-500'
                          }`}
                        >
                          {idx + 1}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-gray-900 font-medium">{row.contestant.displayName}</p>
                        <p className="text-xs text-gray-400 font-mono">{row.contestant.username}</p>
                      </td>
                      {row.perProblem.map((pp, i) => (
                        <td key={i} className="px-4 py-3 text-center">
                          {pp ? (
                            <span
                              title={`ส่ง ${pp.tries} ครั้ง`}
                              className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                                pp.best >= comp.problems[i].points
                                  ? 'bg-green-100 text-green-700'
                                  : 'bg-amber-100 text-amber-700'
                              }`}
                            >
                              {formatScore(pp.best)}
                            </span>
                          ) : (
                            <span className="text-gray-300">—</span>
                          )}
                        </td>
                      ))}
                      <td className="px-4 py-3 text-center">
                        <span
                          className={`text-sm font-bold ${
                            row.total >= totalPoints && row.total > 0
                              ? 'text-green-600'
                              : 'text-gray-700'
                          }`}
                        >
                          {formatScore(row.total)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}

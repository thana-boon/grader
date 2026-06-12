import { getCurrentUser } from '@/lib/auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import { competitionState, competitionEndsAt } from '@/lib/competition'
import Navbar from '@/components/Navbar'
import Countdown from '@/components/Countdown'
import DeleteCompetitionButton from './DeleteCompetitionButton'

export default async function CompeteListPage() {
  const user = await getCurrentUser()
  if (!user || user.role !== 'teacher') redirect('/login')

  const comps = await prisma.competition.findMany({
    orderBy: { createdAt: 'desc' },
    include: { _count: { select: { problems: true, contestants: true } } },
  })

  const stateBadge = (c: (typeof comps)[number]) => {
    const state = competitionState(c)
    if (state === 'pending')
      return (
        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
          ยังไม่เริ่ม
        </span>
      )
    if (state === 'running') {
      const ends = competitionEndsAt(c)!
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">
          กำลังแข่ง · เหลือ <Countdown endsAt={ends.getTime()} />
        </span>
      )
    }
    return (
      <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-700">
        จบแล้ว
      </span>
    )
  }

  return (
    <div className="min-h-screen bg-page">
      <Navbar user={user} />
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">แข่งขัน</h1>
            <p className="text-gray-500 mt-1">
              สร้างรายการแข่ง แจกบัญชีชั่วคราวให้ผู้เข้าแข่ง แล้วกดเริ่มเพื่อนับถอยหลัง
            </p>
          </div>
          <Link
            href="/compete/new"
            className="px-4 py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition shrink-0"
          >
            + สร้างรายการแข่งขัน
          </Link>
        </div>

        <div className="bg-white rounded-2xl border border-indigo-100 shadow-sm overflow-hidden">
          {comps.length === 0 ? (
            <div className="px-6 py-12 text-center text-gray-400 text-sm">
              ยังไม่มีรายการแข่งขัน — กด &quot;สร้างรายการแข่งขัน&quot; เพื่อเริ่ม
            </div>
          ) : (
            <ul className="divide-y divide-gray-100">
              {comps.map((c) => (
                <li key={c.id} className="flex items-center justify-between px-6 py-4">
                  <Link href={`/compete/${c.id}`} className="min-w-0 flex-1 group">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-medium text-gray-900 group-hover:text-indigo-600">
                        {c.title}
                      </p>
                      {stateBadge(c)}
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {c._count.problems} ข้อ · ผู้เข้าแข่ง {c._count.contestants} คน · เวลาแข่ง{' '}
                      {c.durationMinutes} นาที
                    </p>
                  </Link>
                  <div className="shrink-0 ml-3">
                    <DeleteCompetitionButton id={c.id} label={c.title} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </main>
    </div>
  )
}

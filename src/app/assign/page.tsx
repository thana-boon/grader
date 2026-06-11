import { getCurrentUser } from '@/lib/auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import { getSchoolAcademicYears, getActiveSetting } from '@/lib/academicYear'
import Navbar from '@/components/Navbar'
import DeleteAssignmentButton from './DeleteAssignmentButton'

export default async function AssignListPage() {
  const user = await getCurrentUser()
  if (!user || user.role !== 'teacher') redirect('/login')

  const [tasks, years, active] = await Promise.all([
    prisma.assignment.findMany({
      include: {
        targets: true,
        _count: { select: { problems: true, submissions: true } },
      },
      orderBy: { createdAt: 'desc' },
    }),
    getSchoolAcademicYears(),
    getActiveSetting(),
  ])

  const yearTitle = (yearId: number) =>
    years.find((y) => y.id === yearId)?.title ?? `ปี id ${yearId}`

  const targetSummary = (targets: (typeof tasks)[number]['targets']) => {
    const rooms = targets
      .filter((t) => !t.studentCode)
      .map((t) => `${t.classLevel}/${t.classRoom}`)
    const indiv = targets.filter((t) => t.studentCode).length
    const parts = [...rooms]
    if (indiv > 0) parts.push(`รายคน ${indiv} คน`)
    return parts.join(', ') || '—'
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar user={user} />
      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">มอบหมายงาน</h1>
            <p className="text-gray-500 mt-1">
              {active ? `เทอมปัจจุบัน: ${active.label}` : 'ยังไม่ได้ตั้งปีการศึกษาที่ใช้งาน'}
            </p>
          </div>
          <Link
            href="/assign/new"
            className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition shrink-0"
          >
            + มอบหมายงานใหม่
          </Link>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {tasks.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <p className="text-gray-400 font-medium">ยังไม่มีงานที่มอบหมาย</p>
              <p className="text-gray-300 text-sm mt-1">
                กด &quot;มอบหมายงานใหม่&quot; เพื่อสร้างงานชุดแรก
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-gray-100">
              {tasks.map((t) => (
                <li
                  key={t.id}
                  className="flex items-center justify-between px-6 py-4 hover:bg-gray-50"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/assign/${t.id}`}
                        className="text-sm font-medium text-gray-900 hover:text-indigo-600"
                      >
                        {t.title}
                      </Link>
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-700 shrink-0">
                        {t._count.problems} ข้อ
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {targetSummary(t.targets)} · {yearTitle(t.academicYearId)}{' '}
                      ภาคเรียนที่ {t.semester} · สร้างเมื่อ{' '}
                      {t.createdAt.toLocaleDateString('th-TH', { dateStyle: 'medium' })}
                      {t.dueAt &&
                        ` · กำหนดส่ง ${t.dueAt.toLocaleString('th-TH', {
                          dateStyle: 'medium',
                          timeStyle: 'short',
                        })}`}
                      {' · '}การส่ง {t._count.submissions} ครั้ง
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0 ml-3">
                    <Link
                      href={`/assign/${t.id}`}
                      className="text-sm text-indigo-600 hover:text-indigo-800 font-medium px-3 py-1 rounded hover:bg-indigo-50 transition"
                    >
                      ตรวจงาน
                    </Link>
                    <DeleteAssignmentButton id={t.id} label={t.title} />
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

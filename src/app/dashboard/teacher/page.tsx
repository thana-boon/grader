import { getCurrentUser } from '@/lib/auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getActiveSetting } from '@/lib/academicYear'
import { countSchoolStudents } from '@/lib/students'
import { prisma } from '@/lib/prisma'
import { languageLabel } from '@/lib/languages'

export default async function TeacherDashboard() {
  const user = await getCurrentUser()
  if (!user || user.role !== 'teacher') redirect('/login')

  const activeYear = await getActiveSetting()

  // เริ่มต้นของวันนี้ (เวลาเครื่องเซิร์ฟเวอร์) — ใช้นับการส่งงานวันนี้
  const startOfToday = new Date()
  startOfToday.setHours(0, 0, 0, 0)

  const [studentCount, problemCount, submissionsToday, recentProblems] =
    await Promise.all([
      activeYear ? countSchoolStudents(activeYear.academicYearId) : Promise.resolve(0),
      prisma.problem.count(),
      prisma.submission.count({ where: { createdAt: { gte: startOfToday } } }),
      prisma.problem.findMany({
        orderBy: { updatedAt: 'desc' },
        take: 5,
        include: {
          createdBy: { select: { name: true } },
          _count: { select: { testCases: true, assignments: true } },
        },
      }),
    ])

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">
          สวัสดี, {user.name}
        </h1>
        <p className="text-gray-500 mt-1">
          {activeYear ? activeYear.label : 'ยังไม่ได้ตั้งค่าปีการศึกษา'}
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-8">
        <div className="bg-white rounded-2xl border border-indigo-100 shadow-sm p-5">
          <p className="text-sm text-gray-500">นักเรียนทั้งหมด</p>
          <p className="text-3xl font-bold text-gray-900 mt-1">{studentCount}</p>
        </div>
        <Link
          href="/problems"
          className="bg-white rounded-2xl border border-indigo-100 shadow-sm p-5 hover:border-indigo-300 hover:shadow transition"
        >
          <p className="text-sm text-gray-500">โจทย์ทั้งหมด</p>
          <p className="text-3xl font-bold text-gray-900 mt-1">{problemCount}</p>
        </Link>
        <div className="bg-white rounded-2xl border border-indigo-100 shadow-sm p-5 col-span-2 sm:col-span-1">
          <p className="text-sm text-gray-500">การส่งงานวันนี้</p>
          <p className="text-3xl font-bold text-gray-900 mt-1">{submissionsToday}</p>
        </div>
      </div>

      {/* Recent problems */}
      <div className="bg-white rounded-2xl border border-indigo-100 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900">โจทย์ล่าสุด</h2>
          <Link
            href="/problems"
            className="text-sm text-indigo-600 hover:text-indigo-800 font-medium"
          >
            ดูทั้งหมด
          </Link>
        </div>

        {recentProblems.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <p className="text-gray-400 font-medium">ยังไม่มีโจทย์</p>
            <p className="text-gray-300 text-sm mt-1">
              ไปที่คลังโจทย์แล้วกด &quot;สร้างโจทย์&quot; เพื่อเริ่มสร้างข้อแรก
            </p>
            <Link
              href="/problems/new"
              className="inline-block mt-4 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition"
            >
              + สร้างโจทย์
            </Link>
          </div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {recentProblems.map((p) => (
              <li
                key={p.id}
                className="flex items-center justify-between px-6 py-4 hover:bg-gray-50"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Link
                      href={`/problems/${p.id}`}
                      className="text-sm font-medium text-gray-900 hover:text-indigo-600 truncate"
                    >
                      {p.title}
                    </Link>
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700 shrink-0">
                      {languageLabel(p.language)}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {p._count.testCases} test case · มอบหมายแล้ว{' '}
                    {p._count.assignments} รายการ · โดย {p.createdBy.name}
                  </p>
                </div>
                <Link
                  href={`/problems/${p.id}`}
                  className="text-sm text-indigo-600 hover:text-indigo-800 font-medium px-3 py-1 rounded hover:bg-indigo-50 transition shrink-0"
                >
                  แก้ไข
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

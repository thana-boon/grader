import { getCurrentUser } from '@/lib/auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import Navbar from '@/components/Navbar'
import DeleteProblemButton from './DeleteProblemButton'
import { languageLabel } from '@/lib/languages'

export default async function ProblemsPage() {
  const user = await getCurrentUser()
  if (!user || user.role !== 'teacher') redirect('/login')

  const problems = await prisma.problem.findMany({
    orderBy: { updatedAt: 'desc' },
    include: {
      createdBy: { select: { name: true } },
      _count: { select: { testCases: true, assignments: true } },
    },
  })

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar user={user} />
      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">คลังโจทย์</h1>
            <p className="text-gray-500 mt-1">
              สร้างโจทย์เก็บไว้ แล้วมอบหมายให้ห้องเรียนที่ต้องการ
            </p>
          </div>
          <Link
            href="/problems/new"
            className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition shrink-0"
          >
            + สร้างโจทย์
          </Link>
        </div>

        {/* List */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {problems.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <p className="text-gray-400 font-medium">ยังไม่มีโจทย์</p>
              <p className="text-gray-300 text-sm mt-1">
                กดปุ่ม &quot;สร้างโจทย์&quot; เพื่อเริ่มสร้างโจทย์ข้อแรก
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-gray-100">
              {problems.map((p) => (
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
                  <div className="flex items-center gap-1 shrink-0">
                    <Link
                      href={`/problems/${p.id}`}
                      className="text-sm text-indigo-600 hover:text-indigo-800 font-medium px-3 py-1 rounded hover:bg-indigo-50 transition"
                    >
                      แก้ไข
                    </Link>
                    <DeleteProblemButton id={p.id} title={p.title} />
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

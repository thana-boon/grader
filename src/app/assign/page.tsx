import { getCurrentUser } from '@/lib/auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import { getSchoolAcademicYears, getActiveSetting } from '@/lib/academicYear'
import { findSchoolStudentsByCodesAndYear } from '@/lib/students'
import Navbar from '@/components/Navbar'
import DeleteAssignmentButton from './DeleteAssignmentButton'

export default async function AssignListPage() {
  const user = await getCurrentUser()
  if (!user || user.role !== 'teacher') redirect('/login')

  const [assignments, years, active] = await Promise.all([
    prisma.assignment.findMany({
      include: {
        problem: { select: { title: true } },
        _count: { select: { submissions: true } },
      },
      orderBy: { createdAt: 'desc' },
    }),
    getSchoolAcademicYears(),
    getActiveSetting(),
  ])

  // ชื่อนักเรียนของรายการมอบหมายรายคน — ดึงครั้งเดียวต่อปี
  const codesByYear = new Map<number, Set<string>>()
  for (const a of assignments) {
    if (!a.studentCode) continue
    if (!codesByYear.has(a.academicYearId)) codesByYear.set(a.academicYearId, new Set())
    codesByYear.get(a.academicYearId)!.add(a.studentCode)
  }
  const nameMap = new Map<string, string>()
  for (const [yearId, codes] of codesByYear) {
    const students = await findSchoolStudentsByCodesAndYear([...codes], yearId)
    for (const s of students) {
      nameMap.set(`${yearId}:${s.student_code}`, `${s.first_name} ${s.last_name}`)
    }
  }

  const yearTitle = (yearId: number) =>
    years.find((y) => y.id === yearId)?.title ?? `ปี id ${yearId}`

  const targetLabel = (a: (typeof assignments)[number]) => {
    if (a.studentCode) {
      const name = nameMap.get(`${a.academicYearId}:${a.studentCode}`)
      return `รายคน: ${name ?? a.studentCode} (${a.classLevel}/${a.classRoom})`
    }
    return `${a.classLevel} ${a.classRoom ? `ห้อง ${a.classRoom}` : '(ทุกห้อง)'}`
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
          {assignments.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <p className="text-gray-400 font-medium">ยังไม่มีการมอบหมายงาน</p>
              <p className="text-gray-300 text-sm mt-1">
                กด &quot;มอบหมายงานใหม่&quot; เพื่อมอบโจทย์ให้นักเรียน
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-gray-100">
              {assignments.map((a) => (
                <li
                  key={a.id}
                  className="flex items-center justify-between px-6 py-4 hover:bg-gray-50"
                >
                  <div className="min-w-0">
                    <Link
                      href={`/assign/${a.id}`}
                      className="text-sm font-medium text-gray-900 hover:text-indigo-600"
                    >
                      {a.problem.title}
                    </Link>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {targetLabel(a)} · {yearTitle(a.academicYearId)} ภาคเรียนที่{' '}
                      {a.semester}
                      {a.dueAt &&
                        ` · กำหนดส่ง ${a.dueAt.toLocaleString('th-TH', {
                          dateStyle: 'medium',
                          timeStyle: 'short',
                        })}`}
                      {' · '}การส่ง {a._count.submissions} ครั้ง
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0 ml-3">
                    <Link
                      href={`/assign/${a.id}`}
                      className="text-sm text-indigo-600 hover:text-indigo-800 font-medium px-3 py-1 rounded hover:bg-indigo-50 transition"
                    >
                      ดูผลงาน
                    </Link>
                    <DeleteAssignmentButton
                      id={a.id}
                      label={`${a.problem.title} → ${targetLabel(a)}`}
                    />
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

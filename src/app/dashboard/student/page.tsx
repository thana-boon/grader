import { getCurrentUser } from '@/lib/auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import { getActiveSetting } from '@/lib/academicYear'
import { findSchoolStudentByCodeAndYear } from '@/lib/students'
import { assignmentTargetFilter } from '@/lib/assignments'
import { languageLabel, scoreLabel } from '@/lib/languages'

export default async function StudentDashboard() {
  const user = await getCurrentUser()
  if (!user || user.role !== 'student') redirect('/login')

  const activeYear = await getActiveSetting()
  const student = activeYear
    ? await findSchoolStudentByCodeAndYear(user.studentCode ?? '', activeYear.academicYearId)
    : null

  // งานที่มอบหมายให้ชั้น/ห้องของนักเรียนคนนี้ ในเทอมที่ใช้งานอยู่
  const assignments =
    activeYear && student
      ? await prisma.assignment.findMany({
          where: {
            academicYearId: activeYear.academicYearId,
            semester: activeYear.semester,
            OR: assignmentTargetFilter(student),
          },
          include: { problem: { select: { title: true, language: true } } },
          orderBy: { createdAt: 'desc' },
        })
      : []

  // ผลส่งล่าสุดของแต่ละงาน
  const submissions =
    student && assignments.length
      ? await prisma.submission.findMany({
          where: {
            assignmentId: { in: assignments.map((a) => a.id) },
            studentCode: student.student_code,
          },
          orderBy: { createdAt: 'desc' },
        })
      : []
  const latestByAssignment = new Map<number, (typeof submissions)[number]>()
  for (const s of submissions) {
    if (!latestByAssignment.has(s.assignmentId)) latestByAssignment.set(s.assignmentId, s)
  }

  const now = new Date()

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">
          สวัสดี, {user.name}
        </h1>
        <p className="text-gray-500 mt-1">
          รหัสนักเรียน: {user.studentCode}
          {student && ` · ${student.class_level} ห้อง ${student.class_room} เลขที่ ${student.number_in_room}`}
          {activeYear && ` · ${activeYear.label}`}
        </p>
      </div>

      {/* งานที่ได้รับมอบหมาย */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">
            งานของฉัน ({assignments.length})
          </h2>
        </div>

        {!activeYear || !student ? (
          <div className="px-6 py-10 text-center text-gray-400 text-sm">
            ยังไม่พบข้อมูลของคุณในปีการศึกษาปัจจุบัน
          </div>
        ) : assignments.length === 0 ? (
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
            <p className="text-gray-300 text-sm mt-1">โจทย์จากครูจะปรากฏที่นี่</p>
          </div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {assignments.map((a) => {
              const last = latestByAssignment.get(a.id)
              const overdue = a.dueAt !== null && now > a.dueAt
              return (
                <li key={a.id}>
                  <Link
                    href={`/assignments/${a.id}`}
                    className="flex items-center justify-between px-6 py-4 hover:bg-gray-50 transition"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-gray-900 truncate">
                          {a.problem.title}
                        </p>
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700 shrink-0">
                          {languageLabel(a.problem.language)}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {a.dueAt
                          ? `กำหนดส่ง ${a.dueAt.toLocaleString('th-TH', {
                              dateStyle: 'medium',
                              timeStyle: 'short',
                            })}`
                          : 'ไม่มีกำหนดส่ง'}
                        {overdue && !last && (
                          <span className="text-red-500"> · เลยกำหนดแล้ว</span>
                        )}
                      </p>
                    </div>
                    <div className="shrink-0 ml-3">
                      {last ? (
                        <span
                          className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${
                            last.passed === last.total
                              ? 'bg-green-100 text-green-700'
                              : 'bg-amber-100 text-amber-700'
                          }`}
                        >
                          {scoreLabel(a.problem.language, last.passed, last.total)}
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-500">
                          ยังไม่ส่ง
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

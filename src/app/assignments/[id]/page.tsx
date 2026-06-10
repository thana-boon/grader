import { getCurrentUser } from '@/lib/auth'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import { getActiveSetting } from '@/lib/academicYear'
import { findSchoolStudentByCodeAndYear } from '@/lib/students'
import { assignmentMatchesStudent } from '@/lib/assignments'
import { languageLabel, scoreLabel } from '@/lib/languages'
import Navbar from '@/components/Navbar'
import Workspace from './Workspace'

export default async function AssignmentPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const user = await getCurrentUser()
  if (!user || user.role !== 'student') redirect('/login')

  const { id: idRaw } = await params
  const id = parseInt(idRaw)
  if (!id) notFound()

  const active = await getActiveSetting()
  if (!active) redirect('/dashboard/student')

  const student = await findSchoolStudentByCodeAndYear(
    user.studentCode ?? '',
    active.academicYearId
  )
  if (!student) redirect('/dashboard/student')

  const assignment = await prisma.assignment.findUnique({
    where: { id },
    include: {
      problem: { include: { testCases: { orderBy: { sortOrder: 'asc' } } } },
    },
  })
  // เปิดได้เฉพาะงานที่มอบหมายถึงตัวเอง (ทั้งห้องหรือรายคน) ในเทอมปัจจุบัน
  if (
    !assignment ||
    assignment.academicYearId !== active.academicYearId ||
    assignment.semester !== active.semester ||
    !assignmentMatchesStudent(assignment, student)
  ) {
    notFound()
  }

  const lastSubmission = await prisma.submission.findFirst({
    where: { assignmentId: id, studentCode: student.student_code },
    orderBy: { createdAt: 'desc' },
  })

  const overdue = assignment.dueAt !== null && new Date() > assignment.dueAt

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar user={user} />
      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
        <div className="mb-5">
          <Link
            href="/dashboard/student"
            className="text-sm text-gray-500 hover:text-indigo-600"
          >
            ← กลับหน้าหลัก
          </Link>
          <div className="flex flex-wrap items-center gap-3 mt-2">
            <h1 className="text-2xl font-bold text-gray-900">
              {assignment.problem.title}
            </h1>
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
              {languageLabel(assignment.problem.language)}
            </span>
            {lastSubmission && (
              <span
                className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                  lastSubmission.passed === lastSubmission.total
                    ? 'bg-green-100 text-green-700'
                    : 'bg-amber-100 text-amber-700'
                }`}
              >
                ส่งล่าสุด:{' '}
                {scoreLabel(
                  assignment.problem.language,
                  lastSubmission.passed,
                  lastSubmission.total
                )}
              </span>
            )}
          </div>
          <p className="text-sm text-gray-500 mt-1">
            {assignment.dueAt
              ? `กำหนดส่ง ${assignment.dueAt.toLocaleString('th-TH', {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                })}${overdue ? ' (เลยกำหนดแล้ว)' : ''}`
              : 'ไม่มีกำหนดส่ง'}
          </p>
        </div>

        {/* คำสั่งโจทย์ */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 mb-4">
          <h2 className="text-base font-semibold text-gray-900 mb-2">คำสั่ง</h2>
          <p className="text-sm text-gray-700 whitespace-pre-wrap">
            {assignment.problem.description}
          </p>
        </div>

        <Workspace
          assignmentId={assignment.id}
          language={assignment.problem.language}
          starterCode={assignment.problem.starterCode ?? ''}
          testCases={
            assignment.problem.language === 'turtle'
              ? []
              : assignment.problem.testCases.map((tc) => ({
                  input: tc.input,
                  expectedOutput: tc.expectedOutput,
                  isHidden: tc.isHidden,
                }))
          }
          expectedDrawing={
            assignment.problem.language === 'turtle'
              ? (assignment.problem.testCases[0]?.expectedOutput ?? null)
              : null
          }
          lastCode={lastSubmission?.code ?? null}
          canSubmit={!overdue}
        />
      </main>
    </div>
  )
}

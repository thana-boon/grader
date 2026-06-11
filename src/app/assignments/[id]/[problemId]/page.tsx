import { getCurrentUser } from '@/lib/auth'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import { getActiveSetting } from '@/lib/academicYear'
import { findSchoolStudentByCodeAndYear } from '@/lib/students'
import { targetsMatchStudent } from '@/lib/assignments'
import { languageLabel, scoreLabel } from '@/lib/languages'
import Navbar from '@/components/Navbar'
import Workspace from '../Workspace'

export default async function ProblemWorkspacePage({
  params,
}: {
  params: Promise<{ id: string; problemId: string }>
}) {
  const user = await getCurrentUser()
  if (!user || user.role !== 'student') redirect('/login')

  const { id: idRaw, problemId: pidRaw } = await params
  const id = parseInt(idRaw)
  const problemId = parseInt(pidRaw)
  if (!id || !problemId) notFound()

  const active = await getActiveSetting()
  if (!active) redirect('/dashboard/student')

  const student = await findSchoolStudentByCodeAndYear(
    user.studentCode ?? '',
    active.academicYearId
  )
  if (!student) redirect('/dashboard/student')

  // โจทย์ข้อนี้ต้องอยู่ในงานนี้ และงานต้องมอบหมายถึงตัวเอง
  const taskProblem = await prisma.assignmentProblem.findUnique({
    where: { assignmentId_problemId: { assignmentId: id, problemId } },
    include: {
      assignment: {
        include: {
          targets: true,
          problems: { select: { problemId: true }, orderBy: { sortOrder: 'asc' } },
        },
      },
      problem: { include: { testCases: { orderBy: { sortOrder: 'asc' } } } },
    },
  })
  if (
    !taskProblem ||
    taskProblem.assignment.academicYearId !== active.academicYearId ||
    taskProblem.assignment.semester !== active.semester ||
    !targetsMatchStudent(taskProblem.assignment.targets, student)
  ) {
    notFound()
  }

  const task = taskProblem.assignment
  const problem = taskProblem.problem
  const problemNumber =
    task.problems.findIndex((p) => p.problemId === problemId) + 1

  const lastSubmission = await prisma.submission.findFirst({
    where: { assignmentId: id, problemId, studentCode: student.student_code },
    orderBy: { createdAt: 'desc' },
  })

  const overdue = task.dueAt !== null && new Date() > task.dueAt

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar user={user} />
      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
        <div className="mb-5">
          <Link
            href={`/assignments/${task.id}`}
            className="text-sm text-gray-500 hover:text-indigo-600"
          >
            ← กลับงาน &quot;{task.title}&quot;
          </Link>
          <div className="flex flex-wrap items-center gap-3 mt-2">
            <h1 className="text-2xl font-bold text-gray-900">
              ข้อ {problemNumber}: {problem.title}
            </h1>
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
              {languageLabel(problem.language)}
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
                {scoreLabel(problem.language, lastSubmission.passed, lastSubmission.total)}
              </span>
            )}
          </div>
          <p className="text-sm text-gray-500 mt-1">
            {task.dueAt
              ? `กำหนดส่ง ${task.dueAt.toLocaleString('th-TH', {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                })}${overdue ? ' (เลยกำหนดแล้ว)' : ''}`
              : 'ไม่มีกำหนดส่ง'}
          </p>
        </div>

        {/* คำสั่งโจทย์ */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 mb-4">
          <h2 className="text-base font-semibold text-gray-900 mb-2">คำสั่ง</h2>
          <p className="text-sm text-gray-700 whitespace-pre-wrap">{problem.description}</p>
        </div>

        <Workspace
          assignmentId={task.id}
          problemId={problem.id}
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
          canSubmit={!overdue}
        />
      </main>
    </div>
  )
}

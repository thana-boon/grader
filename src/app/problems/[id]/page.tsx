import { getCurrentUser } from '@/lib/auth'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import Navbar from '@/components/Navbar'
import ProblemForm from '../ProblemForm'
import { updateProblem } from '../actions'

export default async function EditProblemPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const user = await getCurrentUser()
  if (!user || user.role !== 'teacher') redirect('/login')

  const { id: idRaw } = await params
  const id = parseInt(idRaw)
  if (!id) notFound()

  const problem = await prisma.problem.findUnique({
    where: { id },
    include: {
      testCases: { orderBy: { sortOrder: 'asc' } },
      _count: { select: { assignments: true } },
    },
  })
  if (!problem) notFound()

  return (
    <div className="min-h-screen bg-page">
      <Navbar user={user} />
      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-6">
        <div className="mb-6">
          <Link href="/problems" className="text-sm text-gray-500 hover:text-indigo-600">
            ← กลับคลังโจทย์
          </Link>
          <div className="flex items-center justify-between mt-2">
            <h1 className="text-2xl font-bold text-gray-900">แก้ไขโจทย์</h1>
            <p className="text-sm text-gray-500">
              มอบหมายแล้ว {problem._count.assignments} รายการ —{' '}
              <Link href="/assign" className="text-indigo-600 hover:underline">
                ไปหน้ามอบหมายงาน
              </Link>
            </p>
          </div>
        </div>

        <ProblemForm
          action={updateProblem.bind(null, problem.id)}
          initial={{
            title: problem.title,
            description: problem.description,
            language: problem.language,
            starterCode: problem.starterCode ?? '',
            solutionCode: problem.solutionCode ?? '',
            testCases:
              problem.language === 'turtle'
                ? []
                : problem.testCases.map((tc) => ({
                    input: tc.input,
                    expectedOutput: tc.expectedOutput,
                    isHidden: tc.isHidden,
                  })),
            expectedDrawing:
              problem.language === 'turtle'
                ? problem.testCases[0]?.expectedOutput
                : undefined,
            datasetName: problem.datasetName ?? undefined,
            datasetContent: problem.datasetContent ?? undefined,
            scratchConfig: problem.scratchConfig,
          }}
          submitLabel="บันทึกการแก้ไข"
        />
      </main>
    </div>
  )
}

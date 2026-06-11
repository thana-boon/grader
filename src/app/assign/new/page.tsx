import { getCurrentUser } from '@/lib/auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import { getActiveSetting } from '@/lib/academicYear'
import { getStudentFilterOptions } from '@/lib/students'
import Navbar from '@/components/Navbar'
import AssignForm from './AssignForm'

export default async function NewAssignmentPage() {
  const user = await getCurrentUser()
  if (!user || user.role !== 'teacher') redirect('/login')

  const active = await getActiveSetting()

  const [problems, options] = await Promise.all([
    prisma.problem.findMany({
      orderBy: { updatedAt: 'desc' },
      select: { id: true, title: true, language: true },
    }),
    active
      ? getStudentFilterOptions(active.academicYearId)
      : Promise.resolve({ classLevels: [], classRooms: [] }),
  ])

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar user={user} />
      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-6">
        <div className="mb-6">
          <Link href="/assign" className="text-sm text-gray-500 hover:text-indigo-600">
            ← กลับหน้ามอบหมายงาน
          </Link>
          <h1 className="text-2xl font-bold text-gray-900 mt-2">มอบหมายงานใหม่</h1>
          {active ? (
            <p className="text-gray-500 mt-1">มอบหมายใน{active.label}</p>
          ) : (
            <p className="text-amber-600 mt-1 text-sm">
              ⚠️ ต้องตั้งปีการศึกษาที่ใช้งานก่อน —{' '}
              <Link href="/academic_year" className="underline">
                ไปตั้งค่า
              </Link>
            </p>
          )}
        </div>

        {active && problems.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 px-6 py-10 text-center">
            <p className="text-gray-400">
              ยังไม่มีโจทย์ในคลัง —{' '}
              <Link href="/problems/new" className="text-indigo-600 hover:underline">
                สร้างโจทย์ก่อน
              </Link>
            </p>
          </div>
        ) : active ? (
          <AssignForm
            problems={problems}
            classLevels={options.classLevels}
            classRooms={options.classRooms}
          />
        ) : null}
      </main>
    </div>
  )
}

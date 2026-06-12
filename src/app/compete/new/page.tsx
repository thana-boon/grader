import { getCurrentUser } from '@/lib/auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import Navbar from '@/components/Navbar'
import CompeteForm from './CompeteForm'

export default async function NewCompetitionPage() {
  const user = await getCurrentUser()
  if (!user || user.role !== 'teacher') redirect('/login')

  const problems = await prisma.problem.findMany({
    orderBy: { createdAt: 'desc' },
    select: { id: true, title: true, language: true },
  })

  return (
    <div className="min-h-screen bg-page">
      <Navbar user={user} />
      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-6">
        <div className="mb-6">
          <Link href="/compete" className="text-sm text-gray-500 hover:text-indigo-600">
            ← กลับหน้าแข่งขัน
          </Link>
          <h1 className="text-2xl font-bold text-gray-900 mt-2">สร้างรายการแข่งขัน</h1>
        </div>
        <CompeteForm problems={problems} />
      </main>
    </div>
  )
}

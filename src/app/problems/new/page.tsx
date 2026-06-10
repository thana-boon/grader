import { getCurrentUser } from '@/lib/auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import Navbar from '@/components/Navbar'
import ProblemForm from '../ProblemForm'
import { createProblem } from '../actions'

export default async function NewProblemPage() {
  const user = await getCurrentUser()
  if (!user || user.role !== 'teacher') redirect('/login')

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar user={user} />
      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-6">
        <div className="mb-6">
          <Link href="/problems" className="text-sm text-gray-500 hover:text-indigo-600">
            ← กลับคลังโจทย์
          </Link>
          <h1 className="text-2xl font-bold text-gray-900 mt-2">สร้างโจทย์ใหม่</h1>
        </div>

        <ProblemForm action={createProblem} submitLabel="สร้างโจทย์" />
      </main>
    </div>
  )
}

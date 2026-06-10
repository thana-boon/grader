import { getCurrentUser } from '@/lib/auth'
import { redirect } from 'next/navigation'

export default async function RootPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')
  redirect(user.role === 'teacher' ? '/dashboard/teacher' : '/dashboard/student')
}

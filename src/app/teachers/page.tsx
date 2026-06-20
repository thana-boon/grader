import { getCurrentUser } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import Navbar from '@/components/Navbar'
import CreateTeacherForm from './CreateTeacherForm'
import TeacherActions from './TeacherActions'

export default async function TeachersPage() {
  const user = await getCurrentUser()
  if (!user || user.role !== 'teacher') redirect('/login')

  // เช็คสิทธิ์ admin จาก DB สด — ค่าใน JWT อาจเก่า
  const me = await prisma.teacher.findUnique({ where: { id: user.userId } })
  if (!me?.is_admin) redirect('/dashboard/teacher')

  const teachers = await prisma.teacher.findMany({
    orderBy: [{ is_admin: 'desc' }, { name: 'asc' }],
  })

  return (
    <div className="min-h-screen bg-page">
      <Navbar user={user} />
      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">จัดการผู้ใช้</h1>
          <p className="text-gray-500 mt-1">
            สร้างและจัดการบัญชีครู — ส่วนนักเรียนไม่ต้องสร้างบัญชี ใช้รหัสนักเรียนกับเลขบัตรประชาชน login ได้เลย
          </p>
        </div>

        <CreateTeacherForm />

        {/* List */}
        <div className="bg-white rounded-2xl border border-indigo-100 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100">
            <h2 className="text-base font-semibold text-gray-900">
              บัญชีครูทั้งหมด ({teachers.length})
            </h2>
          </div>
          <ul className="divide-y divide-gray-100">
            {teachers.map((t) => (
              <li
                key={t.id}
                className="flex items-center justify-between px-6 py-4 hover:bg-gray-50"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-sm font-semibold shrink-0">
                    {t.name.replace(/^ครู\s*/, '').charAt(0) || '?'}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      {t.name}
                      {t.id === me.id && (
                        <span className="text-gray-400 font-normal"> (คุณ)</span>
                      )}
                    </p>
                    <p className="text-xs text-gray-500">
                      {t.teacherCode ? `รหัสครู ${t.teacherCode}` : `@${t.username}`}
                    </p>
                  </div>
                  {t.teacherCode && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-sky-100 text-sky-700">
                      จาก API
                    </span>
                  )}
                  {t.is_admin && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">
                      ผู้ดูแลระบบ
                    </span>
                  )}
                </div>
                <TeacherActions
                  id={t.id}
                  name={t.name}
                  isSelf={t.id === me.id}
                  isAdmin={t.is_admin}
                  isApiTeacher={t.teacherCode !== null}
                />
              </li>
            ))}
          </ul>
        </div>
      </main>
    </div>
  )
}

import { getCurrentUser } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { getActiveSetting } from '@/lib/academicYear'
import { countSchoolStudents } from '@/lib/students'

export default async function TeacherDashboard() {
  const user = await getCurrentUser()
  if (!user || user.role !== 'teacher') redirect('/login')

  const activeYear = await getActiveSetting()
  const studentCount = activeYear
    ? await countSchoolStudents(activeYear.academicYearId)
    : 0

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">
          สวัสดี, {user.name}
        </h1>
        <p className="text-gray-500 mt-1">
          {activeYear ? activeYear.label : 'ยังไม่ได้ตั้งค่าปีการศึกษา'}
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-8">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-sm text-gray-500">นักเรียนทั้งหมด</p>
          <p className="text-3xl font-bold text-gray-900 mt-1">{studentCount}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5 opacity-50">
          <p className="text-sm text-gray-500">โจทย์ทั้งหมด</p>
          <p className="text-3xl font-bold text-gray-400 mt-1">—</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5 opacity-50 col-span-2 sm:col-span-1">
          <p className="text-sm text-gray-500">การส่งงานวันนี้</p>
          <p className="text-3xl font-bold text-gray-400 mt-1">—</p>
        </div>
      </div>

      {/* Placeholder */}
      <div className="bg-white rounded-xl border border-dashed border-gray-300 p-10 text-center">
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
            d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
          />
        </svg>
        <p className="text-gray-400 font-medium">ยังไม่มีโจทย์</p>
        <p className="text-gray-300 text-sm mt-1">
          ฟีเจอร์การสร้างโจทย์และตรวจโค้ดจะเปิดใช้งานเร็วๆ นี้
        </p>
      </div>
    </div>
  )
}

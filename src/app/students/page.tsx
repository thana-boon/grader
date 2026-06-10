import { getCurrentUser } from '@/lib/auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getSchoolAcademicYears, getActiveSetting } from '@/lib/academicYear'
import { getSchoolStudents, getStudentFilterOptions } from '@/lib/students'
import Navbar from '@/components/Navbar'

const PAGE_SIZE = 50

type SearchParams = {
  year?: string
  q?: string
  level?: string
  room?: string
  page?: string
}

export default async function StudentsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const user = await getCurrentUser()
  if (!user || user.role !== 'teacher') redirect('/login')

  const params = await searchParams
  const [years, active] = await Promise.all([
    getSchoolAcademicYears(),
    getActiveSetting(),
  ])

  // ค่าเริ่มต้นคือปีที่เลือกใช้งานอยู่ — เปลี่ยนดูปีอื่นได้จาก dropdown
  const yearId =
    (params.year && parseInt(params.year)) ||
    active?.academicYearId ||
    years[0]?.id
  const q = params.q?.trim() || undefined
  const classLevel = params.level || undefined
  const classRoom = params.room ? parseInt(params.room) : undefined
  const page = Math.max(1, parseInt(params.page ?? '1') || 1)

  const selectedYear = years.find((y) => y.id === yearId)

  const [{ students, total }, options] = yearId
    ? await Promise.all([
        getSchoolStudents({ yearId, q, classLevel, classRoom, page, pageSize: PAGE_SIZE }),
        getStudentFilterOptions(yearId),
      ])
    : [{ students: [], total: 0 }, { classLevels: [], classRooms: [] }]

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const pageHref = (p: number) => {
    const sp = new URLSearchParams()
    if (params.year) sp.set('year', params.year)
    if (q) sp.set('q', q)
    if (classLevel) sp.set('level', classLevel)
    if (params.room) sp.set('room', params.room)
    if (p > 1) sp.set('page', String(p))
    const qs = sp.toString()
    return qs ? `/students?${qs}` : '/students'
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar user={user} />
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">รายชื่อนักเรียน</h1>
          <p className="text-gray-500 mt-1">
            {selectedYear ? selectedYear.title : 'ไม่พบปีการศึกษา'}
            {' · '}ทั้งหมด {total.toLocaleString()} คน
          </p>
        </div>

        {/* Filters */}
        <form
          method="get"
          className="bg-white rounded-xl border border-gray-200 p-4 mb-6 flex flex-wrap gap-3 items-end"
        >
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              ปีการศึกษา
            </label>
            <select
              name="year"
              defaultValue={yearId ?? ''}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            >
              {years.map((y) => (
                <option key={y.id} value={y.id}>
                  {y.title}
                </option>
              ))}
            </select>
          </div>
          <div className="flex-1 min-w-44">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              ค้นหา
            </label>
            <input
              type="text"
              name="q"
              defaultValue={q ?? ''}
              placeholder="ชื่อ นามสกุล หรือรหัสนักเรียน"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              ชั้น
            </label>
            <select
              name="level"
              defaultValue={classLevel ?? ''}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            >
              <option value="">ทุกชั้น</option>
              {options.classLevels.map((lv) => (
                <option key={lv} value={lv}>
                  {lv}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              ห้อง
            </label>
            <select
              name="room"
              defaultValue={params.room ?? ''}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            >
              <option value="">ทุกห้อง</option>
              {options.classRooms.map((r) => (
                <option key={r} value={r}>
                  ห้อง {r}
                </option>
              ))}
            </select>
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition"
            >
              กรอง
            </button>
            <Link
              href="/students"
              className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition"
            >
              ล้าง
            </Link>
          </div>
        </form>

        {/* Table */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {students.length === 0 ? (
            <div className="px-6 py-10 text-center text-gray-400 text-sm">
              ไม่พบนักเรียนตามเงื่อนไขที่เลือก
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-left text-gray-500 border-b border-gray-200">
                    <th className="px-4 py-3 font-medium">รหัส</th>
                    <th className="px-4 py-3 font-medium">ชื่อ-นามสกุล</th>
                    <th className="px-4 py-3 font-medium">ชั้น</th>
                    <th className="px-4 py-3 font-medium">ห้อง</th>
                    <th className="px-4 py-3 font-medium">เลขที่</th>
                    <th className="px-4 py-3 font-medium">เลขบัตรประชาชน</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {students.map((s) => (
                    <tr key={s.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-gray-900 font-medium">
                        {s.student_code}
                      </td>
                      <td className="px-4 py-3 text-gray-900">
                        {s.first_name} {s.last_name}
                      </td>
                      <td className="px-4 py-3 text-gray-600">{s.class_level}</td>
                      <td className="px-4 py-3 text-gray-600">{s.class_room}</td>
                      <td className="px-4 py-3 text-gray-600">{s.number_in_room}</td>
                      <td className="px-4 py-3 text-gray-600">
                        {s.citizen_id ?? '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 text-sm">
              <p className="text-gray-500">
                หน้า {page} จาก {totalPages}
              </p>
              <div className="flex gap-2">
                {page > 1 && (
                  <Link
                    href={pageHref(page - 1)}
                    className="px-3 py-1.5 border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50 transition"
                  >
                    ← ก่อนหน้า
                  </Link>
                )}
                {page < totalPages && (
                  <Link
                    href={pageHref(page + 1)}
                    className="px-3 py-1.5 border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50 transition"
                  >
                    ถัดไป →
                  </Link>
                )}
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}

import { getCurrentUser } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { getSchoolAcademicYears, getActiveSetting } from '@/lib/academicYear'
import { setActiveAcademicYear } from './actions'
import Navbar from '@/components/Navbar'

export default async function AcademicYearPage() {
  const user = await getCurrentUser()
  if (!user || user.role !== 'teacher') redirect('/login')

  const [academicYears, active] = await Promise.all([
    getSchoolAcademicYears(),
    getActiveSetting(),
  ])

  // ปีการศึกษามาจากระบบกลางของโรงเรียน (school_app) — แต่ละปีเลือกได้ภาคเรียนที่ 1 หรือ 2
  const options = academicYears.flatMap((ay) =>
    [2, 1].map((semester) => ({
      year: ay,
      semester,
      label: `${ay.title} ภาคเรียนที่ ${semester}`,
      isActive: active?.academicYearId === ay.id && active?.semester === semester,
    }))
  )

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar user={user} />
      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-6">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">ปีการศึกษา</h1>
          {active ? (
            <p className="text-gray-500 mt-1">
              ปัจจุบัน:{' '}
              <span className="font-medium text-indigo-600">{active.label}</span>
            </p>
          ) : (
            <p className="text-amber-600 mt-1 text-sm">
              ⚠️ ยังไม่ได้เลือกปีการศึกษาที่ใช้งาน
            </p>
          )}
          <p className="text-gray-400 text-sm mt-1">
            รายการปีการศึกษาดึงจากระบบกลางของโรงเรียน — เลือกปีและภาคเรียนที่ต้องการใช้งานได้เท่านั้น
          </p>
        </div>

        {/* List */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100">
            <h2 className="text-base font-semibold text-gray-900">
              ปีการศึกษาทั้งหมด
            </h2>
          </div>
          {options.length === 0 ? (
            <div className="px-6 py-10 text-center text-gray-400 text-sm">
              ไม่พบปีการศึกษาในระบบกลางของโรงเรียน
            </div>
          ) : (
            <ul className="divide-y divide-gray-100">
              {options.map((opt) => (
                <li
                  key={`${opt.year.id}-${opt.semester}`}
                  className={`flex items-center justify-between px-6 py-4 ${
                    opt.isActive ? 'bg-indigo-50' : 'hover:bg-gray-50'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div>
                      <p className="text-sm font-medium text-gray-900">{opt.label}</p>
                    </div>
                    {opt.isActive && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
                        ใช้งานอยู่
                      </span>
                    )}
                  </div>
                  {!opt.isActive && (
                    <form action={setActiveAcademicYear.bind(null, opt.year.id, opt.semester)}>
                      <button
                        type="submit"
                        className="text-sm text-indigo-600 hover:text-indigo-800 font-medium px-3 py-1 rounded hover:bg-indigo-50 transition"
                      >
                        ตั้งเป็นปัจจุบัน
                      </button>
                    </form>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </main>
    </div>
  )
}

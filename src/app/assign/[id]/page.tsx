import { getCurrentUser } from '@/lib/auth'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import { getSchoolAcademicYears } from '@/lib/academicYear'
import {
  getSchoolStudents,
  findSchoolStudentsByCodesAndYear,
  type SchoolStudent,
} from '@/lib/students'
import { languageLabel, scoreLabel } from '@/lib/languages'
import Navbar from '@/components/Navbar'
import TurtleCanvas from '@/components/TurtleCanvas'
import DeleteAssignmentButton from '../DeleteAssignmentButton'
import { updateAssignmentDue } from '../actions'

// ค่า default ของ input datetime-local (เวลาท้องถิ่นเครื่องเซิร์ฟเวอร์)
function toLocalInput(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

export default async function AssignmentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const user = await getCurrentUser()
  if (!user || user.role !== 'teacher') redirect('/login')

  const { id: idRaw } = await params
  const id = parseInt(idRaw)
  if (!id) notFound()

  const [assignment, years] = await Promise.all([
    prisma.assignment.findUnique({
      where: { id },
      include: {
        problem: { select: { id: true, title: true, language: true } },
        submissions: { orderBy: { createdAt: 'desc' } },
      },
    }),
    getSchoolAcademicYears(),
  ])
  if (!assignment) notFound()

  // นักเรียนที่อยู่ในขอบเขตการมอบหมายนี้
  let students: SchoolStudent[]
  if (assignment.studentCode) {
    students = await findSchoolStudentsByCodesAndYear(
      [assignment.studentCode],
      assignment.academicYearId
    )
  } else {
    const r = await getSchoolStudents({
      yearId: assignment.academicYearId,
      classLevel: assignment.classLevel ?? undefined,
      classRoom: assignment.classRoom ?? undefined,
      pageSize: 2000,
    })
    students = r.students
  }

  // ผลส่งล่าสุด + จำนวนครั้ง ต่อนักเรียน
  const latest = new Map<string, (typeof assignment.submissions)[number]>()
  const attempts = new Map<string, number>()
  for (const s of assignment.submissions) {
    if (!latest.has(s.studentCode)) latest.set(s.studentCode, s)
    attempts.set(s.studentCode, (attempts.get(s.studentCode) ?? 0) + 1)
  }

  const submittedCount = students.filter((s) => latest.has(s.student_code)).length
  const fullScoreCount = students.filter((s) => {
    const l = latest.get(s.student_code)
    return l && l.passed === l.total
  }).length

  const yearTitle =
    years.find((y) => y.id === assignment.academicYearId)?.title ??
    `ปี id ${assignment.academicYearId}`
  const targetLabel = assignment.studentCode
    ? `รายคน (${assignment.classLevel}/${assignment.classRoom})`
    : `${assignment.classLevel} ${assignment.classRoom ? `ห้อง ${assignment.classRoom}` : '(ทุกห้อง)'}`

  const inputClass =
    'px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent'

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar user={user} />
      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
        <div className="mb-6">
          <Link href="/assign" className="text-sm text-gray-500 hover:text-indigo-600">
            ← กลับหน้ามอบหมายงาน
          </Link>
          <div className="flex items-center justify-between mt-2 gap-3">
            <h1 className="text-2xl font-bold text-gray-900 min-w-0">
              {assignment.problem.title}
            </h1>
            <div className="flex items-center gap-1 shrink-0">
              <Link
                href={`/problems/${assignment.problem.id}`}
                className="text-sm text-indigo-600 hover:text-indigo-800 font-medium px-3 py-1 rounded hover:bg-indigo-50 transition"
              >
                ดูโจทย์
              </Link>
              <DeleteAssignmentButton
                id={assignment.id}
                label={assignment.problem.title}
                redirectTo="/assign"
              />
            </div>
          </div>
          <p className="text-gray-500 mt-1">
            {languageLabel(assignment.problem.language)} · {targetLabel} · {yearTitle}{' '}
            ภาคเรียนที่ {assignment.semester}
          </p>
        </div>

        {/* สรุป + กำหนดส่ง */}
        <div className="grid sm:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-sm text-gray-500">นักเรียน</p>
            <p className="text-2xl font-bold text-gray-900 mt-0.5">{students.length}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-sm text-gray-500">ส่งแล้ว</p>
            <p className="text-2xl font-bold text-indigo-600 mt-0.5">
              {submittedCount}
              <span className="text-sm font-normal text-gray-400"> / {students.length}</span>
            </p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-sm text-gray-500">ผ่านครบทุกเคส</p>
            <p className="text-2xl font-bold text-green-600 mt-0.5">{fullScoreCount}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-sm text-gray-500 mb-1.5">กำหนดส่ง</p>
            <form
              action={updateAssignmentDue.bind(null, assignment.id)}
              className="flex gap-2"
            >
              <input
                type="datetime-local"
                name="dueAt"
                defaultValue={assignment.dueAt ? toLocalInput(assignment.dueAt) : ''}
                className={`${inputClass} flex-1 min-w-0`}
              />
              <button
                type="submit"
                className="px-3 py-2 text-sm font-medium text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition shrink-0"
              >
                บันทึก
              </button>
            </form>
          </div>
        </div>

        {/* รายชื่อ + ผลงาน */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100">
            <h2 className="text-base font-semibold text-gray-900">ผลการทำงานรายคน</h2>
          </div>
          {students.length === 0 ? (
            <div className="px-6 py-10 text-center text-gray-400 text-sm">
              ไม่พบนักเรียนในขอบเขตนี้
            </div>
          ) : (
            <ul className="divide-y divide-gray-100">
              {students.map((s) => {
                const l = latest.get(s.student_code)
                const n = attempts.get(s.student_code) ?? 0
                return (
                  <li key={s.id} className="px-6 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0 flex items-baseline gap-2">
                        <span className="text-xs text-gray-400 w-12 shrink-0">
                          {s.student_code}
                        </span>
                        <span className="text-sm font-medium text-gray-900 truncate">
                          {s.first_name} {s.last_name}
                        </span>
                        <span className="text-xs text-gray-400 shrink-0">
                          {s.class_level}/{s.class_room} เลขที่ {s.number_in_room}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        {l ? (
                          <>
                            <span className="text-xs text-gray-400">
                              ส่ง {n} ครั้ง · ล่าสุด{' '}
                              {l.createdAt.toLocaleString('th-TH', {
                                dateStyle: 'short',
                                timeStyle: 'short',
                              })}
                            </span>
                            <span
                              className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${
                                l.passed === l.total
                                  ? 'bg-green-100 text-green-700'
                                  : 'bg-amber-100 text-amber-700'
                              }`}
                            >
                              {scoreLabel(assignment.problem.language, l.passed, l.total)}
                            </span>
                          </>
                        ) : (
                          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-500">
                            ยังไม่ส่ง
                          </span>
                        )}
                      </div>
                    </div>
                    {l && (
                      <details className="mt-1.5 ml-14">
                        <summary className="text-xs text-indigo-600 cursor-pointer hover:underline">
                          {assignment.problem.language === 'turtle'
                            ? 'ดูภาพและโค้ดที่ส่งล่าสุด'
                            : 'ดูโค้ดที่ส่งล่าสุด'}
                        </summary>
                        {assignment.problem.language === 'turtle' && (
                          <div className="mt-2">
                            <TurtleCanvas
                              drawing={l.details}
                              size={260}
                              emptyText="ไม่มีภาพบันทึกไว้"
                            />
                          </div>
                        )}
                        <pre className="mt-2 bg-gray-900 text-gray-100 rounded-lg p-3 text-xs font-mono overflow-x-auto whitespace-pre-wrap">
                          {l.code}
                        </pre>
                      </details>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </main>
    </div>
  )
}

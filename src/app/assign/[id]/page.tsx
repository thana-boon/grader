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
import { languageLabel } from '@/lib/languages'
import { withBase } from '@/lib/basePath'
import { bestScore, formatScore } from '@/lib/scoring'
import Navbar from '@/components/Navbar'
import TurtleCanvas from '@/components/TurtleCanvas'
import DeleteAssignmentButton from '../DeleteAssignmentButton'
import { updateAssignmentDue } from '../actions'

// token ไฟล์ .sb3 ใน details ของการส่งงาน scratch
function scratchFileToken(details: string | null): string | null {
  if (!details) return null
  try {
    const d = JSON.parse(details)
    return typeof d.file === 'string' ? d.file : null
  } catch {
    return null
  }
}

// ค่า default ของ input datetime-local (เวลาท้องถิ่นเครื่องเซิร์ฟเวอร์)
function toLocalInput(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

export default async function AssignmentDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ tab?: string }>
}) {
  const user = await getCurrentUser()
  if (!user || user.role !== 'teacher') redirect('/login')

  const { id: idRaw } = await params
  const { tab: tabParam } = await searchParams
  const id = parseInt(idRaw)
  if (!id) notFound()

  const [task, years] = await Promise.all([
    prisma.assignment.findUnique({
      where: { id },
      include: {
        problems: {
          orderBy: { sortOrder: 'asc' },
          include: { problem: { select: { id: true, title: true, language: true } } },
        },
        targets: true,
        submissions: { orderBy: { createdAt: 'desc' } },
      },
    }),
    getSchoolAcademicYears(),
  ])
  if (!task) notFound()

  // โจทย์พร้อมคะแนนเต็มรายข้อในงานนี้
  const problems = task.problems.map((tp) => ({ ...tp.problem, points: tp.points }))
  const totalPoints = problems.reduce((sum, p) => sum + p.points, 0)
  const policy = { freeAttempts: task.freeAttempts, penaltyPercent: task.penaltyPercent }

  // แท็บ: ห้องละแท็บ + แท็บ "รายคน" ถ้ามี
  const roomTargets = task.targets
    .filter((t) => !t.studentCode)
    .sort((a, b) =>
      a.classLevel === b.classLevel
        ? a.classRoom - b.classRoom
        : a.classLevel.localeCompare(b.classLevel, 'th')
    )
  const indivTargets = task.targets.filter((t) => t.studentCode)

  const tabs = [
    ...roomTargets.map((t) => ({
      key: `${t.classLevel}/${t.classRoom}`,
      label: `${t.classLevel}/${t.classRoom}`,
      room: t,
    })),
    ...(indivTargets.length > 0
      ? [{ key: 'indiv', label: `รายคน (${indivTargets.length})`, room: null }]
      : []),
  ]
  const activeTab = tabs.find((t) => t.key === tabParam) ?? tabs[0]

  // นักเรียนของแท็บที่เลือก
  let students: SchoolStudent[] = []
  if (activeTab) {
    if (activeTab.room) {
      const r = await getSchoolStudents({
        yearId: task.academicYearId,
        classLevel: activeTab.room.classLevel,
        classRoom: activeTab.room.classRoom,
        pageSize: 2000,
      })
      students = r.students
    } else {
      students = await findSchoolStudentsByCodesAndYear(
        indivTargets.map((t) => t.studentCode!),
        task.academicYearId
      )
    }
  }

  // ผลส่งล่าสุดต่อ (ข้อ, นักเรียน) — ใช้แสดงโค้ด/ภาพที่ส่ง
  // และการส่งทุกครั้งเรียงเก่า→ใหม่ — ใช้คิดคะแนน (ลำดับ = ครั้งที่ส่ง)
  const latest = new Map<string, (typeof task.submissions)[number]>()
  const byKey = new Map<string, (typeof task.submissions)[number][]>()
  for (const s of task.submissions) {
    const key = `${s.problemId}:${s.studentCode}`
    if (!latest.has(key)) latest.set(key, s)
    const arr = byKey.get(key)
    if (arr) arr.unshift(s) // วนจากใหม่→เก่า จึง unshift ให้ array เรียงเก่า→ใหม่
    else byKey.set(key, [s])
  }

  // คะแนนจริงของข้อ = ครั้งที่ดีที่สุดหลังหักส่งซ้ำ (null = ยังไม่ส่ง)
  const scoreOf = (problemId: number, points: number, studentCode: string): number | null => {
    const subs = byKey.get(`${problemId}:${studentCode}`)
    return subs ? bestScore(subs, points, policy) : null
  }
  const totalScore = (s: SchoolStudent) =>
    problems.reduce((sum, p) => sum + (scoreOf(p.id, p.points, s.student_code) ?? 0), 0)
  const doneCount = (s: SchoolStudent) =>
    problems.filter((p) => latest.has(`${p.id}:${s.student_code}`)).length

  const submittedStudents = students.filter((s) => doneCount(s) > 0).length
  const allFullStudents = students.filter(
    (s) => doneCount(s) === problems.length && totalScore(s) >= totalPoints
  ).length

  const yearTitle =
    years.find((y) => y.id === task.academicYearId)?.title ?? `ปี id ${task.academicYearId}`

  // ป้ายคะแนนรายข้อ — tooltip บอกผลตรวจดิบ + จำนวนครั้งที่ส่ง
  const scoreBadge = (score: number, points: number, tooltip: string) => (
    <span
      title={tooltip}
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
        score >= points ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
      }`}
    >
      {formatScore(score)}
    </span>
  )

  const inputClass =
    'px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent'

  return (
    <div className="min-h-screen bg-page">
      <Navbar user={user} />
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
        <div className="mb-6">
          <Link href="/assign" className="text-sm text-gray-500 hover:text-indigo-600">
            ← กลับหน้ามอบหมายงาน
          </Link>
          <div className="flex items-center justify-between mt-2 gap-3">
            <h1 className="text-2xl font-bold text-gray-900 min-w-0">{task.title}</h1>
            <div className="shrink-0 flex items-center gap-2">
              <a
                href={withBase(`/assign/${task.id}/export`)}
                className="px-4 py-2 text-sm font-medium text-green-700 bg-green-50 hover:bg-green-100 rounded-lg transition"
              >
                ⬇ Export Excel
              </a>
              <DeleteAssignmentButton id={task.id} label={task.title} redirectTo="/assign" />
            </div>
          </div>
          <p className="text-gray-500 mt-1">
            {problems.length} ข้อ · เต็ม {totalPoints} คะแนน ·{' '}
            {task.freeAttempts > 0
              ? `ส่งฟรี ${task.freeAttempts} ครั้ง เกินหัก ${task.penaltyPercent}%/ครั้ง`
              : 'ส่งซ้ำได้ไม่จำกัด'}{' '}
            · {yearTitle} ภาคเรียนที่ {task.semester} · สร้างเมื่อ{' '}
            {task.createdAt.toLocaleDateString('th-TH', { dateStyle: 'medium' })}
          </p>
          <p className="text-sm text-gray-500 mt-1">
            โจทย์:{' '}
            {problems.map((p, i) => (
              <span key={p.id}>
                {i > 0 && ' · '}
                <Link href={`/problems/${p.id}`} className="text-indigo-600 hover:underline">
                  ข้อ {i + 1} {p.title}
                </Link>
              </span>
            ))}
          </p>
        </div>

        {/* สรุป + กำหนดส่ง */}
        <div className="grid sm:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-2xl border border-indigo-100 shadow-sm p-4">
            <p className="text-sm text-gray-500">นักเรียน (แท็บนี้)</p>
            <p className="text-2xl font-bold text-gray-900 mt-0.5">{students.length}</p>
          </div>
          <div className="bg-white rounded-2xl border border-indigo-100 shadow-sm p-4">
            <p className="text-sm text-gray-500">เริ่มทำแล้ว</p>
            <p className="text-2xl font-bold text-indigo-600 mt-0.5">
              {submittedStudents}
              <span className="text-sm font-normal text-gray-400"> / {students.length}</span>
            </p>
          </div>
          <div className="bg-white rounded-2xl border border-indigo-100 shadow-sm p-4">
            <p className="text-sm text-gray-500">เต็มทุกข้อ</p>
            <p className="text-2xl font-bold text-green-600 mt-0.5">{allFullStudents}</p>
          </div>
          <div className="bg-white rounded-2xl border border-indigo-100 shadow-sm p-4">
            <p className="text-sm text-gray-500 mb-1.5">กำหนดส่ง</p>
            <form action={updateAssignmentDue.bind(null, task.id)} className="flex gap-2">
              <input
                type="datetime-local"
                name="dueAt"
                defaultValue={task.dueAt ? toLocalInput(task.dueAt) : ''}
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

        {/* แท็บห้อง */}
        <div className="flex flex-wrap gap-1 border-b border-gray-200 mb-4">
          {tabs.map((t) => (
            <Link
              key={t.key}
              href={`/assign/${task.id}?tab=${encodeURIComponent(t.key)}`}
              className={`px-4 py-2 text-sm font-medium rounded-t-lg border-b-2 -mb-px transition ${
                activeTab?.key === t.key
                  ? 'border-indigo-600 text-indigo-700 bg-white'
                  : 'border-transparent text-gray-500 hover:text-indigo-600 hover:bg-gray-100'
              }`}
            >
              {t.label}
            </Link>
          ))}
        </div>

        {/* ตารางคะแนน */}
        <div className="bg-white rounded-2xl border border-indigo-100 shadow-sm overflow-hidden">
          {students.length === 0 ? (
            <div className="px-6 py-10 text-center text-gray-400 text-sm">
              ไม่พบนักเรียนในแท็บนี้
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-left text-gray-500 border-b border-gray-200">
                    <th className="px-4 py-3 font-medium">เลขที่</th>
                    <th className="px-4 py-3 font-medium">ชื่อ-นามสกุล</th>
                    {problems.map((p, i) => (
                      <th key={p.id} className="px-4 py-3 font-medium text-center" title={p.title}>
                        ข้อ {i + 1}
                        <span className="block text-xs font-normal text-gray-400">
                          {p.points} คะแนน
                        </span>
                      </th>
                    ))}
                    <th className="px-4 py-3 font-medium text-center">
                      รวม
                      <span className="block text-xs font-normal text-gray-400">
                        {totalPoints} คะแนน
                      </span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {students.map((s) => {
                    const total = totalScore(s)
                    const hasAny = doneCount(s) > 0
                    return (
                      <tr key={s.id} className="hover:bg-gray-50 align-top">
                        <td className="px-4 py-3 text-gray-500">{s.number_in_room}</td>
                        <td className="px-4 py-3">
                          <p className="text-gray-900 font-medium">
                            {s.first_name} {s.last_name}
                          </p>
                          <p className="text-xs text-gray-400">
                            {s.student_code}
                            {activeTab?.room ? '' : ` · ${s.class_level}/${s.class_room}`}
                          </p>
                          {hasAny && (
                            <details className="mt-1">
                              <summary className="text-xs text-indigo-600 cursor-pointer hover:underline">
                                ดูงานที่ส่ง
                              </summary>
                              <div className="mt-2 space-y-3">
                                {problems.map((p, i) => {
                                  const l = latest.get(`${p.id}:${s.student_code}`)
                                  if (!l) return null
                                  return (
                                    <div key={p.id}>
                                      <p className="text-xs font-medium text-gray-600 mb-1">
                                        ข้อ {i + 1} {p.title} ({languageLabel(p.language)}) — ส่งเมื่อ{' '}
                                        {l.createdAt.toLocaleString('th-TH', {
                                          dateStyle: 'short',
                                          timeStyle: 'short',
                                        })}
                                      </p>
                                      {p.language === 'turtle' && (
                                        <div className="mb-1">
                                          <TurtleCanvas
                                            drawing={l.details}
                                            size={220}
                                            emptyText="ไม่มีภาพบันทึกไว้"
                                          />
                                        </div>
                                      )}
                                      {p.language === 'scratch' &&
                                        scratchFileToken(l.details) && (
                                          <a
                                            href={withBase(`/api/scratch/file?token=${scratchFileToken(l.details)}`)}
                                            className="inline-block mb-1 text-xs text-indigo-600 hover:underline"
                                          >
                                            ⬇ ดาวน์โหลดไฟล์ .sb3 (เปิดดูใน Scratch ได้)
                                          </a>
                                        )}
                                      <pre className="bg-gray-900 text-gray-100 rounded-lg p-3 text-xs font-mono overflow-x-auto whitespace-pre-wrap max-w-xl">
                                        {l.code}
                                      </pre>
                                    </div>
                                  )
                                })}
                              </div>
                            </details>
                          )}
                        </td>
                        {problems.map((p) => {
                          const subs = byKey.get(`${p.id}:${s.student_code}`)
                          const l = latest.get(`${p.id}:${s.student_code}`)
                          const score = scoreOf(p.id, p.points, s.student_code)
                          return (
                            <td key={p.id} className="px-4 py-3 text-center">
                              {score !== null && subs && l ? (
                                scoreBadge(
                                  score,
                                  p.points,
                                  `ส่ง ${subs.length} ครั้ง · ล่าสุด ${
                                    p.language === 'turtle'
                                      ? `เหมือนเฉลย ${l.passed}%`
                                      : `ผ่าน ${l.passed}/${l.total} เคส`
                                  }`
                                )
                              ) : (
                                <span className="text-gray-300">—</span>
                              )}
                            </td>
                          )
                        })}
                        <td className="px-4 py-3 text-center">
                          <span
                            className={`text-xs font-medium ${
                              hasAny && total >= totalPoints ? 'text-green-600' : 'text-gray-500'
                            }`}
                          >
                            {hasAny ? formatScore(total) : '—'}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}

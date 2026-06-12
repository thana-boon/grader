import { NextRequest, NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth'
import {
  getSchoolStudents,
  findSchoolStudentsByCodesAndYear,
  type SchoolStudent,
} from '@/lib/students'
import { bestScore, roundScore } from '@/lib/scoring'

// Export คะแนนของงานเป็นไฟล์ Excel — sheet ละห้อง (+ sheet "รายคน" ถ้ามี)
// คอลัมน์: รหัสนักเรียน ชื่อ นามสกุล ชั้น เลขที่ คะแนนรายข้อ รวม
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser()
  if (!user || user.role !== 'teacher') {
    return NextResponse.json({ error: 'ไม่ได้รับอนุญาต' }, { status: 403 })
  }

  const { id: idRaw } = await params
  const id = parseInt(idRaw)
  if (!id) return NextResponse.json({ error: 'ไม่พบงาน' }, { status: 404 })

  const task = await prisma.assignment.findUnique({
    where: { id },
    include: {
      problems: {
        orderBy: { sortOrder: 'asc' },
        include: { problem: { select: { id: true, title: true } } },
      },
      targets: true,
      submissions: { orderBy: { createdAt: 'asc' } },
    },
  })
  if (!task) return NextResponse.json({ error: 'ไม่พบงาน' }, { status: 404 })

  const problems = task.problems.map((tp) => ({ ...tp.problem, points: tp.points }))
  const policy = { freeAttempts: task.freeAttempts, penaltyPercent: task.penaltyPercent }

  // การส่งทุกครั้งเรียงเก่า→ใหม่ ต่อ (ข้อ, นักเรียน) — คิดคะแนนครั้งที่ดีที่สุด
  const byKey = new Map<string, typeof task.submissions>()
  for (const s of task.submissions) {
    const key = `${s.problemId}:${s.studentCode}`
    const arr = byKey.get(key)
    if (arr) arr.push(s)
    else byKey.set(key, [s])
  }

  // แถวข้อมูลของนักเรียนหนึ่งคน — คะแนนเว้นว่างถ้ายังไม่ส่งข้อนั้น
  const studentRow = (s: SchoolStudent) => {
    let total = 0
    let submittedAny = false
    const scores = problems.map((p) => {
      const subs = byKey.get(`${p.id}:${s.student_code}`)
      if (!subs) return ''
      submittedAny = true
      const score = bestScore(subs, p.points, policy)
      total += score
      return score
    })
    return [
      s.student_code,
      s.first_name,
      s.last_name,
      `${s.class_level}/${s.class_room}`,
      s.number_in_room,
      ...scores,
      submittedAny ? roundScore(total) : '',
    ]
  }

  const header = [
    'รหัสนักเรียน',
    'ชื่อ',
    'นามสกุล',
    'ชั้น',
    'เลขที่',
    ...problems.map((p, i) => `ข้อ ${i + 1} (${p.points})`),
    `รวม (${problems.reduce((sum, p) => sum + p.points, 0)})`,
  ]

  // ชื่อ sheet ห้ามมี / \ ? * [ ] : และยาวไม่เกิน 31 ตัวอักษร
  const sheetName = (name: string) =>
    name.replace(/[/\\?*[\]:]/g, '-').slice(0, 31)

  const wb = XLSX.utils.book_new()
  const addSheet = (name: string, students: SchoolStudent[]) => {
    const ws = XLSX.utils.aoa_to_sheet([header, ...students.map(studentRow)])
    // ความกว้างคอลัมน์พออ่านสบาย
    ws['!cols'] = [
      { wch: 12 },
      { wch: 16 },
      { wch: 16 },
      { wch: 8 },
      { wch: 7 },
      ...problems.map(() => ({ wch: 10 })),
      { wch: 10 },
    ]
    XLSX.utils.book_append_sheet(wb, ws, sheetName(name))
  }

  // sheet ละห้อง ตามเป้าหมายของงาน
  const roomTargets = task.targets
    .filter((t) => !t.studentCode)
    .sort((a, b) =>
      a.classLevel === b.classLevel
        ? a.classRoom - b.classRoom
        : a.classLevel.localeCompare(b.classLevel, 'th')
    )
  for (const t of roomTargets) {
    const r = await getSchoolStudents({
      yearId: task.academicYearId,
      classLevel: t.classLevel,
      classRoom: t.classRoom,
      pageSize: 2000,
    })
    addSheet(`${t.classLevel}-${t.classRoom}`, r.students)
  }

  // sheet รายคน (ถ้ามอบหมายรายคนไว้)
  const indivCodes = task.targets.filter((t) => t.studentCode).map((t) => t.studentCode!)
  if (indivCodes.length > 0) {
    const students = await findSchoolStudentsByCodesAndYear(indivCodes, task.academicYearId)
    addSheet('รายคน', students)
  }

  if (wb.SheetNames.length === 0) {
    return NextResponse.json({ error: 'งานนี้ไม่มีเป้าหมาย' }, { status: 400 })
  }

  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      // ชื่อไฟล์ภาษาไทยใช้ filename* (RFC 5987) — filename ธรรมดาเป็น ascii สำรอง
      'Content-Disposition': `attachment; filename="scores-${task.id}.xlsx"; filename*=UTF-8''${encodeURIComponent(`คะแนน-${task.title}.xlsx`)}`,
    },
  })
}

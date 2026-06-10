import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { getActiveSetting } from '@/lib/academicYear'
import { getSchoolStudents } from '@/lib/students'

// รายชื่อนักเรียนในชั้น/ห้องของปีที่ใช้งาน — ใช้ในฟอร์มมอบหมายรายคน (เฉพาะครู)
export async function GET(request: NextRequest) {
  const user = await getCurrentUser()
  if (!user || user.role !== 'teacher') {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const active = await getActiveSetting()
  if (!active) return NextResponse.json({ students: [] })

  const level = request.nextUrl.searchParams.get('level') ?? undefined
  const roomRaw = request.nextUrl.searchParams.get('room')
  const room = roomRaw ? parseInt(roomRaw) : undefined

  if (!level) return NextResponse.json({ students: [] })

  const { students } = await getSchoolStudents({
    yearId: active.academicYearId,
    classLevel: level,
    classRoom: room,
    pageSize: 500,
  })

  return NextResponse.json({
    students: students.map((s) => ({
      code: s.student_code,
      name: `${s.first_name} ${s.last_name}`,
      classLevel: s.class_level,
      classRoom: s.class_room,
      number: s.number_in_room,
    })),
  })
}

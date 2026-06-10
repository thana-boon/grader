import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { signJWT } from '@/lib/jwt'
import { getActiveSetting } from '@/lib/academicYear'
import { findSchoolStudentsByCode } from '@/lib/students'
import bcrypt from 'bcryptjs'

const COOKIE_MAX_AGE = 60 * 60 * 24 * 7 // 7 วัน

function setAuthCookie(response: NextResponse, token: string) {
  response.cookies.set('auth-token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: COOKIE_MAX_AGE,
    path: '/',
  })
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null)
  if (!body) {
    return NextResponse.json({ error: 'ข้อมูลไม่ถูกต้อง' }, { status: 400 })
  }

  const { username, password } = body as { username: string; password: string }

  if (!username?.trim() || !password) {
    return NextResponse.json({ error: 'กรุณากรอกข้อมูลให้ครบถ้วน' }, { status: 400 })
  }

  // ===== ลองเป็นครูก่อน =====
  const teacher = await prisma.teacher.findUnique({
    where: { username: username.trim() },
  })

  if (teacher) {
    const valid = await bcrypt.compare(password, teacher.password)
    if (!valid) {
      return NextResponse.json({ error: 'รหัสผ่านไม่ถูกต้อง' }, { status: 401 })
    }

    const token = await signJWT({
      userId: teacher.id,
      role: 'teacher',
      name: teacher.name,
      isAdmin: teacher.is_admin,
    })

    const res = NextResponse.json({ success: true, redirectTo: '/dashboard/teacher' })
    setAuthCookie(res, token)
    return res
  }

  // ===== ลองเป็นนักเรียน =====
  // ไม่ต้องสร้างบัญชี — ตรวจกับข้อมูลนักเรียนใน school_app โดยตรง
  // username: รหัสนักเรียนแบบ 5 หลัก (เติม 0 ข้างหน้า), password: Skdw + เลขบัตรประชาชน
  const candidates = await findSchoolStudentsByCode(username)

  if (candidates.length > 0) {
    // นักเรียนคนเดียวกันมีแถวได้หลายปี — ใช้แถวของปีที่เว็บตั้งใช้งานอยู่ก่อน ไม่มีก็ใช้ปีล่าสุด
    const active = await getActiveSetting()
    const student =
      candidates.find((c) => c.year_id === active?.academicYearId) ?? candidates[0]

    const expectedPassword = student.citizen_id ? `Skdw${student.citizen_id}` : null
    if (!expectedPassword || password !== expectedPassword) {
      return NextResponse.json({ error: 'รหัสผ่านไม่ถูกต้อง' }, { status: 401 })
    }

    const token = await signJWT({
      userId: student.id,
      role: 'student',
      name: `${student.first_name} ${student.last_name}`,
      studentCode: student.student_code.padStart(5, '0'),
    })

    const res = NextResponse.json({ success: true, redirectTo: '/dashboard/student' })
    setAuthCookie(res, token)
    return res
  }

  // ไม่พบทั้งครูและนักเรียน
  return NextResponse.json({ error: 'ไม่พบบัญชีผู้ใช้' }, { status: 401 })
}

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { signJWT, SESSION_MINUTES, COOKIE_SECURE } from '@/lib/jwt'
import { getActiveSetting } from '@/lib/academicYear'
import { findSchoolStudentForLogin } from '@/lib/students'
import { verifyStudent } from '@/lib/studentApi'
import bcrypt from 'bcryptjs'

// รหัสผ่านนักเรียน = "Skdw" + เลขบัตรประชาชน 13 หลัก
const STUDENT_PASSWORD_PREFIX = 'Skdw'

const COOKIE_MAX_AGE = 60 * SESSION_MINUTES // หมดอายุพร้อม token — ต่ออายุเมื่อมีการใช้งาน

function setAuthCookie(response: NextResponse, token: string) {
  response.cookies.set('auth-token', token, {
    httpOnly: true,
    secure: COOKIE_SECURE,
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

  // ===== ลองเป็นผู้เข้าแข่งขัน (บัญชีชั่วคราว) =====
  const contestant = await prisma.contestant.findUnique({
    where: { username: username.trim() },
  })

  if (contestant) {
    // รหัสผ่านบัญชีแข่งเก็บตรงๆ เพื่อให้ครูพิมพ์แจกได้
    if (password !== contestant.password) {
      return NextResponse.json({ error: 'รหัสผ่านไม่ถูกต้อง' }, { status: 401 })
    }

    const token = await signJWT({
      userId: contestant.id,
      role: 'contestant',
      name: contestant.displayName,
      competitionId: contestant.competitionId,
    })

    const res = NextResponse.json({ success: true, redirectTo: '/arena' })
    setAuthCookie(res, token)
    return res
  }

  // ===== ลองเป็นนักเรียน =====
  // ไม่ต้องสร้างบัญชี — ตรวจกับ Student API กลาง
  // username: รหัสนักเรียน (เติม 0 ข้างหน้าได้), password: Skdw + เลขบัตรประชาชน 13 หลัก
  const active = await getActiveSetting()
  const student = await findSchoolStudentForLogin(username, active?.academicYearId)

  if (student) {
    // ตัด prefix เอาเลขบัตรประชาชนจากรหัสผ่าน แล้วยืนยันผ่าน API (ไม่อ่าน citizen_id ตรงๆ)
    const citizenId = password.startsWith(STUDENT_PASSWORD_PREFIX)
      ? password.slice(STUDENT_PASSWORD_PREFIX.length)
      : ''
    const matched = citizenId ? await verifyStudent(student.student_code, citizenId) : false
    if (!matched) {
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

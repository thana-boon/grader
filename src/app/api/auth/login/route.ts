import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { signJWT, COOKIE_SECURE } from '@/lib/jwt'
import { getActiveSetting } from '@/lib/academicYear'
import { findSchoolStudentForLogin } from '@/lib/students'
import { verifyStudent } from '@/lib/studentApi'
import { loginTeacher, type ApiTeacher } from '@/lib/teacherApi'
import bcrypt from 'bcryptjs'

// รหัสผ่านนักเรียน = "Skdw" + เลขบัตรประชาชน 13 หลัก
const STUDENT_PASSWORD_PREFIX = 'Skdw'

// ประกอบชื่อครูจากโปรไฟล์ที่ teacher-api คืนมา
function teacherDisplayName(t: ApiTeacher): string {
  const full = `${t.title ?? ''}${t.first_name} ${t.last_name}`.trim()
  return full || t.teacher_code
}

function setAuthCookie(response: NextResponse, token: string) {
  // ไม่ตั้ง maxAge/expires = session cookie — ปิดเบราว์เซอร์แล้ว cookie หายทันที
  // (กันเคสห้องคอม: นักเรียนปิดเบราว์เซอร์โดยไม่ logout คนต่อไปเปิดมาจะไม่ติด session เดิม)
  // อายุ session จริงคุมด้วย token TTL (idle) + absolute timeout ฝั่งเซิร์ฟเวอร์อยู่แล้ว
  response.cookies.set('auth-token', token, {
    httpOnly: true,
    secure: COOKIE_SECURE,
    sameSite: 'lax',
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

  const uname = username.trim()

  // ===== บัญชีครู local (fallback) — teacherCode = null, มีรหัสผ่านในเครื่อง =====
  const localTeacher = await prisma.teacher.findUnique({ where: { username: uname } })
  if (localTeacher && localTeacher.teacherCode === null && localTeacher.password) {
    const valid = await bcrypt.compare(password, localTeacher.password)
    if (!valid) {
      return NextResponse.json({ error: 'รหัสผ่านไม่ถูกต้อง' }, { status: 401 })
    }

    const token = await signJWT({
      userId: localTeacher.id,
      role: 'teacher',
      name: localTeacher.name,
      isAdmin: localTeacher.is_admin,
    })

    const res = NextResponse.json({ success: true, redirectTo: '/dashboard/teacher' })
    setAuthCookie(res, token)
    return res
  }

  // ===== ครูจาก teacher-api — login ด้วยรหัสประจำตัวครู (teacher_code) + รหัสผ่าน =====
  // ตรวจกับ API กลาง สำเร็จแล้ว mirror โปรไฟล์ลงตาราง teachers (เก็บ is_admin ในเครื่อง)
  // เชื่อม API ไม่ได้ → ปล่อยให้ลองเป็นนักเรียน/ผู้เข้าแข่งต่อ (ไม่ block การ login อื่น)
  let apiTeacher: ApiTeacher | null = null
  try {
    apiTeacher = await loginTeacher(uname, password)
  } catch {
    apiTeacher = null
  }

  if (apiTeacher) {
    const name = teacherDisplayName(apiTeacher)
    // mirror: ผูกด้วย teacherCode — ไม่เขียนทับ is_admin ที่ตั้งไว้ในเครื่อง
    const teacher = await prisma.teacher.upsert({
      where: { teacherCode: apiTeacher.teacher_code },
      update: { name },
      create: {
        teacherCode: apiTeacher.teacher_code,
        username: apiTeacher.teacher_code,
        name,
        is_admin: false,
      },
    })

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

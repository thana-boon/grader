import { NextRequest, NextResponse } from 'next/server'
import { verifyJWT, renewJWT, COOKIE_SECURE } from '@/lib/jwt'

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  const token = request.cookies.get('auth-token')?.value

  // สร้าง redirect จาก nextUrl.clone() แทน new URL(path, request.url)
  // เพราะ nextUrl เก็บ basePath (เช่น '/grader') ไว้ให้ — new URL จะได้ URL ที่ขาด basePath
  const redirectTo = (path: string) => {
    const url = request.nextUrl.clone()
    url.pathname = path
    url.search = ''
    return NextResponse.redirect(url)
  }

  // หน้า login — ถ้า login แล้วให้ redirect ไป dashboard
  if (pathname === '/login') {
    if (token) {
      const user = await verifyJWT(token)
      if (user) {
        const home =
          user.role === 'teacher'
            ? '/dashboard/teacher'
            : user.role === 'contestant'
              ? '/arena'
              : '/dashboard/student'
        return redirectTo(home)
      }
    }
    return NextResponse.next()
  }

  // ทุก route อื่น ต้องล็อกอินก่อน
  if (!token) {
    return redirectTo('/login')
  }

  const user = await verifyJWT(token)
  if (!user) {
    const res = redirectTo('/login')
    res.cookies.delete('auth-token')
    return res
  }

  // เทียบเป็น segment เต็ม — กัน '/assign' (ครู) ไป match '/assignments' (นักเรียน)
  const matchSegment = (prefix: string) =>
    pathname === prefix || pathname.startsWith(prefix + '/')

  // ผู้เข้าแข่งขัน — เข้าได้เฉพาะสนามแข่ง ส่วนคนอื่นห้ามเข้าสนามแข่ง
  if (user.role === 'contestant' && !matchSegment('/arena')) {
    return redirectTo('/arena')
  }
  if (matchSegment('/arena') && user.role !== 'contestant') {
    return redirectTo(user.role === 'teacher' ? '/dashboard/teacher' : '/dashboard/student')
  }

  // Role-based access
  if (pathname.startsWith('/dashboard/teacher') && user.role !== 'teacher') {
    return redirectTo('/dashboard/student')
  }
  if (pathname.startsWith('/dashboard/student') && user.role !== 'student') {
    return redirectTo('/dashboard/teacher')
  }
  const teacherOnly = [
    '/academic_year',
    '/students',
    '/teachers',
    '/problems',
    '/assign',
    '/compete',
  ]
  if (teacherOnly.some(matchSegment) && user.role !== 'teacher') {
    return redirectTo('/dashboard/student')
  }
  // จัดการผู้ใช้ — เฉพาะผู้ดูแลระบบ (หน้า /teachers เช็คซ้ำกับ DB อีกชั้น)
  if (matchSegment('/teachers') && !user.isAdmin) {
    return redirectTo('/dashboard/teacher')
  }
  // หน้าทำงาน — เฉพาะนักเรียน
  if (matchSegment('/assignments') && user.role !== 'student') {
    return redirectTo('/dashboard/teacher')
  }

  // ต่ออายุ session ทุกครั้งที่มีการใช้งาน (sliding) — เงียบครบ SESSION_MINUTES token จะหมดอายุเอง
  // ไม่ตั้ง maxAge = session cookie (หายเมื่อปิดเบราว์เซอร์); อายุจริงคุมด้วย token TTL + absolute timeout
  const res = NextResponse.next()
  res.cookies.set('auth-token', await renewJWT(user), {
    httpOnly: true,
    secure: COOKIE_SECURE,
    sameSite: 'lax',
    path: '/',
  })
  return res
}

export const config = {
  matcher: [
    '/login',
    '/dashboard/:path*',
    '/academic_year/:path*',
    '/academic_year',
    '/students/:path*',
    '/students',
    '/teachers/:path*',
    '/teachers',
    '/problems/:path*',
    '/problems',
    '/assignments/:path*',
    '/assignments',
    '/assign/:path*',
    '/assign',
    '/compete/:path*',
    '/compete',
    '/arena/:path*',
    '/arena',
  ],
}

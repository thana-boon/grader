import { NextRequest, NextResponse } from 'next/server'
import { verifyJWT, renewJWT, SESSION_MINUTES } from '@/lib/jwt'

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  const token = request.cookies.get('auth-token')?.value

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
        return NextResponse.redirect(new URL(home, request.url))
      }
    }
    return NextResponse.next()
  }

  // ทุก route อื่น ต้องล็อกอินก่อน
  if (!token) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  const user = await verifyJWT(token)
  if (!user) {
    const res = NextResponse.redirect(new URL('/login', request.url))
    res.cookies.delete('auth-token')
    return res
  }

  // เทียบเป็น segment เต็ม — กัน '/assign' (ครู) ไป match '/assignments' (นักเรียน)
  const matchSegment = (prefix: string) =>
    pathname === prefix || pathname.startsWith(prefix + '/')

  // ผู้เข้าแข่งขัน — เข้าได้เฉพาะสนามแข่ง ส่วนคนอื่นห้ามเข้าสนามแข่ง
  if (user.role === 'contestant' && !matchSegment('/arena')) {
    return NextResponse.redirect(new URL('/arena', request.url))
  }
  if (matchSegment('/arena') && user.role !== 'contestant') {
    return NextResponse.redirect(
      new URL(user.role === 'teacher' ? '/dashboard/teacher' : '/dashboard/student', request.url)
    )
  }

  // Role-based access
  if (pathname.startsWith('/dashboard/teacher') && user.role !== 'teacher') {
    return NextResponse.redirect(new URL('/dashboard/student', request.url))
  }
  if (pathname.startsWith('/dashboard/student') && user.role !== 'student') {
    return NextResponse.redirect(new URL('/dashboard/teacher', request.url))
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
    return NextResponse.redirect(new URL('/dashboard/student', request.url))
  }
  // จัดการผู้ใช้ — เฉพาะผู้ดูแลระบบ (หน้า /teachers เช็คซ้ำกับ DB อีกชั้น)
  if (matchSegment('/teachers') && !user.isAdmin) {
    return NextResponse.redirect(new URL('/dashboard/teacher', request.url))
  }
  // หน้าทำงาน — เฉพาะนักเรียน
  if (matchSegment('/assignments') && user.role !== 'student') {
    return NextResponse.redirect(new URL('/dashboard/teacher', request.url))
  }

  // ต่ออายุ session ทุกครั้งที่มีการใช้งาน (sliding) — เงียบครบ 30 นาที token จะหมดอายุเอง
  const res = NextResponse.next()
  res.cookies.set('auth-token', await renewJWT(user), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * SESSION_MINUTES,
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

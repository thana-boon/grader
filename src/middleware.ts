import { NextRequest, NextResponse } from 'next/server'
import { verifyJWT } from '@/lib/jwt'

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  const token = request.cookies.get('auth-token')?.value

  // หน้า login — ถ้า login แล้วให้ redirect ไป dashboard
  if (pathname === '/login') {
    if (token) {
      const user = await verifyJWT(token)
      if (user) {
        return NextResponse.redirect(
          new URL(
            user.role === 'teacher' ? '/dashboard/teacher' : '/dashboard/student',
            request.url
          )
        )
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

  // Role-based access
  if (pathname.startsWith('/dashboard/teacher') && user.role !== 'teacher') {
    return NextResponse.redirect(new URL('/dashboard/student', request.url))
  }
  if (pathname.startsWith('/dashboard/student') && user.role !== 'student') {
    return NextResponse.redirect(new URL('/dashboard/teacher', request.url))
  }
  // เทียบเป็น segment เต็ม — กัน '/assign' (ครู) ไป match '/assignments' (นักเรียน)
  const matchRoute = (prefix: string) =>
    pathname === prefix || pathname.startsWith(prefix + '/')

  const teacherOnly = ['/academic_year', '/students', '/teachers', '/problems', '/assign']
  if (teacherOnly.some(matchRoute) && user.role !== 'teacher') {
    return NextResponse.redirect(new URL('/dashboard/student', request.url))
  }
  // จัดการผู้ใช้ — เฉพาะผู้ดูแลระบบ (หน้า /teachers เช็คซ้ำกับ DB อีกชั้น)
  if (matchRoute('/teachers') && !user.isAdmin) {
    return NextResponse.redirect(new URL('/dashboard/teacher', request.url))
  }
  // หน้าทำงาน — เฉพาะนักเรียน
  if (matchRoute('/assignments') && user.role !== 'student') {
    return NextResponse.redirect(new URL('/dashboard/teacher', request.url))
  }

  return NextResponse.next()
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
  ],
}

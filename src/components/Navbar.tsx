import Link from 'next/link'
import LogoutButton from './LogoutButton'
import type { UserPayload } from '@/lib/auth'

interface NavbarProps {
  user: UserPayload
}

export default function Navbar({ user }: NavbarProps) {
  const homeHref =
    user.role === 'teacher' ? '/dashboard/teacher' : '/dashboard/student'

  return (
    <nav className="bg-white border-b border-gray-200 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between h-14">
          {/* Logo + nav links */}
          <div className="flex items-center gap-6">
            <Link href={homeHref} className="flex items-center gap-2 shrink-0">
              <div className="w-7 h-7 bg-indigo-600 rounded-lg flex items-center justify-center">
                <svg
                  className="w-4 h-4 text-white"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"
                  />
                </svg>
              </div>
              <span className="font-bold text-gray-900 text-sm sm:text-base">
                CodeGrader
              </span>
            </Link>

            {user.role === 'teacher' && (
              <div className="flex items-center gap-1">
                <Link
                  href="/dashboard/teacher"
                  className="px-3 py-1.5 text-sm text-gray-600 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition"
                >
                  แดชบอร์ด
                </Link>
                <Link
                  href="/problems"
                  className="px-3 py-1.5 text-sm text-gray-600 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition"
                >
                  โจทย์
                </Link>
                <Link
                  href="/assign"
                  className="px-3 py-1.5 text-sm text-gray-600 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition"
                >
                  มอบหมายงาน
                </Link>
                <Link
                  href="/students"
                  className="px-3 py-1.5 text-sm text-gray-600 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition"
                >
                  นักเรียน
                </Link>
                <Link
                  href="/academic_year"
                  className="px-3 py-1.5 text-sm text-gray-600 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition"
                >
                  ปีการศึกษา
                </Link>
                {user.isAdmin && (
                  <Link
                    href="/teachers"
                    className="px-3 py-1.5 text-sm text-gray-600 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition"
                  >
                    จัดการผู้ใช้
                  </Link>
                )}
              </div>
            )}
          </div>

          {/* User info + logout */}
          <div className="flex items-center gap-3">
            <div className="text-right hidden sm:block">
              <p className="text-sm font-medium text-gray-900 leading-tight">
                {user.name}
              </p>
              <p className="text-xs text-gray-500">
                {user.role === 'teacher' ? 'ครู' : 'นักเรียน'}
                {user.role === 'student' && user.studentCode
                  ? ` · ${user.studentCode}`
                  : ''}
              </p>
            </div>
            <LogoutButton />
          </div>
        </div>
      </div>
    </nav>
  )
}

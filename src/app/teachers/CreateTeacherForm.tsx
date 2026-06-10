'use client'

import { useActionState } from 'react'
import { createTeacher, type ActionResult } from './actions'

export default function CreateTeacherForm() {
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(
    createTeacher,
    {}
  )

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
      <h2 className="text-base font-semibold text-gray-900 mb-4">เพิ่มบัญชีครู</h2>

      {state.error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {state.error}
        </div>
      )}
      {state.success && (
        <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">
          {state.success}
        </div>
      )}

      <form action={formAction} className="flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            ชื่อ-นามสกุล
          </label>
          <input
            type="text"
            name="name"
            required
            placeholder="เช่น ครูสมชาย ใจดี"
            className="w-52 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            ชื่อผู้ใช้
          </label>
          <input
            type="text"
            name="username"
            required
            placeholder="somchai"
            pattern="[a-zA-Z0-9_.\-]{3,30}"
            className="w-40 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            รหัสผ่าน
          </label>
          <input
            type="password"
            name="password"
            required
            minLength={8}
            placeholder="อย่างน้อย 8 ตัวอักษร"
            autoComplete="new-password"
            className="w-44 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-gray-700 pb-2.5">
          <input
            type="checkbox"
            name="is_admin"
            className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
          />
          ผู้ดูแลระบบ
        </label>
        <button
          type="submit"
          disabled={pending}
          className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition disabled:opacity-60"
        >
          {pending ? 'กำลังสร้าง...' : '+ สร้างบัญชี'}
        </button>
      </form>
    </div>
  )
}

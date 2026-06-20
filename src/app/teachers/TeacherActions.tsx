'use client'

import { useState, useTransition, useActionState } from 'react'
import {
  deleteTeacher,
  resetTeacherPassword,
  setTeacherAdmin,
  type ActionResult,
} from './actions'
import ConfirmDialog from '@/components/ConfirmDialog'

export default function TeacherActions({
  id,
  name,
  isSelf,
  isAdmin,
  isApiTeacher,
}: {
  id: number
  name: string
  isSelf: boolean
  isAdmin: boolean
  isApiTeacher: boolean
}) {
  const [resetOpen, setResetOpen] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [deletePending, startDelete] = useTransition()
  const [adminPending, startAdmin] = useTransition()

  const handleToggleAdmin = () => {
    startAdmin(async () => {
      const result = await setTeacherAdmin(id, !isAdmin)
      if (result.error) setErrorMsg(result.error)
    })
  }
  const [resetState, resetAction, resetPending] = useActionState<ActionResult, FormData>(
    resetTeacherPassword.bind(null, id),
    {}
  )

  const handleDelete = () => {
    startDelete(async () => {
      const result = await deleteTeacher(id)
      setConfirmOpen(false)
      if (result.error) setErrorMsg(result.error)
    })
  }

  const dialogs = (
    <>
      <ConfirmDialog
        open={confirmOpen}
        title="ลบบัญชีครู"
        message={`ยืนยันลบบัญชีของ "${name}"?`}
        confirmLabel="ลบบัญชี"
        danger
        pending={deletePending}
        onConfirm={handleDelete}
        onClose={() => setConfirmOpen(false)}
      />
      <ConfirmDialog
        open={errorMsg !== null}
        title="ลบไม่สำเร็จ"
        message={errorMsg ?? ''}
        confirmLabel="ปิด"
        confirmOnly
        onConfirm={() => setErrorMsg(null)}
        onClose={() => setErrorMsg(null)}
      />
    </>
  )

  if (resetOpen) {
    return (
      <div className="flex items-center gap-2">
        {dialogs}
        {resetState.error && (
          <span className="text-xs text-red-600">{resetState.error}</span>
        )}
        {resetState.success && (
          <span className="text-xs text-green-600">{resetState.success}</span>
        )}
        <form action={resetAction} className="flex items-center gap-2">
          <input
            type="password"
            name="password"
            required
            minLength={8}
            placeholder="รหัสผ่านใหม่ (8 ตัวขึ้นไป)"
            autoComplete="new-password"
            autoFocus
            className="w-48 px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          />
          <button
            type="submit"
            disabled={resetPending}
            className="text-sm text-white bg-indigo-600 hover:bg-indigo-700 font-medium px-3 py-1.5 rounded-lg transition disabled:opacity-60"
          >
            {resetPending ? 'กำลังบันทึก...' : 'บันทึก'}
          </button>
          <button
            type="button"
            onClick={() => setResetOpen(false)}
            className="text-sm text-gray-500 hover:text-gray-700 px-2 py-1.5"
          >
            ยกเลิก
          </button>
        </form>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-1">
      {dialogs}
      {!isSelf && (
        <button
          onClick={handleToggleAdmin}
          disabled={adminPending}
          className="text-sm text-amber-600 hover:text-amber-700 font-medium px-3 py-1 rounded hover:bg-amber-50 transition disabled:opacity-60"
        >
          {adminPending ? '...' : isAdmin ? 'ถอนแอดมิน' : 'ตั้งเป็นแอดมิน'}
        </button>
      )}
      {/* ครูจาก API ไม่มีรหัสผ่านในเครื่อง — รีเซ็ตไม่ได้ (เปลี่ยนที่ teacher-api) */}
      {!isApiTeacher && (
        <button
          onClick={() => setResetOpen(true)}
          className="text-sm text-indigo-600 hover:text-indigo-800 font-medium px-3 py-1 rounded hover:bg-indigo-50 transition"
        >
          รีเซ็ตรหัสผ่าน
        </button>
      )}
      {!isSelf && (
        <button
          onClick={() => setConfirmOpen(true)}
          className="text-sm text-red-600 hover:text-red-700 font-medium px-3 py-1 rounded hover:bg-red-50 transition"
        >
          ลบ
        </button>
      )}
    </div>
  )
}

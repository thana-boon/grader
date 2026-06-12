'use client'

// ฟอร์มจัดการบัญชีผู้เข้าแข่ง: สร้างเป็นชุด (prefix + จำนวน) และเพิ่มรายคน

import { useActionState, useState, useTransition } from 'react'
import {
  addContestant,
  generateContestants,
  deleteContestant,
  type ActionResult,
} from '../actions'
import ConfirmDialog from '@/components/ConfirmDialog'

const inputClass =
  'px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent'

export function GenerateForm({ competitionId }: { competitionId: number }) {
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(
    generateContestants.bind(null, competitionId),
    {}
  )
  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2">
      <div>
        <label className="block text-xs text-gray-500 mb-1">คำนำหน้า</label>
        <input type="text" name="prefix" defaultValue="team" className={`${inputClass} w-28`} />
      </div>
      <div>
        <label className="block text-xs text-gray-500 mb-1">จำนวน</label>
        <input
          type="number"
          name="count"
          min={1}
          max={100}
          defaultValue={10}
          className={`${inputClass} w-20`}
        />
      </div>
      <button
        type="submit"
        disabled={pending}
        className="px-4 py-2 text-sm font-medium text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition disabled:opacity-60"
      >
        {pending ? 'กำลังสร้าง...' : 'สร้างบัญชีเป็นชุด'}
      </button>
      {state.error && <p className="text-sm text-red-600 w-full">{state.error}</p>}
    </form>
  )
}

export function AddForm({ competitionId }: { competitionId: number }) {
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(
    addContestant.bind(null, competitionId),
    {}
  )
  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2">
      <div>
        <label className="block text-xs text-gray-500 mb-1">username</label>
        <input type="text" name="username" required className={`${inputClass} w-32`} />
      </div>
      <div>
        <label className="block text-xs text-gray-500 mb-1">password</label>
        <input type="text" name="password" required className={`${inputClass} w-28`} />
      </div>
      <div>
        <label className="block text-xs text-gray-500 mb-1">ชื่อที่แสดง (ไม่บังคับ)</label>
        <input type="text" name="displayName" className={`${inputClass} w-40`} />
      </div>
      <button
        type="submit"
        disabled={pending}
        className="px-4 py-2 text-sm font-medium text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition disabled:opacity-60"
      >
        {pending ? 'กำลังเพิ่ม...' : 'เพิ่มรายคน'}
      </button>
      {state.error && <p className="text-sm text-red-600 w-full">{state.error}</p>}
    </form>
  )
}

export function DeleteContestantButton({
  id,
  username,
}: {
  id: number
  username: string
}) {
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  return (
    <>
      <button
        onClick={() => setConfirmOpen(true)}
        className="text-xs text-red-600 hover:text-red-700 px-2 py-1 rounded hover:bg-red-50 transition"
      >
        ลบ
      </button>
      <ConfirmDialog
        open={confirmOpen}
        title="ลบบัญชีผู้เข้าแข่ง"
        message={`ยืนยันลบบัญชี "${username}"?\nคำตอบที่ส่งไว้ของบัญชีนี้จะถูกลบไปด้วย`}
        confirmLabel="ลบ"
        danger
        pending={pending}
        onConfirm={() =>
          startTransition(async () => {
            await deleteContestant(id)
            setConfirmOpen(false)
          })
        }
        onClose={() => setConfirmOpen(false)}
      />
    </>
  )
}

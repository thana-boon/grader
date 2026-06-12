'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { deleteCompetition } from './actions'
import ConfirmDialog from '@/components/ConfirmDialog'

export default function DeleteCompetitionButton({
  id,
  label,
  redirectTo,
}: {
  id: number
  label: string
  redirectTo?: string
}) {
  const router = useRouter()
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [pending, startTransition] = useTransition()

  const handleConfirm = () => {
    startTransition(async () => {
      await deleteCompetition(id)
      setConfirmOpen(false)
      if (redirectTo) router.push(redirectTo)
    })
  }

  return (
    <>
      <button
        onClick={() => setConfirmOpen(true)}
        className="text-sm text-red-600 hover:text-red-700 font-medium px-3 py-1 rounded hover:bg-red-50 transition"
      >
        ลบ
      </button>
      <ConfirmDialog
        open={confirmOpen}
        title="ลบรายการแข่งขัน"
        message={`ยืนยันลบรายการแข่งขัน "${label}"?\nบัญชีผู้เข้าแข่งและคำตอบทั้งหมดจะถูกลบไปด้วย`}
        confirmLabel="ลบ"
        danger
        pending={pending}
        onConfirm={handleConfirm}
        onClose={() => setConfirmOpen(false)}
      />
    </>
  )
}

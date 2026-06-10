'use client'

import { useState, useTransition } from 'react'
import { deleteProblem } from './actions'
import ConfirmDialog from '@/components/ConfirmDialog'

export default function DeleteProblemButton({
  id,
  title,
}: {
  id: number
  title: string
}) {
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [pending, startTransition] = useTransition()

  const handleConfirm = () => {
    startTransition(async () => {
      await deleteProblem(id)
      setConfirmOpen(false)
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
        title="ลบโจทย์"
        message={`ยืนยันลบโจทย์ "${title}"?\nการมอบหมายของโจทย์นี้จะถูกลบไปด้วย`}
        confirmLabel="ลบโจทย์"
        danger
        pending={pending}
        onConfirm={handleConfirm}
        onClose={() => setConfirmOpen(false)}
      />
    </>
  )
}

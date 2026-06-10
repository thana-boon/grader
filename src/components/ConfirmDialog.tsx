'use client'

// Modal dialog กลางของระบบ — ใช้แทน confirm()/alert() ของเบราว์เซอร์
// โหมดยืนยัน (มีปุ่มยกเลิก+ยืนยัน) หรือโหมดแจ้งเตือนอย่างเดียว (confirmOnly)

export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'ยืนยัน',
  cancelLabel = 'ยกเลิก',
  danger = false,
  confirmOnly = false,
  pending = false,
  onConfirm,
  onClose,
}: {
  open: boolean
  title: string
  message?: string
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
  confirmOnly?: boolean
  pending?: boolean
  onConfirm: () => void
  onClose: () => void
}) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40"
        onClick={pending ? undefined : onClose}
      />

      {/* Dialog */}
      <div className="relative bg-white rounded-xl shadow-xl w-full max-w-sm p-6">
        <div className="flex items-start gap-3">
          <div
            className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
              danger ? 'bg-red-100' : 'bg-indigo-100'
            }`}
          >
            <svg
              className={`w-5 h-5 ${danger ? 'text-red-600' : 'text-indigo-600'}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
              />
            </svg>
          </div>
          <div className="min-w-0 pt-1">
            <h3 className="text-base font-semibold text-gray-900">{title}</h3>
            {message && (
              <p className="text-sm text-gray-600 mt-1.5 whitespace-pre-line">
                {message}
              </p>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-6">
          {!confirmOnly && (
            <button
              type="button"
              onClick={onClose}
              disabled={pending}
              className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition disabled:opacity-60"
            >
              {cancelLabel}
            </button>
          )}
          <button
            type="button"
            onClick={onConfirm}
            disabled={pending}
            autoFocus
            className={`px-4 py-2 text-sm font-medium text-white rounded-lg transition disabled:opacity-60 ${
              danger
                ? 'bg-red-600 hover:bg-red-700'
                : 'bg-indigo-600 hover:bg-indigo-700'
            }`}
          >
            {pending ? 'กำลังดำเนินการ...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

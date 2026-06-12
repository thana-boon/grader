'use client'

import { useActionState, useState } from 'react'
import { createCompetition, type ActionResult } from '../actions'
import { languageLabel } from '@/lib/languages'

type ProblemOption = { id: number; title: string; language: string }

export default function CompeteForm({ problems }: { problems: ProblemOption[] }) {
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(
    createCompetition,
    {}
  )

  // โจทย์ — เก็บตามลำดับที่เลือก (= ลำดับข้อ) พร้อมคะแนนรายข้อ
  const [selected, setSelected] = useState<number[]>([])
  const [pointsById, setPointsById] = useState<Record<number, string>>({})
  const toggleProblem = (id: number) => {
    setSelected((prev) => (prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]))
    setPointsById((prev) => (prev[id] === undefined ? { ...prev, [id]: '10' } : prev))
  }

  const inputClass =
    'px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent'

  return (
    <form action={formAction} className="space-y-5">
      {state.error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {state.error}
        </div>
      )}

      <div className="bg-white rounded-2xl border border-indigo-100 shadow-sm p-6">
        <div className="flex flex-wrap gap-3">
          <div className="flex-1 min-w-64">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              ชื่อรายการแข่งขัน
            </label>
            <input
              type="text"
              name="title"
              required
              placeholder='เช่น "แข่งเขียนโปรแกรม ครั้งที่ 1"'
              className={`${inputClass} w-full`}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              เวลาแข่ง (นาที)
            </label>
            <input
              type="number"
              name="durationMinutes"
              min={1}
              max={1440}
              defaultValue={60}
              required
              className={`${inputClass} w-28`}
            />
            <p className="text-xs text-gray-400 mt-1">เริ่มนับถอยหลังเมื่อกดเริ่มแข่ง</p>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-indigo-100 shadow-sm p-6">
        <h2 className="text-base font-semibold text-gray-900 mb-1">
          เลือกโจทย์ ({selected.length} ข้อ)
        </h2>
        <p className="text-xs text-gray-400 mb-3">
          เลือกได้หลายข้อ — ลำดับที่เลือกคือลำดับข้อในการแข่ง · ส่งซ้ำได้ไม่จำกัด
          นับครั้งที่ได้คะแนนดีที่สุด
        </p>
        {selected.length > 0 && (
          <p className="text-xs text-indigo-600 font-medium mb-3">
            คะแนนรวม {selected.reduce((sum, id) => sum + (Number(pointsById[id]) || 0), 0)} คะแนน
          </p>
        )}
        {problems.length === 0 ? (
          <p className="text-sm text-gray-400">ยังไม่มีโจทย์ในคลัง</p>
        ) : (
          <div className="border border-gray-200 rounded-lg max-h-64 overflow-y-auto divide-y divide-gray-100">
            {problems.map((p) => {
              const order = selected.indexOf(p.id)
              return (
                <label
                  key={p.id}
                  className="flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-gray-50 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={order >= 0}
                    onChange={() => toggleProblem(p.id)}
                    className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  <span className="w-10 shrink-0 text-xs font-semibold text-indigo-600">
                    {order >= 0 ? `ข้อ ${order + 1}` : ''}
                  </span>
                  <span className="text-gray-900 flex-1">{p.title}</span>
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700 shrink-0">
                    {languageLabel(p.language)}
                  </span>
                  {order >= 0 && (
                    <span className="flex items-center gap-1.5 shrink-0">
                      <input
                        type="number"
                        min={1}
                        max={1000}
                        value={pointsById[p.id] ?? '10'}
                        onChange={(e) =>
                          setPointsById((prev) => ({ ...prev, [p.id]: e.target.value }))
                        }
                        className="w-16 px-2 py-1 border border-gray-300 rounded-lg text-sm text-right focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                      <span className="text-xs text-gray-500">คะแนน</span>
                    </span>
                  )}
                </label>
              )
            })}
          </div>
        )}
      </div>

      <input
        type="hidden"
        name="problems"
        value={JSON.stringify(selected.map((id) => ({ id, points: Number(pointsById[id]) || 10 })))}
      />

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={pending}
          className="px-5 py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition disabled:opacity-60"
        >
          {pending ? 'กำลังบันทึก...' : 'สร้างรายการแข่งขัน'}
        </button>
      </div>
    </form>
  )
}

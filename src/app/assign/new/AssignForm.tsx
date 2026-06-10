'use client'

import { useActionState, useEffect, useState } from 'react'
import { createAssignments, type ActionResult } from '../actions'

type StudentOption = {
  code: string
  name: string
  classLevel: string
  classRoom: number
  number: number
}

export default function AssignForm({
  problems,
  classLevels,
  classRooms,
  defaultProblemId,
}: {
  problems: { id: number; title: string }[]
  classLevels: string[]
  classRooms: number[]
  defaultProblemId?: number
}) {
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(
    createAssignments,
    {}
  )
  const [mode, setMode] = useState<'room' | 'student'>('room')
  const [level, setLevel] = useState(classLevels[0] ?? '')
  const [room, setRoom] = useState('')
  const [students, setStudents] = useState<StudentOption[]>([])
  const [loadingStudents, setLoadingStudents] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())

  // โหมดรายคน: โหลดรายชื่อนักเรียนเมื่อเปลี่ยนชั้น/ห้อง
  useEffect(() => {
    if (mode !== 'student' || !level) return
    let cancelled = false
    setLoadingStudents(true)
    const params = new URLSearchParams({ level })
    if (room) params.set('room', room)
    fetch(`/api/students?${params}`)
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled) setStudents(d.students ?? [])
      })
      .catch(() => {
        if (!cancelled) setStudents([])
      })
      .finally(() => {
        if (!cancelled) setLoadingStudents(false)
      })
    return () => {
      cancelled = true
    }
  }, [mode, level, room])

  const toggleStudent = (code: string) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(code)) next.delete(code)
      else next.add(code)
      return next
    })

  const inputClass =
    'px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent'

  return (
    <form action={formAction} className="space-y-5">
      {state.error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {state.error}
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
        {/* เลือกโจทย์ */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">โจทย์</label>
          <select
            name="problemId"
            required
            defaultValue={defaultProblemId ?? ''}
            className={`${inputClass} w-full`}
          >
            <option value="" disabled>
              — เลือกโจทย์ —
            </option>
            {problems.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </select>
        </div>

        {/* รูปแบบการมอบหมาย */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            มอบหมายให้
          </label>
          <div className="flex gap-4">
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="radio"
                name="mode"
                value="room"
                checked={mode === 'room'}
                onChange={() => setMode('room')}
                className="w-4 h-4 text-indigo-600 focus:ring-indigo-500"
              />
              ทั้งห้อง / ทั้งชั้น
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="radio"
                name="mode"
                value="student"
                checked={mode === 'student'}
                onChange={() => setMode('student')}
                className="w-4 h-4 text-indigo-600 focus:ring-indigo-500"
              />
              รายคน
            </label>
          </div>
        </div>

        {/* เลือกชั้น/ห้อง */}
        <div className="flex flex-wrap gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">ชั้น</label>
            <select
              name="classLevel"
              value={level}
              onChange={(e) => setLevel(e.target.value)}
              className={inputClass}
            >
              {classLevels.map((lv) => (
                <option key={lv} value={lv}>
                  {lv}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">ห้อง</label>
            <select
              name="classRoom"
              value={room}
              onChange={(e) => setRoom(e.target.value)}
              className={inputClass}
            >
              <option value="">{mode === 'room' ? 'ทุกห้อง' : 'ทุกห้อง (แสดงทั้งชั้น)'}</option>
              {classRooms.map((r) => (
                <option key={r} value={r}>
                  ห้อง {r}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              กำหนดส่ง (ไม่บังคับ)
            </label>
            <input type="datetime-local" name="dueAt" className={inputClass} />
          </div>
        </div>

        {/* รายชื่อนักเรียน (โหมดรายคน) */}
        {mode === 'student' && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-gray-700">
                เลือกนักเรียน ({selected.size} คน)
              </label>
              {students.length > 0 && (
                <button
                  type="button"
                  onClick={() =>
                    setSelected((prev) =>
                      prev.size === students.length
                        ? new Set()
                        : new Set(students.map((s) => s.code))
                    )
                  }
                  className="text-xs text-indigo-600 hover:underline"
                >
                  {selected.size === students.length ? 'ยกเลิกทั้งหมด' : 'เลือกทั้งหมด'}
                </button>
              )}
            </div>
            <div className="border border-gray-200 rounded-lg max-h-72 overflow-y-auto divide-y divide-gray-100">
              {loadingStudents ? (
                <p className="px-4 py-6 text-center text-sm text-gray-400">
                  กำลังโหลดรายชื่อ...
                </p>
              ) : students.length === 0 ? (
                <p className="px-4 py-6 text-center text-sm text-gray-400">
                  ไม่พบนักเรียนในชั้น/ห้องนี้
                </p>
              ) : (
                students.map((s) => (
                  <label
                    key={s.code}
                    className="flex items-center gap-3 px-4 py-2 text-sm hover:bg-gray-50 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={selected.has(s.code)}
                      onChange={() => toggleStudent(s.code)}
                      className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    <span className="text-gray-400 w-14 shrink-0">{s.code}</span>
                    <span className="text-gray-900 flex-1">{s.name}</span>
                    <span className="text-gray-400 text-xs shrink-0">
                      {s.classLevel}/{s.classRoom} เลขที่ {s.number}
                    </span>
                  </label>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      <input type="hidden" name="studentCodes" value={JSON.stringify([...selected])} />

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={pending}
          className="px-5 py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition disabled:opacity-60"
        >
          {pending ? 'กำลังบันทึก...' : 'มอบหมายงาน'}
        </button>
      </div>
    </form>
  )
}

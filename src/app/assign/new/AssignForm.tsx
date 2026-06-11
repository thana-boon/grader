'use client'

import { useActionState, useEffect, useState } from 'react'
import { createTask, type ActionResult } from '../actions'
import { languageLabel } from '@/lib/languages'

type ProblemOption = { id: number; title: string; language: string }

type StudentOption = {
  code: string
  name: string
  classLevel: string
  classRoom: number
  number: number
}

type SelectedStudent = { code: string; name: string; level: string; room: number }

export default function AssignForm({
  problems,
  classLevels,
  classRooms,
}: {
  problems: ProblemOption[]
  classLevels: string[]
  classRooms: number[]
}) {
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(
    createTask,
    {}
  )

  // โจทย์ — เก็บเป็น array ตามลำดับที่เลือก (= ลำดับข้อในงาน)
  const [selectedProblems, setSelectedProblems] = useState<number[]>([])
  const toggleProblem = (id: number) =>
    setSelectedProblems((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
    )

  // เป้าหมาย: ห้อง (key = "level|room") และรายคน
  const [roomTargets, setRoomTargets] = useState<Set<string>>(new Set())
  const [studentTargets, setStudentTargets] = useState<Map<string, SelectedStudent>>(
    new Map()
  )

  // ตัวเลือกห้องของชั้นที่กำลังดู
  const [level, setLevel] = useState(classLevels[0] ?? '')
  const toggleRoom = (room: number) => {
    const key = `${level}|${room}`
    setRoomTargets((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  // ตัวเลือกนักเรียนรายคน
  const [pickLevel, setPickLevel] = useState(classLevels[0] ?? '')
  const [pickRoom, setPickRoom] = useState('')
  const [students, setStudents] = useState<StudentOption[]>([])
  const [loadingStudents, setLoadingStudents] = useState(false)

  useEffect(() => {
    if (!pickLevel) return
    let cancelled = false
    setLoadingStudents(true)
    const params = new URLSearchParams({ level: pickLevel })
    if (pickRoom) params.set('room', pickRoom)
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
  }, [pickLevel, pickRoom])

  const toggleStudent = (s: StudentOption) =>
    setStudentTargets((prev) => {
      const next = new Map(prev)
      if (next.has(s.code)) next.delete(s.code)
      else next.set(s.code, { code: s.code, name: s.name, level: s.classLevel, room: s.classRoom })
      return next
    })

  const targetsJson = JSON.stringify([
    ...[...roomTargets].map((key) => {
      const [lv, room] = key.split('|')
      return { type: 'room', level: lv, room: Number(room) }
    }),
    ...[...studentTargets.keys()].map((code) => ({ type: 'student', code })),
  ])

  const inputClass =
    'px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent'

  return (
    <form action={formAction} className="space-y-5">
      {state.error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {state.error}
        </div>
      )}

      {/* ชื่องาน + กำหนดส่ง */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex flex-wrap gap-3">
          <div className="flex-1 min-w-64">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              ชื่องาน
            </label>
            <input
              type="text"
              name="title"
              required
              placeholder='เช่น "แบบฝึกหัดครั้งที่ 1"'
              className={`${inputClass} w-full`}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              กำหนดส่ง (ไม่บังคับ)
            </label>
            <input type="datetime-local" name="dueAt" className={inputClass} />
          </div>
        </div>
      </div>

      {/* เลือกโจทย์ */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-base font-semibold text-gray-900 mb-1">
          เลือกโจทย์ ({selectedProblems.length} ข้อ)
        </h2>
        <p className="text-xs text-gray-400 mb-3">
          เลือกได้หลายข้อ — ลำดับที่เลือกคือลำดับข้อในงาน
        </p>
        {problems.length === 0 ? (
          <p className="text-sm text-gray-400">ยังไม่มีโจทย์ในคลัง</p>
        ) : (
          <div className="border border-gray-200 rounded-lg max-h-64 overflow-y-auto divide-y divide-gray-100">
            {problems.map((p) => {
              const order = selectedProblems.indexOf(p.id)
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
                </label>
              )
            })}
          </div>
        )}
      </div>

      {/* เป้าหมาย */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
        <h2 className="text-base font-semibold text-gray-900">
          มอบหมายให้ ({roomTargets.size + studentTargets.size} รายการ)
        </h2>

        {/* ทั้งห้อง — เลือกได้หลายห้อง */}
        <div>
          <p className="text-sm font-medium text-gray-700 mb-2">แบบทั้งห้อง</p>
          <div className="flex flex-wrap items-center gap-3">
            <select
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
            <div className="flex flex-wrap gap-2">
              {classRooms.map((r) => {
                const checked = roomTargets.has(`${level}|${r}`)
                return (
                  <label
                    key={r}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm cursor-pointer transition ${
                      checked
                        ? 'border-indigo-400 bg-indigo-50 text-indigo-700'
                        : 'border-gray-300 text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleRoom(r)}
                      className="w-3.5 h-3.5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    ห้อง {r}
                  </label>
                )
              })}
            </div>
          </div>
        </div>

        {/* รายคน */}
        <div>
          <p className="text-sm font-medium text-gray-700 mb-2">
            แบบรายคน (เลือกเพิ่มจากห้องที่มอบทั้งห้องได้)
          </p>
          <div className="flex flex-wrap gap-3 mb-2">
            <select
              value={pickLevel}
              onChange={(e) => setPickLevel(e.target.value)}
              className={inputClass}
            >
              {classLevels.map((lv) => (
                <option key={lv} value={lv}>
                  {lv}
                </option>
              ))}
            </select>
            <select
              value={pickRoom}
              onChange={(e) => setPickRoom(e.target.value)}
              className={inputClass}
            >
              <option value="">ทุกห้อง</option>
              {classRooms.map((r) => (
                <option key={r} value={r}>
                  ห้อง {r}
                </option>
              ))}
            </select>
          </div>
          <div className="border border-gray-200 rounded-lg max-h-56 overflow-y-auto divide-y divide-gray-100">
            {loadingStudents ? (
              <p className="px-4 py-5 text-center text-sm text-gray-400">
                กำลังโหลดรายชื่อ...
              </p>
            ) : students.length === 0 ? (
              <p className="px-4 py-5 text-center text-sm text-gray-400">
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
                    checked={studentTargets.has(s.code)}
                    onChange={() => toggleStudent(s)}
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

        {/* สรุปเป้าหมายที่เลือก */}
        {(roomTargets.size > 0 || studentTargets.size > 0) && (
          <div className="flex flex-wrap gap-2">
            {[...roomTargets].sort().map((key) => {
              const [lv, room] = key.split('|')
              return (
                <span
                  key={key}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-indigo-100 text-indigo-700"
                >
                  {lv}/{room} (ทั้งห้อง)
                  <button
                    type="button"
                    onClick={() =>
                      setRoomTargets((prev) => {
                        const next = new Set(prev)
                        next.delete(key)
                        return next
                      })
                    }
                    className="hover:text-indigo-900"
                  >
                    ✕
                  </button>
                </span>
              )
            })}
            {[...studentTargets.values()].map((s) => (
              <span
                key={s.code}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700"
              >
                {s.name} ({s.level}/{s.room})
                <button
                  type="button"
                  onClick={() =>
                    setStudentTargets((prev) => {
                      const next = new Map(prev)
                      next.delete(s.code)
                      return next
                    })
                  }
                  className="hover:text-emerald-900"
                >
                  ✕
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      <input type="hidden" name="problemIds" value={JSON.stringify(selectedProblems)} />
      <input type="hidden" name="targets" value={targetsJson} />

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

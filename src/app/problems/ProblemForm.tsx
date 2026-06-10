'use client'

import { useActionState, useState } from 'react'
import type { ActionResult } from './actions'
import TurtleCanvas from '@/components/TurtleCanvas'

export type TestCaseInput = {
  input: string
  expectedOutput: string
  isHidden: boolean
}

type ProblemInitial = {
  title: string
  description: string
  language: string
  starterCode: string
  solutionCode: string
  testCases: TestCaseInput[]
  expectedDrawing?: string // JSON ภาพเฉลย (เฉพาะ turtle)
}

const EMPTY_CASE: TestCaseInput = { input: '', expectedOutput: '', isHidden: false }

export default function ProblemForm({
  action,
  initial,
  submitLabel,
}: {
  action: (prev: ActionResult, formData: FormData) => Promise<ActionResult>
  initial?: ProblemInitial
  submitLabel: string
}) {
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(action, {})
  const [testCases, setTestCases] = useState<TestCaseInput[]>(
    initial?.testCases.length ? initial.testCases : [{ ...EMPTY_CASE }]
  )
  const [solutionCode, setSolutionCode] = useState(initial?.solutionCode ?? '')
  const [language, setLanguage] = useState(initial?.language ?? 'python')
  const [expectedDrawing, setExpectedDrawing] = useState<string | null>(
    initial?.expectedDrawing ?? null
  )
  const [genBusy, setGenBusy] = useState(false)
  const [genMsg, setGenMsg] = useState<string | null>(null)
  const isTurtle = language === 'turtle'

  const updateCase = (i: number, patch: Partial<TestCaseInput>) =>
    setTestCases((prev) => prev.map((tc, j) => (j === i ? { ...tc, ...patch } : tc)))
  const removeCase = (i: number) =>
    setTestCases((prev) => prev.filter((_, j) => j !== i))
  const addCase = () => setTestCases((prev) => [...prev, { ...EMPTY_CASE }])

  // รันเฉลยกับ input ของแต่ละเคส แล้วเอาผลมาเติมช่อง output ให้อัตโนมัติ
  const generateOutputs = async () => {
    if (!solutionCode.trim()) {
      setGenMsg('ใส่โค้ดเฉลยก่อน จึงจะสร้าง output อัตโนมัติได้')
      return
    }
    setGenBusy(true)
    setGenMsg('กำลังโหลดตัวรัน Python (ครั้งแรกใช้เวลาสักครู่ ต้องต่ออินเทอร์เน็ต)...')
    try {
      const { pythonRunner } = await import('@/lib/pythonRunner')
      const warm = await pythonRunner.warmup()
      if (warm.timedOut || (!warm.ok && warm.error)) {
        setGenMsg('โหลดตัวรัน Python ไม่สำเร็จ — ตรวจสอบอินเทอร์เน็ตแล้วลองใหม่')
        return
      }
      const results = [...testCases]
      for (let i = 0; i < results.length; i++) {
        setGenMsg(`กำลังรันเฉลยกับเคสที่ ${i + 1}/${results.length}...`)
        const res = await pythonRunner.run(solutionCode, results[i].input)
        if (res.timedOut) {
          setGenMsg(`เคสที่ ${i + 1}: เฉลยรันนานเกินไป (อาจวน loop หรือรอ input ที่ไม่ได้ใส่)`)
          return
        }
        if (!res.ok) {
          // EOFError = โค้ดเรียก input() แต่ข้อมูลในช่อง Input หมด/ว่าง — เจอบ่อย แจ้งเป็นภาษาคน
          if (res.error?.includes('EOFError')) {
            setGenMsg(
              `เคสที่ ${i + 1}: เฉลยเรียก input() แต่ช่อง Input ของเคสนี้ว่างหรือมีไม่ครบ\n` +
                `ใส่ค่าในช่อง "Input ที่ป้อนให้โปรแกรม" ให้ครบทุกบรรทัดที่เฉลยต้องอ่าน (1 บรรทัดต่อ 1 input) แล้วลองใหม่`
            )
          } else {
            setGenMsg(`เคสที่ ${i + 1}: เฉลยรันแล้ว error\n${res.error ?? ''}`)
          }
          return
        }
        results[i] = { ...results[i], expectedOutput: res.output.replace(/\s+$/, '') }
      }
      setTestCases(results)
      setGenMsg(`✓ เติม output จากเฉลยครบ ${results.length} เคสแล้ว — ตรวจดูความถูกต้องก่อนบันทึก`)
    } catch {
      setGenMsg('โหลดตัวรัน Python ไม่สำเร็จ — ต้องต่ออินเทอร์เน็ต')
    } finally {
      setGenBusy(false)
    }
  }

  // โหมด turtle: รันเฉลยแล้วเก็บ "ภาพเฉลย" ไว้เป็นเกณฑ์ตรวจ
  const drawSolution = async () => {
    if (!solutionCode.trim()) {
      setGenMsg('ใส่โค้ดเฉลยก่อน จึงจะวาดภาพเฉลยได้')
      return
    }
    setGenBusy(true)
    setGenMsg('กำลังโหลดตัวรัน Python (ครั้งแรกใช้เวลาสักครู่ ต้องต่ออินเทอร์เน็ต)...')
    try {
      const { pythonRunner } = await import('@/lib/pythonRunner')
      const warm = await pythonRunner.warmup()
      if (warm.timedOut) {
        setGenMsg('โหลดตัวรัน Python ไม่สำเร็จ — ตรวจสอบอินเทอร์เน็ตแล้วลองใหม่')
        return
      }
      setGenMsg('กำลังรันเฉลย...')
      const res = await pythonRunner.run(solutionCode, '')
      if (res.timedOut) {
        setGenMsg('เฉลยรันนานเกินไป (อาจวน loop)')
        return
      }
      if (!res.ok) {
        setGenMsg(`เฉลยรันแล้ว error\n${res.error ?? ''}`)
        return
      }
      const { hasTurtleDrawing } = await import('@/lib/turtleGrading')
      if (!hasTurtleDrawing(res.drawing)) {
        setGenMsg('เฉลยรันผ่านแต่ไม่ได้วาดอะไรเลย — ตรวจสอบว่าใช้คำสั่ง turtle ในเฉลย')
        return
      }
      setExpectedDrawing(res.drawing)
      setGenMsg('✓ ได้ภาพเฉลยแล้ว — ตรวจดูภาพด้านล่างก่อนบันทึก')
    } catch {
      setGenMsg('โหลดตัวรัน Python ไม่สำเร็จ — ต้องต่ออินเทอร์เน็ต')
    } finally {
      setGenBusy(false)
    }
  }

  const inputClass =
    'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent'

  return (
    <form action={formAction} className="space-y-6">
      {state.error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {state.error}
        </div>
      )}

      {/* ข้อมูลโจทย์ */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        <div className="flex flex-wrap gap-4">
          <div className="flex-1 min-w-64">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              ชื่อโจทย์
            </label>
            <input
              type="text"
              name="title"
              required
              defaultValue={initial?.title}
              placeholder="เช่น บวกเลขสองจำนวน"
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              ภาษา
            </label>
            <select
              name="language"
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className={inputClass}
            >
              <option value="python">Python</option>
              <option value="turtle">Python Turtle (วาดรูป)</option>
              <option value="pandas" disabled>
                Pandas (เร็วๆ นี้)
              </option>
              <option value="html" disabled>
                HTML (เร็วๆ นี้)
              </option>
              <option value="php" disabled>
                PHP (เร็วๆ นี้)
              </option>
              <option value="scratch" disabled>
                Scratch (เร็วๆ นี้)
              </option>
            </select>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            คำสั่ง / คำอธิบายโจทย์
          </label>
          <textarea
            name="description"
            required
            rows={5}
            defaultValue={initial?.description}
            placeholder={'เช่น เขียนโปรแกรมรับจำนวนเต็ม 2 ตัว แล้วแสดงผลรวม\n\nตัวอย่าง input:\n3\n5\n\nตัวอย่าง output:\n8'}
            className={inputClass}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            โค้ดตั้งต้นให้นักเรียน (ไม่บังคับ)
          </label>
          <textarea
            name="starterCode"
            rows={4}
            defaultValue={initial?.starterCode}
            placeholder={'# เขียนโค้ดของนักเรียนที่นี่\n'}
            spellCheck={false}
            className={`${inputClass} font-mono`}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            {isTurtle ? 'โค้ดเฉลย (จำเป็น — ใช้สร้างภาพเฉลย)' : 'โค้ดเฉลย (ไม่บังคับ — นักเรียนไม่เห็น)'}
          </label>
          <textarea
            name="solutionCode"
            rows={6}
            value={solutionCode}
            onChange={(e) => setSolutionCode(e.target.value)}
            placeholder={
              isTurtle
                ? 'import turtle\nfor i in range(4):\n    turtle.forward(100)\n    turtle.left(90)'
                : 'a = int(input())\nb = int(input())\nprint(a + b)'
            }
            spellCheck={false}
            className={`${inputClass} font-mono`}
          />
          <p className="text-xs text-gray-400 mt-1">
            {isTurtle
              ? 'ระบบจะรันเฉลยเพื่อสร้าง "ภาพเฉลย" แล้วใช้เทียบกับภาพที่นักเรียนวาด'
              : 'ใส่เฉลยไว้เพื่อกดสร้าง output ของ test case อัตโนมัติ และเก็บไว้อ้างอิง'}
          </p>
        </div>
      </div>

      {/* โหมด turtle: ภาพเฉลย */}
      {isTurtle && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-base font-semibold text-gray-900">ภาพเฉลย</h2>
            <button
              type="button"
              onClick={drawSolution}
              disabled={genBusy}
              className="text-sm text-emerald-700 hover:text-emerald-800 font-medium px-3 py-1 rounded hover:bg-emerald-50 transition disabled:opacity-60"
            >
              {genBusy ? 'กำลังรันเฉลย...' : '🐢 วาดภาพเฉลยจากโค้ด'}
            </button>
          </div>
          <p className="text-xs text-gray-400 mb-3">
            การตรวจจะเทียบ &quot;เส้นที่วาด&quot; ของนักเรียนกับภาพนี้ (ไม่สนลำดับ/ทิศทางการวาด)
            ให้คะแนนเป็น % ความเหมือน — นักเรียนเห็นภาพนี้เป็นเป้าหมาย
          </p>
          {genMsg && (
            <div
              className={`mb-4 p-3 rounded-lg text-sm whitespace-pre-wrap border ${
                genMsg.startsWith('✓')
                  ? 'bg-green-50 border-green-200 text-green-700'
                  : 'bg-amber-50 border-amber-200 text-amber-700'
              }`}
            >
              {genMsg}
            </div>
          )}
          <TurtleCanvas
            drawing={expectedDrawing}
            emptyText='ยังไม่มีภาพเฉลย — ใส่เฉลยแล้วกด "วาดภาพเฉลยจากโค้ด"'
          />
        </div>
      )}

      {/* Test cases */}
      <div className={`bg-white rounded-xl border border-gray-200 p-6 ${isTurtle ? 'hidden' : ''}`}>
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-base font-semibold text-gray-900">
            Test cases ({testCases.length})
          </h2>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={generateOutputs}
              disabled={genBusy}
              className="text-sm text-emerald-700 hover:text-emerald-800 font-medium px-3 py-1 rounded hover:bg-emerald-50 transition disabled:opacity-60"
            >
              {genBusy ? 'กำลังรันเฉลย...' : '⚡ สร้าง output จากเฉลย'}
            </button>
            <button
              type="button"
              onClick={addCase}
              className="text-sm text-indigo-600 hover:text-indigo-800 font-medium px-3 py-1 rounded hover:bg-indigo-50 transition"
            >
              + เพิ่ม test case
            </button>
          </div>
        </div>
        <p className="text-xs text-gray-400 mb-2">
          ระบบจะป้อน input ให้โปรแกรมนักเรียนแล้วเทียบ output (ไม่สนช่องว่างท้ายบรรทัด)
          — เคสที่ &quot;ซ่อน&quot; นักเรียนจะเห็นแค่ผ่าน/ไม่ผ่าน ช่วยกันเดาคำตอบ
        </p>
        {genMsg && (
          <div
            className={`mb-4 p-3 rounded-lg text-sm whitespace-pre-wrap border ${
              genMsg.startsWith('✓')
                ? 'bg-green-50 border-green-200 text-green-700'
                : 'bg-amber-50 border-amber-200 text-amber-700'
            }`}
          >
            {genMsg}
          </div>
        )}

        <div className="space-y-4">
          {testCases.map((tc, i) => (
            <div key={i} className="border border-gray-200 rounded-lg p-4 bg-gray-50">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-medium text-gray-700">เคสที่ {i + 1}</p>
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-1.5 text-sm text-gray-600">
                    <input
                      type="checkbox"
                      checked={tc.isHidden}
                      onChange={(e) => updateCase(i, { isHidden: e.target.checked })}
                      className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    ซ่อนจากนักเรียน
                  </label>
                  {testCases.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeCase(i)}
                      className="text-sm text-red-500 hover:text-red-700"
                    >
                      ลบ
                    </button>
                  )}
                </div>
              </div>
              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">
                    Input ที่ป้อนให้โปรแกรม (ว่างได้)
                  </label>
                  <textarea
                    rows={3}
                    value={tc.input}
                    onChange={(e) => updateCase(i, { input: e.target.value })}
                    spellCheck={false}
                    className={`${inputClass} font-mono bg-white`}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">
                    Output ที่คาดหวัง
                  </label>
                  <textarea
                    rows={3}
                    value={tc.expectedOutput}
                    onChange={(e) => updateCase(i, { expectedOutput: e.target.value })}
                    spellCheck={false}
                    className={`${inputClass} font-mono bg-white`}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <input type="hidden" name="testCases" value={JSON.stringify(testCases)} />
      <input type="hidden" name="expectedDrawing" value={expectedDrawing ?? ''} />

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={pending}
          className="px-5 py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition disabled:opacity-60"
        >
          {pending ? 'กำลังบันทึก...' : submitLabel}
        </button>
      </div>
    </form>
  )
}

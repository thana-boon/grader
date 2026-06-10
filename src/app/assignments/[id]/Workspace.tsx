'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { outputMatches } from '@/lib/grading'
import { compareDrawings, parseDrawing } from '@/lib/turtleGrading'
import { submitAssignment } from '../actions'
import ConfirmDialog from '@/components/ConfirmDialog'
import TurtleCanvas from '@/components/TurtleCanvas'

export type WorkspaceTestCase = {
  input: string
  expectedOutput: string
  isHidden: boolean
}

type CaseResult = {
  pass: boolean
  actual: string
  error: string | null
  timedOut: boolean
}

export default function Workspace({
  assignmentId,
  language,
  starterCode,
  testCases,
  expectedDrawing,
  lastCode,
  canSubmit,
}: {
  assignmentId: number
  language: string
  starterCode: string
  testCases: WorkspaceTestCase[]
  expectedDrawing: string | null
  lastCode: string | null
  canSubmit: boolean
}) {
  const router = useRouter()
  const isTurtle = language === 'turtle'
  const [code, setCode] = useState(lastCode ?? starterCode)
  const [busy, setBusy] = useState<'idle' | 'run' | 'submit'>('idle')
  const [statusMsg, setStatusMsg] = useState<string | null>(null)
  const [results, setResults] = useState<(CaseResult | null)[]>(
    testCases.map(() => null)
  )
  const [myDrawing, setMyDrawing] = useState<string | null>(null)
  const [turtleError, setTurtleError] = useState<string | null>(null)
  const [similarity, setSimilarity] = useState<number | null>(null)
  const [scoreModal, setScoreModal] = useState<{ passed: number; total: number } | null>(null)
  const [errorModal, setErrorModal] = useState<string | null>(null)

  const visibleIndexes = testCases
    .map((tc, i) => (tc.isHidden ? -1 : i))
    .filter((i) => i >= 0)

  // กด Tab ใน editor = ย่อหน้า 4 ช่อง (ไม่ใช่ย้าย focus)
  const handleTab = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== 'Tab') return
    e.preventDefault()
    const el = e.currentTarget
    const { selectionStart, selectionEnd, value } = el
    const next = value.slice(0, selectionStart) + '    ' + value.slice(selectionEnd)
    setCode(next)
    requestAnimationFrame(() => {
      el.selectionStart = el.selectionEnd = selectionStart + 4
    })
  }

  const runCases = async (indexes: number[]) => {
    const { pythonRunner } = await import('@/lib/pythonRunner')
    setStatusMsg('กำลังโหลดตัวรัน Python (ครั้งแรกใช้เวลาสักครู่)...')
    const warm = await pythonRunner.warmup()
    if (warm.timedOut) {
      setStatusMsg('โหลดตัวรัน Python ไม่สำเร็จ — ตรวจสอบอินเทอร์เน็ตแล้วลองใหม่')
      return null
    }

    const out: (CaseResult | null)[] = [...results]
    for (let n = 0; n < indexes.length; n++) {
      const i = indexes[n]
      setStatusMsg(`กำลังตรวจเคสที่ ${n + 1}/${indexes.length}...`)
      const res = await pythonRunner.run(code, testCases[i].input)
      out[i] = {
        pass: res.ok && outputMatches(res.output, testCases[i].expectedOutput),
        actual: res.output,
        error: res.error,
        timedOut: res.timedOut,
      }
      setResults([...out])
    }
    setStatusMsg(null)
    return out
  }

  // โหมด turtle: รันแล้ววาดภาพ + คำนวณ % ความเหมือนกับภาพเฉลย
  const runTurtle = async (): Promise<{ percent: number; drawing: string | null } | null> => {
    const { pythonRunner } = await import('@/lib/pythonRunner')
    setStatusMsg('กำลังโหลดตัวรัน Python (ครั้งแรกใช้เวลาสักครู่)...')
    const warm = await pythonRunner.warmup()
    if (warm.timedOut) {
      setStatusMsg('โหลดตัวรัน Python ไม่สำเร็จ — ตรวจสอบอินเทอร์เน็ตแล้วลองใหม่')
      return null
    }
    setStatusMsg('กำลังรันโค้ด...')
    const res = await pythonRunner.run(code, '')
    setStatusMsg(null)
    if (res.timedOut) {
      setTurtleError('โค้ดรันนานเกินไป — อาจวน loop ไม่รู้จบ')
      setMyDrawing(null)
      setSimilarity(null)
      return null
    }
    if (!res.ok) {
      setTurtleError(res.error)
      setMyDrawing(res.drawing)
      setSimilarity(null)
      return null
    }
    setTurtleError(null)
    setMyDrawing(res.drawing)
    const exp = parseDrawing(expectedDrawing)
    const act = parseDrawing(res.drawing)
    const percent = exp && act ? Math.round(compareDrawings(exp, act) * 100) : 0
    setSimilarity(percent)
    return { percent, drawing: res.drawing }
  }

  const handleRun = async () => {
    if (!code.trim()) {
      setErrorModal('ยังไม่ได้เขียนโค้ด')
      return
    }
    setBusy('run')
    try {
      if (isTurtle) await runTurtle()
      else await runCases(visibleIndexes)
    } finally {
      setBusy('idle')
    }
  }

  const handleSubmit = async () => {
    if (!code.trim()) {
      setErrorModal('ยังไม่ได้เขียนโค้ด')
      return
    }
    setBusy('submit')
    try {
      let payload: boolean[] | { percent: number; drawing: string | null }
      if (isTurtle) {
        const turtleResult = await runTurtle()
        if (turtleResult === null) return
        payload = turtleResult
      } else {
        const all = await runCases(testCases.map((_, i) => i))
        if (!all) return
        payload = all.map((r) => r?.pass === true)
      }
      setStatusMsg('กำลังบันทึกผล...')
      const res = await submitAssignment(assignmentId, code, payload)
      setStatusMsg(null)
      if (res.error) {
        setErrorModal(res.error)
      } else {
        setScoreModal({ passed: res.passed ?? 0, total: res.total ?? 0 })
        router.refresh()
      }
    } finally {
      setBusy('idle')
      setStatusMsg(null)
    }
  }


  const caseStatus = (r: CaseResult | null) => {
    if (!r) return null
    if (r.pass)
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
          ✓ ผ่าน
        </span>
      )
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">
        ✗ ไม่ผ่าน
      </span>
    )
  }

  return (
    <div className="space-y-4">
      {/* Editor */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100 bg-gray-50">
          <p className="text-sm font-medium text-gray-700">
            โค้ดของฉัน ({isTurtle ? 'Python Turtle' : 'Python'})
          </p>
          <div className="flex gap-2">
            <button
              onClick={handleRun}
              disabled={busy !== 'idle'}
              className="px-4 py-1.5 text-sm font-medium text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition disabled:opacity-60"
            >
              {busy === 'run' ? 'กำลังรัน...' : '▶ ทดลองรัน'}
            </button>
            <button
              onClick={handleSubmit}
              disabled={busy !== 'idle' || !canSubmit}
              className="px-4 py-1.5 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition disabled:opacity-60"
            >
              {busy === 'submit' ? 'กำลังส่ง...' : 'ส่งงาน'}
            </button>
          </div>
        </div>
        <textarea
          value={code}
          onChange={(e) => setCode(e.target.value)}
          onKeyDown={handleTab}
          rows={14}
          spellCheck={false}
          placeholder="# เขียนโค้ด Python ของคุณที่นี่"
          className="w-full px-4 py-3 font-mono text-sm focus:outline-none resize-y"
        />
      </div>

      {!canSubmit && (
        <p className="text-sm text-red-600">
          เลยกำหนดส่งแล้ว — ทดลองรันได้ แต่ส่งงานไม่ได้
        </p>
      )}

      {statusMsg && (
        <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-blue-700 text-sm">
          {statusMsg}
        </div>
      )}

      {/* โหมด turtle: ภาพเป้าหมาย vs ภาพของฉัน */}
      {isTurtle && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-semibold text-gray-900">ผลการวาด</h2>
            {similarity !== null && (
              <span
                className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${
                  similarity >= 100
                    ? 'bg-green-100 text-green-700'
                    : 'bg-amber-100 text-amber-700'
                }`}
              >
                เหมือนภาพเฉลย {similarity}%
              </span>
            )}
          </div>
          {turtleError && (
            <pre className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-xs whitespace-pre-wrap font-mono">
              {turtleError}
            </pre>
          )}
          <div className="flex flex-wrap gap-6">
            <div>
              <p className="text-sm text-gray-500 mb-2">🎯 ภาพเป้าหมาย</p>
              <TurtleCanvas drawing={expectedDrawing} emptyText="ไม่มีภาพเป้าหมาย" />
            </div>
            <div>
              <p className="text-sm text-gray-500 mb-2">🐢 ภาพของฉัน</p>
              <TurtleCanvas
                drawing={myDrawing}
                emptyText='กด "ทดลองรัน" เพื่อวาดภาพ'
              />
            </div>
          </div>
        </div>
      )}

      {/* ผลรายเคส */}
      <div className={`bg-white rounded-xl border border-gray-200 p-5 ${isTurtle ? 'hidden' : ''}`}>
        <h2 className="text-base font-semibold text-gray-900 mb-3">ผลการตรวจ</h2>
        <div className="space-y-3">
          {testCases.map((tc, i) => {
            const r = results[i]
            if (tc.isHidden) {
              return (
                <div
                  key={i}
                  className="flex items-center justify-between border border-gray-200 rounded-lg px-4 py-3 bg-gray-50"
                >
                  <p className="text-sm text-gray-500">
                    เคสที่ {i + 1} (ซ่อน) — ตรวจตอนกดส่งงาน
                  </p>
                  {caseStatus(r)}
                </div>
              )
            }
            return (
              <div key={i} className="border border-gray-200 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-medium text-gray-700">เคสที่ {i + 1}</p>
                  {caseStatus(r)}
                </div>
                <div className="grid sm:grid-cols-3 gap-3 text-sm">
                  <div>
                    <p className="text-xs text-gray-400 mb-1">Input</p>
                    <pre className="bg-gray-50 border border-gray-100 rounded p-2 font-mono text-xs whitespace-pre-wrap min-h-8">
                      {tc.input || '—'}
                    </pre>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400 mb-1">Output ที่ต้องการ</p>
                    <pre className="bg-gray-50 border border-gray-100 rounded p-2 font-mono text-xs whitespace-pre-wrap min-h-8">
                      {tc.expectedOutput}
                    </pre>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400 mb-1">Output ของคุณ</p>
                    <pre
                      className={`border rounded p-2 font-mono text-xs whitespace-pre-wrap min-h-8 ${
                        r
                          ? r.pass
                            ? 'bg-green-50 border-green-200'
                            : 'bg-red-50 border-red-200'
                          : 'bg-gray-50 border-gray-100'
                      }`}
                    >
                      {r
                        ? r.timedOut
                          ? '(รันนานเกินไป — อาจวน loop)'
                          : r.error
                            ? r.error
                            : r.actual || '(ไม่มี output)'
                        : 'ยังไม่ได้รัน'}
                    </pre>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Modals */}
      <ConfirmDialog
        open={scoreModal !== null}
        title="ส่งงานเรียบร้อย"
        message={
          scoreModal
            ? `${
                isTurtle
                  ? `ภาพเหมือนเฉลย ${scoreModal.passed}%`
                  : `ผ่าน ${scoreModal.passed} จาก ${scoreModal.total} เคส`
              }${
                scoreModal.passed === scoreModal.total
                  ? ' 🎉 เยี่ยมมาก!'
                  : '\nยังส่งใหม่ได้จนกว่าจะถึงกำหนดส่ง'
              }`
            : ''
        }
        confirmLabel="ปิด"
        confirmOnly
        onConfirm={() => setScoreModal(null)}
        onClose={() => setScoreModal(null)}
      />
      <ConfirmDialog
        open={errorModal !== null}
        title="ส่งงานไม่สำเร็จ"
        message={errorModal ?? ''}
        confirmLabel="ปิด"
        confirmOnly
        danger
        onConfirm={() => setErrorModal(null)}
        onClose={() => setErrorModal(null)}
      />
    </div>
  )
}

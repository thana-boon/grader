'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { outputMatches } from '@/lib/grading'
import { compareDrawings, parseDrawing } from '@/lib/turtleGrading'
import { evaluateHtml, parseCheck } from '@/lib/htmlGrading'
import {
  evaluateScratch,
  parseSb3,
  parseScratchCheck,
  parseScratchConfig,
  type ScratchStats,
} from '@/lib/scratchGrading'
import { languageLabel } from '@/lib/languages'
import { attemptMultiplier, formatScore } from '@/lib/scoring'
import type { SubmittedResults } from '@/lib/submissionCheck'
import type { SubmitResult } from '../actions'
import CodeEditor from '@/components/CodeEditor'
import ConfirmDialog from '@/components/ConfirmDialog'
import TurtleCanvas from '@/components/TurtleCanvas'
import { withBase } from '@/lib/basePath'

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
  language,
  starterCode,
  testCases,
  expectedDrawing,
  scratchConfig,
  dataset,
  lastCode,
  canSubmit,
  points,
  attemptsUsed,
  freeAttempts,
  penaltyPercent,
  onSubmit,
}: {
  language: string
  starterCode: string
  testCases: WorkspaceTestCase[]
  expectedDrawing: string | null
  scratchConfig: string | null
  dataset: { name: string; content: string } | null
  lastCode: string | null
  canSubmit: boolean
  points: number
  attemptsUsed: number
  freeAttempts: number
  penaltyPercent: number
  // server action ส่งคำตอบ — ผูกปลายทาง (งานมอบหมาย/การแข่งขัน) มาจากหน้า server แล้ว
  onSubmit: (code: string, results: SubmittedResults) => Promise<SubmitResult>
}) {
  const router = useRouter()
  const isTurtle = language === 'turtle'
  const isPandas = language === 'pandas'
  const isHtml = language === 'html'
  const isPhp = language === 'php'
  const isScratch = language === 'scratch'
  // โหมดตรวจ scratch: blocks = นับบล็อก, io = รับค่า-ส่งออก (รันจริง)
  const scratchCfg = isScratch ? parseScratchConfig(scratchConfig) : null
  const isScratchIo = scratchCfg?.mode === 'io'
  const isScratchBlocks = isScratch && !isScratchIo

  // ตัวเลือกตัวรัน — pandas ต้องโหลดแพ็กเกจ + เขียนไฟล์ข้อมูลก่อนรัน
  const runOpts = () => ({
    packages: isPandas ? ['pandas'] : undefined,
    files: dataset ? [dataset] : undefined,
    timeoutMs: isPandas ? 30_000 : undefined,
  })

  // เกณฑ์ตรวจ HTML / Scratch (แปลงจาก test cases — input คือ JSON ของเกณฑ์)
  const htmlChecks = isHtml ? testCases.map((tc) => parseCheck(tc.input)) : []
  const scratchChecks = isScratch ? testCases.map((tc) => parseScratchCheck(tc.input)) : []

  // ไฟล์ .sb3 ที่นักเรียนเลือก
  const [sb3File, setSb3File] = useState<File | null>(null)
  const [sb3Stats, setSb3Stats] = useState<ScratchStats | null>(null)

  const handleSb3File = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try {
      const stats = await parseSb3(file)
      setSb3File(file)
      setSb3Stats(stats)
      setResults(testCases.map(() => null))
    } catch (err) {
      setSb3File(null)
      setSb3Stats(null)
      setErrorModal(err instanceof Error ? err.message : 'อ่านไฟล์ไม่สำเร็จ')
    }
  }

  const runScratchChecks = (): boolean[] | null => {
    if (!sb3Stats) {
      setErrorModal('เลือกไฟล์ .sb3 ของคุณก่อน')
      return null
    }
    const flags = evaluateScratch(sb3Stats, scratchChecks)
    setResults(flags.map((pass) => ({ pass, actual: '', error: null, timedOut: false })))
    return flags
  }

  // โหมด scratch io: รันโปรเจกต์จริงทีละเคส ป้อนคำตอบจาก input แล้วเทียบผลลัพธ์
  const runScratchIo = async (): Promise<boolean[] | null> => {
    if (!sb3File || !scratchCfg || scratchCfg.mode !== 'io') {
      setErrorModal('เลือกไฟล์ .sb3 ของคุณก่อน')
      return null
    }
    const { runScratchProject } = await import('@/lib/scratchRunner')
    const buffer = await sb3File.arrayBuffer()
    const out: (CaseResult | null)[] = testCases.map(() => null)
    const flags: boolean[] = []
    for (let i = 0; i < testCases.length; i++) {
      setStatusMsg(`กำลังรันเคสที่ ${i + 1}/${testCases.length}...`)
      const answers =
        testCases[i].input === ''
          ? []
          : testCases[i].input.replace(/\r/g, '').replace(/\n$/, '').split('\n')
      // ส่ง buffer ใหม่ทุกเคส (scratch-vm อาจ consume ArrayBuffer ต้นฉบับ)
      const res = await runScratchProject(buffer.slice(0), answers, scratchCfg.output)
      const pass = res.ok && outputMatches(res.output, testCases[i].expectedOutput)
      out[i] = {
        pass,
        actual: res.output,
        error: res.error,
        timedOut: res.timedOut,
      }
      flags.push(pass)
      setResults([...out])
    }
    setStatusMsg(null)
    return flags
  }

  // รันโค้ดหนึ่งครั้ง — PHP ส่งไปรันบนเซิร์ฟเวอร์, ที่เหลือรันในเบราว์เซอร์
  const runStudentCode = async (input: string) => {
    if (isPhp) {
      const r = await fetch(withBase('/api/run/php'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, stdin: input }),
      })
      if (!r.ok)
        return { ok: false, output: '', error: 'เรียกตัวรัน PHP บนเซิร์ฟเวอร์ไม่สำเร็จ', timedOut: false }
      return (await r.json()) as { ok: boolean; output: string; error: string | null; timedOut: boolean }
    }
    const { pythonRunner } = await import('@/lib/pythonRunner')
    return pythonRunner.run(code, input, runOpts())
  }
  const [code, setCode] = useState(lastCode ?? starterCode)
  const [busy, setBusy] = useState<'idle' | 'run' | 'submit'>('idle')
  const [statusMsg, setStatusMsg] = useState<string | null>(null)
  const [results, setResults] = useState<(CaseResult | null)[]>(
    testCases.map(() => null)
  )
  const [myDrawing, setMyDrawing] = useState<string | null>(null)
  const [turtleError, setTurtleError] = useState<string | null>(null)
  const [similarity, setSimilarity] = useState<number | null>(null)
  const [scoreModal, setScoreModal] = useState<{
    passed: number
    total: number
    score?: number
    points?: number
    multiplier?: number
  } | null>(null)
  const [errorModal, setErrorModal] = useState<string | null>(null)

  // จำนวนครั้งที่ส่งแล้ว — เพิ่มทันทีหลังส่งสำเร็จ เพื่อให้คำเตือนหักคะแนนอัปเดต
  const [attempts, setAttempts] = useState(attemptsUsed)
  const policy = { freeAttempts, penaltyPercent }
  const nextMultiplier = attemptMultiplier(attempts + 1, policy)

  // Run (python/pandas/php) — รันโค้ดดู output ตรงๆ ไม่ตัดสินถูกผิด ไม่นับเป็นการส่ง
  const [freeInput, setFreeInput] = useState('')
  const [freeResult, setFreeResult] = useState<CaseResult | null>(null)
  // modal ถาม input ตอนโค้ดเรียก input() — resolve(null) = ผู้ใช้กดหยุดรัน
  const [inputModal, setInputModal] = useState<{
    prompt: string
    resolve: (v: string | null) => void
  } | null>(null)
  const [inputValue, setInputValue] = useState('')

  const runCases = async (indexes: number[]) => {
    if (!isPhp) {
      const { pythonRunner } = await import('@/lib/pythonRunner')
      setStatusMsg(
        isPandas
          ? 'กำลังโหลดตัวรัน Python + pandas (ครั้งแรกใช้เวลาสักครู่)...'
          : 'กำลังโหลดตัวรัน Python (ครั้งแรกใช้เวลาสักครู่)...'
      )
      const warm = await pythonRunner.warmup(isPandas ? ['pandas'] : undefined)
      if (warm.timedOut) {
        setStatusMsg('โหลดตัวรัน Python ไม่สำเร็จ — ตรวจสอบอินเทอร์เน็ตแล้วลองใหม่')
        return null
      }
    }

    const out: (CaseResult | null)[] = [...results]
    for (let n = 0; n < indexes.length; n++) {
      const i = indexes[n]
      setStatusMsg(`กำลังตรวจเคสที่ ${n + 1}/${indexes.length}...`)
      const res = await runStudentCode(testCases[i].input)
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

  // html: ตรวจโครงสร้างกับเกณฑ์ทุกข้อ (รันในเครื่องทันที ไม่ต้องโหลดอะไร)
  const runHtmlChecks = (): boolean[] => {
    const flags = evaluateHtml(code, htmlChecks)
    setResults(
      flags.map((pass) => ({ pass, actual: '', error: null, timedOut: false }))
    )
    return flags
  }

  // ปุ่มทดลองรัน — เฉพาะโหมดที่ผลเป็นภาพ/เกณฑ์ (turtle, html, scratch)
  // ภาษาอื่นใช้ "รันอิสระ" แทน และตรวจทุกเคสตอนกดส่งงานเท่านั้น
  const handleRun = async () => {
    if (isScratch) {
      if (isScratchIo) {
        if (!sb3File) {
          setErrorModal('เลือกไฟล์ .sb3 ของคุณก่อน')
          return
        }
        setBusy('run')
        try {
          await runScratchIo()
        } finally {
          setBusy('idle')
          setStatusMsg(null)
        }
      } else {
        runScratchChecks()
      }
      return
    }
    if (!code.trim()) {
      setErrorModal('ยังไม่ได้เขียนโค้ด')
      return
    }
    setBusy('run')
    try {
      if (isTurtle) await runTurtle()
      else if (isHtml) runHtmlChecks()
    } finally {
      setBusy('idle')
    }
  }

  const handleFreeRun = async () => {
    if (!code.trim()) {
      setErrorModal('ยังไม่ได้เขียนโค้ด')
      return
    }
    setBusy('run')
    try {
      // PHP รันบนเซิร์ฟเวอร์ จึงถาม input ระหว่างรันไม่ได้ — ใช้ช่องเตรียม input แทน
      if (isPhp) {
        setStatusMsg('กำลังรันโค้ด...')
        const res = await runStudentCode(freeInput)
        setFreeResult({ pass: res.ok, actual: res.output, error: res.error, timedOut: res.timedOut })
        setStatusMsg(null)
        return
      }
      const { pythonRunner } = await import('@/lib/pythonRunner')
      setStatusMsg(
        isPandas
          ? 'กำลังโหลดตัวรัน Python + pandas (ครั้งแรกใช้เวลาสักครู่)...'
          : 'กำลังโหลดตัวรัน Python (ครั้งแรกใช้เวลาสักครู่)...'
      )
      const warm = await pythonRunner.warmup(isPandas ? ['pandas'] : undefined)
      if (warm.timedOut) {
        setStatusMsg('โหลดตัวรัน Python ไม่สำเร็จ — ตรวจสอบอินเทอร์เน็ตแล้วลองใหม่')
        return
      }
      setStatusMsg('กำลังรันโค้ด...')
      // โหมดโต้ตอบ: โค้ดเรียก input() เมื่อไร จะเด้ง modal ให้พิมพ์เหมือนรันใน IDE จริง
      const res = await pythonRunner.runInteractive(code, runOpts(), (promptText, outputSoFar) => {
        setFreeResult({ pass: true, actual: outputSoFar, error: null, timedOut: false })
        return new Promise<string | null>((resolve) => {
          setInputValue('')
          setInputModal({ prompt: promptText, resolve })
        })
      })
      setFreeResult({ pass: res.ok, actual: res.output, error: res.error, timedOut: res.timedOut })
      setStatusMsg(null)
    } finally {
      setBusy('idle')
    }
  }

  const handleSubmit = async () => {
    if (!isScratch && !code.trim()) {
      setErrorModal('ยังไม่ได้เขียนโค้ด')
      return
    }
    setBusy('submit')
    try {
      let payload: SubmittedResults
      let codeToSend = code
      if (isTurtle) {
        const turtleResult = await runTurtle()
        if (turtleResult === null) return
        payload = turtleResult
      } else if (isHtml) {
        payload = runHtmlChecks()
      } else if (isScratch) {
        const flags = isScratchIo ? await runScratchIo() : runScratchChecks()
        if (!flags || !sb3File || !sb3Stats) return
        // อัปโหลดไฟล์ .sb3 ให้ครูดาวน์โหลดไปเปิดดูได้
        setStatusMsg('กำลังอัปโหลดไฟล์...')
        const fd = new FormData()
        fd.append('file', sb3File)
        const up = await fetch(withBase('/api/scratch/upload'), { method: 'POST', body: fd })
        const upJson = await up.json().catch(() => null)
        if (!up.ok || !upJson?.token) {
          setStatusMsg(null)
          setErrorModal(upJson?.error ?? 'อัปโหลดไฟล์ไม่สำเร็จ')
          return
        }
        payload = {
          flags,
          fileToken: upJson.token as string,
          stats: { spriteCount: sb3Stats.spriteCount, totalBlocks: sb3Stats.totalBlocks },
        }
        codeToSend = `ไฟล์: ${sb3File.name}\nsprite: ${sb3Stats.spriteCount} · block รวม: ${sb3Stats.totalBlocks}`
      } else {
        const all = await runCases(testCases.map((_, i) => i))
        if (!all) return
        payload = all.map((r) => r?.pass === true)
      }
      setStatusMsg('กำลังบันทึกผล...')
      const res = await onSubmit(codeToSend, payload)
      setStatusMsg(null)
      if (res.error) {
        setErrorModal(res.error)
      } else {
        setScoreModal({
          passed: res.passed ?? 0,
          total: res.total ?? 0,
          score: res.score,
          points: res.points,
          multiplier: res.multiplier,
        })
        setAttempts(res.attempt ?? attempts + 1)
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
      {/* ไฟล์ข้อมูลแนบ (pandas) */}
      {dataset && (
        <div className="bg-white rounded-2xl border border-indigo-100 shadow-sm p-5">
          <h2 className="text-base font-semibold text-gray-900 mb-1">
            📄 ไฟล์ข้อมูล: <code className="text-indigo-700">{dataset.name}</code>
          </h2>
          <p className="text-xs text-gray-400 mb-2">
            อ่านในโค้ดได้ เช่น{' '}
            <code className="bg-gray-100 px-1 rounded">
              pd.read_csv(&apos;{dataset.name}&apos;)
            </code>
          </p>
          <details>
            <summary className="text-xs text-indigo-600 cursor-pointer hover:underline">
              ดูตัวอย่างข้อมูล
            </summary>
            <pre className="mt-2 bg-gray-50 border border-gray-100 rounded-lg p-3 text-xs font-mono overflow-x-auto max-h-48">
              {dataset.content.split('\n').slice(0, 20).join('\n')}
              {dataset.content.split('\n').length > 20 && '\n...'}
            </pre>
          </details>
        </div>
      )}

      {/* โหมด scratch: อัปโหลดไฟล์ + เกณฑ์ */}
      {isScratch && (
        <>
          <div className="bg-white rounded-2xl border border-indigo-100 shadow-sm p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base font-semibold text-gray-900">
                🧩 ไฟล์งาน Scratch ของฉัน
              </h2>
              <div className="flex gap-2">
                <button
                  onClick={handleRun}
                  disabled={busy !== 'idle'}
                  className="px-4 py-1.5 text-sm font-medium text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition disabled:opacity-60"
                >
                  {busy === 'run' ? 'กำลังรัน...' : isScratchIo ? '▶ ทดลองรัน' : '▶ ตรวจไฟล์'}
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
            <div className="flex flex-wrap items-center gap-3">
              <label className="px-4 py-2 text-sm font-medium text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition cursor-pointer">
                📁 เลือกไฟล์ .sb3...
                <input type="file" accept=".sb3" onChange={handleSb3File} className="hidden" />
              </label>
              {sb3File && sb3Stats ? (
                <p className="text-sm text-gray-700">
                  <span className="font-medium">{sb3File.name}</span>
                  <span className="text-gray-400">
                    {' '}· {sb3Stats.spriteCount} sprite · {sb3Stats.totalBlocks} block
                  </span>
                </p>
              ) : (
                <p className="text-sm text-gray-400">ยังไม่ได้เลือกไฟล์</p>
              )}
            </div>
            <p className="text-xs text-gray-400 mt-2">
              ทำงานในโปรแกรม/เว็บ Scratch แล้วบันทึกไฟล์ (File → Save to your computer)
              จากนั้นนำไฟล์ .sb3 มาส่งที่นี่
            </p>
          </div>

          {isScratchBlocks && (
            <div className="bg-white rounded-2xl border border-indigo-100 shadow-sm p-5">
              <h2 className="text-base font-semibold text-gray-900 mb-3">
                เกณฑ์การตรวจ ({testCases.length} ข้อ)
              </h2>
              <ul className="space-y-2">
                {testCases.map((tc, i) => {
                  const r = results[i]
                  return (
                    <li
                      key={i}
                      className="flex items-center justify-between border border-gray-200 rounded-lg px-4 py-3"
                    >
                      <p className="text-sm text-gray-700">
                        {tc.isHidden ? (
                          <span className="text-gray-400">
                            เกณฑ์ลับข้อที่ {i + 1} — ตรวจตอนกดส่ง
                          </span>
                        ) : (
                          tc.expectedOutput
                        )}
                      </p>
                      {caseStatus(r)}
                    </li>
                  )
                })}
              </ul>
            </div>
          )}

          {isScratchIo && (
            <div className="bg-white rounded-2xl border border-indigo-100 shadow-sm p-5">
              <h2 className="text-base font-semibold text-gray-900 mb-1">
                เคสทดสอบ ({testCases.length})
              </h2>
              <p className="text-xs text-gray-400 mb-3">
                ระบบจะรันโปรเจกต์ ป้อนคำตอบให้บล็อก &quot;ถามแล้วรอ&quot; ตามลำดับ แล้วเทียบผลลัพธ์
              </p>
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
                          <p className="text-xs text-gray-400 mb-1">คำตอบที่ป้อน</p>
                          <pre className="bg-gray-50 border border-gray-100 rounded p-2 font-mono text-xs whitespace-pre-wrap min-h-8">
                            {tc.input || '—'}
                          </pre>
                        </div>
                        <div>
                          <p className="text-xs text-gray-400 mb-1">ผลลัพธ์ที่ต้องการ</p>
                          <pre className="bg-gray-50 border border-gray-100 rounded p-2 font-mono text-xs whitespace-pre-wrap min-h-8">
                            {tc.expectedOutput}
                          </pre>
                        </div>
                        <div>
                          <p className="text-xs text-gray-400 mb-1">ผลลัพธ์ของคุณ</p>
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
                                  : r.actual || '(ไม่มีผลลัพธ์)'
                              : 'แสดงหลังกดรัน/ส่ง'}
                          </pre>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </>
      )}

      {/* Editor */}
      <div className={`bg-white rounded-2xl border border-indigo-100 shadow-sm overflow-hidden ${isScratch ? 'hidden' : ''}`}>
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100 bg-gray-50">
          <p className="text-sm font-medium text-gray-700">
            โค้ดของฉัน ({languageLabel(language)})
          </p>
          <div className="flex gap-2">
            {(isTurtle || isHtml) && (
              <button
                onClick={handleRun}
                disabled={busy !== 'idle'}
                className="px-4 py-1.5 text-sm font-medium text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition disabled:opacity-60"
              >
                {busy === 'run' ? 'กำลังรัน...' : '▶ ทดลองรัน'}
              </button>
            )}
            {!isTurtle && !isHtml && !isScratch && (
              <button
                onClick={handleFreeRun}
                disabled={busy !== 'idle'}
                className="px-4 py-1.5 text-sm font-medium text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition disabled:opacity-60"
              >
                {busy === 'run' ? 'กำลังรัน...' : '▶ Run'}
              </button>
            )}
            <button
              onClick={handleSubmit}
              disabled={busy !== 'idle' || !canSubmit}
              className="px-4 py-1.5 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition disabled:opacity-60"
            >
              {busy === 'submit' ? 'กำลังส่ง...' : 'ส่งงาน'}
            </button>
          </div>
        </div>
        <CodeEditor
          value={code}
          onChange={setCode}
          language={language}
          placeholder={
            isHtml
              ? '<!-- เขียนโค้ด HTML ของคุณที่นี่ -->'
              : isPhp
                ? '<?php // เขียนโค้ด PHP ของคุณที่นี่'
                : '# เขียนโค้ด Python ของคุณที่นี่'
          }
        />
      </div>

      {/* Terminal — แสดงผลการกด Run (ปุ่มอยู่บนหัว editor) ไม่นับเป็นการส่ง */}
      {!isTurtle && !isHtml && !isScratch && (
        <div className="bg-white rounded-2xl border border-indigo-100 shadow-sm p-5">
          <h2 className="text-base font-semibold text-gray-900 mb-1">🖥️ Terminal</h2>
          <p className="text-xs text-gray-400 mb-3">
            {isPhp
              ? 'ใส่ input ที่อยากลอง (ถ้ามี) แล้วกด Run — ไม่นับเป็นการส่ง'
              : 'รันโค้ดเหมือนในเครื่องจริง — ถ้าโค้ดเรียก input() จะมีช่องเด้งให้พิมพ์ทีละค่า ลองได้ไม่จำกัด ไม่นับเป็นการส่ง'}
          </p>
          {isPhp && (
            <div className="mb-3">
              <p className="text-xs text-gray-400 mb-1">
                Input (ถ้าโปรแกรมอ่าน STDIN ให้ใส่บรรทัดละหนึ่งค่า)
              </p>
              <textarea
                value={freeInput}
                onChange={(e) => setFreeInput(e.target.value)}
                rows={3}
                spellCheck={false}
                placeholder="ใส่ input ที่อยากลอง (เว้นว่างได้)"
                className="w-full bg-gray-50 border border-gray-200 rounded-lg p-2 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-y"
              />
            </div>
          )}
          <pre className="bg-gray-900 rounded-lg p-3 font-mono text-xs whitespace-pre-wrap min-h-24 text-gray-100">
            {freeResult ? (
              <>
                {freeResult.actual}
                {freeResult.timedOut ? (
                  <span className="text-red-400">
                    {'\n(รันนานเกินไป — อาจวน loop ไม่รู้จบ)'}
                  </span>
                ) : freeResult.error ? (
                  <span className="text-red-400">
                    {(freeResult.actual ? '\n' : '') + freeResult.error}
                  </span>
                ) : (
                  !freeResult.actual && <span className="text-gray-500">(ไม่มี output)</span>
                )}
              </>
            ) : (
              <span className="text-gray-500">
                {isPhp
                  ? 'กด "Run" เพื่อดูผลลัพธ์'
                  : 'กด "Run" เพื่อเริ่ม — ถ้าโค้ดมี input() จะมีช่องเด้งให้พิมพ์'}
              </span>
            )}
          </pre>
        </div>
      )}

      {!canSubmit && (
        <p className="text-sm text-red-600">
          เลยกำหนดส่งแล้ว — ทดลองรันได้ แต่ส่งงานไม่ได้
        </p>
      )}

      {/* สถานะครั้งที่ส่ง — เตือนก่อนโดนหักเพดานคะแนน */}
      {canSubmit && freeAttempts > 0 && (
        <div
          className={`p-3 rounded-lg border text-sm ${
            nextMultiplier < 1
              ? 'bg-amber-50 border-amber-200 text-amber-800'
              : 'bg-gray-50 border-gray-200 text-gray-600'
          }`}
        >
          {nextMultiplier < 1
            ? `ส่งแล้ว ${attempts} ครั้ง (โควตาไม่หักคะแนน ${freeAttempts} ครั้ง) — ส่งครั้งถัดไปคะแนนเต็มจะเหลือ ${Math.round(nextMultiplier * 100)}% ของ ${points} คะแนน · คะแนนคิดจากครั้งที่ดีที่สุด ส่งซ้ำไม่ทำให้คะแนนที่ได้แล้วลดลง`
            : `ส่งแล้ว ${attempts}/${freeAttempts} ครั้ง — ส่งได้อีก ${freeAttempts - attempts} ครั้งโดยไม่หักคะแนน (ข้อนี้ ${points} คะแนน)`}
        </div>
      )}

      {statusMsg && (
        <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-blue-700 text-sm">
          {statusMsg}
        </div>
      )}

      {/* โหมด html: ตัวอย่างหน้าเว็บสด + ผลเกณฑ์ */}
      {isHtml && (
        <>
          <div className="bg-white rounded-2xl border border-indigo-100 shadow-sm overflow-hidden">
            <div className="px-4 py-2.5 border-b border-gray-100 bg-gray-50">
              <p className="text-sm font-medium text-gray-700">
                🌐 ตัวอย่างหน้าเว็บ (อัปเดตตามโค้ดทันที)
              </p>
            </div>
            <iframe
              title="แสดงผลหน้าเว็บ"
              sandbox=""
              srcDoc={code}
              className="w-full h-80 bg-white"
            />
          </div>

          <div className="bg-white rounded-2xl border border-indigo-100 shadow-sm p-5">
            <h2 className="text-base font-semibold text-gray-900 mb-3">
              เกณฑ์การตรวจ ({testCases.length} ข้อ)
            </h2>
            <ul className="space-y-2">
              {testCases.map((tc, i) => {
                const r = results[i]
                return (
                  <li
                    key={i}
                    className="flex items-center justify-between border border-gray-200 rounded-lg px-4 py-3"
                  >
                    <p className="text-sm text-gray-700">
                      {tc.isHidden ? (
                        <span className="text-gray-400">
                          เกณฑ์ลับข้อที่ {i + 1} — ตรวจตอนกดส่ง
                        </span>
                      ) : (
                        tc.expectedOutput
                      )}
                    </p>
                    {caseStatus(r)}
                  </li>
                )
              })}
            </ul>
          </div>
        </>
      )}

      {/* โหมด turtle: ภาพเป้าหมาย vs ภาพของฉัน */}
      {isTurtle && (
        <div className="bg-white rounded-2xl border border-indigo-100 shadow-sm p-5">
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
      <div className={`bg-white rounded-2xl border border-indigo-100 shadow-sm p-5 ${isTurtle || isHtml || isScratch ? 'hidden' : ''}`}>
        <h2 className="text-base font-semibold text-gray-900 mb-1">เคสทดสอบ</h2>
        <p className="text-xs text-gray-400 mb-3">ตรวจทุกเคสตอนกด &quot;ส่งงาน&quot;</p>
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
                        : 'แสดงหลังกดส่งงาน'}
                    </pre>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Modal ถาม input ตอนโค้ดเรียก input() — ปิดด้วยการตอบหรือหยุดรันเท่านั้น */}
      {inputModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" />
          <form
            onSubmit={(e) => {
              e.preventDefault()
              inputModal.resolve(inputValue)
              setInputModal(null)
            }}
            className="relative bg-white rounded-xl shadow-xl w-full max-w-sm p-6"
          >
            <div className="flex items-start gap-3 mb-4">
              <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 bg-indigo-100 text-indigo-600 font-mono font-bold">
                &gt;_
              </div>
              <div className="min-w-0 pt-1">
                <h3 className="text-base font-semibold text-gray-900">โปรแกรมรอ input</h3>
                <p className="text-sm text-gray-600 mt-1.5 whitespace-pre-wrap font-mono">
                  {inputModal.prompt.trim() || 'พิมพ์ค่าแล้วกด Enter'}
                </p>
              </div>
            </div>
            <input
              autoFocus
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              spellCheck={false}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <div className="flex justify-end gap-2 mt-4">
              <button
                type="button"
                onClick={() => {
                  inputModal.resolve(null)
                  setInputModal(null)
                }}
                className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition"
              >
                หยุดรัน
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition"
              >
                ตกลง (Enter)
              </button>
            </div>
          </form>
        </div>
      )}

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
                scoreModal.score !== undefined && scoreModal.points !== undefined
                  ? `\nได้ ${formatScore(scoreModal.score)} จาก ${scoreModal.points} คะแนน${
                      scoreModal.multiplier !== undefined && scoreModal.multiplier < 1
                        ? ` (เพดานคะแนนครั้งนี้ ${Math.round(scoreModal.multiplier * 100)}% จากการส่งเกินโควตา)`
                        : ''
                    }`
                  : ''
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

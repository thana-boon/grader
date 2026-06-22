'use client'

import { useActionState, useState } from 'react'
import type { ActionResult } from './actions'
import TurtleCanvas from '@/components/TurtleCanvas'
import { withBase } from '@/lib/basePath'
import {
  describeCheck,
  evaluateHtml,
  parseCheck,
  type HtmlCheck,
} from '@/lib/htmlGrading'
import {
  describeScratchCheck,
  evaluateScratch,
  parseScratchCheck,
  parseScratchConfig,
  parseSb3,
  SCRATCH_RULES,
  SPECIAL_RULES,
  type ScratchCheck,
} from '@/lib/scratchGrading'

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
  datasetName?: string // ไฟล์ข้อมูลแนบ (เฉพาะ pandas)
  datasetContent?: string
  scratchConfig?: string | null // JSON โหมดตรวจ scratch (เฉพาะ scratch)
}

const EMPTY_CASE: TestCaseInput = { input: '', expectedOutput: '', isHidden: false }

// เกณฑ์ HTML ในฟอร์ม — เก็บทุก field เป็น string เพื่อผูกกับ input ได้ตรงๆ
type EditableCheck = {
  type: 'exists' | 'text' | 'attr'
  selector: string
  count: string
  text: string
  attr: string
  value: string
  isHidden: boolean
}

const EMPTY_CHECK: EditableCheck = {
  type: 'exists',
  selector: '',
  count: '',
  text: '',
  attr: '',
  value: '',
  isHidden: false,
}

function toHtmlCheck(c: EditableCheck): HtmlCheck | null {
  if (!c.selector.trim()) return null
  if (c.type === 'exists') {
    const n = parseInt(c.count)
    return { type: 'exists', selector: c.selector.trim(), count: n > 1 ? n : undefined }
  }
  if (c.type === 'text') {
    if (!c.text.trim()) return null
    return { type: 'text', selector: c.selector.trim(), text: c.text }
  }
  if (!c.attr.trim()) return null
  return {
    type: 'attr',
    selector: c.selector.trim(),
    attr: c.attr.trim(),
    value: c.value.trim() || undefined,
  }
}

// เกณฑ์ Scratch ในฟอร์ม
type EditableScratchCheck = {
  rule: string
  count: string
  opcode: string
  isHidden: boolean
}

const EMPTY_SCRATCH_CHECK: EditableScratchCheck = {
  rule: 'green_flag',
  count: '',
  opcode: '',
  isHidden: false,
}

function toScratchCheck(c: EditableScratchCheck): ScratchCheck | null {
  if (c.rule === 'opcode' && !c.opcode.trim()) return null
  const n = parseInt(c.count)
  return {
    rule: c.rule,
    count: n > 1 ? n : undefined,
    opcode: c.rule === 'opcode' ? c.opcode.trim() : undefined,
  }
}

function fromHtmlCheck(c: HtmlCheck, isHidden: boolean): EditableCheck {
  return {
    ...EMPTY_CHECK,
    type: c.type,
    selector: c.selector,
    count: c.type === 'exists' && c.count ? String(c.count) : '',
    text: c.type === 'text' ? c.text : '',
    attr: c.type === 'attr' ? c.attr : '',
    value: (c.type === 'attr' && c.value) || '',
    isHidden,
  }
}

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
  const [datasetName, setDatasetName] = useState(initial?.datasetName ?? 'data.csv')
  const [datasetContent, setDatasetContent] = useState(initial?.datasetContent ?? '')
  const [genBusy, setGenBusy] = useState(false)
  const [genMsg, setGenMsg] = useState<string | null>(null)
  const isTurtle = language === 'turtle'
  const isPandas = language === 'pandas'
  const isHtml = language === 'html'
  const isPhp = language === 'php'
  const isScratch = language === 'scratch'

  // เกณฑ์ตรวจ Scratch
  const [scratchChecks, setScratchChecks] = useState<EditableScratchCheck[]>(() => {
    if (initial?.language !== 'scratch') return [{ ...EMPTY_SCRATCH_CHECK }]
    const parsed = initial.testCases
      .map((tc) => {
        const c = parseScratchCheck(tc.input)
        return c
          ? {
              rule: c.rule,
              count: c.count ? String(c.count) : '',
              opcode: c.opcode ?? '',
              isHidden: tc.isHidden,
            }
          : null
      })
      .filter((c): c is EditableScratchCheck => c !== null)
    return parsed.length ? parsed : [{ ...EMPTY_SCRATCH_CHECK }]
  })

  const updateScratchCheck = (i: number, patch: Partial<EditableScratchCheck>) =>
    setScratchChecks((prev) => prev.map((c, j) => (j === i ? { ...c, ...patch } : c)))

  // โหมดตรวจ scratch: 'blocks' = นับบล็อก (เดิม), 'io' = รับค่า-ส่งออก (รันจริง)
  const initialScratchConfig = parseScratchConfig(initial?.scratchConfig)
  const [scratchMode, setScratchMode] = useState<'blocks' | 'io'>(initialScratchConfig.mode)
  const [scratchOutputType, setScratchOutputType] = useState<'say' | 'variable'>(
    initialScratchConfig.mode === 'io' && initialScratchConfig.output.type === 'variable'
      ? 'variable'
      : 'say'
  )
  const [scratchVariableName, setScratchVariableName] = useState(
    initialScratchConfig.mode === 'io' && initialScratchConfig.output.type === 'variable'
      ? initialScratchConfig.output.name
      : ''
  )
  const isScratchIo = isScratch && scratchMode === 'io'
  const isScratchBlocks = isScratch && scratchMode === 'blocks'

  // ทดสอบเกณฑ์กับไฟล์ .sb3 เฉลยของครู (ไฟล์ไม่ถูกเก็บ — ใช้ทดสอบอย่างเดียว)
  const testScratchFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try {
      const stats = await parseSb3(file)
      const results = evaluateScratch(stats, scratchChecks.map(toScratchCheck))
      setCheckResults(results)
      const failed = results.filter((r) => !r).length
      setGenMsg(
        `ไฟล์ "${file.name}": ${stats.spriteCount} sprite, ${stats.totalBlocks} block\n` +
          (failed === 0
            ? `✓ ผ่านเกณฑ์ครบ ${results.length} ข้อ`
            : `ไม่ผ่าน ${failed} เกณฑ์ — ตรวจดูว่าเกณฑ์เขียนถูกหรือไฟล์ขาดอะไร`)
      )
    } catch (err) {
      setGenMsg(err instanceof Error ? err.message : 'อ่านไฟล์ไม่สำเร็จ')
    }
  }

  // เกณฑ์ตรวจ HTML
  const [htmlChecks, setHtmlChecks] = useState<EditableCheck[]>(() => {
    if (initial?.language !== 'html') return [{ ...EMPTY_CHECK }]
    const parsed = initial.testCases
      .map((tc) => {
        const c = parseCheck(tc.input)
        return c ? fromHtmlCheck(c, tc.isHidden) : null
      })
      .filter((c): c is EditableCheck => c !== null)
    return parsed.length ? parsed : [{ ...EMPTY_CHECK }]
  })
  const [checkResults, setCheckResults] = useState<(boolean | null)[]>([])

  const updateCheck = (i: number, patch: Partial<EditableCheck>) =>
    setHtmlChecks((prev) => prev.map((c, j) => (j === i ? { ...c, ...patch } : c)))

  // ทดสอบเกณฑ์กับโค้ดเฉลย — ครูจะได้รู้ว่าเกณฑ์เขียนถูกก่อนบันทึก
  const testChecksAgainstSolution = () => {
    if (!solutionCode.trim()) {
      setGenMsg('ใส่โค้ดเฉลย (HTML ตัวอย่างที่ถูกต้อง) ก่อน จึงจะทดสอบเกณฑ์ได้')
      return
    }
    const checks = htmlChecks.map(toHtmlCheck)
    const results = evaluateHtml(solutionCode, checks)
    setCheckResults(results)
    const failed = results.filter((r) => !r).length
    setGenMsg(
      failed === 0
        ? `✓ เฉลยผ่านเกณฑ์ครบ ${results.length} ข้อ`
        : `เฉลยไม่ผ่าน ${failed} เกณฑ์ — ตรวจดูว่าเกณฑ์เขียนถูกหรือเฉลยขาดอะไร`
    )
  }

  // ตัวเลือกตัวรันตามภาษา — pandas โหลดแพ็กเกจ + แนบไฟล์ข้อมูล
  const runOpts = () => ({
    packages: isPandas ? ['pandas'] : undefined,
    files:
      isPandas && datasetContent.trim()
        ? [{ name: datasetName.trim() || 'data.csv', content: datasetContent }]
        : undefined,
    timeoutMs: isPandas ? 30_000 : undefined,
  })

  // อ่านไฟล์ CSV ที่ครูเลือกเข้ามาใส่ textarea
  const handleDatasetFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setDatasetName(file.name)
    const reader = new FileReader()
    reader.onload = () => setDatasetContent(String(reader.result ?? ''))
    reader.readAsText(file)
  }

  const updateCase = (i: number, patch: Partial<TestCaseInput>) =>
    setTestCases((prev) => prev.map((tc, j) => (j === i ? { ...tc, ...patch } : tc)))
  const removeCase = (i: number) =>
    setTestCases((prev) => prev.filter((_, j) => j !== i))
  const addCase = () => setTestCases((prev) => [...prev, { ...EMPTY_CASE }])

  // รันเฉลยหนึ่งครั้ง — PHP ส่งไปรันบนเซิร์ฟเวอร์, ที่เหลือรันในเบราว์เซอร์ (Pyodide)
  const runSolutionOnce = async (input: string) => {
    if (isPhp) {
      const r = await fetch(withBase('/api/run/php'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: solutionCode, stdin: input }),
      })
      if (!r.ok)
        return { ok: false, output: '', error: 'เรียกตัวรัน PHP บนเซิร์ฟเวอร์ไม่สำเร็จ', timedOut: false }
      return (await r.json()) as { ok: boolean; output: string; error: string | null; timedOut: boolean }
    }
    const { pythonRunner } = await import('@/lib/pythonRunner')
    return pythonRunner.run(solutionCode, input, runOpts())
  }

  // รันเฉลยกับ input ของแต่ละเคส แล้วเอาผลมาเติมช่อง output ให้อัตโนมัติ
  const generateOutputs = async () => {
    if (!solutionCode.trim()) {
      setGenMsg('ใส่โค้ดเฉลยก่อน จึงจะสร้าง output อัตโนมัติได้')
      return
    }
    setGenBusy(true)
    setGenMsg(isPhp ? 'กำลังรันเฉลยบนเซิร์ฟเวอร์...' : 'กำลังโหลดตัวรัน Python (ครั้งแรกใช้เวลาสักครู่ ต้องต่ออินเทอร์เน็ต)...')
    try {
      if (!isPhp) {
        const { pythonRunner } = await import('@/lib/pythonRunner')
        const warm = await pythonRunner.warmup(isPandas ? ['pandas'] : undefined)
        if (warm.timedOut || (!warm.ok && warm.error)) {
          setGenMsg('โหลดตัวรัน Python ไม่สำเร็จ — ตรวจสอบอินเทอร์เน็ตแล้วลองใหม่')
          return
        }
      }
      const results = [...testCases]
      for (let i = 0; i < results.length; i++) {
        setGenMsg(`กำลังรันเฉลยกับเคสที่ ${i + 1}/${results.length}...`)
        const res = await runSolutionOnce(results[i].input)
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
      <div className="bg-white rounded-2xl border border-indigo-100 shadow-sm p-6 space-y-4">
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
              <option value="pandas">Pandas (วิเคราะห์ข้อมูล)</option>
              <option value="html">HTML (เว็บเพจ)</option>
              <option value="php">PHP</option>
              <option value="scratch">Scratch (อัปโหลดไฟล์ .sb3)</option>
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

        <div className={isScratch ? 'hidden' : ''}>
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

        <div className={isScratch ? 'hidden' : ''}>
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
                : isHtml
                  ? '<!DOCTYPE html>\n<html>\n<body>\n  <h1>หัวข้อ</h1>\n</body>\n</html>'
                  : isPhp
                    ? '<?php\n$a = (int)trim(fgets(STDIN));\n$b = (int)trim(fgets(STDIN));\necho $a + $b;'
                    : 'a = int(input())\nb = int(input())\nprint(a + b)'
            }
            spellCheck={false}
            className={`${inputClass} font-mono`}
          />
          <p className="text-xs text-gray-400 mt-1">
            {isTurtle
              ? 'ระบบจะรันเฉลยเพื่อสร้าง "ภาพเฉลย" แล้วใช้เทียบกับภาพที่นักเรียนวาด'
              : isHtml
                ? 'ใส่ HTML ตัวอย่างที่ถูกต้องไว้ เพื่อกดทดสอบว่าเกณฑ์การตรวจเขียนถูก'
                : 'ใส่เฉลยไว้เพื่อกดสร้าง output ของ test case อัตโนมัติ และเก็บไว้อ้างอิง'}
          </p>
        </div>
      </div>

      {/* โหมด pandas: ไฟล์ข้อมูลแนบ */}
      {isPandas && (
        <div className="bg-white rounded-2xl border border-indigo-100 shadow-sm p-6">
          <h2 className="text-base font-semibold text-gray-900 mb-1">
            ไฟล์ข้อมูลแนบ (ไม่บังคับ)
          </h2>
          <p className="text-xs text-gray-400 mb-3">
            นักเรียนอ่านไฟล์นี้ในโค้ดได้ เช่น{' '}
            <code className="bg-gray-100 px-1 rounded">
              pd.read_csv(&apos;{datasetName.trim() || 'data.csv'}&apos;)
            </code>{' '}
            — เลือกไฟล์จากเครื่อง หรือวางเนื้อหา CSV ในช่องด้านล่าง
          </p>
          <div className="flex flex-wrap gap-3 items-end mb-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                ชื่อไฟล์
              </label>
              <input
                type="text"
                name="datasetName"
                value={datasetName}
                onChange={(e) => setDatasetName(e.target.value)}
                placeholder="data.csv"
                pattern="[\w.\-]{1,60}"
                className="w-48 px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              />
            </div>
            <label className="px-4 py-2 text-sm font-medium text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition cursor-pointer">
              📁 เลือกไฟล์ CSV...
              <input
                type="file"
                accept=".csv,.txt,.tsv"
                onChange={handleDatasetFile}
                className="hidden"
              />
            </label>
          </div>
          <textarea
            name="datasetContent"
            rows={6}
            value={datasetContent}
            onChange={(e) => setDatasetContent(e.target.value)}
            placeholder={'name,score\nสมชาย,80\nสมหญิง,95'}
            spellCheck={false}
            className={`${inputClass} font-mono text-xs`}
          />
          {datasetContent && (
            <p className="text-xs text-gray-400 mt-1">
              {datasetContent.split('\n').length.toLocaleString()} บรรทัด ·{' '}
              {(datasetContent.length / 1024).toFixed(1)} KB
            </p>
          )}
        </div>
      )}

      {/* โหมด scratch: เลือกวิธีตรวจ */}
      {isScratch && (
        <div className="bg-white rounded-2xl border border-indigo-100 shadow-sm p-6">
          <h2 className="text-base font-semibold text-gray-900 mb-3">วิธีตรวจโจทย์ Scratch</h2>
          <div className="grid sm:grid-cols-2 gap-3">
            <label
              className={`flex flex-col gap-1 border rounded-lg p-4 cursor-pointer transition ${
                scratchMode === 'blocks'
                  ? 'border-indigo-400 bg-indigo-50'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <span className="flex items-center gap-2 text-sm font-medium text-gray-800">
                <input
                  type="radio"
                  name="scratchModeRadio"
                  checked={scratchMode === 'blocks'}
                  onChange={() => setScratchMode('blocks')}
                  className="text-indigo-600 focus:ring-indigo-500"
                />
                นับบล็อก (โครงสร้าง)
              </span>
              <span className="text-xs text-gray-500 pl-6">
                ตรวจว่าใช้บล็อกตามเกณฑ์ เช่น มี loop / ใช้ตัวแปร — ไม่รันโปรแกรม
              </span>
            </label>
            <label
              className={`flex flex-col gap-1 border rounded-lg p-4 cursor-pointer transition ${
                scratchMode === 'io'
                  ? 'border-indigo-400 bg-indigo-50'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <span className="flex items-center gap-2 text-sm font-medium text-gray-800">
                <input
                  type="radio"
                  name="scratchModeRadio"
                  checked={scratchMode === 'io'}
                  onChange={() => setScratchMode('io')}
                  className="text-indigo-600 focus:ring-indigo-500"
                />
                รับค่า → ส่งออก (รันจริง)
              </span>
              <span className="text-xs text-gray-500 pl-6">
                รันโปรเจกต์จริง ป้อนคำตอบให้บล็อก &quot;ถามแล้วรอ&quot; แล้วเทียบผลลัพธ์ —
                เหมาะกับโจทย์คำนวณ เช่น หา BMI
              </span>
            </label>
          </div>

          {isScratchIo && (
            <div className="mt-4 border-t border-gray-100 pt-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                เก็บผลลัพธ์จากไหน
              </label>
              <div className="flex flex-wrap items-center gap-3">
                <select
                  value={scratchOutputType}
                  onChange={(e) =>
                    setScratchOutputType(e.target.value as 'say' | 'variable')
                  }
                  className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="say">บล็อก &quot;พูด&quot; (say) — แนะนำ</option>
                  <option value="variable">ค่าของตัวแปร</option>
                </select>
                {scratchOutputType === 'variable' && (
                  <input
                    type="text"
                    value={scratchVariableName}
                    onChange={(e) => setScratchVariableName(e.target.value)}
                    placeholder="ชื่อตัวแปร เช่น BMI"
                    className="flex-1 min-w-44 px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                )}
              </div>
              <p className="text-xs text-gray-500 mt-2">
                {scratchOutputType === 'say'
                  ? 'นักเรียนต้องให้ตัวละคร "พูด" คำตอบออกมา — ตัวเลขทศนิยมจะถูกปัดเหลือ 2 ตำแหน่งเหมือนลูกโป่งคำพูดจริง (เช่น 20.76)'
                  : 'อ่านค่าสุดท้ายของตัวแปรชื่อนี้หลังโปรแกรมจบ — ใส่ชื่อให้ตรงกับในโปรเจกต์ (ตัวพิมพ์เล็ก/ใหญ่ไม่ต้องตรง) ค่าตัวแปรไม่ถูกปัดทศนิยม'}
              </p>
            </div>
          )}
        </div>
      )}

      {/* โหมด scratch (นับบล็อก): เกณฑ์การตรวจ block */}
      {isScratchBlocks && (
        <div className="bg-white rounded-2xl border border-indigo-100 shadow-sm p-6">
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-base font-semibold text-gray-900">
              เกณฑ์การตรวจ ({scratchChecks.length})
            </h2>
            <div className="flex items-center gap-1">
              <label className="text-sm text-emerald-700 hover:text-emerald-800 font-medium px-3 py-1 rounded hover:bg-emerald-50 transition cursor-pointer">
                🧪 ทดสอบกับไฟล์เฉลย (.sb3)
                <input type="file" accept=".sb3" onChange={testScratchFile} className="hidden" />
              </label>
              <button
                type="button"
                onClick={() =>
                  setScratchChecks((prev) => [...prev, { ...EMPTY_SCRATCH_CHECK }])
                }
                className="text-sm text-indigo-600 hover:text-indigo-800 font-medium px-3 py-1 rounded hover:bg-indigo-50 transition"
              >
                + เพิ่มเกณฑ์
              </button>
            </div>
          </div>
          <p className="text-xs text-gray-400 mb-3">
            นักเรียนอัปโหลดไฟล์ .sb3 แล้วระบบแกะดูว่าใช้ block ตามเกณฑ์ครบไหม —
            ไฟล์เฉลยของครูใช้แค่ทดสอบเกณฑ์ ไม่ถูกเก็บ
          </p>
          {genMsg && (
            <div
              className={`mb-4 p-3 rounded-lg text-sm whitespace-pre-wrap border ${
                genMsg.includes('✓')
                  ? 'bg-green-50 border-green-200 text-green-700'
                  : 'bg-amber-50 border-amber-200 text-amber-700'
              }`}
            >
              {genMsg}
            </div>
          )}
          <div className="space-y-3">
            {scratchChecks.map((c, i) => {
              const parsed = toScratchCheck(c)
              const result = checkResults[i]
              return (
                <div key={i} className="border border-gray-200 rounded-lg p-4 bg-gray-50">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-gray-700">เกณฑ์ที่ {i + 1}</p>
                      {result !== null && result !== undefined && (
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                            result ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                          }`}
                        >
                          {result ? '✓ เฉลยผ่าน' : '✗ เฉลยไม่ผ่าน'}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      <label className="flex items-center gap-1.5 text-sm text-gray-600">
                        <input
                          type="checkbox"
                          checked={c.isHidden}
                          onChange={(e) => updateScratchCheck(i, { isHidden: e.target.checked })}
                          className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                        />
                        ซ่อนจากนักเรียน
                      </label>
                      {scratchChecks.length > 1 && (
                        <button
                          type="button"
                          onClick={() =>
                            setScratchChecks((prev) => prev.filter((_, j) => j !== i))
                          }
                          className="text-sm text-red-500 hover:text-red-700"
                        >
                          ลบ
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-3">
                    <select
                      value={c.rule}
                      onChange={(e) => updateScratchCheck(i, { rule: e.target.value })}
                      className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                      {Object.entries(SCRATCH_RULES).map(([key, def]) => (
                        <option key={key} value={key}>
                          {def.label}
                        </option>
                      ))}
                      <option value="sprites">{SPECIAL_RULES.sprites.label}</option>
                      <option value="total_blocks">{SPECIAL_RULES.total_blocks.label}</option>
                      <option value="opcode">กำหนด opcode เอง (ขั้นสูง)</option>
                    </select>
                    {c.rule === 'opcode' && (
                      <input
                        type="text"
                        value={c.opcode}
                        onChange={(e) => updateScratchCheck(i, { opcode: e.target.value })}
                        placeholder="เช่น motion_movesteps"
                        className="flex-1 min-w-44 px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    )}
                    <input
                      type="number"
                      min={1}
                      value={c.count}
                      onChange={(e) => updateScratchCheck(i, { count: e.target.value })}
                      placeholder="จำนวนขั้นต่ำ (1)"
                      className="w-36 px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <p className="text-xs text-gray-500 mt-2">
                    {parsed ? `→ ${describeScratchCheck(parsed)}` : '⚠️ กรอกข้อมูลเกณฑ์ให้ครบ'}
                  </p>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* โหมด html: เกณฑ์การตรวจโครงสร้าง */}
      {isHtml && (
        <div className="bg-white rounded-2xl border border-indigo-100 shadow-sm p-6">
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-base font-semibold text-gray-900">
              เกณฑ์การตรวจ ({htmlChecks.length})
            </h2>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={testChecksAgainstSolution}
                className="text-sm text-emerald-700 hover:text-emerald-800 font-medium px-3 py-1 rounded hover:bg-emerald-50 transition"
              >
                🧪 ทดสอบเกณฑ์กับเฉลย
              </button>
              <button
                type="button"
                onClick={() => setHtmlChecks((prev) => [...prev, { ...EMPTY_CHECK }])}
                className="text-sm text-indigo-600 hover:text-indigo-800 font-medium px-3 py-1 rounded hover:bg-indigo-50 transition"
              >
                + เพิ่มเกณฑ์
              </button>
            </div>
          </div>
          <p className="text-xs text-gray-400 mb-3">
            ตรวจโครงสร้างหน้าเว็บด้วย CSS selector เช่น <code>h1</code>, <code>img</code>,{' '}
            <code>table tr</code>, <code>#menu</code>, <code>.card</code> — เกณฑ์ที่
            &quot;ซ่อน&quot; นักเรียนเห็นแค่ผ่าน/ไม่ผ่าน
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
          <div className="space-y-3">
            {htmlChecks.map((c, i) => {
              const parsed = toHtmlCheck(c)
              const result = checkResults[i]
              return (
                <div key={i} className="border border-gray-200 rounded-lg p-4 bg-gray-50">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-gray-700">เกณฑ์ที่ {i + 1}</p>
                      {result !== null && result !== undefined && (
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                            result ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                          }`}
                        >
                          {result ? '✓ เฉลยผ่าน' : '✗ เฉลยไม่ผ่าน'}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      <label className="flex items-center gap-1.5 text-sm text-gray-600">
                        <input
                          type="checkbox"
                          checked={c.isHidden}
                          onChange={(e) => updateCheck(i, { isHidden: e.target.checked })}
                          className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                        />
                        ซ่อนจากนักเรียน
                      </label>
                      {htmlChecks.length > 1 && (
                        <button
                          type="button"
                          onClick={() =>
                            setHtmlChecks((prev) => prev.filter((_, j) => j !== i))
                          }
                          className="text-sm text-red-500 hover:text-red-700"
                        >
                          ลบ
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-3">
                    <select
                      value={c.type}
                      onChange={(e) =>
                        updateCheck(i, { type: e.target.value as EditableCheck['type'] })
                      }
                      className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value="exists">ต้องมี element</option>
                      <option value="text">ต้องมีข้อความใน element</option>
                      <option value="attr">ต้องมี attribute</option>
                    </select>
                    <input
                      type="text"
                      value={c.selector}
                      onChange={(e) => updateCheck(i, { selector: e.target.value })}
                      placeholder="selector เช่น h1, img, table tr"
                      className="flex-1 min-w-40 px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                    {c.type === 'exists' && (
                      <input
                        type="number"
                        min={1}
                        value={c.count}
                        onChange={(e) => updateCheck(i, { count: e.target.value })}
                        placeholder="จำนวนขั้นต่ำ (1)"
                        className="w-36 px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    )}
                    {c.type === 'text' && (
                      <input
                        type="text"
                        value={c.text}
                        onChange={(e) => updateCheck(i, { text: e.target.value })}
                        placeholder="ข้อความที่ต้องมี"
                        className="flex-1 min-w-40 px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    )}
                    {c.type === 'attr' && (
                      <>
                        <input
                          type="text"
                          value={c.attr}
                          onChange={(e) => updateCheck(i, { attr: e.target.value })}
                          placeholder="attribute เช่น alt, href"
                          className="w-44 px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                        <input
                          type="text"
                          value={c.value}
                          onChange={(e) => updateCheck(i, { value: e.target.value })}
                          placeholder="ค่า (ไม่บังคับ)"
                          className="w-40 px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                      </>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 mt-2">
                    {parsed ? `→ ${describeCheck(parsed)}` : '⚠️ กรอกข้อมูลเกณฑ์ให้ครบ'}
                  </p>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* โหมด turtle: ภาพเฉลย */}
      {isTurtle && (
        <div className="bg-white rounded-2xl border border-indigo-100 shadow-sm p-6">
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
      <div className={`bg-white rounded-2xl border border-indigo-100 shadow-sm p-6 ${isTurtle || isHtml || isScratchBlocks ? 'hidden' : ''}`}>
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-base font-semibold text-gray-900">
            Test cases ({testCases.length})
          </h2>
          <div className="flex items-center gap-1">
            {!isScratch && (
              <button
                type="button"
                onClick={generateOutputs}
                disabled={genBusy}
                className="text-sm text-emerald-700 hover:text-emerald-800 font-medium px-3 py-1 rounded hover:bg-emerald-50 transition disabled:opacity-60"
              >
                {genBusy ? 'กำลังรันเฉลย...' : '⚡ สร้าง output จากเฉลย'}
              </button>
            )}
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
          {isScratchIo
            ? 'ใส่ "คำตอบ" ที่จะป้อนให้บล็อกถามทีละค่า (บรรทัดละค่า ตามลำดับที่โปรแกรมถาม) แล้วใส่ผลลัพธ์ที่ต้องการ — เคสที่ "ซ่อน" นักเรียนเห็นแค่ผ่าน/ไม่ผ่าน'
            : 'ระบบจะป้อน input ให้โปรแกรมนักเรียนแล้วเทียบ output (ไม่สนช่องว่างท้ายบรรทัด) — เคสที่ "ซ่อน" นักเรียนจะเห็นแค่ผ่าน/ไม่ผ่าน ช่วยกันเดาคำตอบ'}
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
      <input type="hidden" name="scratchMode" value={scratchMode} />
      <input type="hidden" name="scratchOutputType" value={scratchOutputType} />
      <input type="hidden" name="scratchVariableName" value={scratchVariableName} />
      <input
        type="hidden"
        name="scratchChecks"
        value={JSON.stringify(
          scratchChecks
            .map((c) => {
              const check = toScratchCheck(c)
              return check ? { ...check, isHidden: c.isHidden } : null
            })
            .filter(Boolean)
        )}
      />
      <input
        type="hidden"
        name="htmlChecks"
        value={JSON.stringify(
          htmlChecks
            .map((c) => {
              const check = toHtmlCheck(c)
              return check ? { ...check, isHidden: c.isHidden } : null
            })
            .filter(Boolean)
        )}
      />

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

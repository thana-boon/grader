'use server'

import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth'
import { describeCheck, type HtmlCheck } from '@/lib/htmlGrading'
import {
  describeScratchCheck,
  SCRATCH_RULES,
  type ScratchCheck,
} from '@/lib/scratchGrading'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

export type ActionResult = { error?: string }

// ครบทุกภาษาตามแผนแล้ว
const LANGUAGES = ['python', 'turtle', 'pandas', 'html', 'php', 'scratch']
const MAX_HTML_CHECKS = 20
const SCRATCH_RULE_KEYS = [...Object.keys(SCRATCH_RULES), 'sprites', 'total_blocks', 'opcode']
const MAX_DATASET_BYTES = 2_000_000 // ~2MB กันไฟล์ใหญ่เกิน (เก็บใน MEDIUMTEXT และส่งให้เบราว์เซอร์ทุกครั้งที่รัน)
const MAX_TEST_CASES = 20

async function requireTeacher() {
  const user = await getCurrentUser()
  if (!user || user.role !== 'teacher') redirect('/login')
  return user
}

type ParsedTestCase = { input: string; expectedOutput: string; isHidden: boolean }

type ParsedProblem = {
  title: string
  description: string
  language: string
  starterCode: string | null
  solutionCode: string | null
  datasetName: string | null
  datasetContent: string | null
  testCases: ParsedTestCase[]
}

type ParseResult = { ok: false; error: string } | { ok: true; data: ParsedProblem }

function parseProblemForm(formData: FormData): ParseResult {
  const title = (formData.get('title') as string)?.trim()
  const description = (formData.get('description') as string)?.trim() ?? ''
  const language = formData.get('language') as string
  const starterCode = (formData.get('starterCode') as string) || null
  const solutionCode = (formData.get('solutionCode') as string) || null

  if (!title) return { ok: false, error: 'กรุณาใส่ชื่อโจทย์' }
  if (!description) return { ok: false, error: 'กรุณาใส่คำสั่ง/คำอธิบายโจทย์' }
  if (!LANGUAGES.includes(language)) return { ok: false, error: 'ภาษานี้ยังไม่เปิดใช้งาน' }

  // ไฟล์ข้อมูลแนบ — เฉพาะ pandas
  let datasetName: string | null = null
  let datasetContent: string | null = null
  if (language === 'pandas') {
    datasetContent = (formData.get('datasetContent') as string) || null
    if (datasetContent) {
      if (datasetContent.length > MAX_DATASET_BYTES) {
        return { ok: false, error: 'ไฟล์ข้อมูลใหญ่เกินไป (จำกัด ~2MB)' }
      }
      datasetName = ((formData.get('datasetName') as string) || 'data.csv').trim()
      if (!/^[\w.\-]{1,60}$/.test(datasetName)) {
        return { ok: false, error: 'ชื่อไฟล์ข้อมูลต้องเป็นอักษรอังกฤษ/ตัวเลข เช่น data.csv' }
      }
    }
  }

  // โหมด turtle — เกณฑ์ตรวจคือ "ภาพเฉลย" (เก็บเป็น test case เดียว expectedOutput = JSON ภาพ)
  if (language === 'turtle') {
    if (!solutionCode?.trim()) {
      return { ok: false, error: 'โจทย์ turtle ต้องใส่โค้ดเฉลย' }
    }
    const drawing = (formData.get('expectedDrawing') as string) ?? ''
    let valid = false
    try {
      const d = JSON.parse(drawing)
      valid = Array.isArray(d?.events) && d.events.length > 0
    } catch {
      valid = false
    }
    if (!valid) {
      return { ok: false, error: 'ยังไม่มีภาพเฉลย — กดปุ่ม "วาดภาพเฉลยจากโค้ด" ก่อนบันทึก' }
    }
    return {
      ok: true,
      data: {
        title,
        description,
        language,
        starterCode,
        solutionCode,
        datasetName: null,
        datasetContent: null,
        testCases: [{ input: '', expectedOutput: drawing, isHidden: false }],
      },
    }
  }

  // โหมด scratch — เกณฑ์ตรวจ block เก็บเป็น test case: input = JSON เกณฑ์, expectedOutput = คำอธิบาย
  if (language === 'scratch') {
    let rawChecks: unknown
    try {
      rawChecks = JSON.parse((formData.get('scratchChecks') as string) ?? '[]')
    } catch {
      return { ok: false, error: 'ข้อมูลเกณฑ์การตรวจไม่ถูกต้อง' }
    }
    if (!Array.isArray(rawChecks) || rawChecks.length === 0) {
      return { ok: false, error: 'ต้องมีเกณฑ์การตรวจอย่างน้อย 1 ข้อ' }
    }
    if (rawChecks.length > MAX_HTML_CHECKS) {
      return { ok: false, error: `เกณฑ์การตรวจได้สูงสุด ${MAX_HTML_CHECKS} ข้อ` }
    }

    const testCases: ParsedTestCase[] = []
    for (const [i, raw] of rawChecks.entries()) {
      const c = raw as (ScratchCheck & { isHidden?: boolean }) | null
      if (!c || !SCRATCH_RULE_KEYS.includes(c.rule)) {
        return { ok: false, error: `เกณฑ์ที่ ${i + 1}: รูปแบบไม่ถูกต้อง` }
      }
      if (c.rule === 'opcode' && (typeof c.opcode !== 'string' || !c.opcode.trim())) {
        return { ok: false, error: `เกณฑ์ที่ ${i + 1}: ยังไม่ได้ใส่ชื่อ opcode` }
      }
      const check: ScratchCheck = {
        rule: c.rule,
        count: typeof c.count === 'number' && c.count > 1 ? c.count : undefined,
        opcode: c.rule === 'opcode' ? c.opcode!.trim() : undefined,
      }
      testCases.push({
        input: JSON.stringify(check),
        expectedOutput: describeScratchCheck(check),
        isHidden: c.isHidden === true,
      })
    }

    return {
      ok: true,
      data: {
        title,
        description,
        language,
        starterCode: null,
        solutionCode: null,
        datasetName: null,
        datasetContent: null,
        testCases,
      },
    }
  }

  // โหมด html — เกณฑ์ตรวจโครงสร้าง เก็บเป็น test case: input = JSON เกณฑ์, expectedOutput = คำอธิบาย
  if (language === 'html') {
    let rawChecks: unknown
    try {
      rawChecks = JSON.parse((formData.get('htmlChecks') as string) ?? '[]')
    } catch {
      return { ok: false, error: 'ข้อมูลเกณฑ์การตรวจไม่ถูกต้อง' }
    }
    if (!Array.isArray(rawChecks) || rawChecks.length === 0) {
      return { ok: false, error: 'ต้องมีเกณฑ์การตรวจอย่างน้อย 1 ข้อ' }
    }
    if (rawChecks.length > MAX_HTML_CHECKS) {
      return { ok: false, error: `เกณฑ์การตรวจได้สูงสุด ${MAX_HTML_CHECKS} ข้อ` }
    }

    const testCases: ParsedTestCase[] = []
    for (const [i, raw] of rawChecks.entries()) {
      const c = raw as (HtmlCheck & { isHidden?: boolean }) | null
      const selector = typeof c?.selector === 'string' ? c.selector.trim() : ''
      if (!selector) return { ok: false, error: `เกณฑ์ที่ ${i + 1}: ยังไม่ได้ใส่ selector` }

      let check: HtmlCheck
      if (c!.type === 'exists') {
        check = { type: 'exists', selector, count: typeof c!.count === 'number' && c!.count > 1 ? c!.count : undefined }
      } else if (c!.type === 'text' && typeof c!.text === 'string' && c!.text.trim()) {
        check = { type: 'text', selector, text: c!.text }
      } else if (c!.type === 'attr' && typeof c!.attr === 'string' && c!.attr.trim()) {
        check = { type: 'attr', selector, attr: c!.attr.trim(), value: typeof c!.value === 'string' && c!.value ? c!.value : undefined }
      } else {
        return { ok: false, error: `เกณฑ์ที่ ${i + 1}: กรอกข้อมูลไม่ครบ` }
      }
      testCases.push({
        input: JSON.stringify(check),
        expectedOutput: describeCheck(check),
        isHidden: c!.isHidden === true,
      })
    }

    return {
      ok: true,
      data: {
        title,
        description,
        language,
        starterCode,
        solutionCode,
        datasetName: null,
        datasetContent: null,
        testCases,
      },
    }
  }

  let raw: unknown
  try {
    raw = JSON.parse((formData.get('testCases') as string) ?? '[]')
  } catch {
    return { ok: false, error: 'ข้อมูล test case ไม่ถูกต้อง' }
  }
  if (!Array.isArray(raw) || raw.length === 0) {
    return { ok: false, error: 'ต้องมี test case อย่างน้อย 1 ชุด' }
  }
  if (raw.length > MAX_TEST_CASES) {
    return { ok: false, error: `test case ได้สูงสุด ${MAX_TEST_CASES} ชุด` }
  }

  const testCases: ParsedTestCase[] = []
  for (const [i, tc] of raw.entries()) {
    const input = typeof tc?.input === 'string' ? tc.input : ''
    const expectedOutput =
      typeof tc?.expectedOutput === 'string' ? tc.expectedOutput : ''
    if (!expectedOutput.trim()) {
      return { ok: false, error: `test case ที่ ${i + 1} ยังไม่ได้ใส่ output ที่คาดหวัง` }
    }
    testCases.push({ input, expectedOutput, isHidden: tc?.isHidden === true })
  }

  return {
    ok: true,
    data: {
      title,
      description,
      language,
      starterCode,
      solutionCode,
      datasetName,
      datasetContent,
      testCases,
    },
  }
}

export async function createProblem(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const user = await requireTeacher()
  const parsed = parseProblemForm(formData)
  if (!parsed.ok) return { error: parsed.error }

  const { testCases, ...data } = parsed.data
  await prisma.problem.create({
    data: {
      ...data,
      createdById: user.userId,
      testCases: {
        create: testCases.map((tc, i) => ({ ...tc, sortOrder: i })),
      },
    },
  })

  revalidatePath('/problems')
  redirect('/problems')
}

export async function updateProblem(
  id: number,
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  await requireTeacher()
  const parsed = parseProblemForm(formData)
  if (!parsed.ok) return { error: parsed.error }

  const { testCases, ...data } = parsed.data
  // แก้ test cases แบบลบทั้งชุดแล้วสร้างใหม่ — ง่ายและไม่มีปัญหา id ค้าง
  await prisma.$transaction([
    prisma.problem.update({ where: { id }, data }),
    prisma.testCase.deleteMany({ where: { problemId: id } }),
    prisma.testCase.createMany({
      data: testCases.map((tc, i) => ({ ...tc, problemId: id, sortOrder: i })),
    }),
  ])

  revalidatePath('/problems')
  redirect('/problems')
}

export async function deleteProblem(id: number): Promise<ActionResult> {
  await requireTeacher()
  // ลบโจทย์แล้ว test cases กับ assignments หายตามด้วย (onDelete: Cascade)
  await prisma.problem.delete({ where: { id } }).catch(() => {})
  revalidatePath('/problems')
  return {}
}


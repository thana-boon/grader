'use server'

import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

export type ActionResult = { error?: string }

// ภาษาที่เปิดใช้แล้ว — เฟสถัดไป: pandas, html, php, scratch
const LANGUAGES = ['python', 'turtle']
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
        testCases: [{ input: '', expectedOutput: drawing, isHidden: false }],
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
    data: { title, description, language, starterCode, solutionCode, testCases },
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


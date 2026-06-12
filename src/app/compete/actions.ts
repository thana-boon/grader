'use server'

import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

export type ActionResult = { error?: string }

async function requireTeacher() {
  const user = await getCurrentUser()
  if (!user || user.role !== 'teacher') redirect('/login')
  return user
}

// สร้างรายการแข่งขัน — ชื่อ + เวลาแข่ง (นาที) + โจทย์พร้อมคะแนนรายข้อ
export async function createCompetition(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  await requireTeacher()

  const title = (formData.get('title') as string)?.trim()
  if (!title) return { error: 'กรุณาตั้งชื่อรายการแข่งขัน' }

  const durationMinutes = Math.min(
    60 * 24,
    Math.max(1, Math.round(Number(formData.get('durationMinutes'))) || 0)
  )
  if (!durationMinutes) return { error: 'กรุณากำหนดเวลาแข่ง (นาที)' }

  let problemsRaw: unknown
  try {
    problemsRaw = JSON.parse((formData.get('problems') as string) ?? '[]')
  } catch {
    return { error: 'รายการโจทย์ไม่ถูกต้อง' }
  }
  if (!Array.isArray(problemsRaw) || problemsRaw.length === 0) {
    return { error: 'กรุณาเลือกโจทย์อย่างน้อย 1 ข้อ' }
  }
  const picked = (problemsRaw as { id?: unknown; points?: unknown }[])
    .map((p) => ({
      id: Number(p?.id),
      points: Math.min(1000, Math.max(1, Math.round(Number(p?.points)) || 10)),
    }))
    .filter((p) => Number.isInteger(p.id) && p.id > 0)
  const found = await prisma.problem.findMany({
    where: { id: { in: picked.map((p) => p.id) } },
    select: { id: true },
  })
  const foundIds = new Set(found.map((p) => p.id))
  const validProblems = picked.filter((p) => foundIds.has(p.id))
  if (validProblems.length === 0) return { error: 'ไม่พบโจทย์ที่เลือก' }

  const comp = await prisma.competition.create({
    data: {
      title,
      durationMinutes,
      problems: {
        create: validProblems.map((p, i) => ({ problemId: p.id, sortOrder: i, points: p.points })),
      },
    },
  })

  revalidatePath('/compete')
  redirect(`/compete/${comp.id}`)
}

export async function deleteCompetition(id: number): Promise<ActionResult> {
  await requireTeacher()
  // บัญชีผู้แข่ง/คำตอบ หายตามด้วย (cascade) — ตัวโจทย์ในคลังไม่หาย
  await prisma.competition.delete({ where: { id } }).catch(() => {})
  revalidatePath('/compete')
  return {}
}

// เริ่มการแข่งขัน — นาฬิกาเริ่มนับถอยหลังจากตอนนี้
export async function startCompetition(id: number) {
  await requireTeacher()
  await prisma.competition
    .update({ where: { id }, data: { startedAt: new Date(), endedAt: null } })
    .catch(() => {})
  revalidatePath(`/compete/${id}`)
  revalidatePath('/arena')
}

// สั่งจบก่อนเวลา
export async function endCompetition(id: number) {
  await requireTeacher()
  await prisma.competition
    .update({ where: { id }, data: { endedAt: new Date() } })
    .catch(() => {})
  revalidatePath(`/compete/${id}`)
  revalidatePath('/arena')
}

// เพิ่มผู้เข้าแข่งรายคน — ครูตั้ง username/password เอง
export async function addContestant(
  competitionId: number,
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  await requireTeacher()
  const username = (formData.get('username') as string)?.trim()
  const password = (formData.get('password') as string)?.trim()
  const displayName = ((formData.get('displayName') as string)?.trim() || username) ?? ''
  if (!username || !password) return { error: 'กรุณากรอก username และ password' }
  if (!/^[a-zA-Z0-9_.-]{3,30}$/.test(username)) {
    return { error: 'username ใช้ a-z 0-9 _ . - ยาว 3-30 ตัวอักษร' }
  }
  try {
    await prisma.contestant.create({
      data: { competitionId, username, password, displayName },
    })
  } catch {
    return { error: `username "${username}" ถูกใช้แล้ว` }
  }
  revalidatePath(`/compete/${competitionId}`)
  return {}
}

// สร้างบัญชีผู้แข่งเป็นชุด เช่น team01..team10 พร้อมรหัสผ่านสุ่ม
export async function generateContestants(
  competitionId: number,
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  await requireTeacher()
  const prefix = ((formData.get('prefix') as string)?.trim() || 'team').toLowerCase()
  if (!/^[a-z0-9_.-]{1,20}$/.test(prefix)) {
    return { error: 'คำนำหน้าใช้ a-z 0-9 _ . - ยาวไม่เกิน 20 ตัวอักษร' }
  }
  const count = Math.min(100, Math.max(1, Math.round(Number(formData.get('count'))) || 0))
  if (!count) return { error: 'กรุณาใส่จำนวนบัญชี' }

  // ตัดอักษรที่อ่านสับสนง่ายออก (0/O, 1/l/I)
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789'
  const randomPassword = () =>
    Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')

  // หาเลขต่อท้ายที่ว่าง — สร้างซ้ำได้โดยไม่ชนของเดิม
  const existing = await prisma.contestant.findMany({
    where: { username: { startsWith: prefix } },
    select: { username: true },
  })
  const used = new Set(existing.map((c) => c.username))
  const rows: { competitionId: number; username: string; password: string; displayName: string }[] =
    []
  let n = 1
  while (rows.length < count && n <= 999) {
    const username = `${prefix}${String(n).padStart(2, '0')}`
    if (!used.has(username)) {
      rows.push({ competitionId, username, password: randomPassword(), displayName: username })
    }
    n++
  }
  if (rows.length === 0) return { error: 'สร้างไม่สำเร็จ — ชื่อถูกใช้หมดแล้ว' }
  await prisma.contestant.createMany({ data: rows })
  revalidatePath(`/compete/${competitionId}`)
  return {}
}

export async function deleteContestant(id: number): Promise<ActionResult> {
  await requireTeacher()
  const c = await prisma.contestant.delete({ where: { id } }).catch(() => null)
  if (c) revalidatePath(`/compete/${c.competitionId}`)
  return {}
}

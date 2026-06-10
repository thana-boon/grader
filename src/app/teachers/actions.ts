'use server'

import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import bcrypt from 'bcryptjs'

export type ActionResult = { error?: string; success?: string }

// จัดการบัญชีครูได้เฉพาะผู้ดูแลระบบ — ตรวจ is_admin จาก DB สด ไม่เชื่อค่าใน JWT
// เผื่อกรณีถูกถอดสิทธิ์หลังจาก login ไปแล้ว
async function requireAdmin() {
  const user = await getCurrentUser()
  if (!user || user.role !== 'teacher') redirect('/login')
  const me = await prisma.teacher.findUnique({ where: { id: user.userId } })
  if (!me?.is_admin) redirect('/dashboard/teacher')
  return me
}

export async function createTeacher(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  await requireAdmin()

  const username = (formData.get('username') as string)?.trim()
  const name = (formData.get('name') as string)?.trim()
  const password = formData.get('password') as string
  const isAdmin = formData.get('is_admin') === 'on'

  if (!username || !name || !password) {
    return { error: 'กรุณากรอกข้อมูลให้ครบถ้วน' }
  }
  if (!/^[a-zA-Z0-9_.-]{3,30}$/.test(username)) {
    return { error: 'ชื่อผู้ใช้ต้องเป็นอักษรอังกฤษ ตัวเลข หรือ _ . - ยาว 3-30 ตัว' }
  }
  if (password.length < 8) {
    return { error: 'รหัสผ่านต้องยาวอย่างน้อย 8 ตัวอักษร' }
  }

  try {
    await prisma.teacher.create({
      data: {
        username,
        name,
        password: await bcrypt.hash(password, 12),
        is_admin: isAdmin,
      },
    })
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      return { error: `ชื่อผู้ใช้ "${username}" ถูกใช้แล้ว` }
    }
    throw e
  }

  revalidatePath('/teachers')
  return { success: `สร้างบัญชี "${username}" เรียบร้อย` }
}

export async function resetTeacherPassword(
  id: number,
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  await requireAdmin()

  const password = formData.get('password') as string
  if (!password || password.length < 8) {
    return { error: 'รหัสผ่านต้องยาวอย่างน้อย 8 ตัวอักษร' }
  }

  await prisma.teacher.update({
    where: { id },
    data: { password: await bcrypt.hash(password, 12) },
  })

  revalidatePath('/teachers')
  return { success: 'รีเซ็ตรหัสผ่านเรียบร้อย' }
}

export async function deleteTeacher(id: number): Promise<ActionResult> {
  const me = await requireAdmin()

  if (me.id === id) return { error: 'ลบบัญชีของตัวเองไม่ได้' }

  const target = await prisma.teacher.findUnique({ where: { id } })
  if (!target) return { error: 'ไม่พบบัญชีนี้' }

  // กันระบบล็อกตัวเอง — ต้องเหลือผู้ดูแลระบบอย่างน้อย 1 คนเสมอ
  if (target.is_admin) {
    const adminCount = await prisma.teacher.count({ where: { is_admin: true } })
    if (adminCount <= 1) return { error: 'ต้องเหลือผู้ดูแลระบบอย่างน้อย 1 คน' }
  }

  await prisma.teacher.delete({ where: { id } })
  revalidatePath('/teachers')
  return { success: 'ลบบัญชีเรียบร้อย' }
}

import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { writeFile, mkdir } from 'fs/promises'
import { join } from 'path'
import { randomUUID } from 'crypto'
import { SCRATCH_UPLOAD_DIR } from '@/lib/scratchStorage'

// รับไฟล์ .sb3 ของนักเรียน เก็บลง uploads/scratch (นอก public — ดาวน์โหลดผ่าน API ที่เช็คสิทธิ์)
// ชื่อไฟล์เป็น UUID สุ่ม กันเดา/กันชนกัน

const MAX_BYTES = 20 * 1024 * 1024 // 20MB

export async function POST(request: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const form = await request.formData().catch(() => null)
  const file = form?.get('file')
  if (!(file instanceof Blob)) {
    return NextResponse.json({ error: 'ไม่พบไฟล์' }, { status: 400 })
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'ไฟล์ใหญ่เกิน 20MB' }, { status: 400 })
  }

  const bytes = Buffer.from(await file.arrayBuffer())
  // ไฟล์ .sb3 คือ zip — ต้องขึ้นต้นด้วย PK
  if (bytes.length < 4 || bytes[0] !== 0x50 || bytes[1] !== 0x4b) {
    return NextResponse.json({ error: 'ไฟล์นี้ไม่ใช่ .sb3 (Scratch 3)' }, { status: 400 })
  }

  await mkdir(SCRATCH_UPLOAD_DIR, { recursive: true })
  const token = `${randomUUID()}.sb3`
  await writeFile(join(SCRATCH_UPLOAD_DIR, token), bytes)
  return NextResponse.json({ token })
}

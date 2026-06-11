import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { readFile } from 'fs/promises'
import { join } from 'path'
import { SCRATCH_UPLOAD_DIR, SCRATCH_TOKEN_PATTERN } from '@/lib/scratchStorage'

// ดาวน์โหลดไฟล์ .sb3 ที่ส่งไว้ — ใช้โดยครูตอนตรวจงาน (เปิดใน Scratch ได้)
export async function GET(request: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const token = request.nextUrl.searchParams.get('token') ?? ''
  if (!SCRATCH_TOKEN_PATTERN.test(token)) {
    return NextResponse.json({ error: 'token ไม่ถูกต้อง' }, { status: 400 })
  }

  try {
    const bytes = await readFile(join(SCRATCH_UPLOAD_DIR, token))
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': `attachment; filename="project.sb3"`,
      },
    })
  } catch {
    return NextResponse.json({ error: 'ไม่พบไฟล์' }, { status: 404 })
  }
}

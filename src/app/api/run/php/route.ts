import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { spawn } from 'child_process'
import { writeFile, unlink, mkdir } from 'fs/promises'
import { existsSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { randomUUID } from 'crypto'

// รันโค้ด PHP บนเครื่องเซิร์ฟเวอร์ (ใช้ php ของ XAMPP) — ภาษาเดียวที่รันฝั่ง server
// มาตรการจำกัดความเสี่ยง:
// - open_basedir ขังให้อ่าน/เขียนได้เฉพาะโฟลเดอร์ temp (อ่าน .env หรือไฟล์โปรเจกต์ไม่ได้)
// - disable_functions ปิดคำสั่งเรียก shell/โปรเซส
// - timeout 10 วินาที + จำกัดขนาดโค้ด/หน่วยความจำ

const PHP_PATH =
  process.env.PHP_PATH ??
  (existsSync('C:\\xampp\\php\\php.exe') ? 'C:\\xampp\\php\\php.exe' : 'php')

const RUN_DIR = join(tmpdir(), 'codegrader-php')
const TIMEOUT_MS = 10_000

const DISABLED_FUNCTIONS = [
  'exec', 'passthru', 'shell_exec', 'system', 'proc_open', 'popen',
  'pcntl_exec', 'dl', 'putenv',
].join(',')

type RunResponse = {
  ok: boolean
  output: string
  error: string | null
  timedOut: boolean
}

function runPhp(file: string, stdin: string): Promise<RunResponse> {
  return new Promise((resolve) => {
    const child = spawn(
      PHP_PATH,
      [
        '-d', 'display_errors=1',
        '-d', 'error_reporting=E_ALL',
        '-d', 'memory_limit=128M',
        '-d', `open_basedir=${RUN_DIR}`,
        '-d', `disable_functions=${DISABLED_FUNCTIONS}`,
        file,
      ],
      { windowsHide: true }
    )

    let stdout = ''
    let stderr = ''
    let done = false

    const timer = setTimeout(() => {
      done = true
      child.kill('SIGKILL')
      resolve({ ok: false, output: stdout, error: null, timedOut: true })
    }, TIMEOUT_MS)

    child.stdout.on('data', (d) => {
      stdout += d.toString()
      if (stdout.length > 200_000) {
        // output ทะลัก (เช่น loop print ไม่หยุด) — ตัดจบ
        done = true
        clearTimeout(timer)
        child.kill('SIGKILL')
        resolve({ ok: false, output: stdout.slice(0, 10_000), error: 'output ยาวเกินไป', timedOut: false })
      }
    })
    child.stderr.on('data', (d) => (stderr += d.toString()))
    child.on('error', (e) => {
      if (done) return
      done = true
      clearTimeout(timer)
      resolve({ ok: false, output: '', error: `เรียกใช้ PHP ไม่สำเร็จ: ${e.message}`, timedOut: false })
    })
    child.on('close', (codeNum) => {
      if (done) return
      done = true
      clearTimeout(timer)
      resolve({
        ok: codeNum === 0,
        output: stdout,
        error: codeNum === 0 ? null : stderr.trim() || `PHP จบด้วยรหัส ${codeNum}`,
        timedOut: false,
      })
    })

    child.stdin.write(stdin)
    child.stdin.end()
  })
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => null)
  const code = typeof body?.code === 'string' ? body.code : ''
  const stdin = typeof body?.stdin === 'string' ? body.stdin : ''
  if (!code.trim()) {
    return NextResponse.json({ ok: false, output: '', error: 'ไม่มีโค้ด', timedOut: false })
  }
  if (code.length > 50_000 || stdin.length > 10_000) {
    return NextResponse.json({ ok: false, output: '', error: 'โค้ดหรือ input ยาวเกินไป', timedOut: false })
  }

  await mkdir(RUN_DIR, { recursive: true })
  const file = join(RUN_DIR, `run-${randomUUID()}.php`)
  await writeFile(file, code, 'utf-8')
  try {
    const result = await runPhp(file, stdin)
    return NextResponse.json(result)
  } finally {
    unlink(file).catch(() => {})
  }
}

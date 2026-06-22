// รันโปรเจกต์ Scratch (.sb3) จริงด้วย scratch-vm แบบไม่มีจอ — สำหรับโจทย์ "รับค่า → ส่งออก"
// ป้อนคำตอบให้บล็อก "ถามแล้วรอ" ทีละค่า แล้วดักผลลัพธ์จากบล็อก "พูด" หรือค่าของตัวแปร
// ทำงานได้ทั้งในเบราว์เซอร์ (ตอนนักเรียนส่ง) และใน Node (ตอนเทสต์) — โหลด scratch-vm แบบ dynamic

import type { ScratchOutputSpec } from './scratchGrading'

export type ScratchRunResult = {
  ok: boolean
  output: string // ผลลัพธ์ที่ดักได้ (ใช้เทียบกับ expectedOutput)
  says: string[] // ทุกข้อความที่ "พูด" ตามลำดับ (เก็บให้ครูดู/ดีบัก)
  error: string | null
  timedOut: boolean
}

type VmTarget = {
  isStage?: boolean
  visible?: boolean
  variables?: Record<string, { name: string; value: unknown }>
}

type VmLike = {
  runtime: {
    on: (event: string, cb: (...args: unknown[]) => void) => void
    emit: (event: string, ...args: unknown[]) => void
    targets: VmTarget[]
  }
  attachStorage?: (storage: unknown) => void
  start: () => void
  greenFlag: () => void
  loadProject: (input: ArrayBuffer | Uint8Array) => Promise<void>
  quit?: () => void
}

// แปลง input เป็น ArrayBuffer ให้ scratch-vm
function toArrayBuffer(data: ArrayBuffer | Uint8Array): ArrayBuffer {
  if (data instanceof ArrayBuffer) return data
  return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer
}

export async function runScratchProject(
  fileData: ArrayBuffer | Uint8Array,
  answers: string[],
  outputSpec: ScratchOutputSpec,
  opts: { timeoutMs?: number } = {}
): Promise<ScratchRunResult> {
  const timeoutMs = opts.timeoutMs ?? 10_000
  const says: string[] = []

  let vm: VmLike
  try {
    const VirtualMachine = (await import('scratch-vm')).default as unknown as new () => VmLike
    vm = new VirtualMachine()
    // ไม่แนบ storage โดยตั้งใจ — โจทย์โหมด io ใช้แค่ตรรกะ/ถาม-ตอบ/พูด/ตัวแปร ไม่ต้องโหลด costume/sound
    // (scratch-vm จะเตือนว่าโหลด asset ไม่ได้ แต่รันต่อได้ปกติและให้ผลถูกต้อง)
  } catch (err) {
    return {
      ok: false,
      output: '',
      says,
      error: 'โหลดตัวรัน Scratch ไม่สำเร็จ: ' + (err instanceof Error ? err.message : String(err)),
      timedOut: false,
    }
  }

  return new Promise<ScratchRunResult>((resolve) => {
    let answerIdx = 0
    let settled = false
    let timer: ReturnType<typeof setTimeout> | null = null

    const cleanup = () => {
      if (timer) clearTimeout(timer)
      try {
        vm.quit?.()
      } catch {
        /* ignore */
      }
    }

    const finish = (partial: Omit<ScratchRunResult, 'says'>) => {
      if (settled) return
      settled = true
      cleanup()
      resolve({ ...partial, says })
    }

    // โปรแกรมถาม → ป้อนคำตอบถัดไป (หมดแล้วป้อนค่าว่าง)
    // หมายเหตุ: runtime ยิง QUESTION(null) ตอนเคลียร์คำถาม (เริ่มโปรแกรม/หยุด) — ต้องข้าม
    // คำถามจริงจะมี payload เป็น string เสมอ (เราซ่อนตัวละครไว้ จึงได้ข้อความคำถามตรง ๆ ไม่มี SAY ปน)
    vm.runtime.on('QUESTION', (question: unknown) => {
      if (typeof question !== 'string') return
      const ans = answerIdx < answers.length ? answers[answerIdx++] : ''
      vm.runtime.emit('ANSWER', ans)
    })

    // โปรแกรมพูด → เก็บข้อความที่ไม่ว่าง (sayforsecs จะพูดค่าว่างตอนเคลียร์ — ข้าม)
    // ค่าที่พูดอาจเป็น number → แปลงแบบเดียวกับลูกโป่งคำพูดของ Scratch (ปัดทศนิยม 2 ตำแหน่ง)
    vm.runtime.on('SAY', (...args: unknown[]) => {
      const text = formatSayText(args[2])
      if (text !== '') says.push(text)
    })

    // โปรแกรมทำงานจบ (ทุก thread หยุด) → ดักผลลัพธ์
    vm.runtime.on('PROJECT_RUN_STOP', () => {
      finish({
        ok: true,
        output: captureOutput(vm, outputSpec, says),
        error: null,
        timedOut: false,
      })
    })

    timer = setTimeout(() => {
      finish({
        ok: false,
        output: captureOutput(vm, outputSpec, says),
        error: 'โปรแกรมรันนานเกินไป — อาจวน loop ไม่รู้จบ หรือไม่จบการทำงาน',
        timedOut: true,
      })
    }, timeoutMs)

    vm.loadProject(toArrayBuffer(fileData))
      .then(() => {
        // ซ่อนตัวละครทุกตัว เพื่อให้บล็อก "ถามแล้วรอ" ส่งคำถามผ่าน event QUESTION ตรง ๆ
        // (ถ้าตัวละครมองเห็นได้ คำถามจะไปโผล่เป็น SAY ปนกับผลลัพธ์ที่นักเรียนพูดจริง)
        for (const target of vm.runtime.targets) {
          if (!target.isStage) target.visible = false
        }
        vm.start()
        vm.greenFlag()
      })
      .catch((err: unknown) => {
        finish({
          ok: false,
          output: '',
          error: 'เปิดไฟล์ Scratch ไม่สำเร็จ: ' + (err instanceof Error ? err.message : String(err)),
          timedOut: false,
        })
      })
  })
}

// เลียนแบบ _formatBubbleText ของ scratch-vm: ตัวเลขที่ไม่ลงตัวจะปัดเหลือ 2 ตำแหน่ง
// (นี่คือสิ่งที่นักเรียนเห็นจริงในลูกโป่งคำพูด เช่น BMI 20.7612... จะแสดงเป็น "20.76")
export function formatSayText(text: unknown): string {
  if (typeof text === 'number' && Math.abs(text) >= 0.01 && text % 1 !== 0) {
    return text.toFixed(2)
  }
  return String(text ?? '')
}

function captureOutput(vm: VmLike, spec: ScratchOutputSpec, says: string[]): string {
  if (spec.type === 'variable') {
    const want = spec.name.trim().toLowerCase()
    for (const target of vm.runtime.targets) {
      for (const v of Object.values(target.variables ?? {})) {
        if (v.name.trim().toLowerCase() === want) return String(v.value)
      }
    }
    return ''
  }
  // say: รวมทุกข้อความที่พูดตามลำดับ (เหมือน stdout บรรทัดละข้อความ)
  return says.join('\n')
}

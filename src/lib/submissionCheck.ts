// แปลง+ตรวจความถูกต้องของผลตรวจที่เบราว์เซอร์ส่งมา → passed/total/details
// ใช้ร่วมกันระหว่างส่งงานมอบหมาย (assignments) และส่งคำตอบการแข่งขัน (arena)
// server เชื่อผลรันโค้ดจาก client ตามที่ออกแบบ แต่ตรวจรูปร่างข้อมูลทั้งหมด

// ผลตรวจ turtle — % ความเหมือนของภาพ + ภาพที่ผู้ใช้วาด (เก็บให้ครูดู)
export type TurtleResult = { percent: number; drawing: string | null }

// ผลตรวจ scratch — ผ่าน/ไม่ผ่านรายเกณฑ์ + token ไฟล์ .sb3 ที่อัปโหลดไว้ + สถิติ
export type ScratchResult = {
  flags: boolean[]
  fileToken: string | null
  stats?: { spriteCount: number; totalBlocks: number }
}

export type SubmittedResults = boolean[] | TurtleResult | ScratchResult

export type CheckedResults =
  | { ok: true; passed: number; total: number; details: string | null }
  | { ok: false; error: string }

export async function checkResults(
  language: string,
  testCaseCount: number,
  results: SubmittedResults
): Promise<CheckedResults> {
  const invalid = { ok: false as const, error: 'ผลการตรวจไม่ถูกต้อง กรุณากดส่งใหม่' }

  if (language === 'scratch') {
    // scratch: ผ่าน/ไม่ผ่านรายเกณฑ์ + เก็บ token ไฟล์ .sb3 ไว้ให้ครูดาวน์โหลด
    if (Array.isArray(results) || !('flags' in results) || !Array.isArray(results.flags)) {
      return invalid
    }
    const total = testCaseCount
    if (results.flags.length !== total || results.flags.some((f) => typeof f !== 'boolean')) {
      return invalid
    }
    const { SCRATCH_TOKEN_PATTERN } = await import('@/lib/scratchStorage')
    const fileToken =
      typeof results.fileToken === 'string' && SCRATCH_TOKEN_PATTERN.test(results.fileToken)
        ? results.fileToken
        : null
    return {
      ok: true,
      passed: results.flags.filter(Boolean).length,
      total,
      details: JSON.stringify({
        file: fileToken,
        flags: results.flags,
        stats: results.stats ?? null,
      }),
    }
  }

  if (language === 'turtle') {
    // turtle: คะแนน = % ความเหมือนของภาพ (0-100), details = ภาพที่วาด
    if (Array.isArray(results) || !('percent' in results) || typeof results.percent !== 'number') {
      return invalid
    }
    return {
      ok: true,
      passed: Math.max(0, Math.min(100, Math.round(results.percent))),
      total: 100,
      details:
        typeof results.drawing === 'string' && results.drawing.length <= 1_000_000
          ? results.drawing
          : null,
    }
  }

  // ภาษาอื่น: ผ่าน/ไม่ผ่านรายเคส
  const total = testCaseCount
  if (
    !Array.isArray(results) ||
    results.length !== total ||
    results.some((r) => typeof r !== 'boolean')
  ) {
    return invalid
  }
  return {
    ok: true,
    passed: results.filter(Boolean).length,
    total,
    details: JSON.stringify(results),
  }
}

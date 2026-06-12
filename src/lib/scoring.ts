// คิดคะแนนจากผลตรวจ — คะแนนข้อ = คะแนนเต็ม × (เคสที่ผ่าน/ทั้งหมด) × ตัวคูณของครั้งที่ส่ง
// แล้วเอาครั้งที่ได้คะแนนสูงสุดเป็นคะแนนจริง (ส่งซ้ำไม่ทำให้คะแนนที่ได้แล้วลด)
//
// นโยบายส่งซ้ำตั้งระดับงาน (Assignment):
//   freeAttempts   = ส่งได้กี่ครั้งโดยไม่หัก (0 = ไม่จำกัด ไม่หักเลย)
//   penaltyPercent = เกินโควตาแล้วหักเพดานคะแนนครั้งละกี่ %

export type AttemptPolicy = { freeAttempts: number; penaltyPercent: number }

// ตัวคูณเพดานคะแนนของการส่งครั้งที่ attempt (ครั้งแรก = 1)
export function attemptMultiplier(attempt: number, policy: AttemptPolicy): number {
  if (policy.freeAttempts <= 0) return 1
  const over = Math.max(0, attempt - policy.freeAttempts)
  return Math.max(0, 1 - (over * policy.penaltyPercent) / 100)
}

// คะแนนของการส่งหนึ่งครั้ง
export function submissionScore(
  passed: number,
  total: number,
  points: number,
  multiplier: number
): number {
  if (total <= 0) return 0
  return roundScore((passed / total) * points * multiplier)
}

// คะแนนจริงของข้อ — subs ต้องเรียงเก่า→ใหม่ (ลำดับ = ครั้งที่ส่ง)
export function bestScore(
  subs: { passed: number; total: number }[],
  points: number,
  policy: AttemptPolicy
): number {
  let best = 0
  subs.forEach((s, i) => {
    const score = submissionScore(s.passed, s.total, points, attemptMultiplier(i + 1, policy))
    if (score > best) best = score
  })
  return best
}

export function roundScore(n: number): number {
  return Math.round(n * 100) / 100
}

// แสดงคะแนนแบบไม่มีศูนย์ท้าย เช่น 8 / 8.5 / 8.25
export function formatScore(n: number): string {
  return roundScore(n)
    .toFixed(2)
    .replace(/\.?0+$/, '')
}

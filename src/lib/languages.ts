export const LANGUAGE_LABELS: Record<string, string> = {
  python: 'Python',
  turtle: 'Python Turtle',
  pandas: 'Pandas',
  html: 'HTML',
  php: 'PHP',
  scratch: 'Scratch',
}

export function languageLabel(language: string): string {
  return LANGUAGE_LABELS[language] ?? language
}

// ข้อความคะแนน — turtle ให้คะแนนเป็น % ความเหมือนของภาพ, ภาษาอื่นนับเคสที่ผ่าน
export function scoreLabel(language: string, passed: number, total: number): string {
  return language === 'turtle'
    ? `คะแนน ${passed}%`
    : `ผ่าน ${passed}/${total} เคส`
}

// ตัวเลือกตัวรัน Python ตามภาษาโจทย์ — pandas ต้องโหลดแพ็กเกจเพิ่ม และอาจมีไฟล์ข้อมูลแนบ
export function runnerOptions(
  language: string,
  dataset?: { name: string; content: string } | null
): { packages?: string[]; files?: { name: string; content: string }[]; timeoutMs?: number } {
  const isPandas = language === 'pandas'
  return {
    packages: isPandas ? ['pandas'] : undefined,
    files: dataset?.content ? [dataset] : undefined,
    timeoutMs: isPandas ? 30_000 : undefined, // pandas import ครั้งแรกช้ากว่าปกติ
  }
}

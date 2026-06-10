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

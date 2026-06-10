// เทียบ output ของโปรแกรมกับที่คาดหวัง
// ไม่สนช่องว่าง/แท็บท้ายบรรทัด, ความต่าง CRLF/LF และบรรทัดว่างท้าย output

export function normalizeOutput(s: string): string {
  return s
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/, ''))
    .join('\n')
    .replace(/\n+$/, '')
}

export function outputMatches(actual: string, expected: string): boolean {
  return normalizeOutput(actual) === normalizeOutput(expected)
}

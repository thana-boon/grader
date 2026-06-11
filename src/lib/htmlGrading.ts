// เกณฑ์ตรวจโจทย์ HTML — เช็คโครงสร้างเอกสารด้วย CSS selector
// (HTML เทียบ output ตรงๆ ไม่ได้ จึงตรวจว่า "มีสิ่งที่โจทย์สั่งครบไหม" แทน)
// เกณฑ์ถูกเก็บใน test_cases: input = JSON ของเกณฑ์, expectedOutput = คำอธิบายภาษาคน

export type HtmlCheck =
  | { type: 'exists'; selector: string; count?: number } // มี element ตาม selector อย่างน้อย n ชิ้น
  | { type: 'text'; selector: string; text: string } // element ตาม selector มีข้อความที่กำหนด
  | { type: 'attr'; selector: string; attr: string; value?: string } // มี attribute (และค่า ถ้าระบุ)

export function describeCheck(c: HtmlCheck): string {
  switch (c.type) {
    case 'exists':
      return c.count && c.count > 1
        ? `มี "${c.selector}" อย่างน้อย ${c.count} ชิ้น`
        : `มี "${c.selector}"`
    case 'text':
      return `"${c.selector}" มีข้อความ "${c.text}"`
    case 'attr':
      return c.value
        ? `"${c.selector}" มี ${c.attr}="${c.value}"`
        : `"${c.selector}" มี attribute ${c.attr}`
  }
}

export function parseCheck(json: string): HtmlCheck | null {
  try {
    const c = JSON.parse(json)
    if (!c || typeof c.selector !== 'string' || !c.selector.trim()) return null
    if (c.type === 'exists') return { type: 'exists', selector: c.selector, count: c.count }
    if (c.type === 'text' && typeof c.text === 'string')
      return { type: 'text', selector: c.selector, text: c.text }
    if (c.type === 'attr' && typeof c.attr === 'string')
      return { type: 'attr', selector: c.selector, attr: c.attr, value: c.value }
    return null
  } catch {
    return null
  }
}

// ตรวจ HTML ของนักเรียนกับเกณฑ์ทั้งหมด — ใช้ DOMParser (รันในเบราว์เซอร์เท่านั้น)
export function evaluateHtml(code: string, checks: (HtmlCheck | null)[]): boolean[] {
  const doc = new DOMParser().parseFromString(code, 'text/html')
  return checks.map((c) => {
    if (!c) return false
    try {
      const els = [...doc.querySelectorAll(c.selector)]
      switch (c.type) {
        case 'exists':
          return els.length >= (c.count && c.count > 0 ? c.count : 1)
        case 'text':
          return els.some((el) => (el.textContent ?? '').includes(c.text))
        case 'attr':
          return els.some((el) =>
            c.value !== undefined && c.value !== ''
              ? el.getAttribute(c.attr) === c.value
              : el.hasAttribute(c.attr)
          )
      }
    } catch {
      return false // selector ผิดรูปแบบ
    }
  })
}

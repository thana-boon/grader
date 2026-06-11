// ตรวจโจทย์ Scratch — แกะไฟล์ .sb3 (zip ที่มี project.json) แล้วเช็คว่าใช้ block ตามเกณฑ์ไหม
// เกณฑ์เก็บใน test_cases: input = JSON ของเกณฑ์, expectedOutput = คำอธิบายภาษาคน

export type ScratchCheck = {
  rule: string // key จาก SCRATCH_RULES หรือ 'opcode' (กำหนด opcode เอง)
  count?: number // จำนวนขั้นต่ำ (default 1)
  opcode?: string // เฉพาะ rule = 'opcode'
}

// สถิติที่แกะได้จากโปรเจกต์
export type ScratchStats = {
  spriteCount: number
  totalBlocks: number
  opcodes: Record<string, number> // opcode -> จำนวนครั้งที่ใช้
}

type RuleDef = {
  label: string // ชื่อใน dropdown ของครู
  describe: (n: number) => string
  match: (opcode: string) => boolean
}

export const SCRATCH_RULES: Record<string, RuleDef> = {
  green_flag: {
    label: 'เริ่มด้วยธงเขียว',
    describe: () => 'มี block "เมื่อคลิกธงเขียว"',
    match: (op) => op === 'event_whenflagclicked',
  },
  loop: {
    label: 'ใช้ loop (ทำซ้ำ)',
    describe: (n) => `ใช้ block ทำซ้ำ (repeat/forever) อย่างน้อย ${n} ครั้ง`,
    match: (op) => ['control_repeat', 'control_forever', 'control_repeat_until'].includes(op),
  },
  if: {
    label: 'ใช้เงื่อนไข (if)',
    describe: (n) => `ใช้ block เงื่อนไข (ถ้า...) อย่างน้อย ${n} ครั้ง`,
    match: (op) => op === 'control_if' || op === 'control_if_else',
  },
  motion: {
    label: 'ใช้ block การเคลื่อนที่',
    describe: (n) => `ใช้ block หมวดการเคลื่อนที่ (Motion) อย่างน้อย ${n} ครั้ง`,
    match: (op) => op.startsWith('motion_'),
  },
  looks: {
    label: 'ใช้ block รูปร่าง/พูด',
    describe: (n) => `ใช้ block หมวดรูปร่าง (Looks เช่น พูด, เปลี่ยนชุด) อย่างน้อย ${n} ครั้ง`,
    match: (op) => op.startsWith('looks_'),
  },
  sound: {
    label: 'ใช้ block เสียง',
    describe: (n) => `ใช้ block หมวดเสียง (Sound) อย่างน้อย ${n} ครั้ง`,
    match: (op) => op.startsWith('sound_'),
  },
  variable: {
    label: 'ใช้ตัวแปร',
    describe: (n) => `ใช้ block ตัวแปร (ตั้งค่า/เปลี่ยนค่า) อย่างน้อย ${n} ครั้ง`,
    match: (op) => op === 'data_setvariableto' || op === 'data_changevariableby',
  },
  broadcast: {
    label: 'ใช้การส่งสัญญาณ (broadcast)',
    describe: (n) => `ใช้ block ส่งสัญญาณ/รับสัญญาณ อย่างน้อย ${n} ครั้ง`,
    match: (op) => op.startsWith('event_broadcast') || op === 'event_whenbroadcastreceived',
  },
  sensing: {
    label: 'ใช้ block การรับรู้',
    describe: (n) => `ใช้ block หมวดการรับรู้ (Sensing เช่น สัมผัส, ถาม) อย่างน้อย ${n} ครั้ง`,
    match: (op) => op.startsWith('sensing_'),
  },
  my_block: {
    label: 'สร้าง block ของตัวเอง',
    describe: (n) => `สร้างและใช้ block ของตัวเอง (My Blocks) อย่างน้อย ${n} ครั้ง`,
    match: (op) => op === 'procedures_definition',
  },
}

// เกณฑ์พิเศษที่ไม่ใช่การนับ opcode
export const SPECIAL_RULES = {
  sprites: {
    label: 'จำนวน sprite ขั้นต่ำ',
    describe: (n: number) => `มี sprite อย่างน้อย ${n} ตัว`,
  },
  total_blocks: {
    label: 'จำนวน block รวมขั้นต่ำ',
    describe: (n: number) => `ใช้ block รวมอย่างน้อย ${n} block`,
  },
}

export function describeScratchCheck(c: ScratchCheck): string {
  const n = c.count && c.count > 0 ? c.count : 1
  if (c.rule === 'sprites') return SPECIAL_RULES.sprites.describe(n)
  if (c.rule === 'total_blocks') return SPECIAL_RULES.total_blocks.describe(n)
  if (c.rule === 'opcode') return `ใช้ block "${c.opcode ?? '?'}" อย่างน้อย ${n} ครั้ง`
  const def = SCRATCH_RULES[c.rule]
  return def ? def.describe(n) : `เกณฑ์ไม่รู้จัก (${c.rule})`
}

export function parseScratchCheck(json: string): ScratchCheck | null {
  try {
    const c = JSON.parse(json)
    if (!c || typeof c.rule !== 'string') return null
    if (c.rule === 'opcode' && typeof c.opcode !== 'string') return null
    return { rule: c.rule, count: typeof c.count === 'number' ? c.count : undefined, opcode: c.opcode }
  } catch {
    return null
  }
}

export function evaluateScratch(stats: ScratchStats, checks: (ScratchCheck | null)[]): boolean[] {
  const countWhere = (match: (op: string) => boolean) =>
    Object.entries(stats.opcodes).reduce((sum, [op, n]) => (match(op) ? sum + n : sum), 0)

  return checks.map((c) => {
    if (!c) return false
    const need = c.count && c.count > 0 ? c.count : 1
    if (c.rule === 'sprites') return stats.spriteCount >= need
    if (c.rule === 'total_blocks') return stats.totalBlocks >= need
    if (c.rule === 'opcode') return (stats.opcodes[c.opcode ?? ''] ?? 0) >= need
    const def = SCRATCH_RULES[c.rule]
    if (!def) return false
    return countWhere(def.match) >= need
  })
}

// แกะไฟล์ .sb3 → สถิติ (รันในเบราว์เซอร์)
export async function parseSb3(file: File | Blob): Promise<ScratchStats> {
  const JSZip = (await import('jszip')).default
  const zip = await JSZip.loadAsync(await file.arrayBuffer())
  const entry = zip.file('project.json')
  if (!entry) throw new Error('ไฟล์นี้ไม่ใช่โปรเจกต์ Scratch (.sb3) — ไม่พบ project.json')
  const project = JSON.parse(await entry.async('string'))

  const stats: ScratchStats = { spriteCount: 0, totalBlocks: 0, opcodes: {} }
  for (const target of project.targets ?? []) {
    if (!target.isStage) stats.spriteCount++
    for (const block of Object.values<Record<string, unknown>>(target.blocks ?? {})) {
      // ข้าม shadow blocks (ช่องค่าที่ Scratch สร้างเอง ไม่ใช่ block ที่นักเรียนวาง)
      if (!block || typeof block !== 'object' || block.shadow === true) continue
      const opcode = block.opcode
      if (typeof opcode !== 'string') continue
      stats.totalBlocks++
      stats.opcodes[opcode] = (stats.opcodes[opcode] ?? 0) + 1
    }
  }
  return stats
}

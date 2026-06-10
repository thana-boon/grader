// เทียบภาพวาด turtle สองภาพ — หลักการ: คำสั่งวาดชุดเดียวกันให้ "เส้น" ชุดเดียวกันเสมอ
// จึงเทียบแบบ multiset ของเส้น (ไม่สนลำดับ/ทิศทางการวาด) พร้อมปัดพิกัดกันคลาดเคลื่อนทศนิยม
//
// รูปแบบ JSON จาก pythonRunner:
// { bg: string, events: Array<
//     ['seg', x1, y1, x2, y2, color, width]   เส้นตรง
//   | ['dot', x, y, size, color]              จุด
//   | ['fill', color, [x,y,x,y,...]]          พื้นที่ระบายสี
//   | ['text', x, y, str, color]              ข้อความ
// > }

export type TurtleDrawing = {
  bg: string
  events: unknown[][]
}

export function parseDrawing(json: string | null | undefined): TurtleDrawing | null {
  if (!json) return null
  try {
    const d = JSON.parse(json)
    if (!d || !Array.isArray(d.events)) return null
    return { bg: typeof d.bg === 'string' ? d.bg : 'white', events: d.events }
  } catch {
    return null
  }
}

const rnd = (v: unknown) => Math.round(Number(v))

// แปลง event เป็น key มาตรฐาน — เส้นเดียวกันต้องได้ key เดียวกันไม่ว่าวาดจากปลายไหน
function canonicalKeys(d: TurtleDrawing): string[] {
  const keys: string[] = []
  if (d.bg !== 'white') keys.push(`bg|${d.bg}`)

  for (const ev of d.events) {
    const type = ev[0]
    if (type === 'seg') {
      let [x1, y1, x2, y2] = [rnd(ev[1]), rnd(ev[2]), rnd(ev[3]), rnd(ev[4])]
      if (x1 === x2 && y1 === y2) continue // เส้นความยาวศูนย์ ไม่มีผลต่อภาพ
      // เรียงปลายเส้นให้คงที่ — วาดไป/กลับถือว่าเส้นเดียวกัน
      if (x1 > x2 || (x1 === x2 && y1 > y2)) {
        ;[x1, y1, x2, y2] = [x2, y2, x1, y1]
      }
      keys.push(`seg|${x1},${y1},${x2},${y2}|${ev[5]}|${ev[6]}`)
    } else if (type === 'dot') {
      keys.push(`dot|${rnd(ev[1])},${rnd(ev[2])}|${ev[3]}|${ev[4]}`)
    } else if (type === 'text') {
      keys.push(`text|${rnd(ev[1])},${rnd(ev[2])}|${ev[3]}|${ev[4]}`)
    } else if (type === 'fill') {
      const pts = (ev[2] as number[]).map(rnd)
      // polygon เดียวกันอาจเริ่มคนละมุม/คนละทิศ — หา rotation ที่ให้ string น้อยสุดทั้งสองทิศ
      const pairs: string[] = []
      for (let i = 0; i + 1 < pts.length; i += 2) pairs.push(`${pts[i]},${pts[i + 1]}`)
      // ตัดจุดสุดท้ายถ้าซ้ำจุดแรก (polygon ปิด)
      if (pairs.length > 1 && pairs[0] === pairs[pairs.length - 1]) pairs.pop()
      let best: string | null = null
      for (const seq of [pairs, [...pairs].reverse()]) {
        for (let r = 0; r < seq.length; r++) {
          const rotated = [...seq.slice(r), ...seq.slice(0, r)].join(';')
          if (best === null || rotated < best) best = rotated
        }
      }
      keys.push(`fill|${ev[1]}|${best ?? ''}`)
    }
  }
  return keys
}

// คืนค่าความเหมือน 0..1 — 1 = เส้นทุกเส้นตรงกันหมด
export function compareDrawings(expected: TurtleDrawing, actual: TurtleDrawing): number {
  const expKeys = canonicalKeys(expected)
  const actKeys = canonicalKeys(actual)
  if (expKeys.length === 0 && actKeys.length === 0) return 1
  if (expKeys.length === 0 || actKeys.length === 0) return 0

  const counts = new Map<string, number>()
  for (const k of expKeys) counts.set(k, (counts.get(k) ?? 0) + 1)
  let matched = 0
  for (const k of actKeys) {
    const c = counts.get(k) ?? 0
    if (c > 0) {
      matched++
      counts.set(k, c - 1)
    }
  }
  return matched / Math.max(expKeys.length, actKeys.length)
}

export function hasTurtleDrawing(json: string | null | undefined): boolean {
  const d = parseDrawing(json)
  return d !== null && d.events.length > 0
}

// สถานะการแข่งขัน — ใช้ร่วมกันทั้งหน้าครู (/compete) และสนามแข่ง (/arena)

export type CompetitionClock = {
  startedAt: Date | null
  endedAt: Date | null
  durationMinutes: number
}

export type CompetitionState = 'pending' | 'running' | 'ended'

export function competitionEndsAt(c: CompetitionClock): Date | null {
  if (!c.startedAt) return null
  const timeUp = new Date(c.startedAt.getTime() + c.durationMinutes * 60_000)
  // ครูสั่งจบก่อนเวลาได้ — ใช้เวลาที่ถึงก่อน
  return c.endedAt && c.endedAt < timeUp ? c.endedAt : timeUp
}

export function competitionState(c: CompetitionClock): CompetitionState {
  if (!c.startedAt) return 'pending'
  const ends = competitionEndsAt(c)
  return ends && new Date() >= ends ? 'ended' : 'running'
}

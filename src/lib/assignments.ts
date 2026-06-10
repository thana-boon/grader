import type { Prisma } from '@prisma/client'
import type { SchoolStudent } from './students'

// เงื่อนไขหา "งานของนักเรียนคนนี้" — ใช้ร่วมกันทั้ง dashboard, หน้าทำงาน และตอนส่งงาน
// งานเข้าถึงได้เมื่อ: มอบหมายรายคนถึงรหัสนี้ หรือมอบหมายทั้งชั้น(ทุกห้อง)/ห้องที่นักเรียนอยู่
export function assignmentTargetFilter(
  student: SchoolStudent
): Prisma.AssignmentWhereInput[] {
  return [
    { studentCode: student.student_code },
    { studentCode: null, classLevel: student.class_level, classRoom: null },
    { studentCode: null, classLevel: student.class_level, classRoom: student.class_room },
  ]
}

// เช็คเงื่อนไขเดียวกันกับ assignmentTargetFilter แบบรายตัว (ใช้ตอนเปิดหน้างาน/ส่งงาน)
export function assignmentMatchesStudent(
  assignment: { studentCode: string | null; classLevel: string | null; classRoom: number | null },
  student: SchoolStudent
): boolean {
  if (assignment.studentCode) return assignment.studentCode === student.student_code
  return (
    assignment.classLevel === student.class_level &&
    (assignment.classRoom === null || assignment.classRoom === student.class_room)
  )
}

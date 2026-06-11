import type { Prisma } from '@prisma/client'
import type { SchoolStudent } from './students'

// เงื่อนไขหา "งานของนักเรียนคนนี้" — งานเข้าถึงได้เมื่อมีเป้าหมาย (target) อย่างน้อยหนึ่งแถวที่
// มอบรายคนถึงรหัสนี้ หรือมอบทั้งห้องที่นักเรียนอยู่
export function targetOrFilter(
  student: SchoolStudent
): Prisma.AssignmentTargetWhereInput[] {
  return [
    { studentCode: student.student_code },
    {
      studentCode: null,
      classLevel: student.class_level,
      classRoom: student.class_room,
    },
  ]
}

// เช็คเงื่อนไขเดียวกันแบบรายตัว (ใช้ตอนเปิดหน้างาน/ส่งงาน)
export function targetsMatchStudent(
  targets: { studentCode: string | null; classLevel: string; classRoom: number }[],
  student: SchoolStudent
): boolean {
  return targets.some((t) =>
    t.studentCode
      ? t.studentCode === student.student_code
      : t.classLevel === student.class_level && t.classRoom === student.class_room
  )
}

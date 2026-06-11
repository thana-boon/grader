import { join } from 'path'

// โฟลเดอร์เก็บไฟล์ .sb3 ที่นักเรียนส่ง — อยู่นอก public เพื่อให้ดาวน์โหลดผ่าน API ที่เช็คสิทธิ์เท่านั้น
export const SCRATCH_UPLOAD_DIR = join(process.cwd(), 'uploads', 'scratch')

export const SCRATCH_TOKEN_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.sb3$/

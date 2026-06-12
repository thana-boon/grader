import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // ที่อยู่ฐานของเว็บเมื่อ deploy หลัง reverse proxy เช่น '/grader' → เข้าเว็บที่ http://server/grader
  // ตั้งค่าใน .env ของเครื่อง server (NEXT_PUBLIC_BASE_PATH="/grader") ก่อนสั่ง build
  // เครื่อง dev ไม่ต้องตั้ง — ใช้ http://localhost:3000 ตามเดิม
  basePath: process.env.NEXT_PUBLIC_BASE_PATH ?? '',
}

export default nextConfig

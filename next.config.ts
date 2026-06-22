import type { NextConfig } from 'next'
import path from 'path'

const nextConfig: NextConfig = {
  // ที่อยู่ฐานของเว็บเมื่อ deploy หลัง reverse proxy เช่น '/grader' → เข้าเว็บที่ http://server/grader
  // ตั้งค่าใน .env ของเครื่อง server (NEXT_PUBLIC_BASE_PATH="/grader") ก่อนสั่ง build
  // เครื่อง dev ไม่ต้องตั้ง — ใช้ http://localhost:3000 ตามเดิม
  basePath: process.env.NEXT_PUBLIC_BASE_PATH ?? '',
  webpack: (config) => {
    // scratch-vm มี exports condition "webpack" ที่ชี้ไป src/ ซึ่งยังไม่ bundle (ต้องใช้ asset loader พิเศษ)
    // alias ให้ใช้ bundle สำเร็จรูป dist/web แทน — asset (เสียง/รูป) ฝังในตัวแล้ว ไม่ต้องตั้ง loader เพิ่ม
    config.resolve = config.resolve ?? {}
    config.resolve.alias = {
      ...(config.resolve.alias ?? {}),
      'scratch-vm$': path.resolve(
        process.cwd(),
        'node_modules/scratch-vm/dist/web/scratch-vm.js'
      ),
    }
    return config
  },
}

export default nextConfig

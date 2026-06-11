import type { Metadata } from 'next'
import './globals.css'

// ฟอนต์ Sarabun ประกาศใน globals.css ชี้ไฟล์ใน public/fonts (self-host)
// — เลิกใช้ next/font/google เพราะมันดาวน์โหลดจากเน็ตตอน compile
// ถ้าเน็ตล่มจะทำให้ CSS ทั้งหน้าพัง (Tailwind ตั้ง font-sans เป็น Sarabun อยู่แล้ว)

export const metadata: Metadata = {
  title: 'CodeGrader',
  description: 'ระบบตรวจโค้ดนักเรียน',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="th">
      <body className="antialiased">{children}</body>
    </html>
  )
}

import type { Metadata } from 'next'
import { Sarabun } from 'next/font/google'
import './globals.css'

const sarabun = Sarabun({
  weight: ['300', '400', '500', '600', '700'],
  subsets: ['latin', 'thai'],
  display: 'swap',
})

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
      <body className={`${sarabun.className} antialiased`}>{children}</body>
    </html>
  )
}

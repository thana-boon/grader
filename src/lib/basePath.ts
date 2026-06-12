// คำนำหน้า URL ของเว็บเมื่ออยู่หลัง reverse proxy เช่น '/grader' — ตั้งผ่าน NEXT_PUBLIC_BASE_PATH ใน .env
// <Link>, router.push, redirect() ของ Next เติม basePath ให้อัตโนมัติอยู่แล้ว
// แต่ fetch() และ <a href> ตรงๆ ไม่เติม — ต้องครอบ path ด้วย withBase() เสมอ
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? ''

export const withBase = (path: string) => `${BASE_PATH}${path}`

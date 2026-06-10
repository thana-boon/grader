import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  console.log('🌱 Starting seed...')

  // ครู admin
  const hashedPassword = await bcrypt.hash('admin1234', 12)
  const teacher = await prisma.teacher.upsert({
    where: { username: 'admin' },
    update: {},
    create: {
      username: 'admin',
      password: hashedPassword,
      name: 'ผู้ดูแลระบบ',
      is_admin: true,
    },
  })
  console.log(`✅ Teacher created: ${teacher.username}`)

  // ปีการศึกษาไม่ต้อง seed — ดึงจากระบบกลาง school_app.academic_years (อ่านอย่างเดียว)

  console.log('\n🎉 Seed completed!')
  console.log('---')
  console.log('Teacher login: admin / admin1234')
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())

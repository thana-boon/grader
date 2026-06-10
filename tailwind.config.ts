import type { Config } from 'tailwindcss'
import rippleui from 'rippleui'

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
    'node_modules/rippleui/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Sarabun', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
    },
  },
  // rippleui ไม่ได้ประกาศ type เป็น tailwind plugin — ใช้งานได้จริงที่ runtime
  plugins: [rippleui as unknown as NonNullable<Config['plugins']>[number]],
}

export default config

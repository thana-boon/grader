'use client'

// Editor โค้ดสำหรับนักเรียน — CodeMirror 6: สีโค้ดธีม VS Code Dark เลขบรรทัด
// คำใบ้ขณะพิมพ์ (Tab หรือ Enter เพื่อรับคำ) ย่อหน้าอัตโนมัติ ปิดวงเล็บ/เครื่องหมายคำพูดให้

import CodeMirror from '@uiw/react-codemirror'
import { vscodeDark } from '@uiw/codemirror-theme-vscode'
import { keymap } from '@codemirror/view'
import { indentWithTab } from '@codemirror/commands'
import { acceptCompletion } from '@codemirror/autocomplete'
import { python } from '@codemirror/lang-python'
import { html } from '@codemirror/lang-html'
import { php } from '@codemirror/lang-php'

// turtle/pandas คือ Python — php โหมดปกติรองรับไฟล์ที่มี <?php ... ?> ปน HTML
function languageExtension(language: string) {
  if (language === 'html') return html()
  if (language === 'php') return php()
  return python()
}

export default function CodeEditor({
  value,
  onChange,
  language,
  placeholder,
}: {
  value: string
  onChange: (code: string) => void
  language: string
  placeholder?: string
}) {
  return (
    <CodeMirror
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      theme={vscodeDark}
      extensions={[
        languageExtension(language),
        // Tab: ถ้ามีคำใบ้เปิดอยู่ = รับคำนั้น (เหมือน VS Code) ไม่งั้น = ย่อหน้า
        keymap.of([{ key: 'Tab', run: acceptCompletion }, indentWithTab]),
      ]}
      minHeight="320px"
      style={{ fontSize: '14px' }}
      basicSetup={{
        tabSize: 4,
        foldGutter: false, // ปุ่มพับโค้ดทำให้เด็กงง/กดพลาด
      }}
    />
  )
}

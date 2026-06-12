'use client'

// IDE อิสระบนหน้าแรกของนักเรียน — เลือกภาษา เขียนโค้ด กด Run ได้เลย ไม่เกี่ยวกับงาน/คะแนน
// โค้ดเก็บใน localStorage แยกตามภาษา รีเฟรชหน้าแล้วไม่หาย

import { useEffect, useRef, useState } from 'react'
import CodeEditor from '@/components/CodeEditor'
import TurtleCanvas from '@/components/TurtleCanvas'

const LANGS = [
  { key: 'python', label: 'Python' },
  { key: 'turtle', label: 'Python Turtle' },
  { key: 'pandas', label: 'Pandas' },
  { key: 'html', label: 'HTML' },
  { key: 'php', label: 'PHP' },
]

// โค้ดเริ่มต้นของแต่ละภาษา — ให้เด็กกด Run เห็นผลได้ทันที
const TEMPLATES: Record<string, string> = {
  python: '# เขียนโค้ด Python แล้วกดปุ่ม Run\nname = input("ชื่อของคุณ: ")\nprint("สวัสดี", name)\n',
  turtle:
    'import turtle\n\nt = turtle.Turtle()\nfor i in range(4):\n    t.forward(100)\n    t.left(90)\n',
  pandas:
    'import pandas as pd\n\ndf = pd.DataFrame({"name": ["som", "fah"], "score": [8, 10]})\nprint(df)\n',
  html: '<!DOCTYPE html>\n<html>\n<body>\n  <h1>สวัสดี</h1>\n  <p>เขียน HTML แล้วดูผลด้านขวาได้เลย</p>\n</body>\n</html>\n',
  php: '<?php\necho "สวัสดี PHP";\n',
}

type RunOutput = { ok: boolean; output: string; error: string | null; timedOut: boolean }

const codeKey = (lang: string) => `playground-code-${lang}`

export default function Playground() {
  const [lang, setLang] = useState('python')
  const [code, setCode] = useState(TEMPLATES.python)
  const [busy, setBusy] = useState(false)
  const [statusMsg, setStatusMsg] = useState<string | null>(null)
  const [result, setResult] = useState<RunOutput | null>(null)
  const [drawing, setDrawing] = useState<string | null>(null)
  const [phpInput, setPhpInput] = useState('')
  // modal ถาม input ตอนโค้ดเรียก input() — resolve(null) = ผู้ใช้กดหยุดรัน
  const [inputModal, setInputModal] = useState<{
    prompt: string
    resolve: (v: string | null) => void
  } | null>(null)
  const [inputValue, setInputValue] = useState('')
  const loaded = useRef(false)

  // โหลดภาษา/โค้ดที่ค้างไว้รอบก่อน (หลัง mount — เลี่ยง hydration mismatch)
  useEffect(() => {
    const savedLang = localStorage.getItem('playground-lang')
    const startLang = savedLang && TEMPLATES[savedLang] ? savedLang : 'python'
    setLang(startLang)
    setCode(localStorage.getItem(codeKey(startLang)) ?? TEMPLATES[startLang])
    loaded.current = true
  }, [])

  useEffect(() => {
    if (!loaded.current) return
    localStorage.setItem('playground-lang', lang)
    localStorage.setItem(codeKey(lang), code)
  }, [lang, code])

  const switchLang = (next: string) => {
    if (next === lang) return
    localStorage.setItem(codeKey(lang), code)
    setLang(next)
    setCode(localStorage.getItem(codeKey(next)) ?? TEMPLATES[next])
    setResult(null)
    setDrawing(null)
    setStatusMsg(null)
  }

  const isTurtle = lang === 'turtle'
  const isPandas = lang === 'pandas'
  const isHtml = lang === 'html'
  const isPhp = lang === 'php'

  const handleRun = async () => {
    if (!code.trim()) return
    setBusy(true)
    try {
      if (isPhp) {
        setStatusMsg('กำลังรันโค้ด...')
        const r = await fetch('/api/run/php', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code, stdin: phpInput }),
        })
        const res = r.ok
          ? ((await r.json()) as RunOutput)
          : { ok: false, output: '', error: 'เรียกตัวรัน PHP บนเซิร์ฟเวอร์ไม่สำเร็จ', timedOut: false }
        setResult(res)
        setStatusMsg(null)
        return
      }
      const { pythonRunner } = await import('@/lib/pythonRunner')
      setStatusMsg(
        isPandas
          ? 'กำลังโหลดตัวรัน Python + pandas (ครั้งแรกใช้เวลาสักครู่)...'
          : 'กำลังโหลดตัวรัน Python (ครั้งแรกใช้เวลาสักครู่)...'
      )
      const warm = await pythonRunner.warmup(isPandas ? ['pandas'] : undefined)
      if (warm.timedOut) {
        setStatusMsg('โหลดตัวรัน Python ไม่สำเร็จ — ตรวจสอบอินเทอร์เน็ตแล้วลองใหม่')
        return
      }
      setStatusMsg('กำลังรันโค้ด...')
      const res = await pythonRunner.runInteractive(
        code,
        { packages: isPandas ? ['pandas'] : undefined, timeoutMs: isPandas ? 30_000 : undefined },
        (promptText, outputSoFar) => {
          setResult({ ok: true, output: outputSoFar, error: null, timedOut: false })
          return new Promise<string | null>((resolve) => {
            setInputValue('')
            setInputModal({ prompt: promptText, resolve })
          })
        }
      )
      setResult(res)
      if (isTurtle) setDrawing(res.drawing)
      setStatusMsg(null)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* เลือกภาษา + ปุ่ม Run */}
      <div className="bg-white rounded-2xl border border-indigo-100 shadow-sm p-4 flex flex-wrap items-center gap-2">
        {LANGS.map((l) => (
          <button
            key={l.key}
            onClick={() => switchLang(l.key)}
            className={`px-3 py-1.5 rounded-lg border text-sm transition ${
              lang === l.key
                ? 'border-indigo-400 bg-indigo-50 text-indigo-700 font-medium'
                : 'border-gray-300 text-gray-600 hover:bg-gray-50'
            }`}
          >
            {l.label}
          </button>
        ))}
        <div className="flex-1" />
        {!isHtml && (
          <button
            onClick={handleRun}
            disabled={busy}
            className="px-5 py-1.5 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition disabled:opacity-60"
          >
            {busy ? 'กำลังรัน...' : '▶ Run'}
          </button>
        )}
      </div>

      {statusMsg && (
        <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-blue-700 text-sm">
          {statusMsg}
        </div>
      )}

      <div className={`grid gap-4 ${isHtml || isTurtle ? 'lg:grid-cols-2' : ''}`}>
        {/* Editor */}
        <div className="bg-white rounded-2xl border border-indigo-100 shadow-sm overflow-hidden">
          <div className="px-4 py-2.5 border-b border-gray-100 bg-gray-50">
            <p className="text-sm font-medium text-gray-700">
              โค้ดของฉัน ({LANGS.find((l) => l.key === lang)?.label})
            </p>
          </div>
          <CodeEditor value={code} onChange={setCode} language={lang} />
        </div>

        {/* html: ตัวอย่างหน้าเว็บสด */}
        {isHtml && (
          <div className="bg-white rounded-2xl border border-indigo-100 shadow-sm overflow-hidden">
            <div className="px-4 py-2.5 border-b border-gray-100 bg-gray-50">
              <p className="text-sm font-medium text-gray-700">
                🌐 หน้าเว็บของฉัน (อัปเดตตามโค้ดทันที)
              </p>
            </div>
            <iframe title="แสดงผลหน้าเว็บ" sandbox="" srcDoc={code} className="w-full h-96 bg-white" />
          </div>
        )}

        {/* turtle: ภาพที่วาด */}
        {isTurtle && (
          <div className="bg-white rounded-2xl border border-indigo-100 shadow-sm p-5">
            <p className="text-sm font-medium text-gray-700 mb-3">🐢 ภาพของฉัน</p>
            <TurtleCanvas drawing={drawing} size={360} emptyText='กด "Run" เพื่อวาดภาพ' />
          </div>
        )}
      </div>

      {/* php: ช่องเตรียม input (รันบนเซิร์ฟเวอร์ ถามกลางคันไม่ได้) */}
      {isPhp && (
        <div className="bg-white rounded-2xl border border-indigo-100 shadow-sm p-4">
          <p className="text-xs text-gray-400 mb-1">
            Input (ถ้าโปรแกรมอ่าน STDIN ให้ใส่บรรทัดละหนึ่งค่า)
          </p>
          <textarea
            value={phpInput}
            onChange={(e) => setPhpInput(e.target.value)}
            rows={3}
            spellCheck={false}
            placeholder="ใส่ input ที่อยากลอง (เว้นว่างได้)"
            className="w-full bg-gray-50 border border-gray-200 rounded-lg p-2 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-y"
          />
        </div>
      )}

      {/* Terminal */}
      {!isHtml && (
        <div className="bg-white rounded-2xl border border-indigo-100 shadow-sm p-5">
          <h2 className="text-base font-semibold text-gray-900 mb-1">🖥️ Terminal</h2>
          <p className="text-xs text-gray-400 mb-3">
            {isPhp
              ? 'ผลลัพธ์ของโค้ดแสดงที่นี่'
              : 'ถ้าโค้ดเรียก input() จะมีช่องเด้งให้พิมพ์ทีละค่า เหมือนรันในเครื่องจริง'}
          </p>
          <pre className="bg-gray-900 rounded-lg p-3 font-mono text-xs whitespace-pre-wrap min-h-24 text-gray-100">
            {result ? (
              <>
                {result.output}
                {result.timedOut ? (
                  <span className="text-red-400">{'\n(รันนานเกินไป — อาจวน loop ไม่รู้จบ)'}</span>
                ) : result.error ? (
                  <span className="text-red-400">{(result.output ? '\n' : '') + result.error}</span>
                ) : (
                  !result.output && <span className="text-gray-500">(ไม่มี output)</span>
                )}
              </>
            ) : (
              <span className="text-gray-500">กด &quot;Run&quot; เพื่อเริ่ม</span>
            )}
          </pre>
        </div>
      )}

      {/* Modal ถาม input ตอนโค้ดเรียก input() */}
      {inputModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" />
          <form
            onSubmit={(e) => {
              e.preventDefault()
              inputModal.resolve(inputValue)
              setInputModal(null)
            }}
            className="relative bg-white rounded-xl shadow-xl w-full max-w-sm p-6"
          >
            <div className="flex items-start gap-3 mb-4">
              <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 bg-indigo-100 text-indigo-600 font-mono font-bold">
                &gt;_
              </div>
              <div className="min-w-0 pt-1">
                <h3 className="text-base font-semibold text-gray-900">โปรแกรมรอ input</h3>
                <p className="text-sm text-gray-600 mt-1.5 whitespace-pre-wrap font-mono">
                  {inputModal.prompt.trim() || 'พิมพ์ค่าแล้วกด Enter'}
                </p>
              </div>
            </div>
            <input
              autoFocus
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              spellCheck={false}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <div className="flex justify-end gap-2 mt-4">
              <button
                type="button"
                onClick={() => {
                  inputModal.resolve(null)
                  setInputModal(null)
                }}
                className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition"
              >
                หยุดรัน
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition"
              >
                ตกลง (Enter)
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}

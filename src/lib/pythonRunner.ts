// รันโค้ด Python ในเบราว์เซอร์ผ่าน Pyodide (Python บน WebAssembly)
// - รันบน Web Worker เพื่อไม่ค้างหน้าเว็บ และ terminate ได้เมื่อโค้ดวน loop ไม่รู้จบ
// - โหลดครั้งแรกช้า (ดาวน์โหลดจาก CDN ~10 วินาที ต้องต่ออินเทอร์เน็ต) จากนั้นรันเร็ว
// - มี module `turtle` จำลอง: บันทึก "เส้นที่วาด" ส่งกลับเป็น JSON แทนการเปิดหน้าต่าง tkinter
//   (รูปแบบ JSON ดู src/lib/turtleGrading.ts)

const PYODIDE_CDN = 'https://cdn.jsdelivr.net/pyodide/v0.26.4/full/'

const WORKER_SOURCE = `
importScripts('${PYODIDE_CDN}pyodide.js')
const pyodideReady = loadPyodide({ indexURL: '${PYODIDE_CDN}' })

const RUNNER = \`
import sys, io, traceback, types, math, json

# ---------- turtle จำลอง: บันทึกการวาดแทนการแสดงผลจริง ----------
_TURTLE_SRC = r'''
import math as _math

_MAX_EVENTS = 20000

class _Rec:
    def __init__(self):
        self.events = []
        self.bg = 'white'
    def add(self, ev):
        if len(self.events) >= _MAX_EVENTS:
            raise RuntimeError('วาดเส้นเยอะเกินไป (เกิน %d รายการ) — ตรวจสอบ loop ของคุณ' % _MAX_EVENTS)
        self.events.append(ev)

_REC = _Rec()

def _norm_color(*args):
    if len(args) == 1:
        c = args[0]
        if isinstance(c, (tuple, list)) and len(c) == 3:
            args = tuple(c)
        else:
            return str(c).strip().lower()
    if len(args) == 3:
        vals = []
        for v in args:
            f = float(v)
            if f <= 1.0:
                f = f * 255.0
            vals.append(max(0, min(255, int(round(f)))))
        return '#%02x%02x%02x' % tuple(vals)
    return 'black'

def _r(v):
    return round(float(v), 1)

class Turtle:
    def __init__(self):
        self._x = 0.0
        self._y = 0.0
        self._h = 0.0
        self._pen = True
        self._pencolor = 'black'
        self._fillcolor = 'black'
        self._w = 1
        self._fillpath = None

    # ---- การเคลื่อนที่ ----
    def _go(self, nx, ny):
        if self._pen:
            _REC.add(['seg', _r(self._x), _r(self._y), _r(nx), _r(ny), self._pencolor, self._w])
        if self._fillpath is not None:
            self._fillpath.append((nx, ny))
        self._x, self._y = nx, ny

    def forward(self, d):
        rad = _math.radians(self._h)
        self._go(self._x + d * _math.cos(rad), self._y + d * _math.sin(rad))
    fd = forward

    def backward(self, d):
        self.forward(-d)
    bk = backward
    back = backward

    def left(self, a):
        self._h = (self._h + a) % 360.0
    lt = left

    def right(self, a):
        self.left(-a)
    rt = right

    def goto(self, x, y=None):
        if y is None:
            x, y = x[0], x[1]
        self._go(float(x), float(y))
    setpos = goto
    setposition = goto

    def setx(self, x):
        self._go(float(x), self._y)

    def sety(self, y):
        self._go(self._x, float(y))

    def setheading(self, a):
        self._h = float(a) % 360.0
    seth = setheading

    def home(self):
        self.goto(0, 0)
        self.setheading(0)

    def circle(self, radius, extent=None, steps=None):
        # สูตรเดียวกับ turtle จริงของ CPython เพื่อให้เส้นออกมาตรงกัน
        if extent is None:
            extent = 360.0
        if steps is None:
            frac = abs(extent) / 360.0
            steps = 1 + int(min(11.0 + abs(radius) / 6.0, 59.0) * frac)
        w = 1.0 * extent / steps
        w2 = 0.5 * w
        l = 2.0 * radius * _math.sin(_math.radians(w2))
        if radius < 0:
            l, w, w2 = -l, -w, -w2
        self.left(w2)
        for _ in range(steps):
            self.forward(l)
            self.left(w)
        self.left(-w2)

    # ---- ปากกา ----
    def penup(self):
        self._pen = False
    pu = penup
    up = penup

    def pendown(self):
        self._pen = True
    pd = pendown
    down = pendown

    def isdown(self):
        return self._pen

    def pensize(self, w=None):
        if w is None:
            return self._w
        self._w = max(1, int(round(w)))
    width = pensize

    def pencolor(self, *args):
        if not args:
            return self._pencolor
        self._pencolor = _norm_color(*args)

    def fillcolor(self, *args):
        if not args:
            return self._fillcolor
        self._fillcolor = _norm_color(*args)

    def color(self, *args):
        if not args:
            return (self._pencolor, self._fillcolor)
        if len(args) == 2:
            self._pencolor = _norm_color(args[0])
            self._fillcolor = _norm_color(args[1])
        else:
            c = _norm_color(*args)
            self._pencolor = c
            self._fillcolor = c

    def begin_fill(self):
        self._fillpath = [(self._x, self._y)]

    def end_fill(self):
        if self._fillpath and len(self._fillpath) > 2:
            pts = []
            for (px, py) in self._fillpath:
                pts.append(_r(px))
                pts.append(_r(py))
            _REC.add(['fill', self._fillcolor, pts])
        self._fillpath = None

    def dot(self, size=None, *color):
        if size is None:
            size = max(self._w + 4, self._w * 2)
        c = _norm_color(*color) if color else self._pencolor
        _REC.add(['dot', _r(self._x), _r(self._y), int(round(size)), c])

    def write(self, arg, move=False, align='left', font=None):
        _REC.add(['text', _r(self._x), _r(self._y), str(arg), self._pencolor])

    def stamp(self):
        pass

    # ---- สถานะ ----
    def position(self):
        return (self._x, self._y)
    pos = position

    def xcor(self):
        return self._x

    def ycor(self):
        return self._y

    def heading(self):
        return self._h

    def distance(self, x, y=None):
        if y is None:
            x, y = x[0], x[1]
        return _math.hypot(self._x - x, self._y - y)

    def clear(self):
        _REC.events.clear()

    def reset(self):
        self.clear()
        self.__init__()

    # ---- คำสั่งที่ไม่มีผลต่อภาพ (ทำให้โค้ด turtle ปกติรันผ่าน) ----
    def speed(self, *a):
        pass
    def hideturtle(self):
        pass
    ht = hideturtle
    def showturtle(self):
        pass
    st = showturtle
    def shape(self, *a):
        pass
    def shapesize(self, *a):
        pass
    turtlesize = shapesize
    def tracer(self, *a):
        pass
    def pen(self, **kw):
        pass

Pen = Turtle
RawTurtle = Turtle

class _Screen:
    def bgcolor(self, *args):
        if not args:
            return _REC.bg
        _REC.bg = _norm_color(*args)
    def setup(self, *a, **kw):
        pass
    def title(self, *a):
        pass
    def screensize(self, *a):
        pass
    def tracer(self, *a):
        pass
    def update(self):
        pass
    def delay(self, *a):
        pass
    def colormode(self, *a):
        pass
    def exitonclick(self):
        pass
    def mainloop(self):
        pass
    def bye(self):
        pass
    def clear(self):
        _REC.events.clear()
    clearscreen = clear

_screen = _Screen()

def Screen():
    return _screen

# ฟังก์ชันระดับ module (ใช้ turtle ตัวเดียวร่วมกัน)
_default = [None]

def _t():
    if _default[0] is None:
        _default[0] = Turtle()
    return _default[0]

def _reset_recording():
    _REC.events.clear()
    _REC.bg = 'white'
    _default[0] = None

def _drawing_json():
    import json as _json
    return _json.dumps({'bg': _REC.bg, 'events': _REC.events})

def forward(d): _t().forward(d)
fd = forward
def backward(d): _t().backward(d)
bk = backward
back = backward
def left(a): _t().left(a)
lt = left
def right(a): _t().right(a)
rt = right
def goto(x, y=None): _t().goto(x, y)
setpos = goto
setposition = goto
def setx(x): _t().setx(x)
def sety(y): _t().sety(y)
def setheading(a): _t().setheading(a)
seth = setheading
def home(): _t().home()
def circle(radius, extent=None, steps=None): _t().circle(radius, extent, steps)
def penup(): _t().penup()
pu = penup
up = penup
def pendown(): _t().pendown()
pd = pendown
down = pendown
def isdown(): return _t().isdown()
def pensize(w=None): return _t().pensize(w)
width = pensize
def pencolor(*a): return _t().pencolor(*a)
def fillcolor(*a): return _t().fillcolor(*a)
def color(*a): return _t().color(*a)
def begin_fill(): _t().begin_fill()
def end_fill(): _t().end_fill()
def dot(size=None, *c): _t().dot(size, *c)
def write(arg, move=False, align='left', font=None): _t().write(arg, move, align, font)
def position(): return _t().position()
pos = position
def xcor(): return _t().xcor()
def ycor(): return _t().ycor()
def heading(): return _t().heading()
def distance(x, y=None): return _t().distance(x, y)
def clear(): _t().clear()
def reset(): _t().reset()
def speed(*a): pass
def hideturtle(): pass
ht = hideturtle
def showturtle(): pass
st = showturtle
def shape(*a): pass
def tracer(*a): pass
def update(): pass
def bgcolor(*a): return _screen.bgcolor(*a)
def colormode(*a): pass
def title(*a): pass
def setup(*a, **kw): pass
def done(): pass
mainloop = done
def exitonclick(): pass
def bye(): pass
'''

_turtle_mod = types.ModuleType('turtle')
exec(_TURTLE_SRC, _turtle_mod.__dict__)
sys.modules['turtle'] = _turtle_mod

def __grader_run(code, stdin_text):
    _turtle_mod._reset_recording()
    sys.stdin = io.StringIO(stdin_text)
    buf = io.StringIO()
    old_out, old_err = sys.stdout, sys.stderr
    sys.stdout = buf
    sys.stderr = buf
    err = None
    try:
        exec(compile(code, '<code>', 'exec'), {'__name__': '__main__'})
    except SystemExit:
        pass
    except BaseException:
        err = traceback.format_exc(limit=2)
    finally:
        sys.stdout, sys.stderr = old_out, old_err
    return (buf.getvalue(), err, _turtle_mod._drawing_json())
\`

const loadedPackages = new Set()

self.onmessage = async (e) => {
  const { id, code, stdin, packages, files } = e.data
  try {
    const pyodide = await pyodideReady
    // โหลดแพ็กเกจเพิ่ม (เช่น pandas) — โหลดครั้งเดียวต่อ worker
    if (Array.isArray(packages)) {
      for (const p of packages) {
        if (!loadedPackages.has(p)) {
          await pyodide.loadPackage(p)
          loadedPackages.add(p)
        }
      }
    }
    // เขียนไฟล์ข้อมูลแนบลง filesystem จำลอง ให้โค้ดอ่านได้เช่น pd.read_csv('data.csv')
    if (Array.isArray(files)) {
      for (const f of files) {
        pyodide.FS.writeFile(f.name, new TextEncoder().encode(f.content))
      }
    }
    pyodide.runPython(RUNNER)
    const run = pyodide.globals.get('__grader_run')
    const result = run(code, stdin)
    const [output, error, drawing] = result.toJs()
    result.destroy()
    run.destroy()
    self.postMessage({ id, ok: !error, output, error: error || null, drawing })
  } catch (err) {
    self.postMessage({ id, ok: false, output: '', error: String(err), drawing: null })
  }
}
`

export type RunResult = {
  ok: boolean
  output: string
  error: string | null
  timedOut: boolean
  drawing: string | null // JSON ภาพวาด turtle ({bg, events}) — events ว่างถ้าไม่ได้ใช้ turtle
}

export type RunOptions = {
  timeoutMs?: number
  packages?: string[] // แพ็กเกจ Pyodide ที่ต้องโหลดก่อน เช่น ['pandas']
  files?: { name: string; content: string }[] // ไฟล์ข้อมูลแนบ
}

type Pending = { resolve: (r: RunResult) => void; timer: number }

class PythonRunner {
  private worker: Worker | null = null
  private seq = 0
  private pending = new Map<number, Pending>()

  private ensureWorker(): Worker {
    if (this.worker) return this.worker
    const blob = new Blob([WORKER_SOURCE], { type: 'application/javascript' })
    const worker = new Worker(URL.createObjectURL(blob))
    worker.onmessage = (e: MessageEvent) => {
      const { id, ok, output, error, drawing } = e.data
      const p = this.pending.get(id)
      if (!p) return
      clearTimeout(p.timer)
      this.pending.delete(id)
      p.resolve({ ok, output, error, drawing: drawing ?? null, timedOut: false })
    }
    this.worker = worker
    return worker
  }

  // โหลด Pyodide (และแพ็กเกจ เช่น pandas) ล่วงหน้า — เรียกก่อนรันจริง
  // เพื่อให้ timeout ของ run() ไม่นับเวลาดาวน์โหลด
  warmup(packages?: string[]): Promise<RunResult> {
    return this.run('pass', '', { timeoutMs: 180_000, packages })
  }

  run(code: string, stdin: string, options: RunOptions = {}): Promise<RunResult> {
    const { timeoutMs = 15_000, packages, files } = options
    const worker = this.ensureWorker()
    const id = ++this.seq
    return new Promise((resolve) => {
      const timer = window.setTimeout(() => {
        // น่าจะวน loop ไม่รู้จบ — ฆ่า worker ทิ้ง (การรันครั้งถัดไปจะโหลดใหม่)
        this.pending.delete(id)
        this.worker?.terminate()
        this.worker = null
        for (const p of this.pending.values()) {
          clearTimeout(p.timer)
          p.resolve({ ok: false, output: '', error: null, timedOut: true, drawing: null })
        }
        this.pending.clear()
        resolve({ ok: false, output: '', error: null, timedOut: true, drawing: null })
      }, timeoutMs)
      this.pending.set(id, { resolve, timer })
      worker.postMessage({ id, code, stdin, packages, files })
    })
  }
}

export const pythonRunner = new PythonRunner()

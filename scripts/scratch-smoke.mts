// สร้างไฟล์ .sb3 โจทย์ BMI จากโค้ด แล้วทดสอบ runScratchProject ใน Node (regression test ของตัวรัน)
// รัน: npx tsx scripts/scratch-smoke.mts
import JSZip from 'jszip'
import { createHash } from 'crypto'
import { runScratchProject } from '../src/lib/scratchRunner'

const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="2" height="2"></svg>'
const md5 = createHash('md5').update(svg).digest('hex')
const costume = {
  assetId: md5,
  name: 'costume1',
  bitmapResolution: 1,
  md5ext: `${md5}.svg`,
  dataFormat: 'svg',
  rotationCenterX: 1,
  rotationCenterY: 1,
}

const spriteBlocks: Record<string, unknown> = {
  flag: { opcode: 'event_whenflagclicked', next: 'ask1', parent: null, inputs: {}, fields: {}, shadow: false, topLevel: true, x: 0, y: 0 },
  ask1: { opcode: 'sensing_askandwait', next: 'setW', parent: 'flag', inputs: { QUESTION: [1, [10, 'weight?']] }, fields: {}, shadow: false, topLevel: false },
  setW: { opcode: 'data_setvariableto', next: 'ask2', parent: 'ask1', inputs: { VALUE: [3, 'answer1', [10, '']] }, fields: { VARIABLE: ['weight', 'vw'] }, shadow: false, topLevel: false },
  answer1: { opcode: 'sensing_answer', next: null, parent: 'setW', inputs: {}, fields: {}, shadow: false, topLevel: false },
  ask2: { opcode: 'sensing_askandwait', next: 'setH', parent: 'setW', inputs: { QUESTION: [1, [10, 'height?']] }, fields: {}, shadow: false, topLevel: false },
  setH: { opcode: 'data_setvariableto', next: 'setBmi', parent: 'ask2', inputs: { VALUE: [3, 'answer2', [10, '']] }, fields: { VARIABLE: ['height', 'vh'] }, shadow: false, topLevel: false },
  answer2: { opcode: 'sensing_answer', next: null, parent: 'setH', inputs: {}, fields: {}, shadow: false, topLevel: false },
  setBmi: { opcode: 'data_setvariableto', next: 'say1', parent: 'setH', inputs: { VALUE: [3, 'divide', [10, '']] }, fields: { VARIABLE: ['bmi', 'vb'] }, shadow: false, topLevel: false },
  divide: { opcode: 'operator_divide', next: null, parent: 'setBmi', inputs: { NUM1: [3, 'wR', [4, '0']], NUM2: [3, 'mul', [4, '0']] }, fields: {}, shadow: false, topLevel: false },
  wR: { opcode: 'data_variable', next: null, parent: 'divide', inputs: {}, fields: { VARIABLE: ['weight', 'vw'] }, shadow: false, topLevel: false },
  mul: { opcode: 'operator_multiply', next: null, parent: 'divide', inputs: { NUM1: [3, 'hR1', [4, '0']], NUM2: [3, 'hR2', [4, '0']] }, fields: {}, shadow: false, topLevel: false },
  hR1: { opcode: 'data_variable', next: null, parent: 'mul', inputs: {}, fields: { VARIABLE: ['height', 'vh'] }, shadow: false, topLevel: false },
  hR2: { opcode: 'data_variable', next: null, parent: 'mul', inputs: {}, fields: { VARIABLE: ['height', 'vh'] }, shadow: false, topLevel: false },
  say1: { opcode: 'looks_say', next: null, parent: 'setBmi', inputs: { MESSAGE: [3, 'bmiR', [10, 'hi']] }, fields: {}, shadow: false, topLevel: false },
  bmiR: { opcode: 'data_variable', next: null, parent: 'say1', inputs: {}, fields: { VARIABLE: ['bmi', 'vb'] }, shadow: false, topLevel: false },
}

const project = {
  targets: [
    {
      isStage: true,
      name: 'Stage',
      variables: { vw: ['weight', 0], vh: ['height', 0], vb: ['bmi', 0] },
      lists: {},
      broadcasts: {},
      blocks: {},
      comments: {},
      currentCostume: 0,
      costumes: [costume],
      sounds: [],
      volume: 100,
      layerOrder: 0,
      tempo: 60,
      videoTransparency: 50,
      videoState: 'on',
      textToSpeechLanguage: null,
    },
    {
      isStage: false,
      name: 'Sprite1',
      variables: {},
      lists: {},
      broadcasts: {},
      blocks: spriteBlocks,
      comments: {},
      currentCostume: 0,
      costumes: [costume],
      sounds: [],
      volume: 100,
      layerOrder: 1,
      visible: true,
      x: 0,
      y: 0,
      size: 100,
      direction: 90,
      draggable: false,
      rotationStyle: 'all around',
    },
  ],
  monitors: [],
  extensions: [],
  meta: { semver: '3.0.0', vm: '0.2.0', agent: 'smoke-test' },
}

const zip = new JSZip()
zip.file('project.json', JSON.stringify(project))
zip.file(costume.md5ext, svg)
const buffer = await zip.generateAsync({ type: 'nodebuffer' })

const expected = String(60 / (1.7 * 1.7))
console.log('expected BMI =', expected)

const sayExpected = (60 / (1.7 * 1.7)).toFixed(2) // ลูกโป่งคำพูด Scratch ปัด 2 ตำแหน่ง = "20.76"
const sayRes = await runScratchProject(buffer, ['60', '1.7'], { type: 'say' })
console.log('\n[say mode]', JSON.stringify(sayRes, null, 2))
console.log(`say match (expect ${sayExpected}):`, sayRes.output === sayExpected ? 'PASS ✓' : 'FAIL ✗')

const varRes = await runScratchProject(buffer, ['60', '1.7'], { type: 'variable', name: 'bmi' })
console.log('\n[variable mode]', JSON.stringify(varRes, null, 2))
console.log('variable match:', varRes.output === expected ? 'PASS ✓' : 'FAIL ✗')

process.exit(0)

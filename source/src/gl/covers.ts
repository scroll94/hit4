import * as THREE from 'three'
import type { Work } from '../content'

// Обложки-заглушки для работ. Рисуются кодом в палитре сайта:
// чёрный, ледяной серый и один красный акцент.

const W = 1600
const H = 1000
const BLACK = '#111217'
const GREY = '#DFE5EB'
const RED = '#EF233C'
const DISPLAY = 'Unbounded, Arial, sans-serif'
const MONO = '"JetBrains Mono", Consolas, monospace'

type Ctx = CanvasRenderingContext2D

function chrome(c: Ctx, work: Work, fg: string) {
  c.fillStyle = fg
  c.font = `500 22px ${MONO}`
  c.textBaseline = 'top'
  c.textAlign = 'left'
  c.fillText(work.title.toUpperCase(), 56, 48)
  c.textAlign = 'right'
  c.fillText('КАТАЛОГ    О НАС    КОНТАКТЫ', W - 56, 48)
  c.textAlign = 'left'
  c.fillText(work.kind.toUpperCase(), 56, H - 74)
  c.textAlign = 'right'
  c.fillText(`КОНЦЕПТ / ${work.year}`, W - 56, H - 74)
}

function title(c: Ctx, text: string, x: number, y: number, size: number, color: string, align: CanvasTextAlign = 'left') {
  c.fillStyle = color
  c.font = `800 ${size}px ${DISPLAY}`
  c.textAlign = align
  c.textBaseline = 'alphabetic'
  c.fillText(text.toUpperCase(), x, y)
}

const painters: Record<string, (c: Ctx, w: Work) => void> = {
  // тёмная обложка: большой круг и имя во всю ширину
  nord(c, w) {
    c.fillStyle = BLACK
    c.fillRect(0, 0, W, H)
    c.fillStyle = GREY
    c.beginPath()
    c.arc(1180, 400, 330, 0, Math.PI * 2)
    c.fill()
    c.fillStyle = BLACK
    c.fillRect(850, 400, 660, 14)
    c.fillStyle = RED
    c.fillRect(1180 - 40, 400 - 40, 80, 80)
    title(c, w.title, 44, 830, 300, GREY)
    chrome(c, w, GREY)
  },
  // светлая обложка: кольца и красная кардиограмма
  pulse(c, w) {
    c.fillStyle = GREY
    c.fillRect(0, 0, W, H)
    c.strokeStyle = BLACK
    for (let i = 0; i < 9; i++) {
      c.lineWidth = i % 3 === 0 ? 10 : 3
      c.beginPath()
      c.arc(1120, 470, 60 + i * 52, 0, Math.PI * 2)
      c.stroke()
    }
    c.strokeStyle = RED
    c.lineWidth = 12
    c.lineJoin = 'miter'
    c.beginPath()
    const beat = [0, 0, 0, -30, 40, -210, 150, -40, 0, 0, 0, -60, 70, 0, 0]
    beat.forEach((dy, i) => {
      const x = 0 + (i * W) / (beat.length - 1)
      if (i === 0) c.moveTo(x, 470 + dy)
      else c.lineTo(x, 470 + dy)
    })
    c.stroke()
    title(c, w.title, 44, 850, 280, BLACK)
    chrome(c, w, BLACK)
  },
  // тёмная обложка: линии высот и красная метка
  atlas(c, w) {
    c.fillStyle = BLACK
    c.fillRect(0, 0, W, H)
    c.strokeStyle = GREY
    for (let ring = 1; ring <= 13; ring++) {
      c.lineWidth = ring % 4 === 0 ? 4 : 1.5
      c.globalAlpha = ring % 4 === 0 ? 0.9 : 0.5
      c.beginPath()
      for (let a = 0; a <= 360; a += 3) {
        const t = (a * Math.PI) / 180
        const r = ring * 46 * (1 + 0.16 * Math.sin(t * 3 + ring * 0.5) + 0.1 * Math.cos(t * 5 - ring * 0.9))
        const x = 1090 + Math.cos(t) * r * 1.25
        const y = 430 + Math.sin(t) * r
        if (a === 0) c.moveTo(x, y)
        else c.lineTo(x, y)
      }
      c.closePath()
      c.stroke()
    }
    c.globalAlpha = 1
    c.fillStyle = RED
    c.beginPath()
    c.arc(1090, 430, 22, 0, Math.PI * 2)
    c.fill()
    c.fillStyle = GREY
    c.font = `500 22px ${MONO}`
    c.textAlign = 'left'
    c.textBaseline = 'middle'
    c.fillText('27.9881° N  86.9250° E', 1130, 430)
    title(c, w.title, 44, 850, 280, GREY)
    chrome(c, w, GREY)
  },
  // обложка пополам: буквы меняют цвет на границе
  mono(c, w) {
    c.fillStyle = GREY
    c.fillRect(0, 0, W / 2, H)
    c.fillStyle = BLACK
    c.fillRect(W / 2, 0, W / 2, H)
    const draw = (color: string, x: number) => {
      c.save()
      c.beginPath()
      c.rect(x, 0, W / 2, H)
      c.clip()
      title(c, w.title, W / 2, 640, 380, color, 'center')
      c.restore()
    }
    draw(BLACK, 0)
    draw(GREY, W / 2)
    c.fillStyle = RED
    c.fillRect(W / 2 - 5, 150, 10, H - 300)
    c.fillStyle = BLACK
    c.font = `500 22px ${MONO}`
    c.textBaseline = 'top'
    c.textAlign = 'left'
    c.fillText(w.title.toUpperCase(), 56, 48)
    c.fillText(w.kind.toUpperCase(), 56, H - 74)
    c.fillStyle = GREY
    c.textAlign = 'right'
    c.fillText('СЕРИИ    О СЕБЕ    КОНТАКТЫ', W - 56, 48)
    c.fillText(`КОНЦЕПТ / ${w.year}`, W - 56, H - 74)
  },
}

export function createCover(work: Work): THREE.Texture {
  if (work.image) {
    const tex = new THREE.TextureLoader().load(work.image)
    tex.colorSpace = THREE.SRGBColorSpace
    return tex
  }
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const c = canvas.getContext('2d')!
  ;(painters[work.id] ?? painters.nord)(c, work)
  // тонкая рамка, чтобы светлые обложки не сливались со светлым фоном
  c.strokeStyle = BLACK
  c.lineWidth = 8
  c.strokeRect(4, 4, W - 8, H - 8)
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 8
  return tex
}

import * as THREE from 'three'

/**
 * Монограмма для первого экрана и финала: буква, нарисованная шрифтом сайта.
 * Яркость плавно меняется по диагонали, чтобы у точек был объём.
 */
export function createMonogram(letter: string): THREE.Texture {
  const W = 1000
  const H = 760
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const c = canvas.getContext('2d')!
  const font = (size: number) => `800 ${size}px Unbounded, "Arial Black", Arial, sans-serif`

  // подгоняем размер буквы под холст
  c.font = font(600)
  let m = c.measureText(letter)
  const k = Math.min(880 / (m.actualBoundingBoxLeft + m.actualBoundingBoxRight), 640 / (m.actualBoundingBoxAscent + m.actualBoundingBoxDescent))
  c.font = font(600 * k)
  m = c.measureText(letter)

  const shade = c.createLinearGradient(60, 60, W - 60, H - 60)
  shade.addColorStop(0, '#ffffff')
  shade.addColorStop(0.55, '#d2d2d2')
  shade.addColorStop(1, '#8a8a8a')
  c.fillStyle = shade
  c.textAlign = 'left'
  c.textBaseline = 'alphabetic'
  const x = (W - (m.actualBoundingBoxRight - m.actualBoundingBoxLeft)) / 2 - m.actualBoundingBoxLeft
  const y = (H + m.actualBoundingBoxAscent - m.actualBoundingBoxDescent) / 2
  c.fillText(letter, x, y)

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.generateMipmaps = false
  texture.minFilter = THREE.LinearFilter
  return texture
}

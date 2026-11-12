import * as THREE from 'three'
import { contact, person } from '../content'

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))
const mix = (a: number, b: number, t: number) => a + (b - a) * t

/**
 * Картинка для окна на крыше: уменьшенный финал сайта —
 * красное поле, заголовок слева и буква из точек справа.
 */
function drawFinale(colors: { black: number; red: number }) {
  const W = 1536
  const H = 1024
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const c = canvas.getContext('2d')!
  const hex = (n: number) => '#' + n.toString(16).padStart(6, '0')
  c.fillStyle = hex(colors.red)
  c.fillRect(0, 0, W, H)

  c.fillStyle = hex(colors.black)
  c.textBaseline = 'alphabetic'
  c.font = '800 96px Unbounded, "Arial Black", Arial, sans-serif'
  contact.title.forEach((line, i) => c.fillText(line.toUpperCase(), 70, 420 + i * 100))
  c.font = '800 30px Unbounded, Arial, sans-serif'
  c.fillText(person.name.toUpperCase(), 70, 96)

  // буква из точек: чем ниже и правее, тем крупнее точки
  const mask = document.createElement('canvas')
  mask.width = W
  mask.height = H
  const m = mask.getContext('2d')!
  m.font = '800 620px Unbounded, "Arial Black", Arial, sans-serif'
  m.textBaseline = 'alphabetic'
  m.fillText(person.monogram, 880, 760)
  const data = m.getImageData(0, 0, W, H).data
  const step = 15
  for (let y = step / 2; y < H; y += step)
    for (let x = 860; x < W; x += step) {
      if (data[(Math.floor(y) * W + Math.floor(x)) * 4 + 3] < 128) continue
      const r = 2.2 + 4.6 * clamp01((x - 880) / 560) * 0.5 + 4.6 * clamp01((y - 300) / 460) * 0.5
      c.beginPath()
      c.arc(x, y, r, 0, Math.PI * 2)
      c.fill()
    }

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 8
  return texture
}

/**
 * Город для вида сверху: кварталы из коробок с окнами и красное здание в центре.
 * Здание сложено из блоков: они разлетаются по крышам вокруг красными домиками
 * и собираются обратно. Его крыша — окно в финал: картинка из плиток, как пазл.
 */
export function createCity(colors: { black: number; grey: number; red: number }) {
  const group = new THREE.Group()
  let seed = 11
  const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646

  // стена с окнами: часть горит, часть нет
  const wall = (repeatX: number, repeatY: number) => {
    const canvas = document.createElement('canvas')
    canvas.width = 64
    canvas.height = 64
    const c = canvas.getContext('2d')!
    c.fillStyle = '#15171c'
    c.fillRect(0, 0, 64, 64)
    for (let y = 0; y < 4; y++)
      for (let x = 0; x < 4; x++) {
        c.fillStyle = rnd() < 0.38 ? '#f2f5f8' : '#2d3139'
        c.fillRect(x * 16 + 4, y * 16 + 3, 8, 10)
      }
    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = THREE.SRGBColorSpace
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping
    texture.repeat.set(repeatX, repeatY)
    texture.magFilter = THREE.NearestFilter
    return new THREE.MeshLambertMaterial({ map: texture })
  }

  const box = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0)
  const roof = new THREE.MeshLambertMaterial({ color: 0x3d424c })
  const classes = [
    { min: 2, max: 4, side: wall(2, 2), items: [] as number[][] },
    { min: 5, max: 8, side: wall(2, 4), items: [] as number[][] },
    { min: 9, max: 12, side: wall(2, 7), items: [] as number[][] },
  ]
  const tiers: number[][] = []
  const units: number[][] = []
  const lights: number[][] = []
  const redLights: number[][] = []
  /** свободные плоские крыши: на них садятся красные домики */
  const landings: { x: number; y: number; z: number; w: number }[] = []

  const PITCH = 5.2
  const N = 10
  const add = (x: number, z: number, w: number, d: number) => {
    const r = rnd()
    const cls = classes[r < 0.4 ? 0 : r < 0.8 ? 1 : 2]
    const h = cls.min + rnd() * (cls.max - cls.min)
    cls.items.push([x, z, w, h, d])
    if (w > 3 && rnd() < 0.3) {
      // надстройка: второй ярус поменьше
      tiers.push([x + (rnd() - 0.5) * w * 0.25, h, z + (rnd() - 0.5) * d * 0.25, w * 0.55, 0.6 + rnd() * 1.6, d * 0.55])
    } else {
      landings.push({ x, y: h, z, w: Math.min(w, d) })
    }
  }
  for (let gx = -N; gx <= N; gx++) {
    for (let gz = -N; gz <= N; gz++) {
      const x = gx * PITCH
      const z = gz * PITCH
      // огоньки на перекрёстках и вдоль улиц
      if (rnd() < 0.6) (rnd() < 0.1 ? redLights : lights).push([x + PITCH / 2, 0.12, z + (rnd() - 0.5) * PITCH, 0.16, 0.16, 0.16])
      if (rnd() < 0.6) (rnd() < 0.1 ? redLights : lights).push([x + (rnd() - 0.5) * PITCH, 0.12, z + PITCH / 2, 0.16, 0.16, 0.16])
      // вокруг красного здания — пустая площадь, чтобы окно было видно целиком
      if (Math.abs(gx) <= 1 && Math.abs(gz) <= 1) continue
      const r = rnd()
      if (r < 0.08) continue
      if (r < 0.38) {
        add(x - 1, z, 1.7, 3.5)
        add(x + 1, z, 1.7, 3.5)
      } else {
        add(x, z, 3.1 + rnd() * 0.8, 3.1 + rnd() * 0.8)
      }
    }
  }

  const dummy = new THREE.Object3D()
  const instanced = (material: THREE.Material | THREE.Material[], items: number[][], place: (it: number[]) => void) => {
    if (!items.length) return
    const mesh = new THREE.InstancedMesh(box, material, items.length)
    items.forEach((it, i) => {
      place(it)
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
    })
    mesh.instanceMatrix.needsUpdate = true
    mesh.frustumCulled = false
    group.add(mesh)
  }
  for (const cls of classes) {
    instanced([cls.side, cls.side, roof, roof, cls.side, cls.side], cls.items, ([x, z, w, h, d]) => {
      dummy.position.set(x, 0, z)
      dummy.scale.set(w, h, d)
    })
  }
  const small = ([x, y, z, sx, sy, sz]: number[]) => {
    dummy.position.set(x, y, z)
    dummy.scale.set(sx, sy, sz)
  }
  instanced(new THREE.MeshLambertMaterial({ color: 0x4a505b }), tiers, small)
  instanced(new THREE.MeshLambertMaterial({ color: 0x8b929b }), units, small)
  instanced(new THREE.MeshBasicMaterial({ color: colors.grey }), lights, small)
  instanced(new THREE.MeshBasicMaterial({ color: colors.red }), redLights, small)

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(700, 700), new THREE.MeshLambertMaterial({ color: 0x0d0e13 }))
  ground.rotation.x = -Math.PI / 2
  group.add(ground)

  // ── красное здание из блоков; стоит под углом к кварталам, как окно на его скрине
  const SIZE = 1.1
  const COLS = 6
  const ROWS = 4
  const LAYERS = 14
  const ANGLE = 0.42
  const roofY = LAYERS * SIZE
  const top = new THREE.MeshBasicMaterial({ color: colors.red, fog: false })
  const sideA = new THREE.MeshBasicMaterial({ color: 0xb51a2e, fog: false })
  const sideB = new THREE.MeshBasicMaterial({ color: 0x8f1524, fog: false })
  const count = COLS * ROWS * LAYERS
  const blocks = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), [sideA, sideA, top, sideB, sideB, sideB], count)
  blocks.frustumCulled = false
  group.add(blocks)

  // плитки с картинкой лежат на верхнем слое блоков и летают вместе с ними
  const tileGeometry = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2)
  const tileIndex = new Float32Array(COLS * ROWS * 2)
  const picture = { value: 0 }
  const tileMaterial = new THREE.ShaderMaterial({
    uniforms: {
      uMap: { value: drawFinale(colors) },
      uRed: { value: new THREE.Color(colors.red) },
      uPicture: picture,
      uGrid: { value: new THREE.Vector2(COLS, ROWS) },
    },
    vertexShader: /* glsl */ `
      attribute vec2 aTile;
      uniform vec2 uGrid;
      varying vec2 vUv;
      void main() {
        vUv = (aTile + uv) / uGrid;
        gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D uMap;
      uniform vec3 uRed;
      uniform float uPicture;
      varying vec2 vUv;
      void main() {
        gl_FragColor = vec4(mix(uRed, texture2D(uMap, vUv).rgb, uPicture), 1.0);
      }
    `,
  })
  const tiles = new THREE.InstancedMesh(tileGeometry, tileMaterial, COLS * ROWS)
  tiles.frustumCulled = false
  group.add(tiles)

  // у каждого блока свой дом на крыше поближе или подальше; на одной крыше помещается два
  const spots = landings
    .map((l) => ({ ...l, r: Math.hypot(l.x, l.z) }))
    .filter((l) => l.r > 9 && l.r < 52)
    .sort(() => rnd() - 0.5)
  type Block = { hx: number; hy: number; hz: number; tx: number; ty: number; tz: number; size: number; arc: number; yaw: number; tumble: number; delay: number }
  const data: Block[] = []
  const cos = Math.cos(ANGLE)
  const sin = Math.sin(ANGLE)
  let n = 0
  for (let ly = 0; ly < LAYERS; ly++)
    for (let ix = 0; ix < COLS; ix++)
      for (let iz = 0; iz < ROWS; iz++, n++) {
        const spot = spots[n % spots.length]
        const corner = Math.floor(n / spots.length) % 2 ? 0.22 : -0.22
        const size = Math.min(spot.w * 0.42, 0.7 + rnd() * 0.6)
        const lx = (ix - (COLS - 1) / 2) * SIZE
        const lz = (iz - (ROWS - 1) / 2) * SIZE
        data.push({
          hx: lx * cos + lz * sin,
          hy: (ly + 0.5) * SIZE,
          hz: -lx * sin + lz * cos,
          tx: spot.x + corner * spot.w,
          ty: spot.y + size / 2,
          tz: spot.z + corner * spot.w,
          size,
          arc: 5 + rnd() * 9 + spot.r * 0.12,
          yaw: Math.round(rnd() * 3) * (Math.PI / 2) + Math.PI * 2,
          tumble: (rnd() - 0.5) * 2.4,
          // верхние этажи улетают первыми и возвращаются последними
          delay: (1 - ly / (LAYERS - 1)) * 0.5 + rnd() * 0.1,
        })
        if (ly === LAYERS - 1) {
          const t = ix * ROWS + iz
          tileIndex[t * 2] = ix
          tileIndex[t * 2 + 1] = ROWS - 1 - iz
        }
      }
  tileGeometry.setAttribute('aTile', new THREE.InstancedBufferAttribute(tileIndex, 2))

  const lift = new THREE.Matrix4().makeTranslation(0, 0.503, 0)
  const tileMatrix = new THREE.Matrix4()
  const firstTop = (LAYERS - 1) * COLS * ROWS

  /** 0 — здание собрано, 1 — блоки разлетелись по крышам. */
  const setOpen = (open: number) => {
    for (let i = 0; i < count; i++) {
      const b = data[i]
      let t = clamp01(open * 1.6 - b.delay)
      t = t * t * (3 - 2 * t)
      const up = Math.sin(Math.PI * t)
      dummy.position.set(mix(b.hx, b.tx, t), mix(b.hy, b.ty, t) + up * b.arc, mix(b.hz, b.tz, t))
      dummy.rotation.set(up * b.tumble, mix(ANGLE, b.yaw, t), up * b.tumble * 0.6)
      dummy.scale.setScalar(mix(SIZE, b.size, t))
      dummy.updateMatrix()
      blocks.setMatrixAt(i, dummy.matrix)
      if (i >= firstTop) tiles.setMatrixAt(i - firstTop, tileMatrix.multiplyMatrices(dummy.matrix, lift))
    }
    dummy.rotation.set(0, 0, 0)
    blocks.instanceMatrix.needsUpdate = true
    tiles.instanceMatrix.needsUpdate = true
  }
  setOpen(0)

  group.add(new THREE.HemisphereLight(0xffffff, 0x0b0c10, 1.0))
  const sun = new THREE.DirectionalLight(0xffffff, 2.4)
  sun.position.set(30, 50, 18)
  group.add(sun)

  return {
    group,
    roofY,
    /** угол, под которым окно стоит к кварталам: камера выравнивается по нему перед входом */
    angle: ANGLE,
    setOpen,
    /** 0 — крыша просто красная, 1 — на ней видна картинка финала */
    setPicture: (v: number) => void (picture.value = v),
  }
}

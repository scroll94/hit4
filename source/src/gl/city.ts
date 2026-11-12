import * as THREE from 'three'

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))
const mix = (a: number, b: number, t: number) => a + (b - a) * t

/**
 * Город для вида сверху: кварталы из коробок с окнами и одно красное здание в центре.
 * Красное здание сложено из блоков: они умеют разлетаться по крышам вокруг,
 * становясь красными домиками, и собираться обратно.
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
    { min: 9, max: 13, side: wall(2, 7), items: [] as number[][] },
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
      tiers.push([x + (rnd() - 0.5) * w * 0.25, h, z + (rnd() - 0.5) * d * 0.25, w * 0.55, 0.8 + rnd() * 2.4, d * 0.55])
    } else {
      landings.push({ x, y: h, z, w: Math.min(w, d) })
      if (rnd() < 0.5) units.push([x + (rnd() - 0.5) * w * 0.6, h, z + (rnd() - 0.5) * d * 0.6, 0.4 + rnd() * 0.4, 0.26, 0.4 + rnd() * 0.4])
    }
  }
  for (let gx = -N; gx <= N; gx++) {
    for (let gz = -N; gz <= N; gz++) {
      const x = gx * PITCH
      const z = gz * PITCH
      // огоньки на перекрёстках и вдоль улиц
      if (rnd() < 0.6) (rnd() < 0.1 ? redLights : lights).push([x + PITCH / 2, 0.12, z + (rnd() - 0.5) * PITCH, 0.16, 0.16, 0.16])
      if (rnd() < 0.6) (rnd() < 0.1 ? redLights : lights).push([x + (rnd() - 0.5) * PITCH, 0.12, z + PITCH / 2, 0.16, 0.16, 0.16])
      if (gx === 0 && gz === 0) continue
      const r = rnd()
      if (r < 0.08) continue // пустая площадь
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

  // ── красное здание из блоков
  const SIZE = 1.1
  const SIDE = 4
  const LAYERS = 15
  const roofY = LAYERS * SIZE
  const top = new THREE.MeshBasicMaterial({ color: colors.red, fog: false })
  const sideA = new THREE.MeshBasicMaterial({ color: 0xb51a2e, fog: false })
  const sideB = new THREE.MeshBasicMaterial({ color: 0x8f1524, fog: false })
  const cube = new THREE.BoxGeometry(1, 1, 1)
  const count = SIDE * SIDE * LAYERS
  const blocks = new THREE.InstancedMesh(cube, [sideA, sideA, top, sideB, sideB, sideB], count)
  blocks.frustumCulled = false
  group.add(blocks)

  // у каждого блока свой дом на крыше поближе или подальше
  const spots = landings
    .map((l) => ({ ...l, r: Math.hypot(l.x, l.z) }))
    .filter((l) => l.r > 5 && l.r < 47)
    .sort(() => rnd() - 0.5)
  type Block = { hx: number; hy: number; hz: number; tx: number; ty: number; tz: number; size: number; arc: number; spin: number; tumble: number; delay: number }
  const data: Block[] = []
  let n = 0
  for (let ly = 0; ly < LAYERS; ly++)
    for (let ix = 0; ix < SIDE; ix++)
      for (let iz = 0; iz < SIDE; iz++, n++) {
        const spot = spots[n % spots.length]
        const size = Math.min(spot.w * 0.62, 0.85 + rnd() * 0.75)
        data.push({
          hx: (ix - (SIDE - 1) / 2) * SIZE,
          hy: (ly + 0.5) * SIZE,
          hz: (iz - (SIDE - 1) / 2) * SIZE,
          tx: spot.x,
          ty: spot.y + size / 2,
          tz: spot.z,
          size,
          arc: 5 + rnd() * 9 + spot.r * 0.12,
          spin: Math.round(rnd() * 3) * (Math.PI / 2) + Math.PI * 2,
          tumble: (rnd() - 0.5) * 2.4,
          // верхние этажи улетают первыми и возвращаются последними
          delay: (1 - ly / (LAYERS - 1)) * 0.5 + rnd() * 0.1,
        })
      }

  /** 0 — здание собрано, 1 — блоки разлетелись по крышам. */
  const setOpen = (open: number) => {
    for (let i = 0; i < count; i++) {
      const b = data[i]
      let t = clamp01(open * 1.6 - b.delay)
      t = t * t * (3 - 2 * t)
      const lift = Math.sin(Math.PI * t)
      dummy.position.set(mix(b.hx, b.tx, t), mix(b.hy, b.ty, t) + lift * b.arc, mix(b.hz, b.tz, t))
      dummy.rotation.set(lift * b.tumble, t * b.spin, lift * b.tumble * 0.6)
      dummy.scale.setScalar(mix(SIZE, b.size, t))
      dummy.updateMatrix()
      blocks.setMatrixAt(i, dummy.matrix)
    }
    dummy.rotation.set(0, 0, 0)
    blocks.instanceMatrix.needsUpdate = true
  }
  setOpen(0)

  group.add(new THREE.HemisphereLight(0xffffff, 0x0b0c10, 1.0))
  const sun = new THREE.DirectionalLight(0xffffff, 2.4)
  sun.position.set(30, 50, 18)
  group.add(sun)

  return { group, roofY, setOpen }
}

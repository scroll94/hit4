import * as THREE from 'three'

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))
const mix = (a: number, b: number, t: number) => a + (b - a) * t
const smooth = (v: number) => v * v * (3 - 2 * v)
const TAU = Math.PI * 2

/**
 * Город для вида сверху: кварталы из коробок с окнами и красное здание в центре.
 * Здание сложено из блоков. Они раскручиваются по спирали и собираются над городом в глаз:
 * контуры век расходятся волнами, радужка вращается и следит за курсором, зрачок — вход в финал.
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
  const lights: number[][] = []
  const redLights: number[][] = []

  const PITCH = 5.2
  const N = 10
  const add = (x: number, z: number, w: number, d: number) => {
    const r = rnd()
    const cls = classes[r < 0.4 ? 0 : r < 0.8 ? 1 : 2]
    const h = cls.min + rnd() * (cls.max - cls.min)
    cls.items.push([x, z, w, h, d])
    // надстройка: второй ярус поменьше
    if (w > 3 && rnd() < 0.3) tiers.push([x + (rnd() - 0.5) * w * 0.25, h, z + (rnd() - 0.5) * d * 0.25, w * 0.55, 0.6 + rnd() * 1.6, d * 0.55])
  }
  for (let gx = -N; gx <= N; gx++) {
    for (let gz = -N; gz <= N; gz++) {
      const x = gx * PITCH
      const z = gz * PITCH
      // огоньки на перекрёстках и вдоль улиц
      if (rnd() < 0.6) (rnd() < 0.1 ? redLights : lights).push([x + PITCH / 2, 0.12, z + (rnd() - 0.5) * PITCH, 0.16, 0.16, 0.16])
      if (rnd() < 0.6) (rnd() < 0.1 ? redLights : lights).push([x + (rnd() - 0.5) * PITCH, 0.12, z + PITCH / 2, 0.16, 0.16, 0.16])
      // вокруг красного здания — пустая площадь
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
  instanced(new THREE.MeshBasicMaterial({ color: colors.grey }), lights, small)
  instanced(new THREE.MeshBasicMaterial({ color: colors.red }), redLights, small)

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(700, 700), new THREE.MeshLambertMaterial({ color: 0x0d0e13 }))
  ground.rotation.x = -Math.PI / 2
  group.add(ground)

  // ── красное здание из блоков
  const SIZE = 1.1
  const COLS = 6
  const ROWS = 4
  const LAYERS = 14
  const ANGLE = 0.42
  const roofY = LAYERS * SIZE
  /** высота, на которой собирается глаз: выше любой крыши */
  const EYE_Y = roofY + 6
  const PUPIL_Y = EYE_Y + 1.8
  const count = COLS * ROWS * LAYERS

  // грани белые разной яркости, а цвет блока задаётся отдельно: красный или серый
  const shade = (v: number) => new THREE.MeshBasicMaterial({ color: new THREE.Color(v, v, v), fog: false })
  const blocks = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), [shade(0.52), shade(0.52), shade(1), shade(0.3), shade(0.34), shade(0.34)], count)
  blocks.frustumCulled = false
  group.add(blocks)
  const cRed = new THREE.Color(colors.red)
  const cGrey = new THREE.Color(colors.grey)
  const tint = new THREE.Color()

  // зрачок: гладкий красный диск, в него ныряет камера
  const pupil = new THREE.Mesh(new THREE.CircleGeometry(1.95, 56), new THREE.MeshBasicMaterial({ color: colors.red, fog: false }))
  pupil.rotation.x = -Math.PI / 2
  group.add(pupil)

  // ── из чего состоит глаз
  // контуры век: параболические дуги, каждая следующая больше и ниже — расходятся, как круги по воде
  const lidSize = (k: number) => ({ a: 10 + k * 2.7, b: 4.5 + k * 2.3 })
  type Spot =
    | { kind: 'lid'; ring: number; s: number; side: number }
    | { kind: 'iris'; ring: number; phase: number }
  const spotsList: Spot[] = []
  const iris = [
    { r: 2.75, n: 14, grey: true, y: 1.1, turn: 0.28 },
    { r: 3.85, n: 20, grey: false, y: 0.55, turn: -0.2 },
    { r: 4.95, n: 26, grey: true, y: 0, turn: 0.13 },
  ]
  iris.forEach((ring, j) => {
    for (let i = 0; i < ring.n; i++) spotsList.push({ kind: 'iris', ring: j, phase: (i / ring.n) * TAU })
  })
  let left = count - spotsList.length
  for (let k = 0; left > 0; k++) {
    const { a, b } = lidSize(k)
    // длина одной дуги и точки на ней через равные отрезки
    const steps = 400
    const xs: number[] = []
    const acc: number[] = [0]
    for (let i = 0; i <= steps; i++) xs.push(-1 + (2 * i) / steps)
    for (let i = 1; i <= steps; i++) {
      const y0 = b * (1 - xs[i - 1] ** 2)
      const y1 = b * (1 - xs[i] ** 2)
      acc.push(acc[i - 1] + Math.hypot((xs[i] - xs[i - 1]) * a, y1 - y0))
    }
    const perArc = Math.min(Math.floor(left / 2), Math.round(acc[steps] / 1.32))
    if (perArc < 6) {
      // остаток блоков уходит в последнее кольцо, чтобы ни один не потерялся
      for (; left > 0; left--) spotsList.push({ kind: 'lid', ring: Math.max(0, k - 1), s: -1 + 2 * rnd(), side: rnd() < 0.5 ? 1 : -1 })
      break
    }
    for (const side of [1, -1])
      for (let i = 0; i < perArc; i++) {
        const want = ((i + (side > 0 ? 0.5 : 0)) / perArc) * acc[steps]
        let j = 1
        while (j < steps && acc[j] < want) j++
        spotsList.push({ kind: 'lid', ring: k, s: xs[j], side })
      }
    left -= perArc * 2
  }

  /** куда блок встаёт в глазу; lid 0…1 — насколько глаз открыт */
  const place = (spot: Spot, lid: number, time: number, lookX: number, lookZ: number, out: THREE.Vector3) => {
    if (spot.kind === 'iris') {
      const ring = iris[spot.ring]
      const grow = smooth(clamp01(lid * 1.4 - spot.ring * 0.12))
      const angle = spot.phase + time * ring.turn
      const r = ring.r * (0.12 + 0.88 * grow) * (1 + 0.03 * Math.sin(time * 1.7 - spot.ring))
      out.set(lookX + Math.cos(angle) * r, EYE_Y + ring.y * grow, lookZ + Math.sin(angle) * r)
    } else {
      const { a, b } = lidSize(spot.ring)
      // внутренние контуры открываются раньше внешних, потом все слегка «дышат»
      const open = smooth(clamp01(lid * 1.35 - spot.ring * 0.08))
      const pulse = 1 + 0.035 * Math.sin(time * 1.25 - spot.ring * 0.85)
      out.set(spot.s * a * pulse, EYE_Y - spot.ring * 0.55, -spot.side * b * open * pulse * (1 - spot.s * spot.s))
    }
  }

  // ── блоки: дом в здании, место в глазу и спираль между ними
  type Block = { hr: number; ha: number; hy: number; tr: number; sweep: number; bx: number; by: number; bz: number; arc: number; tumble: number; delay: number; spot: Spot }
  const data: Block[] = []
  const cos = Math.cos(ANGLE)
  const sin = Math.sin(ANGLE)
  const base = new THREE.Vector3()
  // верхние этажи улетают первыми и становятся радужкой и внутренними контурами
  const order = spotsList.map((spot, i) => ({ spot, i }))
  let n = 0
  for (let ly = LAYERS - 1; ly >= 0; ly--)
    for (let ix = 0; ix < COLS; ix++)
      for (let iz = 0; iz < ROWS; iz++, n++) {
        const lx = (ix - (COLS - 1) / 2) * SIZE
        const lz = (iz - (ROWS - 1) / 2) * SIZE
        const hx = lx * cos + lz * sin
        const hz = -lx * sin + lz * cos
        const ha = Math.atan2(hz, hx)
        const around = (((ha % TAU) + TAU) % TAU) / TAU
        const spot = order[n].spot
        place(spot, 1, 0, 0, 0, base)
        data.push({
          hr: Math.hypot(hx, hz),
          ha,
          hy: (ly + 0.5) * SIZE,
          tr: Math.hypot(base.x, base.z),
          // до своего места блок делает ещё один-два оборота вокруг оси здания, все в одну сторону
          sweep: ((((Math.atan2(base.z, base.x) - ha) % TAU) + TAU) % TAU) + TAU * (1 + Math.floor(rnd() * 2)),
          bx: base.x,
          by: base.y,
          bz: base.z,
          arc: 2.5 + rnd() * 4,
          tumble: (rnd() - 0.5) * 1.4,
          // здание раскручивается, как лента: сверху вниз и по кругу, блок за блоком
          delay: ((LAYERS - 1 - ly + around) / LAYERS) * 0.56 + rnd() * 0.02,
          spot,
        })
      }

  const now = new THREE.Vector3()
  /**
   * @param open 0 — здание собрано, 1 — блоки встали в глаз
   * @param lid 0 — глаз закрыт, 1 — открыт
   * @param look куда смотрит глаз: смещение радужки, примерно от -1 до 1
   */
  const update = (open: number, lid: number, time: number, lookX: number, lookY: number) => {
    // радужка не выходит за край век
    const gx = lookX * 2.6 * lid
    const gz = lookY * 1.3 * lid
    for (let i = 0; i < count; i++) {
      const b = data[i]
      let t = clamp01(open * 1.6 - b.delay)
      t = t * t * (3 - 2 * t)
      const up = Math.sin(Math.PI * t)
      // спираль ведёт к месту в неподвижном открытом глазу; живое смещение подмешивается к концу пути
      const angle = b.ha + b.sweep * t
      const radius = mix(b.hr, b.tr, Math.pow(t, 1.5)) + up * 1.8
      place(b.spot, lid, time, gx, gz, now)
      dummy.position.set(
        Math.cos(angle) * radius + (now.x - b.bx) * t,
        mix(b.hy, b.by, t) + up * b.arc + (now.y - b.by) * t,
        Math.sin(angle) * radius + (now.z - b.bz) * t,
      )
      dummy.rotation.set(up * b.tumble, mix(ANGLE, 0, t) + up * 2.2, up * b.tumble * 0.6)
      dummy.scale.setScalar(mix(SIZE, b.spot.kind === 'iris' ? 0.78 : 0.92, t))
      dummy.updateMatrix()
      blocks.setMatrixAt(i, dummy.matrix)
      const grey = b.spot.kind === 'iris' && iris[b.spot.ring].grey
      blocks.setColorAt(i, grey ? tint.copy(cRed).lerp(cGrey, t) : cRed)
    }
    dummy.rotation.set(0, 0, 0)
    blocks.instanceMatrix.needsUpdate = true
    if (blocks.instanceColor) blocks.instanceColor.needsUpdate = true

    const grow = smooth(clamp01(lid * 1.4)) * smooth(clamp01(open * 1.6 - 0.56))
    pupil.position.set(gx, PUPIL_Y, gz)
    pupil.scale.setScalar(Math.max(grow, 0.0001))
  }
  update(0, 0, 0, 0, 0)

  group.add(new THREE.HemisphereLight(0xffffff, 0x0b0c10, 1.0))
  const sun = new THREE.DirectionalLight(0xffffff, 2.4)
  sun.position.set(30, 50, 18)
  group.add(sun)

  return { group, roofY, pupilY: PUPIL_Y, update }
}

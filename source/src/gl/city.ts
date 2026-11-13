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

  const cDark = new THREE.Color(0x4d0b16)

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

  // форма глаза симметричная: верх и низ зеркальны
  const SKEW = 0
  const arch = (_side: number) => 1
  let tanX = 1
  let tanZ = 0
  /** точка контура века и касательная к нему (tanX, tanZ) */
  const lidAt = (k: number, side: number, s: number, lid: number, time: number, out: THREE.Vector3, inset = 1) => {
    const a = lidSize(k).a * inset
    const b = lidSize(k).b * inset
    const open = smooth(clamp01(lid * 1.35 - k * 0.08))
    const pulse = 1 + 0.02 * Math.sin(time * 1.25 - k * 0.85)
    const bb = b * arch(side) * open
    out.set(s * a * pulse, EYE_Y - k * 0.55 + Math.sin(time * 1.6 - k * 0.9 + s * 1.5) * 0.3 * open, (-side * bb * (1 - s * s) - SKEW * s * open) * pulse)
    tanX = a
    tanZ = 2 * side * bb * s - SKEW * open
  }

  /** куда блок встаёт в глазу; lid 0…1 — насколько глаз открыт */
  const place = (spot: Spot, lid: number, time: number, lookX: number, lookZ: number, out: THREE.Vector3) => {
    if (spot.kind === 'iris') {
      const ring = iris[spot.ring]
      const grow = smooth(clamp01(lid * 1.4 - spot.ring * 0.12))
      const angle = spot.phase + time * ring.turn
      const r = ring.r * (0.12 + 0.88 * grow) * (1 + 0.03 * Math.sin(time * 1.7 - spot.ring))
      out.set(lookX + Math.cos(angle) * r, EYE_Y + ring.y * grow, lookZ + Math.sin(angle) * r)
    } else lidAt(spot.ring, spot.side, spot.s, lid, time, out)
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

  // ── гладкий глаз: блоки долетают до своих мест и растворяются в линиях
  const range = (v: number, a: number, b: number) => clamp01((v - a) / (b - a))
  const ringCount = spotsList.reduce((m, sp) => (sp.kind === 'lid' ? Math.max(m, sp.ring + 1) : m), 0)
  // когда прилетает первый и последний блок каждого контура и радужки
  const lidFrom = new Array(ringCount).fill(9)
  const lidTo = new Array(ringCount).fill(0)
  let irisFrom = 9
  let irisTo = 0
  for (const b of data) {
    if (b.spot.kind === 'lid') {
      lidFrom[b.spot.ring] = Math.min(lidFrom[b.spot.ring], b.delay)
      lidTo[b.spot.ring] = Math.max(lidTo[b.spot.ring], b.delay)
    } else {
      irisFrom = Math.min(irisFrom, b.delay)
      irisTo = Math.max(irisTo, b.delay)
    }
  }

  // линии глаза: веки, складка над верхним веком и ресницы — ленты с мягким краем
  const M = 64
  type Strip = { k: number; side: number; half: number; inset: number; color: THREE.Color }
  const stripList: Strip[] = []
  // внешние контуры рисуются первыми: они тоньше и темнее внутренних
  for (let k = ringCount - 1; k >= 0; k--)
    for (const side of [1, -1]) stripList.push({ k, side, half: 0.34 * Math.pow(0.72, k), inset: 1, color: cRed.clone().lerp(cDark, Math.min(0.85, k * 0.24)) })
  for (const side of [1, -1]) stripList.push({ k: 0, side, half: 0.035, inset: 0.9, color: cGrey })
  const strips = stripList.length
  const per = (M + 1) * 2
  const ribPos = new Float32Array(strips * per * 3)
  const ribUv = new Float32Array(strips * per * 2)
  const ribTint = new Float32Array(strips * per * 3)
  const ribIndex: number[] = []
  stripList.forEach((sp, st) => {
    for (let i = 0; i <= M; i++)
      for (let e = 0; e < 2; e++) {
        const v = st * per + i * 2 + e
        ribUv.set([i / M, e], v * 2)
        ribTint.set([sp.color.r, sp.color.g, sp.color.b], v * 3)
      }
    for (let i = 0; i < M; i++) {
      const v = st * per + i * 2
      ribIndex.push(v, v + 1, v + 2, v + 1, v + 3, v + 2)
    }
  })
  const ribGeo = new THREE.BufferGeometry()
  const ribAttr = new THREE.BufferAttribute(ribPos, 3)
  ribAttr.setUsage(THREE.DynamicDrawUsage)
  ribGeo.setAttribute('position', ribAttr)
  ribGeo.setAttribute('uv', new THREE.BufferAttribute(ribUv, 2))
  ribGeo.setAttribute('tint', new THREE.BufferAttribute(ribTint, 3))
  ribGeo.setIndex(ribIndex)
  const lids = new THREE.Mesh(
    ribGeo,
    new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      vertexShader: /* glsl */ `
        attribute vec3 tint;
        varying vec2 vUv;
        varying vec3 vTint;
        void main() {
          vUv = uv;
          vTint = tint;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        varying vec2 vUv;
        varying vec3 vTint;
        void main() {
          float edge = min(vUv.y, 1.0 - vUv.y);
          float alpha = smoothstep(0.0, fwidth(vUv.y) * 1.5, edge);
          float s = vUv.x * 2.0 - 1.0;
          gl_FragColor = vec4(vTint * mix(0.45, 1.0, 1.0 - s * s), alpha);
        }`,
    }),
  )
  lids.frustumCulled = false
  lids.renderOrder = 2
  group.add(lids)

  // радужка, зрачок и блик — один гладкий круг; веки обрезают его сверху и снизу
  const IRIS_R = 4.6
  const eyeUniforms = {
    uTime: { value: 0 },
    uPupil: { value: 0.36 },
    uDive: { value: 0 },
    uCenter: { value: new THREE.Vector2() },
    uRadius: { value: 1 },
    uLid: { value: new THREE.Vector3(10, 0, 0) },
    uSkew: { value: 0 },
    uRed: { value: new THREE.Color(colors.red) },
    uGrey: { value: new THREE.Color(colors.grey) },
    uBlack: { value: new THREE.Color(colors.black) },
    uDark: { value: cDark },
  }
  const eye = new THREE.Mesh(
    new THREE.PlaneGeometry(2, 2),
    new THREE.ShaderMaterial({
      uniforms: eyeUniforms,
      transparent: true,
      depthWrite: false,
      vertexShader: /* glsl */ `
        varying vec2 vP;
        void main() {
          vP = position.xy;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform float uTime, uPupil, uDive, uRadius, uSkew;
        uniform vec2 uCenter;
        uniform vec3 uLid;
        uniform vec3 uRed, uGrey, uBlack, uDark;
        varying vec2 vP;
        void main() {
          float r = length(vP);
          float ang = atan(vP.y, vP.x);
          float aa = fwidth(r) * 1.2;
          // радужка: от красного у зрачка к тёмному краю, по ней идут светлые волокна
          vec3 col = mix(uRed, uDark, smoothstep(uPupil, 0.95, r));
          float fibre = sin(ang * 46.0 + sin(ang * 9.0 + uTime * 0.25) * 2.2 + r * 6.0 - uTime * 0.4);
          float soft = sin(ang * 17.0 - uTime * 0.18 + r * 3.0) * 0.5 + 0.5;
          float band = smoothstep(uPupil + 0.02, uPupil + 0.2, r) * (1.0 - smoothstep(0.62, 0.92, r));
          col = mix(col, uGrey, smoothstep(0.6, 1.0, fibre) * band * mix(0.2, 0.62, soft));
          float dark = sin(ang * 92.0 + r * 5.0 + sin(ang * 5.0) * 3.0);
          col = mix(col, uBlack, smoothstep(0.5, 1.0, dark) * smoothstep(uPupil, uPupil + 0.12, r) * 0.45);
          // светлое кольцо вокруг зрачка
          col = mix(col, uGrey, (1.0 - smoothstep(0.004, 0.012 + aa, abs(r - uPupil - 0.045))) * 0.7 * (1.0 - uDive));
          // тёмный ободок и тонкая светлая кромка
          col = mix(col, uBlack, smoothstep(0.8, 0.96, r));
          col = mix(col, uGrey, (1.0 - smoothstep(0.0, 0.012 + aa, abs(r - 0.975))) * 0.55);
          // зрачок: красный, с чёрной сердцевиной и бликом; на входе в финал остаётся чистый красный
          col = mix(col, uRed, 1.0 - smoothstep(uPupil - aa, uPupil + aa, r));
          float core = uPupil * 0.52 * (1.0 - uDive);
          col = mix(col, uBlack, 1.0 - smoothstep(core - aa, core + aa, r));
          float glint = length(vP - vec2(-0.17, 0.17));
          col = mix(col, uGrey, (1.0 - smoothstep(0.055 - aa, 0.055 + aa, glint)) * (1.0 - uDive));
          // веки
          float x = uCenter.x + vP.x * uRadius;
          float z = uCenter.y - vP.y * uRadius;
          float zr = z + uSkew * x / uLid.x;
          float limit = (zr < 0.0 ? uLid.y : uLid.z) * (1.0 - (x * x) / (uLid.x * uLid.x)) - 0.3;
          float alpha = (1.0 - smoothstep(1.0 - aa * 2.0, 1.0, r)) * smoothstep(0.0, 0.3, limit - abs(zr));
          gl_FragColor = vec4(col, alpha);
        }`,
    }),
  )
  eye.rotation.x = -Math.PI / 2
  eye.frustumCulled = false
  eye.renderOrder = 3
  group.add(eye)

  const now = new THREE.Vector3()
  /**
   * @param open 0 — здание собрано, 1 — блоки встали в глаз
   * @param lid 0 — глаз закрыт, 1 — открыт
   * @param look куда смотрит глаз: смещение радужки, примерно от -1 до 1
   * @param dive 0…1 — камера ныряет в зрачок
   */
  const update = (open: number, lid: number, time: number, lookX: number, lookY: number, dive = 0) => {
    // радужка не выходит за край век
    const gx = lookX * 2.6 * lid
    const gz = lookY * 1.3 * lid
    const flight = open * 1.6
    for (let i = 0; i < count; i++) {
      const b = data[i]
      let t = clamp01(flight - b.delay)
      // у самого места блок сжимается и уступает линии
      const melt = 1 - smooth(range(t, 0.78, 1))
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
      dummy.scale.setScalar(Math.max(mix(SIZE, 0.7, t) * melt, 0.0001))
      dummy.updateMatrix()
      blocks.setMatrixAt(i, dummy.matrix)
      blocks.setColorAt(i, cRed)
    }
    dummy.rotation.set(0, 0, 0)
    blocks.instanceMatrix.needsUpdate = true
    if (blocks.instanceColor) blocks.instanceColor.needsUpdate = true

    // линии глаза
    const open0 = smooth(clamp01(lid * 1.35))
    stripList.forEach((sp, st) => {
      const at = st * per * 3
      const shown = smooth(range(flight, lidFrom[sp.k] + 0.78, lidTo[sp.k] + 1))
      for (let i = 0; i <= M; i++) {
        const s = -1 + (2 * i) / M
        lidAt(sp.k, sp.side, s, lid, time, now, sp.inset)
        const len = Math.hypot(tanX, tanZ)
        const w = sp.half * shown * Math.pow(Math.max(0, 1 - s * s), 0.7)
        const nx = (-tanZ / len) * w
        const nz = (tanX / len) * w
        const v = at + i * 6
        ribPos[v] = now.x - nx
        ribPos[v + 1] = now.y
        ribPos[v + 2] = now.z - nz
        ribPos[v + 3] = now.x + nx
        ribPos[v + 4] = now.y
        ribPos[v + 5] = now.z + nz
      }
    })
    ribAttr.needsUpdate = true

    // радужка и зрачок
    const grown = smooth(range(flight, irisFrom + 0.78, irisTo + 1))
    const radius = Math.max(IRIS_R * grown, 0.0001)
    const pulse0 = 1 + 0.02 * Math.sin(time * 1.25)
    eye.position.set(gx, PUPIL_Y, gz)
    eye.scale.setScalar(radius)
    eye.visible = grown > 0 && lid > 0.001
    eyeUniforms.uTime.value = time
    eyeUniforms.uCenter.value.set(gx, gz)
    eyeUniforms.uRadius.value = radius
    eyeUniforms.uLid.value.set(lidSize(0).a * 0.9 * pulse0, lidSize(0).b * 0.9 * open0 * pulse0, lidSize(0).b * 0.9 * open0 * pulse0)
    eyeUniforms.uSkew.value = SKEW * open0 * pulse0
    // зрачок медленно дышит, а на входе в финал раскрывается на всю радужку
    eyeUniforms.uPupil.value = mix(0.355 * (1 + 0.05 * Math.sin(time * 0.9)), 1.05, smooth(dive))
    eyeUniforms.uDive.value = dive
  }
  update(0, 0, 0, 0, 0)

  group.add(new THREE.HemisphereLight(0xffffff, 0x0b0c10, 1.0))
  const sun = new THREE.DirectionalLight(0xffffff, 2.4)
  sun.position.set(30, 50, 18)
  group.add(sun)

  return { group, roofY, pupilY: PUPIL_Y, update }
}

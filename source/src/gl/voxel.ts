import * as THREE from 'three'

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))

/**
 * Буква из кубиков для финала. Кубики слетаются по спирали и складываются в букву,
 * а от курсора разлетаются в стороны и возвращаются на место, как на пружинах.
 */
export function createVoxelMark(mask: HTMLCanvasElement, width: number, colors: { black: number }) {
  const COLS = 30
  const ROWS = Math.round((COLS * mask.height) / mask.width)
  const size = width / COLS
  const pixels = mask.getContext('2d')!.getImageData(0, 0, mask.width, mask.height).data
  const inside = (u: number, v: number) => pixels[(Math.floor(v * (mask.height - 1)) * mask.width + Math.floor(u * (mask.width - 1))) * 4 + 3] > 128

  type Cube = { x: number; y: number; angle: number; radius: number; depth: number; spin: number; delay: number }
  const cubes: Cube[] = []
  for (let j = 0; j < ROWS; j++)
    for (let i = 0; i < COLS; i++) {
      if (!inside((i + 0.5) / COLS, (j + 0.5) / ROWS)) continue
      const x = (i + 0.5 - COLS / 2) * size
      const y = (ROWS / 2 - j - 0.5) * size
      cubes.push({
        x,
        y,
        angle: Math.atan2(y, x),
        radius: Math.hypot(x, y),
        depth: (Math.random() - 0.5) * 9,
        spin: (Math.random() - 0.5) * 9,
        // буква собирается слева направо с небольшим разбросом
        delay: (i / COLS) * 0.45 + Math.random() * 0.15,
      })
    }
  const count = cubes.length

  // грани разного тона, чтобы повернувшийся кубик читался объёмным и без света
  const face = (color: number) => new THREE.MeshBasicMaterial({ color, fog: false })
  const mesh = new THREE.InstancedMesh(
    new THREE.BoxGeometry(size * 0.94, size * 0.94, size * 0.94),
    [face(0x2e323c), face(0x191b21), face(0x474c58), face(0x08090c), face(colors.black), face(0x050608)],
    count,
  )
  mesh.frustumCulled = false

  // смещение и скорость каждого кубика: x, y, z и два угла поворота
  const offset = new Float32Array(count * 5)
  const speed = new Float32Array(count * 5)
  const target = new Float32Array(5)
  const dummy = new THREE.Object3D()
  const group = new THREE.Group()
  group.add(mesh)

  /**
   * @param assemble 0 — кубики разбросаны, 1 — буква собрана
   * @param pointer точка курсора в координатах буквы или null, если курсора рядом нет
   */
  const update = (dt: number, assemble: number, pointer: { x: number; y: number } | null) => {
    const REACH = width * 0.3
    const stiffness = 60
    const damping = 9
    for (let i = 0; i < count; i++) {
      const c = cubes[i]
      const o = i * 5

      // куда кубик хочет: прочь от курсора, чуть к зрителю и с поворотом
      target.fill(0)
      if (pointer) {
        const dx = c.x - pointer.x
        const dy = c.y - pointer.y
        const d = Math.hypot(dx, dy)
        if (d < REACH) {
          const k = (1 - d / REACH) ** 2
          const inv = 1 / Math.max(d, 0.0001)
          target[0] = dx * inv * k * width * 0.22
          target[1] = dy * inv * k * width * 0.22
          target[2] = k * width * 0.5
          target[3] = -dy * inv * k * 2.6
          target[4] = dx * inv * k * 2.6
        }
      }
      for (let a = 0; a < 5; a++) {
        speed[o + a] += ((target[a] - offset[o + a]) * stiffness - speed[o + a] * damping) * dt
        offset[o + a] += speed[o + a] * dt
      }

      // сборка: спираль вокруг центра буквы сходится к месту кубика
      let t = clamp01(assemble * 1.6 - c.delay)
      t = 1 - (1 - t) ** 3
      const away = 1 - t
      const angle = c.angle + away * 3.4
      const radius = c.radius * (1 + away * 2.6) + away * width * 0.5
      dummy.position.set(Math.cos(angle) * radius + offset[o], Math.sin(angle) * radius + offset[o + 1], away * c.depth + offset[o + 2])
      dummy.rotation.set(away * c.spin + offset[o + 3], away * c.spin * 0.7 + offset[o + 4], 0)
      dummy.scale.setScalar(t < 0.02 ? 0 : 0.35 + 0.65 * t)
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
    }
    mesh.instanceMatrix.needsUpdate = true
  }

  return { group, update }
}

/** Кубики-фон: медленно плывут в глубине красного пространства. */
export function createDrift(colors: { red: number }) {
  const count = 46
  const face = (color: number) => new THREE.MeshBasicMaterial({ color, fog: false })
  const red = new THREE.Color(colors.red)
  const shade = (k: number) => red.clone().multiplyScalar(k).getHex()
  const mesh = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1, 1, 1),
    [face(shade(0.86)), face(shade(0.7)), face(shade(0.94)), face(shade(0.6)), face(shade(0.8)), face(shade(0.6))],
    count,
  )
  mesh.frustumCulled = false
  const items = Array.from({ length: count }, () => ({
    x: (Math.random() - 0.5) * 26,
    y: (Math.random() - 0.5) * 15,
    z: -11 - Math.random() * 16,
    size: 0.5 + Math.random() * 1.9,
    rx: Math.random() * 6,
    ry: Math.random() * 6,
    speed: 0.05 + Math.random() * 0.16,
    phase: Math.random() * 6,
  }))
  const dummy = new THREE.Object3D()
  const update = (time: number, lookX: number, lookY: number) => {
    items.forEach((it, i) => {
      // дальние кубики сдвигаются за курсором меньше ближних
      const depth = 1 / -it.z
      dummy.position.set(it.x - lookX * depth * 9, it.y + Math.sin(time * it.speed + it.phase) * 0.6 + lookY * depth * 9, it.z)
      dummy.rotation.set(it.rx + time * it.speed, it.ry + time * it.speed * 0.7, 0)
      dummy.scale.setScalar(it.size)
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
    })
    mesh.instanceMatrix.needsUpdate = true
  }
  return { mesh, update }
}

import * as THREE from 'three'

/**
 * Город для вида сверху: кварталы из коробок с окнами и одно красное здание в центре.
 * Камера стартует вплотную к красной крыше, поднимается над городом и ныряет обратно.
 */
export function createCity(colors: { black: number; grey: number; red: number }) {
  const group = new THREE.Group()
  let seed = 11
  const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646
  const ROOF = 17

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
        c.fillStyle = rnd() < 0.3 ? '#dfe5eb' : '#2d3139'
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
  const units: number[][] = []
  const lights: number[][] = []
  const redLights: number[][] = []

  const PITCH = 5.2
  const N = 10
  const add = (x: number, z: number, w: number, d: number) => {
    const r = rnd()
    const cls = classes[r < 0.4 ? 0 : r < 0.8 ? 1 : 2]
    const h = cls.min + rnd() * (cls.max - cls.min)
    cls.items.push([x, z, w, h, d])
    if (rnd() < 0.55) units.push([x + (rnd() - 0.5) * w * 0.5, h, z + (rnd() - 0.5) * d * 0.5, 0.5 + rnd() * 0.5, 0.28, 0.5 + rnd() * 0.5])
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
      if (r < 0.1) continue // пустая площадь
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
  instanced(new THREE.MeshLambertMaterial({ color: 0x8b929b }), units, small)
  instanced(new THREE.MeshBasicMaterial({ color: colors.grey }), lights, small)
  instanced(new THREE.MeshBasicMaterial({ color: colors.red }), redLights, small)

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(700, 700), new THREE.MeshLambertMaterial({ color: 0x0d0e13 }))
  ground.rotation.x = -Math.PI / 2
  group.add(ground)

  // красное здание: крыша чистого цвета палитры, стены чуть темнее
  const redTop = new THREE.MeshBasicMaterial({ color: colors.red, fog: false })
  const redSide = new THREE.MeshBasicMaterial({ color: 0xb51a2e, fog: false })
  const tower = new THREE.Mesh(box, [redSide, redSide, redTop, redTop, redSide, redSide])
  tower.scale.set(4.4, ROOF, 4.4)
  group.add(tower)

  group.add(new THREE.HemisphereLight(0xffffff, 0x0b0c10, 1.0))
  const sun = new THREE.DirectionalLight(0xffffff, 2.4)
  sun.position.set(30, 50, 18)
  group.add(sun)

  return { group, roofY: ROOF }
}

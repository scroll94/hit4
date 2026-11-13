import * as THREE from 'three'

/**
 * Тоннель для раздела «Обо мне»: рельсы, шпалы, колонны и огни.
 * Всё собрано из коробок; в конце горит красный свет — выход к контактам.
 */
export function createTunnel(length: number, colors: { black: number; grey: number; red: number }) {
  const group = new THREE.Group()
  const rnd = (() => {
    let s = 7
    return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646
  })()

  const dark = new THREE.MeshLambertMaterial({ color: 0x2a2e36 })
  const mid = new THREE.MeshLambertMaterial({ color: 0x7c838d })
  const light = new THREE.MeshBasicMaterial({ color: colors.grey })
  const red = new THREE.MeshBasicMaterial({ color: colors.red })
  const box = new THREE.BoxGeometry(1, 1, 1)
  // стройка: каждая деталь поднимается от пола, ближние раньше дальних
  const build = { value: 1 }
  for (const material of [dark, mid, light, red]) {
    material.onBeforeCompile = (shader) => {
      shader.uniforms.uBuild = build
      shader.vertexShader = 'uniform float uBuild;\n' + shader.vertexShader.replace(
        '#include <project_vertex>',
        `vec4 mvPosition = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          mvPosition = instanceMatrix * mvPosition;
        #endif
        float bDist = clamp((6.0 - mvPosition.z) / 60.0, 0.0, 1.0);
        float bGrow = clamp(uBuild * 2.0 - bDist, 0.0, 1.0);
        bGrow = bGrow * bGrow * (3.0 - 2.0 * bGrow);
        mvPosition.y = -1.5 + (mvPosition.y + 1.5) * bGrow;
        mvPosition.xz *= mix(0.92, 1.0, bGrow);
        mvPosition = modelViewMatrix * mvPosition;
        gl_Position = projectionMatrix * mvPosition;`,
      )
    }
  }
  const dummy = new THREE.Object3D()

  const instanced = (material: THREE.Material, items: [number, number, number, number, number, number][]) => {
    const mesh = new THREE.InstancedMesh(box, material, items.length)
    items.forEach(([x, y, z, sx, sy, sz], i) => {
      dummy.position.set(x, y, z)
      dummy.scale.set(sx, sy, sz)
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
    })
    mesh.instanceMatrix.needsUpdate = true
    mesh.frustumCulled = false
    group.add(mesh)
    return mesh
  }

  const mid_z = 6 - length / 2
  const darkItems: [number, number, number, number, number, number][] = [[0, -1.5, mid_z, 11, 0.3, length + 12]]
  const midItems: [number, number, number, number, number, number][] = []
  const lightItems: [number, number, number, number, number, number][] = [
    [-0.75, -1.26, mid_z, 0.1, 0.12, length + 12],
    [0.75, -1.26, mid_z, 0.1, 0.12, length + 12],
    [4.3, 3.2, mid_z, 0.05, 0.05, length + 12],
  ]
  const redItems: [number, number, number, number, number, number][] = [[-4.3, 3.2, mid_z, 0.06, 0.06, length + 12]]

  for (let z = 6; z > -length; z -= 1.1) midItems.push([0, -1.32, z, 2.3, 0.06, 0.3])

  let n = 0
  for (let z = 4; z > -length + 16; z -= 2.4, n++) {
    for (const side of [-1, 1]) {
      const h = 1.6 + rnd() * 3.6
      const x = side * (3.0 + rnd() * 0.7)
      darkItems.push([x, -1.35 + h / 2, z, 0.8, h, 0.8])
      lightItems.push([x, -1.35 + h + 0.04, z, 0.56, 0.05, 0.56])
      // огоньки на колоннах, каждый шестой — красный
      const led: [number, number, number, number, number, number] = [x - side * 0.42, -0.9 + rnd() * Math.max(h - 1, 0.2), z, 0.06, 0.16, 0.16]
      if ((n + (side > 0 ? 3 : 0)) % 6 === 0) redItems.push(led)
      else lightItems.push(led)
      // второй ряд, пониже и подальше
      const h2 = 0.8 + rnd() * 1.6
      darkItems.push([side * (4.6 + rnd() * 0.5), -1.35 + h2 / 2, z + 1.2, 1.1, h2, 1.1])
    }
  }

  // рамы-арки над путями
  for (let z = -4; z > -length + 16; z -= 12) {
    midItems.push([-4.9, 1.6, z, 0.3, 6.2, 0.3], [4.9, 1.6, z, 0.3, 6.2, 0.3], [0, 4.7, z, 10.1, 0.3, 0.3])
    lightItems.push([0, 4.52, z, 9.4, 0.04, 0.1])
  }

  instanced(dark, darkItems)
  instanced(mid, midItems)
  instanced(light, lightItems)
  instanced(red, redItems)

  // красный свет в конце тоннеля
  const exit = new THREE.Mesh(new THREE.PlaneGeometry(60, 40), new THREE.MeshBasicMaterial({ color: colors.red, fog: false }))
  exit.position.set(0, 1, -length - 2)
  group.add(exit)

  group.add(new THREE.HemisphereLight(0xffffff, 0x20232a, 1.5))
  const lamp = new THREE.PointLight(0xffffff, 40, 26, 1.6)
  group.add(lamp)

  /** 0 — пустой пол, 1 — тоннель построен */
  const setBuild = (v: number) => {
    build.value = v
    exit.scale.y = Math.max(v * v, 0.0001)
    exit.position.y = -1.5 + 2.5 * v * v
  }

  return { group, lamp, setBuild }
}

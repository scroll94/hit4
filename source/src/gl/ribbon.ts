import * as THREE from 'three'

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))
const smooth = (v: number) => v * v * (3 - 2 * v)
const mix = (a: number, b: number, t: number) => a + (b - a) * t

/** расстояние от камеры: ближе колонн тоннеля, чтобы они не перекрывали ленту */
const DEPTH = 2.4
const COUNT = 15

/**
 * Лента из глянцевых пластин для раздела «Обо мне».
 * Висит перед камерой справа сверху: пластины плывут по дуге, как раскрытая колода.
 */
export function createRibbon(colors: { black: number; grey: number; red: number }, fov: number) {
  const group = new THREE.Group()

  const w = 0.36
  const h = 0.48
  const r = 0.075
  const shape = new THREE.Shape()
  shape.moveTo(-w / 2 + r, -h / 2)
  shape.lineTo(w / 2 - r, -h / 2)
  shape.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + r)
  shape.lineTo(w / 2, h / 2 - r)
  shape.quadraticCurveTo(w / 2, h / 2, w / 2 - r, h / 2)
  shape.lineTo(-w / 2 + r, h / 2)
  shape.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - r)
  shape.lineTo(-w / 2, -h / 2 + r)
  shape.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + r, -h / 2)
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: 0.006, bevelEnabled: true, bevelThickness: 0.007, bevelSize: 0.007, bevelSegments: 4, curveSegments: 10 })
  geometry.center()

  // свой свет вместо ламп тоннеля: мягкий верхний, блик-полоса и светлая кромка
  const uniforms = { uTime: { value: 0 } }
  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */ `
      varying vec3 vN;
      varying vec3 vV;
      varying vec3 vCol;
      varying float vY;
      varying float vX;
      void main() {
        vY = position.y / 0.48 + 0.5;
        vX = position.x / 0.36 + 0.5;
        mat4 m = modelViewMatrix * instanceMatrix;
        vec4 p = m * vec4(position, 1.0);
        vN = mat3(m) * normal;
        vV = -p.xyz;
        vCol = instanceColor;
        gl_Position = projectionMatrix * p;
      }`,
    fragmentShader: /* glsl */ `
      varying vec3 vN;
      varying vec3 vV;
      varying vec3 vCol;
      varying float vY;
      varying float vX;
      uniform float uTime;
      void main() {
        vec3 n = normalize(vN);
        vec3 v = normalize(vV);
        if (dot(n, v) < 0.0) n = -n;
        float top = smoothstep(-0.3, 1.0, n.y);
        float key = pow(max(dot(n, normalize(vec3(-0.45, 0.6, 0.65))), 0.0), 3.0);
        float rim = pow(1.0 - max(dot(n, v), 0.0), 3.0);
        vec3 r = reflect(-v, n);
        float strip = smoothstep(0.35, 0.8, r.y) * (1.0 - smoothstep(0.8, 1.0, r.y));
        vec3 col = vCol * (0.2 + 0.5 * top + 0.75 * key) * mix(0.7, 1.25, smoothstep(0.0, 1.0, vY)) + vec3(0.87, 0.9, 0.92) * (rim * 0.65 + strip * 0.2);
        // по стеклу медленно проходит косой блик
        float d = vY * 0.75 + vX * 0.5 - fract(uTime * 0.07) * 3.0 + 1.0;
        float sheen = smoothstep(0.0, 0.22, d) * (1.0 - smoothstep(0.22, 0.5, d));
        col += vec3(0.87, 0.9, 0.92) * (sheen * 0.22 + smoothstep(0.55, 1.0, vY) * 0.08);
        gl_FragColor = vec4(col, 1.0);
      }`,
  })
  const mesh = new THREE.InstancedMesh(geometry, material, COUNT)
  mesh.frustumCulled = false
  const dark = new THREE.Color(0x1a1c22)
  const grey = new THREE.Color(colors.grey)
  const tint = new THREE.Color()
  for (let i = 0; i < COUNT; i++) {
    // от тёмных пластин к светлым и обратно; одна красная
    const v = 0.5 - 0.5 * Math.cos((i / COUNT) * Math.PI * 2)
    if (i === 5) tint.set(colors.red)
    else tint.copy(dark).lerp(grey, v)
    mesh.setColorAt(i, tint)
  }
  group.add(mesh)
  group.visible = false

  const dummy = new THREE.Object3D()
  const tan = Math.tan((fov * Math.PI) / 360)

  /**
   * @param appear 0 — ленты нет, 1 — раскрыта целиком
   * @param scroll доля прокрутки раздела: лента едет вместе со страницей
   */
  const update = (appear: number, time: number, aspect: number, lookX: number, lookY: number, scroll: number) => {
    group.visible = appear > 0.001
    if (!group.visible) return
    uniforms.uTime.value = time
    const hh = tan * DEPTH
    const hw = hh * aspect
    // дуга с центром за правым верхним углом экрана
    const R = Math.min(1.12, hw * 0.98)
    const cx = hw * 1.1
    const cy = hh * 1.16
    const a0 = 2.7
    const a1 = 5.05
    for (let i = 0; i < COUNT; i++) {
      const raw = i / COUNT + time * 0.014 + scroll * 0.45
      const u = raw - Math.floor(raw)
      // лента раскрывается от верхнего края
      const a = a0 + (a1 - a0) * u * mix(0.25, 1, appear)
      const edge = smooth(clamp01(u * 7)) * smooth(clamp01((1 - u) * 7))
      const born = smooth(clamp01(appear * 1.6 - u * 0.6))
      dummy.position.set(cx + Math.cos(a) * R + lookX * 0.03, cy + Math.sin(a) * R - lookY * 0.03, -DEPTH + Math.sin(u * Math.PI) * 0.3 - 0.15)
      dummy.rotation.set(0, 0, 0)
      // пластины держат общий наклон и плавно доворачиваются вдоль дуги
      dummy.rotateZ(-1.6 + (a - 3.2) * 0.45)
      dummy.rotateX(-0.62 + Math.sin(time * 0.5 + i * 0.5) * 0.07 + lookY * 0.12)
      dummy.rotateY(0.5 + Math.sin(time * 0.37 + i * 0.8) * 0.08 + lookX * 0.18)
      dummy.scale.setScalar(Math.max(edge * born * (R / 1.12) * 0.74, 0.0001))
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
    }
    mesh.instanceMatrix.needsUpdate = true
  }

  return { group, update }
}

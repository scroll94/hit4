import * as THREE from 'three'

export type Portrait = {
  points: THREE.Points
  uniforms: {
    uTime: { value: number }
    uReveal: { value: number }
    uScatter: { value: number }
    uScale: { value: number }
    uGlitch: { value: number }
  }
}

type Options = {
  cols: number
  width: number
  height: number
  /** true — чёрный растр на цветном фоне (финал), false — светящаяся матрица (первый экран) */
  halftone?: boolean
  color?: number
  dark?: number
}

/**
 * Картинка из точек. Каждая точка читает яркость и маску из текстуры:
 * сначала рисуется контур, потом он заполняется, а при прокрутке точки разлетаются.
 */
export function createPortrait(map: THREE.Texture, opts: Options): Portrait {
  const { cols, width, height, halftone = false } = opts
  const rows = Math.round(cols * (height / width))
  const count = cols * rows

  const position = new Float32Array(count * 3)
  const uv = new Float32Array(count * 2)
  const seed = new Float32Array(count * 3)
  let i = 0
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++, i++) {
      const u = (x + 0.5) / cols
      const v = (y + 0.5) / rows
      position[i * 3] = (u - 0.5) * width
      position[i * 3 + 1] = (v - 0.5) * height
      uv[i * 2] = u
      uv[i * 2 + 1] = v
      seed[i * 3] = Math.random()
      seed[i * 3 + 1] = Math.random()
      seed[i * 3 + 2] = Math.random()
    }
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(position, 3))
  geometry.setAttribute('aUv', new THREE.BufferAttribute(uv, 2))
  geometry.setAttribute('aSeed', new THREE.BufferAttribute(seed, 3))
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 40)

  const uniforms = {
    uMap: { value: map },
    uTime: { value: 0 },
    uReveal: { value: 0 },
    uScatter: { value: 0 },
    uCell: { value: width / cols },
    uScale: { value: 1 },
    uDepth: { value: halftone ? 0 : 0.45 },
    uGlitch: { value: 0 },
    uHalftone: { value: halftone ? 1 : 0 },
    uTexel: { value: new THREE.Vector2(1 / cols, 1 / rows) },
    uColor: { value: new THREE.Color(opts.color ?? 0xdfe5eb) },
    uDark: { value: new THREE.Color(opts.dark ?? 0x111217) },
  }

  const material = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    vertexShader: /* glsl */ `
      uniform sampler2D uMap;
      uniform float uTime, uReveal, uScatter, uCell, uScale, uDepth, uGlitch, uHalftone;
      uniform vec2 uTexel;
      attribute vec2 aUv;
      attribute vec3 aSeed;
      varying float vLum;
      varying float vAlpha;
      varying float vLine;

      void main() {
        vec4 t = texture2D(uMap, aUv);
        float lum = t.r;
        float mask = t.a;

        // контур: граница силуэта и резкие перепады яркости внутри
        vec4 tx = texture2D(uMap, aUv + vec2(uTexel.x * 1.5, 0.0));
        vec4 ty = texture2D(uMap, aUv + vec2(0.0, uTexel.y * 1.5));
        float edge = (abs(tx.a - mask) + abs(ty.a - mask)) * 1.6;
        edge += (abs(tx.r - lum) + abs(ty.r - lum)) * 2.4 * mask;
        edge = clamp(edge, 0.0, 1.0);

        // световая полоса медленно проходит сверху вниз, как развёртка экрана
        float sweep = smoothstep(0.14, 0.0, abs(1.3 - fract(uTime * 0.11) * 1.7 - aUv.y));
        lum = min(1.0, lum + sweep * 0.4 * (1.0 - uHalftone));

        vec3 p = position;
        p.z += (lum - 0.3) * uDepth * mask;

        // редкие сдвиги строк, как помехи на экране
        float slice = step(0.97, fract(sin(floor(aUv.y * 64.0) * 91.7 + floor(uTime * 8.0)) * 43758.5));
        p.x += slice * uGlitch * 0.4;

        // разлёт: сначала верх, потом всё остальное
        float delay = aSeed.x * 0.45 + (1.0 - aUv.y) * 0.25;
        float k = clamp(uScatter * 1.7 - delay, 0.0, 1.0);
        k = k * k * (3.0 - 2.0 * k);
        vec3 dir = normalize(aSeed - 0.5 + vec3(0.0, 0.25, 0.5));
        p += dir * k * (2.5 + 7.0 * aSeed.y);
        p.y += k * k * 2.0;
        p.x += sin(uTime * 0.7 + aSeed.z * 50.0) * 0.3 * k;

        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;

        // появление: первая половина — контур сверху вниз, вторая — заливка
        float lineIn = smoothstep(0.0, 0.08, uReveal * 2.2 - (1.0 - aUv.y) - aSeed.x * 0.08);
        float fill = smoothstep(0.0, 0.1, (uReveal - 0.45) * 2.2 - (1.0 - aUv.y) - aSeed.y * 0.08);
        float outline = step(0.2, edge) * lineIn * (1.0 - fill);

        vLine = outline;
        vLum = lum;
        vAlpha = mask * max(fill, outline) * (1.0 - k * k);

        float size = mix(0.5 + 0.62 * lum, 1.2 - 1.0 * lum, uHalftone);
        size = mix(size, 0.55, vLine);
        gl_PointSize = vAlpha < 0.01 ? 0.0 : uCell * uScale * size * (1.0 - k * 0.5) / -mv.z;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform vec3 uDark;
      uniform float uHalftone;
      varying float vLum;
      varying float vAlpha;
      varying float vLine;

      void main() {
        if (vAlpha < 0.01) discard;
        vec2 c = abs(gl_PointCoord - 0.5);
        float cell = step(max(c.x * 1.3, c.y), 0.45);
        float disc = step(length(gl_PointCoord - 0.5), 0.5);
        if (mix(cell, disc, uHalftone) < 0.5) discard;

        float b = mix(0.13, 1.0, pow(vLum, 1.1));
        vec3 lit = mix(mix(uDark, uColor, b), uColor, vLine);
        gl_FragColor = vec4(mix(lit, uDark, uHalftone), vAlpha);
      }
    `,
  })

  const points = new THREE.Points(geometry, material)
  points.frustumCulled = false
  return { points, uniforms }
}

/**
 * Комната из линий, как на миллиметровке. Линза потом изгибает её.
 * Если передать холст с буквой, сетка на задней стене дробится вдоль её контура.
 */
export function createGridRoom(color: number, mark?: { canvas: HTMLCanvasElement; width: number; height: number; y: number; distance: number }) {
  const x0 = -10
  const x1 = 10
  const y0 = -5.5
  const y1 = 5.5
  const z0 = -6
  const z1 = 14
  const pts: number[] = []
  for (let x = x0; x <= x1; x++) pts.push(x, y0, z0, x, y0, z1, x, y1, z0, x, y1, z1, x, y0, z0, x, y1, z0)
  for (let z = z0; z <= z1; z++) pts.push(x0, y0, z, x1, y0, z, x0, y1, z, x1, y1, z, x0, y0, z, x0, y1, z, x1, y0, z, x1, y1, z)
  for (let y = y0; y <= y1; y++) pts.push(x0, y, z0, x0, y, z1, x1, y, z0, x1, y, z1, x0, y, z0, x1, y, z0)

  const group = new THREE.Group()
  group.add(
    new THREE.LineSegments(
      new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(pts, 3)),
      new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.3, fog: false }),
    ),
  )

  if (mark) {
    // буква проецируется на заднюю стену; клетки, через которые проходит её край, делятся на четыре
    const { canvas } = mark
    const data = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data
    const k = (mark.distance - z0) / mark.distance
    const w = mark.width * k
    const h = mark.height * k
    const cy = mark.y * k
    const inside = (x: number, y: number) => {
      const u = x / w + 0.5
      const v = 0.5 - (y - cy) / h
      if (u < 0 || u > 1 || v < 0 || v > 1) return false
      const px = Math.min(canvas.width - 1, Math.floor(u * canvas.width))
      const py = Math.min(canvas.height - 1, Math.floor(v * canvas.height))
      return data[(py * canvas.width + px) * 4 + 3] > 128
    }
    const fine: number[] = []
    const split = (x: number, y: number, size: number, depth: number) => {
      let hits = 0
      for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) if (inside(x + ((i + 0.5) / 4) * size, y + ((j + 0.5) / 4) * size)) hits++
      const edge = hits > 0 && hits < 16
      if (edge && depth < 3) {
        const half = size / 2
        split(x, y, half, depth + 1)
        split(x + half, y, half, depth + 1)
        split(x, y + half, half, depth + 1)
        split(x + half, y + half, half, depth + 1)
      } else if (depth > 0) {
        const z = z0 + 0.01
        fine.push(x, y, z, x + size, y, z, x + size, y, z, x + size, y + size, z, x + size, y + size, z, x, y + size, z, x, y + size, z, x, y, z)
      }
    }
    for (let x = -7; x < 7; x++) for (let y = -5; y < 5; y++) split(x, y, 1, 0)
    group.add(
      new THREE.LineSegments(
        new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(fine, 3)),
        new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.2, fog: false }),
      ),
    )
  }
  return group
}

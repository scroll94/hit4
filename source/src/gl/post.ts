import { Vector2 } from 'three'

/** «Линза» поверх всей картинки: выпуклость, строки развёртки, зерно и разрывы при быстрой прокрутке. */
export const PostShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uBarrel: { value: 0.22 },
    uShift: { value: 0.0012 },
    uGlitch: { value: 0 },
    uScan: { value: 0.07 },
    uGrain: { value: 0.05 },
    uVignette: { value: 0.32 },
    uBand: { value: 1 },
    uDim: { value: 0 },
    uRes: { value: new Vector2(1, 1) },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = vec4(position.xy, 0.0, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    precision highp float;
    uniform sampler2D tDiffuse;
    uniform float uTime, uBarrel, uShift, uGlitch, uScan, uGrain, uVignette, uBand, uDim;
    uniform vec2 uRes;
    varying vec2 vUv;

    float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

    // центр увеличивается, края сжимаются; за границы кадра не выходим
    vec2 barrel(vec2 uv, float k) {
      vec2 c = uv - 0.5;
      float r2 = dot(c, c);
      return 0.5 + c * (1.0 + k * r2) / (1.0 + k * 0.5);
    }

    void main() {
      vec2 uv = barrel(vUv, uBarrel);

      // разрывы строк при быстрой прокрутке
      float row = floor(uv.y * 80.0);
      float tear = step(0.84, hash(vec2(row, floor(uTime * 12.0)))) * uGlitch;
      uv.x += (hash(vec2(row, 3.0)) - 0.5) * 0.08 * tear;

      // полоса развёртки: медленно идёт сверху вниз и слегка сдвигает картинку
      float band = smoothstep(0.016, 0.0, abs(vUv.y - (1.0 - fract(uTime * 0.085)))) * uBand;
      uv.x += band * 0.007 * sin(vUv.y * 700.0 + uTime * 30.0);

      vec2 dir = uv - 0.5;
      float sh = uShift * (1.0 + uGlitch * 7.0 + band * 4.0);
      float r = texture2D(tDiffuse, uv + dir * sh).r;
      float g = texture2D(tDiffuse, uv).g;
      float b = texture2D(tDiffuse, uv - dir * sh).b;
      vec3 col = vec3(r, g, b);

      col += band * 0.035;
      col *= 1.0 - uScan * (0.5 + 0.5 * sin(vUv.y * uRes.y * 1.5));
      col += (hash(vUv * uRes + fract(uTime) * 71.0) - 0.5) * uGrain;

      float v = smoothstep(0.92, 0.2, length(vUv - 0.5));
      col *= mix(1.0 - uVignette, 1.0, v);

      // затемнение сцены под открытым меню
      col *= 1.0 - uDim * 0.82;

      gl_FragColor = vec4(col, 1.0);
    }
  `,
}

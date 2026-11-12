import * as THREE from 'three'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'
import { works } from '../content'
import { createCity } from './city'
import { createCover } from './covers'
import { PostShader } from './post'
import { createGridRoom, createPortrait, type Portrait } from './portrait'
import { createTunnel } from './tunnel'

export const PALETTE = { black: 0x111217, grey: 0xdfe5eb, red: 0xef233c }

/** Где сейчас страница: доли прокрутки каждого раздела от 0 до 1. */
export type Progress = {
  scatter: number // монограмма рассыпается
  toWorks: number // камера опускается к работам
  works: number // движение вдоль работ
  toAbout: number // спуск в тоннель
  about: number // полёт по тоннелю
  toCity: number // вылет в красный свет в конце тоннеля
  city: number // подъём над городом от красной крыши
  toContact: number // пике обратно в красную крышу
  contact: number // монограмма собирается снова
  velocity: number // скорость прокрутки, экранов в секунду
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))
const smooth = (v: number) => v * v * (3 - 2 * v)
const mix = (a: number, b: number, t: number) => a + (b - a) * t
const range = (v: number, a: number, b: number) => clamp01((v - a) / (b - a))

const CAM_Z = 6.5
const FOV = 38
const WORK_W = 4.1
const WORK_GAP = 3.9
const WORKS_Y = -8.6
const TUNNEL_LEN = 170
const MARK = { width: 3.1, height: 2.356 }
// город стоит далеко в стороне от остальных сцен; камера переносится туда, пока весь экран красный
const CITY_AT = new THREE.Vector3(600, -400, 0)
const CITY_NEAR = 1
const CITY_FAR = 54

export class Experience {
  readonly renderer: THREE.WebGLRenderer
  private scene = new THREE.Scene()
  private camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 500)
  private composer: EffectComposer
  private post: ShaderPass
  private bg = new THREE.Color(PALETTE.black)
  private cBlack = new THREE.Color(PALETTE.black)
  private cGrey = new THREE.Color(PALETTE.grey)
  private cRed = new THREE.Color(PALETTE.red)
  private fog = new THREE.Fog(PALETTE.black, 60, 200)

  private hero = new THREE.Group()
  private head = new THREE.Group()
  private worksGroup = new THREE.Group()
  private planes: THREE.Mesh[] = []
  private tunnel: ReturnType<typeof createTunnel>
  private city: ReturnType<typeof createCity>
  private finale = new THREE.Group()
  private face: Portrait
  private ink: Portrait

  private pointer = new THREE.Vector2()
  private look = new THREE.Vector2()
  private glitch = 0
  private dim = 0
  private fit = 1
  private tunnelY = 0
  private reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches

  /** 0..1 — появление монограммы после загрузки; управляется снаружи */
  reveal = { value: 0 }
  /** true, пока открыто меню: сцена затемняется */
  menuOpen = false

  constructor(canvas: HTMLCanvasElement, mark: THREE.Texture) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75))
    this.scene.background = this.bg
    this.scene.fog = this.fog

    // сцена 1: комната-сетка и монограмма из точек
    const cols = window.innerWidth < 700 ? 110 : 150
    this.face = createPortrait(mark, { cols, ...MARK, color: PALETTE.grey, dark: PALETTE.black })
    this.head.add(this.face.points)
    this.hero.add(createGridRoom(PALETTE.grey, { canvas: mark.image as HTMLCanvasElement, ...MARK, y: 0.1, distance: CAM_Z }), this.head)
    this.scene.add(this.hero)

    // сцена 2: работы
    works.forEach((work, i) => {
      const plane = new THREE.Mesh(
        new THREE.PlaneGeometry(WORK_W, WORK_W / 1.6),
        new THREE.MeshBasicMaterial({ map: createCover(work), fog: false }),
      )
      plane.position.set(0, -i * WORK_GAP, 0)
      plane.rotation.z = (i % 2 ? 1 : -1) * 0.025
      this.planes.push(plane)
      this.worksGroup.add(plane)
    })
    this.scene.add(this.worksGroup)

    // сцена 3: тоннель
    this.tunnel = createTunnel(TUNNEL_LEN, PALETTE)
    this.scene.add(this.tunnel.group)

    // сцена 4: город сверху
    this.city = createCity(PALETTE)
    this.city.group.position.copy(CITY_AT)
    this.city.group.visible = false
    this.scene.add(this.city.group)

    // финал: та же монограмма, но чёрным растром на красном; закреплена перед камерой
    this.ink = createPortrait(mark, { cols: Math.round(cols * 0.6), width: 2.8, height: 2.128, halftone: true, dark: PALETTE.black })
    this.ink.uniforms.uReveal.value = 1
    this.ink.uniforms.uScatter.value = 1
    this.finale.add(this.ink.points)
    this.camera.add(this.finale)
    this.scene.add(this.camera)

    this.composer = new EffectComposer(this.renderer)
    this.composer.addPass(new RenderPass(this.scene, this.camera))
    this.post = new ShaderPass(PostShader)
    this.composer.addPass(this.post)
    this.composer.addPass(new OutputPass())

    window.addEventListener('pointermove', (e) => {
      this.pointer.set((e.clientX / window.innerWidth) * 2 - 1, (e.clientY / window.innerHeight) * 2 - 1)
    })
    this.resize()
  }

  /** Короткий всплеск помех: при открытии меню и переходах по ссылкам. */
  kick(amount = 1) {
    if (!this.reduced) this.glitch = Math.max(this.glitch, amount)
  }

  resize() {
    const w = window.innerWidth
    const h = window.innerHeight
    const aspect = w / h
    this.renderer.setSize(w, h, false)
    this.composer.setSize(w, h)
    this.camera.aspect = aspect
    this.camera.updateProjectionMatrix()

    // на узких экранах сцены уменьшаются, чтобы помещаться по ширине
    this.fit = Math.min(1, aspect / 1.35)
    const buffer = this.renderer.getDrawingBufferSize(new THREE.Vector2())
    const scale = buffer.y / (2 * Math.tan((FOV * Math.PI) / 360))
    this.face.uniforms.uScale.value = scale
    this.ink.uniforms.uScale.value = scale
    ;(this.post.uniforms.uRes.value as THREE.Vector2).copy(buffer)

    // на узком экране буква занимает около трёх четвертей ширины
    const markScale = Math.min(1, aspect * 0.98)
    this.head.scale.setScalar(markScale)
    this.head.position.y = aspect < 1 ? 0.55 : 0.1

    const s = mix(0.42, 1, range(aspect, 0.45, 1.35))
    this.worksGroup.scale.setScalar(s)
    this.worksGroup.position.set(aspect < 1 ? 0 : 0.8, WORKS_Y, 0)
    this.tunnelY = WORKS_Y - (works.length - 1) * WORK_GAP * s - 16
    this.tunnel.group.position.set(0, this.tunnelY, 0)

    // монограмма в финале: справа на широком экране, по центру сверху на узком
    const inkScale = aspect < 1 ? 0.5 : mix(0.7, 1, range(aspect, 1, 1.6))
    this.finale.scale.setScalar(inkScale)
    this.finale.position.set(aspect < 1 ? 0 : 1.75 * Math.min(1, aspect / 1.6), aspect < 1 ? 1.1 : 0.05, -CAM_Z)
  }

  update(p: Progress, time: number, dt: number) {
    const cam = this.camera
    const s = this.worksGroup.scale.x
    const worksTop = WORKS_Y
    const worksEnd = WORKS_Y - (works.length - 1) * WORK_GAP * s
    const inCity = p.toCity >= 1 && p.toContact < 1
    const inFinale = p.toContact >= 1

    this.look.lerp(this.pointer, 1 - Math.exp(-dt * 4))

    let z = CAM_Z
    if (inCity) {
      // ── над городом: камера смотрит вниз, поднимается от красной крыши и медленно поворачивается,
      // а в конце ныряет обратно в ту же крышу
      const up = p.toContact > 0 ? 1 - Math.pow(p.toContact, 3) : 1 - Math.pow(1 - p.city, 3)
      const h = mix(CITY_NEAR, CITY_FAR, up)
      cam.position.set(
        CITY_AT.x - 10 * this.fit * up + this.look.x * 1.4,
        CITY_AT.y + this.city.roofY + h,
        CITY_AT.z + 4 * up + this.look.y * 1.4,
      )
      cam.rotation.set(-Math.PI / 2, 0, 0.3 + p.city * 0.95 + p.toContact * 0.45)
    } else {
      // ── первый экран, работы и тоннель
      let y = mix(0, worksTop, smooth(p.toWorks))
      // у каждой работы камера чуть задерживается
      const f = p.works * (works.length - 1)
      const i = Math.min(Math.floor(f), works.length - 2)
      const dwell = (t: number) => t * t * t * (t * (t * 6 - 15) + 10)
      if (p.toWorks >= 1) y = worksTop - (i + dwell(f - i)) * WORK_GAP * s
      if (p.toAbout > 0) y = mix(worksEnd, this.tunnelY + 0.35, smooth(p.toAbout))

      const flight = p.about * (TUNNEL_LEN - 22) + smooth(p.toCity) * 24
      z = CAM_Z - flight
      const sway = p.about > 0 && p.toCity < 1 ? Math.sin(flight * 0.07) * 0.35 : 0
      cam.position.set(sway + this.look.x * 0.25, y - this.look.y * 0.12, z)
      cam.rotation.set(-this.look.y * 0.02, -this.look.x * 0.03 - sway * 0.04, -sway * 0.05)
    }

    // ── цвет фона: чёрный → серый → чёрный → красный → чёрный город → красный финал
    this.bg.copy(this.cBlack).lerp(this.cGrey, smooth(range(p.toWorks, 0.3, 0.8)))
    this.bg.lerp(this.cBlack, smooth(range(p.toAbout, 0.1, 0.65)))
    this.bg.lerp(this.cRed, range(p.toCity, 0.82, 1))
    if (inCity) this.bg.copy(this.cBlack)
    if (inFinale) this.bg.copy(this.cRed)
    this.fog.color.copy(this.bg)
    if (inCity) {
      this.fog.near = 75
      this.fog.far = 230
    } else {
      const inTunnel = range(p.toAbout, 0.5, 1)
      // перед самым выходом туман съедает всё, чтобы тоннель растворился в красном
      const out = range(p.toCity, 0.7, 1)
      this.fog.near = mix(mix(60, 4, inTunnel), 0.05, out)
      this.fog.far = mix(mix(200, 64, inTunnel), 1.5, out)
    }

    // ── что видно
    this.hero.visible = p.toWorks < 1
    this.worksGroup.visible = p.toWorks > 0.15 && p.toAbout < 1
    this.tunnel.group.visible = p.toAbout > 0.35 && p.toCity < 1
    this.city.group.visible = inCity
    this.finale.visible = p.toContact > 0.9
    this.tunnel.lamp.position.set(cam.position.x, 1.4, z - 3)

    // ── монограмма на первом экране
    const face = this.face.uniforms
    face.uTime.value = time
    face.uReveal.value = this.reveal.value
    face.uScatter.value = p.scatter
    this.head.rotation.y = this.look.x * 0.2
    this.head.rotation.x = this.look.y * 0.08

    // ── работы: плоскости наклоняются вслед за прокруткой
    const tilt = THREE.MathUtils.clamp(p.velocity * 0.22, -0.35, 0.35)
    for (const plane of this.planes) plane.rotation.x += (tilt - plane.rotation.x) * (1 - Math.exp(-dt * 6))

    // ── финал: растровая монограмма собирается из разлетевшихся точек
    const ink = this.ink.uniforms
    ink.uTime.value = time
    ink.uScatter.value = 1 - smooth(range(p.contact, 0.05, 0.75))

    // ── линза
    const speed = Math.min(1, Math.abs(p.velocity) / 2.2)
    this.glitch += ((this.reduced ? 0 : speed) - this.glitch) * (1 - Math.exp(-dt * 7))
    this.dim += ((this.menuOpen ? 1 : 0) - this.dim) * (1 - Math.exp(-dt * 6))
    face.uGlitch.value = 0.25 + this.glitch
    const u = this.post.uniforms
    u.uTime.value = time
    u.uGlitch.value = this.glitch
    u.uDim.value = this.dim
    let barrel = mix(0.26, 0.5, smooth(range(p.toWorks, 0.2, 0.9)))
    barrel = mix(barrel, 0.3, smooth(p.toAbout))
    barrel = mix(barrel, 0.12, smooth(range(p.toCity, 0.6, 1)))
    if (inCity) barrel = mix(mix(0.12, 0.34, smooth(range(p.city, 0, 0.5))), 0.12, smooth(range(p.toContact, 0.4, 1)))
    u.uBarrel.value = barrel + this.glitch * 0.12
    // на сером и красном фоне зерно, виньетка и помехи слабее, чтобы цвет остался чистым
    let flat = Math.max(smooth(range(p.toWorks, 0.3, 0.8)) * (1 - smooth(range(p.toAbout, 0.1, 0.65))), range(p.toCity, 0.82, 1))
    if (inCity) flat = Math.max(1 - range(p.city, 0, 0.12), range(p.toContact, 0.85, 1))
    if (inFinale) flat = 1
    u.uVignette.value = mix(0.34, 0.1, flat)
    u.uScan.value = mix(0.08, 0.035, flat)
    u.uGrain.value = mix(0.05, 0.025, flat)
    u.uBand.value = this.reduced ? 0 : mix(1, 0.25, flat)

    this.composer.render()
  }
}

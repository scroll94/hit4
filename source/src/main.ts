import './style.css'
import gsap from 'gsap'
import Lenis from 'lenis'
import { about, contact, person, works, worksNote } from './content'
import { Experience, type Progress } from './gl/experience'
import { createMonogram } from './gl/monogram'

const $ = <T extends HTMLElement>(selector: string) => document.querySelector<T>(selector)!
const clamp01 = (v: number) => Math.min(1, Math.max(0, v))
const range = (v: number, a: number, b: number) => clamp01((v - a) / (b - a))
const pad = (n: number) => String(n).padStart(2, '0')

/** Текст «проявляется» из случайных символов. */
function scramble(el: HTMLElement, text: string, duration = 0.7, pool = 'АБВГДЕЖЗИКЛМНОПРСТУФХЦЧШЭЮЯ0123456789/_#') {
  const start = performance.now()
  const step = (now: number) => {
    const t = Math.min(1, (now - start) / (duration * 1000))
    const shown = Math.floor(t * text.length)
    let out = text.slice(0, shown)
    for (let i = shown; i < text.length; i++) out += text[i] === ' ' ? ' ' : pool[(Math.random() * pool.length) | 0]
    el.textContent = out
    if (t < 1) requestAnimationFrame(step)
  }
  requestAnimationFrame(step)
}

// ── Текст из content.ts
$('#tagline').textContent = person.tagline
$('#role').textContent = person.role
$('#status').textContent = person.status

const list = $('#works-list')
works.forEach((work, i) => {
  const li = document.createElement('li')
  li.innerHTML = `[${pad(i + 1)}] ${work.title}<small><span>${work.kind}. ${worksNote}, ${work.year}</span></small>`
  list.append(li)
})
const workItems = [...list.children] as HTMLElement[]

const panels = $('#about-panels')
about.forEach((block) => {
  const div = document.createElement('div')
  div.className = 'about__panel'
  div.innerHTML = `<h2>${block.title}</h2>` + block.lines.map((line) => `<p>${line}</p>`).join('')
  panels.append(div)
})
const aboutPanels = [...panels.children] as HTMLElement[]

$('#contact-title').innerHTML = contact.title.map((line) => `<span>${line}</span>`).join('')
$('#contact-note').textContent = contact.note
$('#contact-links').innerHTML = contact.links
  .map((link) => `<li><a href="${link.href}"><small>${link.label}</small>${link.value}</a></li>`)
  .join('')

// ── Загрузка
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
const bar = $('.loader__bar i')
const load = { v: 0 }
const loadTo = (v: number) => gsap.to(load, { v, duration: 0.6, ease: 'power2.out', onUpdate: () => void (bar.style.transform = `scaleX(${load.v})`) })

async function boot() {
  loadTo(0.25)
  await Promise.all([
    document.fonts.load('800 80px Unbounded', 'Marsel Обо мне'),
    document.fonts.load('500 20px "JetBrains Mono"', 'Работы Marsel'),
  ]).catch(() => {})
  loadTo(0.55)

  const mark = createMonogram(person.monogram)
  loadTo(0.85)

  const experience = new Experience($<HTMLCanvasElement>('#gl'), mark)

  // плавная прокрутка — для мыши; на телефоне остаётся родная
  const fine = window.matchMedia('(hover: hover) and (pointer: fine)').matches
  const lenis = fine && !reduced ? new Lenis({ lerp: 0.1, anchors: true }) : null

  // ── Разметка разделов: где начинается и сколько длится каждая сцена
  const hero = $('.hero')
  const worksEl = $('.works')
  const aboutEl = $('.about')
  const contactEl = $('.contact')
  let m = { vh: 1, works: 0, worksEnd: 0, about: 0, aboutEnd: 0, contact: 0, contactEnd: 0 }
  const measure = () => {
    const vh = window.innerHeight
    m = {
      vh,
      works: worksEl.offsetTop,
      worksEnd: worksEl.offsetTop + worksEl.offsetHeight - vh,
      about: aboutEl.offsetTop,
      aboutEnd: aboutEl.offsetTop + aboutEl.offsetHeight - vh,
      contact: contactEl.offsetTop,
      contactEnd: contactEl.offsetTop + contactEl.offsetHeight - vh,
    }
    experience.resize()
  }
  measure()
  window.addEventListener('resize', measure)

  const heroPin = $('.hero__pin')
  const count = $('#works-count')
  let theme = 'dark'
  let workIndex = -1
  let aboutIndex = -1
  let lastY = window.scrollY

  const progress: Progress = { scatter: 0, toWorks: 0, works: 0, toAbout: 0, about: 0, toContact: 0, contact: 0, velocity: 0 }

  gsap.ticker.add((time, deltaMs) => {
    lenis?.raf(time * 1000)
    const dt = Math.min(deltaMs / 1000, 0.05) || 0.016
    const y = window.scrollY
    const { vh } = m

    progress.scatter = range(y, vh * 0.04, vh * 0.95)
    progress.toWorks = range(y, vh * 0.5, m.works)
    progress.works = range(y, m.works, m.worksEnd)
    progress.toAbout = range(y, m.worksEnd, m.about)
    progress.about = range(y, m.about, m.aboutEnd)
    progress.toContact = range(y, m.aboutEnd, m.contact)
    progress.contact = range(y, m.contact, m.contactEnd)
    progress.velocity = (y - lastY) / dt / vh
    lastY = y

    experience.update(progress, time, dt)

    // текст первого экрана гаснет, пока монограмма рассыпается
    heroPin.style.opacity = String(1 - range(progress.scatter, 0.12, 0.6))

    // цвет текста под фон сцены
    const next = progress.toContact > 0.9 ? 'red' : progress.toWorks > 0.55 && progress.toAbout < 0.35 ? 'light' : 'dark'
    if (next !== theme) document.body.dataset.theme = theme = next

    const wi = Math.round(progress.works * (works.length - 1))
    if (wi !== workIndex) {
      workIndex = wi
      workItems.forEach((li, i) => (li.dataset.on = String(i === wi)))
      scramble(count, `${pad(wi + 1)} / ${pad(works.length)}`, 0.35, '0123456789')
    }

    const ai = progress.about < 0.36 ? 0 : progress.about < 0.68 ? 1 : 2
    const aboutOn = progress.toAbout > 0.6 && progress.toContact < 0.5
    const an = aboutOn ? ai : -1
    if (an !== aboutIndex) {
      aboutIndex = an
      aboutPanels.forEach((panel, i) => (panel.dataset.on = String(i === an)))
    }
  })
  gsap.ticker.lagSmoothing(0)

  // ── Выход из загрузки и появление портрета
  await loadTo(1)
  const intro = gsap.timeline()
  intro.to('#loader', { autoAlpha: 0, duration: 0.5, ease: 'power2.out' })
  if (reduced || window.scrollY > 40) {
    experience.reveal.value = 1
  } else {
    intro.to(experience.reveal, { value: 1, duration: 3, ease: 'power1.inOut' }, 0.15)
    intro.from('.top, .hero__role, .hero__hint, .hero__status', { autoAlpha: 0, duration: 0.8, stagger: 0.08 }, 0.5)
    intro.call(() => scramble($('#name'), person.name, 0.9, 'ABCDEFGHIKLMNOPRSTUXZ0123456789'), [], 0.4)
    intro.call(() => scramble($('#tagline'), person.tagline, 0.8), [], 0.7)
  }
}

boot()

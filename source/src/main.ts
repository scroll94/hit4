import './style.css'
import gsap from 'gsap'
import Lenis from 'lenis'
import { about, city, contact, menu, person, works, worksNote } from './content'
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

/** Строки блока по очереди «расшифровываются» из случайных символов. */
function decode(panel: HTMLElement) {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
  ;([...panel.children] as HTMLElement[]).forEach((el, i) => {
    const text = (el.dataset.text ??= el.textContent ?? '')
    window.setTimeout(() => scramble(el, text, 0.45 + text.length * 0.006), i * 120)
  })
}

// ── Текст из content.ts
$('#tagline').textContent = person.tagline
$('#role').textContent = person.role
$('#status').textContent = person.status

const list = $('#works-list')
works.forEach((work, i) => {
  const li = document.createElement('li')
  li.innerHTML =
    `[${pad(i + 1)}] ${work.title}` +
    `<small><span><b>${work.kind}. ${worksNote}, ${work.year}</b>${work.text}<i>Роль: ${work.role}</i></span></small>`
  list.append(li)
})
const workItems = [...list.children] as HTMLElement[]

const panels = $('#about-panels')
const panelHtml = (block: { title: string; lines: string[] }) => `<h2>${block.title}</h2>` + block.lines.map((line) => `<p>${line}</p>`).join('')
about.forEach((block) => {
  const div = document.createElement('div')
  div.className = 'about__panel'
  div.innerHTML = panelHtml(block)
  panels.append(div)
})
const aboutPanels = [...panels.children] as HTMLElement[]
const cityPanel = $('#city-panel')
cityPanel.innerHTML = panelHtml(city)

$('#contact-title').innerHTML = contact.title.map((line) => `<span>${line}</span>`).join('')
$('#contact-note').textContent = contact.note
$('#contact-links').innerHTML = contact.links
  .map((link) => `<li><a href="${link.href}"><small>${link.label}</small>${link.value}</a></li>`)
  .join('')

$('#menu-links').innerHTML = menu.map((item, i) => `<a href="${item.href}"><small>${pad(i + 1)}</small><span>${item.label}</span></a>`).join('')
$('#menu-social').innerHTML = contact.links.map((link) => `<li><a href="${link.href}">${link.label}</a></li>`).join('')
$('#menu-status').textContent = person.status
// бегущая строка в финале: одна фраза, повторённая столько раз, чтобы хватило на два экрана
$('#ticker').innerHTML = Array.from({ length: 8 }, () => `<span>${person.status}</span><span>Напиши мне</span>`).join('')

// ── Загрузка
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
const bar = $('.loader__bar i')
const pct = $('#loader-pct')
const load = { v: 0 }
const loadTo = (v: number) =>
  gsap.to(load, {
    v,
    duration: 0.6,
    ease: 'power2.out',
    onUpdate: () => {
      bar.style.transform = `scaleX(${load.v})`
      pct.textContent = String(Math.round(load.v * 100))
    },
  })

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
  const lenis = fine && !reduced ? new Lenis({ lerp: 0.1 }) : null

  // ── Разметка разделов: где начинается и сколько длится каждая сцена
  const sections = { works: $('.works'), about: $('.about'), city: $('.city'), contact: $('.contact') }
  let m = { vh: 1, works: 0, worksEnd: 0, about: 0, aboutEnd: 0, city: 0, cityEnd: 0, contact: 0, contactEnd: 0 }
  const measure = () => {
    const vh = window.innerHeight
    const top = (el: HTMLElement) => el.offsetTop
    const end = (el: HTMLElement) => el.offsetTop + el.offsetHeight - vh
    m = {
      vh,
      works: top(sections.works),
      worksEnd: end(sections.works),
      about: top(sections.about),
      aboutEnd: end(sections.about),
      city: top(sections.city),
      cityEnd: end(sections.city),
      contact: top(sections.contact),
      contactEnd: end(sections.contact),
    }
    experience.resize()
  }
  measure()
  window.addEventListener('resize', measure)

  // ── Переходы по ссылкам: в каждую сцену попадаем в тот момент, где она уже раскрылась
  const stops: Record<string, () => number> = {
    '#top': () => 0,
    '#works': () => m.works + (m.worksEnd - m.works) * 0.01,
    '#about': () => m.about + (m.aboutEnd - m.about) * 0.12,
    '#city': () => m.city + (m.cityEnd - m.city) * 0.55,
    '#contact': () => m.contactEnd,
  }
  const go = (hash: string) => {
    const y = stops[hash]?.()
    if (y === undefined) return
    experience.kick(0.8)
    if (lenis) lenis.scrollTo(y, { duration: 1.8 })
    else window.scrollTo({ top: y, behavior: reduced ? 'auto' : 'smooth' })
  }

  // ── Меню
  const menuEl = $('#menu')
  const menuButton = $('#menu-button')
  const menuLabel = $('#menu-label')
  const menuLinks = [...menuEl.querySelectorAll<HTMLElement>('.menu__links a')]
  let menuOpen = false
  const setMenu = (open: boolean) => {
    if (open === menuOpen) return
    menuOpen = open
    document.body.dataset.menu = open ? 'open' : 'closed'
    menuButton.setAttribute('aria-expanded', String(open))
    menuLabel.textContent = open ? 'Закрыть' : 'Меню'
    menuEl.inert = !open
    experience.menuOpen = open
    experience.kick(1)
    if (open) lenis?.stop()
    else lenis?.start()
    document.documentElement.style.overflow = open && !lenis ? 'hidden' : ''
    gsap.killTweensOf([menuEl, ...menuLinks, '.menu__foot'])
    if (open) {
      gsap.fromTo(menuEl, { clipPath: 'inset(0% 0% 100% 0%)' }, { clipPath: 'inset(0% 0% 0% 0%)', duration: reduced ? 0 : 0.7, ease: 'expo.out' })
      gsap.fromTo(menuLinks, { yPercent: 70, autoAlpha: 0 }, { yPercent: 0, autoAlpha: 1, duration: 0.7, ease: 'expo.out', stagger: 0.06, delay: 0.08 })
      gsap.fromTo('.menu__foot', { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.5, delay: 0.4 })
    } else {
      gsap.to(menuEl, { clipPath: 'inset(0% 0% 100% 0%)', duration: reduced ? 0 : 0.45, ease: 'power3.inOut' })
    }
  }
  menuButton.addEventListener('click', () => setMenu(!menuOpen))
  window.addEventListener('keydown', (e) => e.key === 'Escape' && setMenu(false))

  document.addEventListener('click', (e) => {
    const link = (e.target as HTMLElement).closest<HTMLAnchorElement>('a[href^="#"]')
    if (!link) return
    e.preventDefault()
    setMenu(false)
    go(link.getAttribute('href')!)
  })

  const heroPin = $('.hero__pin')
  const count = $('#works-count')
  let theme = 'dark'
  let workIndex = -1
  let aboutIndex = -1
  let cityOn = false
  let lastY = window.scrollY

  const progress: Progress = { scatter: 0, toWorks: 0, works: 0, toAbout: 0, about: 0, toCity: 0, city: 0, toContact: 0, contact: 0, velocity: 0 }

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
    progress.toCity = range(y, m.aboutEnd, m.city)
    progress.city = range(y, m.city, m.cityEnd)
    progress.toContact = range(y, m.cityEnd, m.contact)
    progress.contact = range(y, m.contact, m.contactEnd)
    progress.velocity = (y - lastY) / dt / vh
    lastY = y

    experience.update(progress, time, dt)

    // текст первого экрана гаснет, пока монограмма рассыпается
    heroPin.style.opacity = String(1 - range(progress.scatter, 0.12, 0.6))

    // цвет текста под фон сцены: красный кадр бывает на выходе из тоннеля, у самой крыши и в финале
    const red = (progress.toCity > 0.9 && progress.city < 0.02) || progress.toContact > 0.985
    const next = red ? 'red' : progress.toWorks > 0.55 && progress.toAbout < 0.35 ? 'light' : 'dark'
    if (next !== theme) document.body.dataset.theme = theme = next

    const wi = Math.round(progress.works * (works.length - 1))
    if (wi !== workIndex) {
      workIndex = wi
      workItems.forEach((li, i) => (li.dataset.on = String(i === wi)))
      scramble(count, `${pad(wi + 1)} / ${pad(works.length)}`, 0.35, '0123456789')
    }

    const ai = progress.about < 0.36 ? 0 : progress.about < 0.68 ? 1 : 2
    const an = progress.toAbout > 0.6 && progress.toCity < 0.5 ? ai : -1
    if (an !== aboutIndex) {
      aboutIndex = an
      aboutPanels.forEach((panel, i) => (panel.dataset.on = String(i === an)))
      if (an >= 0) decode(aboutPanels[an])
    }

    const cn = progress.city > 0.3 && progress.toContact < 0.2
    if (cn !== cityOn) {
      cityPanel.dataset.on = String((cityOn = cn))
      if (cn) decode(cityPanel)
    }
  })
  gsap.ticker.lagSmoothing(0)

  // ── Выход из загрузки и появление монограммы
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

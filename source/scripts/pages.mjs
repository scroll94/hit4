// Собирает сайт и раскладывает его в соседнюю папку hit4 — это репозиторий GitHub Pages.
// В корень идёт готовый сайт, в папку source — исходники. После этого остаётся commit и push.
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import path from 'node:path'

const root = process.cwd()
const repo = path.resolve(root, '../hit4')
if (!existsSync(path.join(repo, '.git'))) {
  console.error('Не найден репозиторий рядом с проектом:', repo)
  process.exit(1)
}

execSync('npx vite build', { stdio: 'inherit' })

for (const name of ['assets', 'source', 'index.html', 'favicon.svg']) rmSync(path.join(repo, name), { recursive: true, force: true })
cpSync(path.join(root, 'dist'), repo, { recursive: true })
writeFileSync(path.join(repo, '.nojekyll'), '')

const source = path.join(repo, 'source')
mkdirSync(source, { recursive: true })
for (const name of ['index.html', 'package.json', 'package-lock.json', 'tsconfig.json', 'vite.config.ts', '.gitignore', 'src', 'public', 'scripts'])
  cpSync(path.join(root, name), path.join(source, name), { recursive: true })

console.log('Готово: сайт разложен в', repo)

import { copyFile, mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const srcTemplatePath = resolve(rootDir, 'src', 'template.html')
const distDir = resolve(rootDir, 'dist')
const distTemplatePath = resolve(distDir, 'template.html')

await mkdir(distDir, { recursive: true })
await copyFile(srcTemplatePath, distTemplatePath)

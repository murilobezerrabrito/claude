// npm run sync:engine: copia o motor (src/engine), a montagem do mês (src/report) e a formatação (src/lib/format.ts)
// para supabase/functions/_shared/aware, a cópia que as funções do servidor usam (SPEC, "Stack técnica"). Com
// --check, só confere se a cópia está igual à fonte e termina com erro se não estiver (integração contínua e teste).

import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const target = join(root, 'supabase/functions/_shared/aware')
const HEADER = '// Cópia gerada por `npm run sync:engine` a partir de src/. Não edite aqui: edite a fonte e rode o comando de novo.\n'

/** Arquivos da fonte (sem testes) e o caminho de cada um dentro da cópia. */
export function sourceFiles(): { from: string; to: string }[] {
  const files: { from: string; to: string }[] = []
  for (const dir of ['src/engine', 'src/report']) {
    for (const name of readdirSync(join(root, dir))) {
      if (!name.endsWith('.ts')) continue
      files.push({ from: join(root, dir, name), to: join(target, dir.replace('src/', ''), name) })
    }
  }
  files.push({ from: join(root, 'src/lib/format.ts'), to: join(target, 'lib/format.ts') })
  return files
}

/** Diferenças entre a fonte e a cópia: arquivos que faltam, que sobram ou que mudaram. */
export function staleFiles(): string[] {
  const files = sourceFiles()
  const expected = new Set(files.map((f) => f.to))
  const problems: string[] = []
  for (const f of files) {
    if (!existsSync(f.to) || readFileSync(f.to, 'utf8') !== HEADER + readFileSync(f.from, 'utf8')) problems.push(relative(root, f.to))
  }
  const walk = (dir: string): string[] =>
    existsSync(dir) ? readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)])) : []
  for (const extra of walk(target)) if (!expected.has(extra)) problems.push(`${relative(root, extra)} (sobra)`)
  return problems
}

function sync() {
  rmSync(target, { recursive: true, force: true })
  for (const f of sourceFiles()) {
    mkdirSync(dirname(f.to), { recursive: true })
    writeFileSync(f.to, HEADER + readFileSync(f.from, 'utf8'))
  }
  console.log(`Cópia atualizada em ${relative(root, target)} (${sourceFiles().length} arquivos).`)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--check')) {
    const problems = staleFiles()
    if (problems.length > 0) {
      console.error(`A cópia do motor nas funções está desatualizada; rode npm run sync:engine:\n  ${problems.join('\n  ')}`)
      process.exit(1)
    }
    console.log('A cópia do motor nas funções está igual à fonte.')
  } else sync()
}

import esbuild from 'esbuild'
import { builtinModules } from 'node:module'
import { copyFileSync, mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import process from 'node:process'

const prod = process.argv[2] === 'production'
const PLUGIN_ID = 'progressive-pomodoro'
const OUT_FILES = ['main.js', 'manifest.json', 'styles.css']

// Install targets: the bundled dev vault, plus an optional real vault via OBSIDIAN_VAULT.
const vaults = ['dev-vault', process.env.OBSIDIAN_VAULT].filter(Boolean)

function install() {
  for (const vault of vaults) {
    const dir = join(vault, '.obsidian', 'plugins', PLUGIN_ID)
    mkdirSync(dir, { recursive: true })
    for (const f of OUT_FILES) copyFileSync(f, join(dir, f))
    // Enable the plugin in the dev vault on first install.
    const list = join(vault, '.obsidian', 'community-plugins.json')
    const enabled = existsSync(list) ? JSON.parse(readFileSync(list, 'utf8')) : []
    if (!enabled.includes(PLUGIN_ID)) writeFileSync(list, JSON.stringify([...enabled, PLUGIN_ID], null, 2))
    console.log(`installed -> ${dir}`)
  }
}

const ctx = await esbuild.context({
  entryPoints: ['src/main.ts'],
  bundle: true,
  external: [
    'obsidian', 'electron',
    '@codemirror/autocomplete', '@codemirror/collab', '@codemirror/commands', '@codemirror/language',
    '@codemirror/lint', '@codemirror/search', '@codemirror/state', '@codemirror/view',
    '@lezer/common', '@lezer/highlight', '@lezer/lr',
    ...builtinModules,
  ],
  format: 'cjs',
  target: 'es2020',
  jsx: 'automatic',
  define: { 'process.env.NODE_ENV': JSON.stringify(prod ? 'production' : 'development') },
  logLevel: 'info',
  sourcemap: prod ? false : 'inline',
  treeShaking: true,
  minify: prod,
  outfile: 'main.js',
  plugins: [{ name: 'install', setup: (b) => b.onEnd((r) => { if (!r.errors.length) install() }) }],
})

if (prod) {
  await ctx.rebuild()
  await ctx.dispose()
} else {
  await ctx.watch()
}

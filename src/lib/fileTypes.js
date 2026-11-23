/** Above this size a text file is not opened automatically (the browser would struggle). */
export const LARGE_FILE_BYTES = 20 * 1024 * 1024

export function getExtension(name) {
  const lower = name.toLowerCase()
  const dot = lower.lastIndexOf('.')
  return dot >= 0 ? lower.slice(dot + 1) : ''
}

/* ------------------------------------------------------------ languages */

const LANGUAGES = {
  js: 'javascript', jsx: 'javascript', mjs: 'javascript', cjs: 'javascript',
  ts: 'typescript', tsx: 'typescript', mts: 'typescript', cts: 'typescript',
  html: 'html', htm: 'html', vue: 'html', svelte: 'html', astro: 'html',
  css: 'css', scss: 'scss', sass: 'scss', less: 'less',
  json: 'json', jsonc: 'json', map: 'json', webmanifest: 'json',
  md: 'markdown', markdown: 'markdown', mdx: 'markdown',
  py: 'python', java: 'java', kt: 'kotlin', kts: 'kotlin', scala: 'scala',
  c: 'c', h: 'c', cpp: 'cpp', cc: 'cpp', cxx: 'cpp', hpp: 'cpp', hh: 'cpp',
  cs: 'csharp', go: 'go', rs: 'rust', php: 'php', rb: 'ruby', swift: 'swift',
  dart: 'dart', lua: 'lua', r: 'r', pl: 'perl',
  sh: 'shell', bash: 'shell', zsh: 'shell', ps1: 'powershell', bat: 'bat', cmd: 'bat',
  sql: 'sql', xml: 'xml', svg: 'xml', xaml: 'xml', csproj: 'xml',
  yaml: 'yaml', yml: 'yaml', toml: 'ini', ini: 'ini', env: 'ini', cfg: 'ini', conf: 'ini',
  graphql: 'graphql', gql: 'graphql', dockerfile: 'dockerfile',
  txt: 'plaintext', log: 'plaintext', csv: 'plaintext',
}

const SPECIAL_LANGUAGES = {
  dockerfile: 'dockerfile',
  makefile: 'plaintext',
  '.prettierrc': 'json',
  '.eslintrc': 'json',
  '.babelrc': 'json',
}

export function languageFor(name) {
  const lower = name.toLowerCase()
  if (SPECIAL_LANGUAGES[lower]) return SPECIAL_LANGUAGES[lower]
  if (lower.startsWith('.env')) return 'ini'
  return LANGUAGES[getExtension(name)] || 'plaintext'
}

const LANGUAGE_LABELS = {
  javascript: 'JavaScript', typescript: 'TypeScript', html: 'HTML', css: 'CSS', scss: 'SCSS',
  less: 'Less', json: 'JSON', markdown: 'Markdown', python: 'Python', java: 'Java',
  kotlin: 'Kotlin', scala: 'Scala', c: 'C', cpp: 'C++', csharp: 'C#', go: 'Go', rust: 'Rust',
  php: 'PHP', ruby: 'Ruby', swift: 'Swift', dart: 'Dart', lua: 'Lua', r: 'R', perl: 'Perl',
  shell: 'Shell Script', powershell: 'PowerShell', bat: 'Batch', sql: 'SQL', xml: 'XML',
  yaml: 'YAML', ini: 'Ini', graphql: 'GraphQL', dockerfile: 'Dockerfile', plaintext: 'Plain Text',
}
export const languageLabel = (id) => LANGUAGE_LABELS[id] || id

/* ---------------------------------------------------------- media/binary */

const IMAGE = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'ico', 'avif', 'apng'])
const VIDEO = new Set(['mp4', 'webm', 'ogv', 'mov', 'm4v'])
const AUDIO = new Set(['mp3', 'wav', 'ogg', 'oga', 'm4a', 'flac', 'aac', 'opus'])
const FONTS = new Set(['woff', 'woff2', 'ttf', 'otf', 'eot'])
const ARCHIVES = new Set(['zip', 'rar', '7z', 'gz', 'tar', 'tgz', 'bz2', 'xz'])
const OFFICE = new Set(['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'odt', 'ods', 'odp'])
const BINARY = new Set([
  ...FONTS, ...ARCHIVES, ...OFFICE,
  'exe', 'dll', 'so', 'dylib', 'bin', 'iso', 'dmg', 'msi', 'apk', 'jar', 'class', 'wasm',
  'pyc', 'o', 'a', 'psd', 'ai', 'sketch', 'fig', 'sqlite', 'db', 'heic', 'tif', 'tiff',
])

/** 'image' | 'video' | 'audio' | 'pdf' | null */
export function mediaKind(name) {
  const ext = getExtension(name)
  if (IMAGE.has(ext)) return 'image'
  if (VIDEO.has(ext)) return 'video'
  if (AUDIO.has(ext)) return 'audio'
  if (ext === 'pdf') return 'pdf'
  return null
}

export const isKnownBinary = (name) => BINARY.has(getExtension(name))

/** A NUL byte in the first 8 KB is a reliable sign of a binary file. */
export async function looksBinary(blob) {
  const head = new Uint8Array(await blob.slice(0, 8000).arrayBuffer())
  return head.includes(0)
}

/* ----------------------------------------------------------------- mime */

const MIME = {
  html: 'text/html', htm: 'text/html', css: 'text/css',
  js: 'text/javascript', mjs: 'text/javascript', cjs: 'text/javascript', jsx: 'text/javascript',
  json: 'application/json', md: 'text/markdown', svg: 'image/svg+xml', xml: 'application/xml',
  csv: 'text/csv', txt: 'text/plain',
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp',
  bmp: 'image/bmp', ico: 'image/x-icon', avif: 'image/avif', apng: 'image/apng',
  mp4: 'video/mp4', webm: 'video/webm', ogv: 'video/ogg', mov: 'video/quicktime', m4v: 'video/mp4',
  mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', oga: 'audio/ogg', m4a: 'audio/mp4',
  flac: 'audio/flac', aac: 'audio/aac', opus: 'audio/opus',
  pdf: 'application/pdf', zip: 'application/zip', wasm: 'application/wasm',
}

export function guessMime(name) {
  const ext = getExtension(name)
  if (MIME[ext]) return MIME[ext]
  if (LANGUAGES[ext] || !ext || name.startsWith('.')) return 'text/plain'
  return 'application/octet-stream'
}

/** Code files get a text type even when the browser guesses otherwise (e.g. .ts → video/mp2t). */
export function contentTypeFor(name, browserType = '') {
  const ext = getExtension(name)
  if (LANGUAGES[ext] || MIME[ext]) return guessMime(name)
  return browserType || guessMime(name)
}

/* ---------------------------------------------------------------- icons */

const glyph = (text, color) => ({ glyph: text, color })
const icon = (codicon, color) => ({ codicon, color })

const ICONS_BY_NAME = {
  'package.json': icon('package', '#cc3e44'),
  'package-lock.json': icon('lock', '#cbcb41'),
  '.gitignore': icon('source-control', '#e84e31'),
  '.gitattributes': icon('source-control', '#e84e31'),
  dockerfile: icon('vm', '#519aba'),
  'readme.md': icon('info', '#519aba'),
  license: icon('law', '#cbcb41'),
  'license.md': icon('law', '#cbcb41'),
}

const ICONS_BY_EXT = {
  html: glyph('<>', '#e37933'), htm: glyph('<>', '#e37933'),
  vue: glyph('V', '#41b883'), svelte: glyph('S', '#ff3e00'), astro: glyph('A', '#ff5d01'),
  css: glyph('#', '#519aba'), scss: glyph('#', '#f55385'), sass: glyph('#', '#f55385'), less: glyph('#', '#4f7dbf'),
  js: glyph('JS', '#cbcb41'), mjs: glyph('JS', '#cbcb41'), cjs: glyph('JS', '#cbcb41'),
  jsx: glyph('⚛', '#61dafb'), tsx: glyph('⚛', '#519aba'),
  ts: glyph('TS', '#519aba'), mts: glyph('TS', '#519aba'), cts: glyph('TS', '#519aba'),
  json: icon('json', '#cbcb41'), jsonc: icon('json', '#cbcb41'), webmanifest: icon('json', '#cbcb41'),
  md: icon('markdown', '#519aba'), mdx: icon('markdown', '#519aba'), markdown: icon('markdown', '#519aba'),
  py: glyph('py', '#3e7bbf'), java: glyph('J', '#cc3e44'), kt: glyph('K', '#a97bff'), scala: glyph('S', '#cc3e44'),
  c: glyph('C', '#599eff'), h: glyph('h', '#a074c4'), cpp: glyph('C+', '#f34b7d'), cc: glyph('C+', '#f34b7d'),
  hpp: glyph('h', '#a074c4'), cs: glyph('C#', '#a074c4'), go: glyph('go', '#519aba'), rs: glyph('rs', '#dea584'),
  php: glyph('php', '#a074c4'), rb: glyph('rb', '#cc3e44'), swift: glyph('S', '#f05138'), dart: glyph('D', '#03a9f4'),
  lua: glyph('L', '#51a0cf'), r: glyph('R', '#358a5b'),
  sh: icon('terminal', '#89e051'), bash: icon('terminal', '#89e051'), zsh: icon('terminal', '#89e051'),
  ps1: icon('terminal-powershell', '#519aba'), bat: icon('terminal-cmd', '#c1f12e'), cmd: icon('terminal-cmd', '#c1f12e'),
  sql: icon('database', '#f55385'), db: icon('database', '#f55385'), sqlite: icon('database', '#f55385'),
  xml: icon('code', '#e37933'), xaml: icon('code', '#e37933'),
  yml: icon('settings', '#a074c4'), yaml: icon('settings', '#a074c4'),
  toml: icon('gear', '#6d8086'), ini: icon('gear', '#6d8086'), env: icon('gear', '#cbcb41'), cfg: icon('gear', '#6d8086'), conf: icon('gear', '#6d8086'),
  txt: icon('file', '#9da5b4'), log: icon('output', '#9da5b4'),
  csv: icon('table', '#89e051'), xls: icon('table', '#21a366'), xlsx: icon('table', '#21a366'),
  svg: icon('file-media', '#ffb13b'), pdf: icon('file-pdf', '#e44d26'),
  lock: icon('lock', '#cbcb41'), graphql: glyph('◈', '#e535ab'), gql: glyph('◈', '#e535ab'),
}

export function iconFor(name) {
  const lower = name.toLowerCase()
  if (ICONS_BY_NAME[lower]) return ICONS_BY_NAME[lower]
  if (lower.startsWith('.env')) return ICONS_BY_EXT.env
  const ext = getExtension(name)
  if (ICONS_BY_EXT[ext]) return ICONS_BY_EXT[ext]
  if (IMAGE.has(ext)) return icon('file-media', '#a074c4')
  if (VIDEO.has(ext)) return icon('device-camera-video', '#f55385')
  if (AUDIO.has(ext)) return icon('unmute', '#ee9b3b')
  if (ARCHIVES.has(ext)) return icon('file-zip', '#cbcb41')
  if (FONTS.has(ext)) return icon('text-size', '#cc3e44')
  if (BINARY.has(ext)) return icon('file-binary', '#9da5b4')
  return icon('file', '#9da5b4')
}

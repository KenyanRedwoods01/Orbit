// ── Language Detection ───────────────────────────────────────────────────────
export const EXT_TO_MONACO: Record<string, string> = {
  js: 'javascript', mjs: 'javascript', cjs: 'javascript', jsx: 'javascript',
  ts: 'typescript', tsx: 'typescript', mts: 'typescript',
  html: 'html', htm: 'html', xhtml: 'html',
  css: 'css', scss: 'scss', sass: 'scss', less: 'less',
  json: 'json', jsonc: 'json', json5: 'json',
  yaml: 'yaml', yml: 'yaml',
  php: 'php', php3: 'php', php4: 'php', php5: 'php', phtml: 'php',
  py: 'python', pyw: 'python',
  sh: 'shell', bash: 'shell', zsh: 'shell', fish: 'shell', ksh: 'shell',
  sql: 'sql', mysql: 'sql', pgsql: 'sql',
  go: 'go', rs: 'rust', java: 'java',
  c: 'c', h: 'c', cpp: 'cpp', cc: 'cpp', cxx: 'cpp', hpp: 'cpp', hxx: 'cpp',
  cs: 'csharp',
  xml: 'xml', plist: 'xml', svg: 'xml',
  md: 'markdown', mdx: 'markdown', markdown: 'markdown',
  toml: 'ini', ini: 'ini', cfg: 'ini', conf: 'ini', env: 'ini',
  dockerfile: 'dockerfile', graphql: 'graphql', gql: 'graphql',
  rb: 'ruby', swift: 'swift', kt: 'kotlin', kts: 'kotlin',
  vue: 'html', svelte: 'html',
  txt: 'plaintext', log: 'plaintext', text: 'plaintext',
  htaccess: 'apache', nginx: 'nginx', makefile: 'makefile', mk: 'makefile',
  r: 'r', lua: 'lua', pl: 'perl', ex: 'elixir', exs: 'elixir',
  tf: 'hcl', hcl: 'hcl', proto: 'proto',
}

export type IconKind =
  | 'folder' | 'folder-open' | 'folder-etc' | 'folder-home' | 'folder-var'
  | 'folder-log' | 'folder-tmp' | 'folder-git' | 'folder-config'
  | 'folder-backup' | 'folder-src' | 'folder-scripts' | 'folder-node'
  | 'folder-docker' | 'folder-nginx' | 'folder-lib'
  | 'js' | 'ts' | 'jsx' | 'tsx'
  | 'html' | 'css' | 'scss' | 'less'
  | 'json' | 'yaml' | 'toml' | 'xml'
  | 'php' | 'python' | 'shell' | 'sql'
  | 'go' | 'rust' | 'java' | 'c' | 'cpp' | 'csharp'
  | 'ruby' | 'swift' | 'kotlin' | 'dart'
  | 'markdown' | 'svg' | 'image' | 'video' | 'audio'
  | 'pdf' | 'archive' | 'binary' | 'symlink'
  | 'env' | 'docker' | 'config' | 'git' | 'lock'
  | 'vue' | 'svelte' | 'graphql'
  | 'database' | 'makefile' | 'nginx-conf'
  | 'file'

export const EXT_TO_ICON: Record<string, IconKind> = {
  js: 'js', mjs: 'js', cjs: 'js', jsx: 'jsx',
  ts: 'ts', mts: 'ts', tsx: 'tsx',
  html: 'html', htm: 'html', xhtml: 'html',
  css: 'css', scss: 'scss', sass: 'scss', less: 'less',
  json: 'json', jsonc: 'json', json5: 'json',
  yaml: 'yaml', yml: 'yaml', toml: 'toml',
  xml: 'xml', plist: 'xml',
  php: 'php', phtml: 'php',
  py: 'python', pyw: 'python',
  sh: 'shell', bash: 'shell', zsh: 'shell', fish: 'shell',
  sql: 'sql', mysql: 'sql', pgsql: 'sql',
  go: 'go', rs: 'rust', java: 'java',
  c: 'c', h: 'c', cpp: 'cpp', cc: 'cpp', cxx: 'cpp', hpp: 'cpp',
  cs: 'csharp', rb: 'ruby', swift: 'swift', kt: 'kotlin', kts: 'kotlin', dart: 'dart',
  md: 'markdown', mdx: 'markdown',
  svg: 'svg',
  png: 'image', jpg: 'image', jpeg: 'image', gif: 'image',
  webp: 'image', bmp: 'image', ico: 'image', tiff: 'image',
  mp4: 'video', webm: 'video', avi: 'video', mov: 'video', mkv: 'video',
  mp3: 'audio', wav: 'audio', ogg: 'audio', flac: 'audio',
  pdf: 'pdf',
  zip: 'archive', tar: 'archive', gz: 'archive', bz2: 'archive',
  xz: 'archive', rar: 'archive', '7z': 'archive',
  exe: 'binary', bin: 'binary', dll: 'binary', so: 'binary', dylib: 'binary',
  env: 'env', dockerfile: 'docker',
  gitignore: 'git', gitattributes: 'git', lock: 'lock',
  vue: 'vue', svelte: 'svelte', graphql: 'graphql', gql: 'graphql',
  db: 'database', sqlite: 'database',
  makefile: 'makefile', mk: 'makefile',
  conf: 'config', cfg: 'config', ini: 'config', htaccess: 'config',
}

export const NAME_TO_ICON: Record<string, IconKind> = {
  '.bashrc': 'shell', '.bash_profile': 'shell', '.bash_history': 'shell',
  '.zshrc': 'shell', '.profile': 'shell', '.zprofile': 'shell',
  '.env': 'env', '.env.local': 'env', '.env.production': 'env',
  '.gitignore': 'git', '.gitattributes': 'git', '.gitmodules': 'git',
  'dockerfile': 'docker', 'docker-compose.yml': 'docker', 'docker-compose.yaml': 'docker',
  'makefile': 'makefile', 'makefile.am': 'makefile',
  'package.json': 'json', 'package-lock.json': 'lock', 'yarn.lock': 'lock',
  'composer.json': 'json', 'composer.lock': 'lock',
  'cargo.toml': 'toml', 'cargo.lock': 'lock',
  'go.mod': 'go', 'go.sum': 'go',
  'requirements.txt': 'python', 'pipfile': 'python', 'setup.py': 'python',
  'nginx.conf': 'nginx-conf', 'sshd_config': 'config', 'ssh_config': 'config',
  'sudoers': 'lock', 'hosts': 'config', 'hostname': 'config',
  'fstab': 'config', 'resolv.conf': 'config', 'crontab': 'config',
  'authorized_keys': 'lock', 'known_hosts': 'config',
  'my.cnf': 'database', 'my.conf': 'database',
  '.htaccess': 'config',
  'robots.txt': 'config',
  'readme.md': 'markdown', 'readme': 'markdown', 'changelog.md': 'markdown',
}

export const FOLDER_NAME_TO_ICON: Record<string, IconKind> = {
  'etc': 'folder-etc', 'home': 'folder-home', 'var': 'folder-var',
  'log': 'folder-log', 'logs': 'folder-log', 'tmp': 'folder-tmp',
  '.git': 'folder-git', 'node_modules': 'folder-node',
  'backup': 'folder-backup', 'backups': 'folder-backup',
  'src': 'folder-src', 'source': 'folder-src',
  'scripts': 'folder-scripts', 'bin': 'folder-scripts',
  'docker': 'folder-docker', '.docker': 'folder-docker',
  'nginx': 'folder-nginx', 'config': 'folder-config', 'conf': 'folder-config',
  'conf.d': 'folder-config', 'sites-available': 'folder-config',
  'sites-enabled': 'folder-config',
  'lib': 'folder-lib', 'libs': 'folder-lib',
}

// ── Viewer mode ───────────────────────────────────────────────────────────────
export type ViewerMode = 'monaco' | 'markdown' | 'image' | 'svg' | 'pdf' | 'audio' | 'video' | 'archive' | 'binary' | 'none'

export function getViewerMode(ext: string): ViewerMode {
  const e = ext.toLowerCase()
  if (['png','jpg','jpeg','gif','webp','bmp','ico','tiff'].includes(e)) return 'image'
  if (e === 'svg') return 'svg'
  if (e === 'pdf') return 'pdf'
  if (['mp3','wav','ogg','flac'].includes(e)) return 'audio'
  if (['mp4','webm','avi','mov','mkv'].includes(e)) return 'video'
  if (['md','mdx','markdown'].includes(e)) return 'markdown'
  if (['zip','tar','gz','bz2','xz','rar','7z'].includes(e)) return 'archive'
  if (['exe','bin','dll','so','dylib'].includes(e)) return 'binary'
  if (EXT_TO_MONACO[e]) return 'monaco'
  return 'binary'
}

// ── File Tree ─────────────────────────────────────────────────────────────────
export interface TreeNode {
  id: string
  name: string
  kind: 'folder' | 'file' | 'symlink'
  ext?: string
  size?: string
  sizeBytes?: number
  modified?: string
  permissions?: string
  owner?: string
  group?: string
  children?: TreeNode[]
  content?: string
  target?: string
  hidden?: boolean
}

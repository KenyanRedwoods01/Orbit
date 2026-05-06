export type SessionStatus = 'active' | 'idle' | 'dead' | 'connecting'

export interface SshSession {
  id: string
  server: string
  user: string
  host: string
  port: number
  status: SessionStatus
  uptime: string
  encoding: string
  cols: number
  rows: number
  theme: string
}

export interface SshKey {
  id: string
  name: string
  type: string
  fingerprint: string
  created: string
  lastUsed: string
  bits: number
}

export interface SavedConnection {
  id: string
  name: string
  host: string
  port: number
  user: string
  authType: 'key' | 'password' | 'agent'
  keyId?: string
  tags: string[]
  lastConnected: string
  group: string
}

export interface CommandSnippet {
  id: string
  name: string
  command: string
  category: string
  description: string
  tags: string[]
}

export interface PortForward {
  id: string
  type: 'local' | 'remote' | 'dynamic'
  localPort: number
  remoteHost: string
  remotePort: number
  session: string
  status: 'active' | 'inactive'
}

export interface SessionRecording {
  id: string
  server: string
  user: string
  started: string
  duration: string
  commands: number
  outputLines: number
  size: string
}

export interface SftpTransfer {
  id: string
  filename: string
  direction: 'upload' | 'download'
  size: string
  sizeBytes: number
  transferred: number
  speed: string
  status: 'active' | 'queued' | 'done' | 'error'
}

export const SNIPPET_CATEGORIES = ['All', 'System', 'Web Server', 'Database', 'Cache', 'Containers', 'Logs', 'Network']

export const TERMINAL_THEMES = ['dark', 'solarized-dark', 'monokai', 'dracula', 'one-dark', 'light']

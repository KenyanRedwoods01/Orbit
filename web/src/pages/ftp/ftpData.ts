export type FileType = 'folder' | 'file' | 'archive' | 'symlink' | 'image' | 'video' | 'audio' | 'code' | 'binary'

export interface FileEntry {
  id: string
  name: string
  type: FileType
  size: string
  sizeBytes: number
  permissions: string
  owner: string
  group: string
  modified: string
  isHidden: boolean
  target?: string
  ext?: string
}

export interface FtpUser {
  id: string
  username: string
  homeDir: string
  chroot: boolean
  bandwidth: string
  uploadLimit: number
  downloadLimit: number
  status: 'active' | 'disabled'
  lastLogin: string
  connections: number
}

export interface QuotaEntry {
  user: string
  used: string
  usedBytes: number
  softLimit: string
  softBytes: number
  hardLimit: string
  hardBytes: number
  grace: string
  status: 'ok' | 'warning' | 'exceeded'
}

export interface CloudMount {
  id: string
  provider: 'S3' | 'Google Drive' | 'Dropbox' | 'Backblaze B2' | 'OneDrive'
  bucket: string
  mountPoint: string
  status: 'mounted' | 'offline' | 'error'
  usedSpace: string
  totalSpace: string
}

// Shared types and utilities for deployment pages

export type StepStatus = 'success' | 'failed' | 'running' | 'skipped' | 'pending'
export type DeployStatus = 'ok' | 'error' | 'running' | 'cancelled' | 'rolled_back'
export type TriggerKind = 'webhook' | 'manual' | 'schedule' | 'api' | 'chained'

export interface BuildStep {
  id: number
  name: string
  type: 'shell' | 'test' | 'notify' | 'reload' | 'build' | 'migrate'
  command: string
  status: StepStatus
  startedAt: number
  endedAt?: number
  duration?: string
  output: string[]
  exitCode?: number
}

export interface GitChange {
  path: string
  status: 'added' | 'modified' | 'deleted' | 'renamed'
  additions: number
  deletions: number
}

export interface Artifact {
  name: string
  path: string
  size: string
  type: string
}

export interface DeploymentRecord {
  id: number
  pipeline: string
  pipelineId: number
  status: DeployStatus
  commit: string
  commitFull: string
  message: string
  author: string
  authorEmail: string
  branch: string
  repoUrl: string
  provider: 'github' | 'gitlab' | 'bitbucket' | 'gitea' | 'manual'
  triggerKind: TriggerKind
  triggerSource?: string
  webhookPayload?: string
  startedAt: number
  endedAt?: number
  duration: string
  durationMs: number
  environment: 'production' | 'staging' | 'development'
  serverTarget: string
  steps: BuildStep[]
  changes: GitChange[]
  artifacts: Artifact[]
  envVars: Array<{ key: string; secret: boolean; value?: string }>
  rollbackFrom?: number
  previousDeployId?: number
  nextDeployId?: number
  stepsTotal: number
  stepsPassed: number
  stepsFailed: number
}

export function getStatusColor(status: string): string {
  switch (status) {
    case 'ok': return 'var(--color-success)'
    case 'error': return 'var(--color-danger)'
    case 'running': return 'var(--color-accent)'
    case 'cancelled': return 'var(--color-text-muted)'
    case 'rolled_back': return 'var(--color-warning)'
    default: return 'var(--color-text-muted)'
  }
}

export function getStatusLabel(status: string): string {
  switch (status) {
    case 'ok': return 'Success'
    case 'error': return 'Failed'
    case 'running': return 'Running'
    case 'cancelled': return 'Cancelled'
    case 'rolled_back': return 'Rolled back'
    default: return status
  }
}

export function getStepColor(status: StepStatus): string {
  switch (status) {
    case 'success': return 'var(--color-success)'
    case 'failed': return 'var(--color-danger)'
    case 'running': return 'var(--color-accent)'
    case 'skipped': return 'var(--color-text-dim)'
    case 'pending': return 'var(--color-text-dim)'
    default: return 'var(--color-text-dim)'
  }
}

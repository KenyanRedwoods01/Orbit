import { useState, useRef, KeyboardEvent } from 'react'
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query'
import { createUptimeMonitor, fetchContainers, fetchServices, Container, Service } from '@/lib/api'
import { Modal, Spinner } from '@/components/ui'
import styles from './MonitorForm.module.css'

// ── SVG icons (inline) ─────────────────────────────────────
const IcoHttp    = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><circle cx="10" cy="10" r="7"/><path d="M3 10h14M10 3c-2 2-3 4.5-3 7s1 5 3 7M10 3c2 2 3 4.5 3 7s-1 5-3 7"/></svg>
const IcoTcp     = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="6" width="5" height="8" rx="1.5"/><rect x="13" y="6" width="5" height="8" rx="1.5"/><path d="M7 10h6"/></svg>
const IcoPing    = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><circle cx="10" cy="10" r="2"/><path d="M5 10a5 5 0 0 1 5-5M15 10a5 5 0 0 1-5 5"/><path d="M2 10a8 8 0 0 1 8-8M18 10a8 8 0 0 1-8 8"/></svg>
const IcoDns     = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="16" height="4" rx="1"/><rect x="2" y="9" width="16" height="4" rx="1"/><rect x="2" y="15" width="16" height="2" rx="1"/><circle cx="5.5" cy="5" r="0.8" fill="currentColor" stroke="none"/><circle cx="5.5" cy="11" r="0.8" fill="currentColor" stroke="none"/></svg>
const IcoWs      = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7l4 6 3-4 3 4 4-6"/></svg>
const IcoGrpc    = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><circle cx="10" cy="10" r="3"/><path d="M10 3v4M10 13v4M3 10h4M13 10h4"/></svg>
const IcoCheck   = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="4,10 8,14 16,6"/></svg>
const IcoPlus    = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="10" y1="4" x2="10" y2="16"/><line x1="4" y1="10" x2="16" y2="10"/></svg>
const IcoX       = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="5" y1="5" x2="15" y2="15"/><line x1="15" y1="5" x2="5" y2="15"/></svg>
const IcoWarn    = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M10 3L18 17H2z"/><line x1="10" y1="9" x2="10" y2="12"/><circle cx="10" cy="15.5" r="0.6" fill="currentColor" stroke="none"/></svg>
const IcoEmail   = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="16" height="12" rx="2"/><polyline points="2,6 10,12 18,6"/></svg>
const IcoHook    = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M7 4v4a3 3 0 0 0 6 0V4"/><path d="M5 16h10a2 2 0 0 0 0-4H9"/></svg>
const IcoSlack   = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="4" height="4" rx="1"/><rect x="11" y="5" width="4" height="4" rx="1"/><rect x="3" y="5" width="4" height="4" rx="1"/><rect x="11" y="11" width="4" height="4" rx="1"/></svg>
const IcoPD      = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M10 2L5 12h10z"/><line x1="10" y1="13" x2="10" y2="18"/><line x1="7" y1="18" x2="13" y2="18"/></svg>
const IcoGear    = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><circle cx="10" cy="10" r="2.5"/><path d="M10 2v2M10 16v2M2 10h2M16 10h2M4.22 4.22l1.42 1.42M14.36 14.36l1.42 1.42M4.22 15.78l1.42-1.42M14.36 5.64l1.42-1.42"/></svg>
const IcoSla     = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M3 17L8 10l4 3 5-8"/><circle cx="17" cy="5" r="1.5" fill="currentColor" stroke="none"/></svg>
const IcoSearch  = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="8.5" cy="8.5" r="5.5"/><line x1="13" y1="13" x2="17" y2="17"/></svg>
const IcoServer  = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="16" height="5" rx="1.5"/><rect x="2" y="10" width="16" height="5" rx="1.5"/><circle cx="5.5" cy="5.5" r="0.9" fill="currentColor" stroke="none"/><circle cx="5.5" cy="12.5" r="0.9" fill="currentColor" stroke="none"/><line x1="9" y1="5.5" x2="15" y2="5.5"/><line x1="9" y1="12.5" x2="15" y2="12.5"/></svg>
const IcoDocker  = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="9" width="3" height="3" rx="0.5"/><rect x="6" y="9" width="3" height="3" rx="0.5"/><rect x="10" y="9" width="3" height="3" rx="0.5"/><rect x="6" y="5" width="3" height="3" rx="0.5"/><rect x="10" y="5" width="3" height="3" rx="0.5"/><path d="M15 11c.5-1 1.5-1.5 2.5-1 0 0 .5 2-1 3H4.5C2.5 13 2 11 3 10c.5-.5 1-.5 1-.5"/></svg>
const IcoEdit    = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M14 3l3 3-9 9H5v-3z"/><path d="M12 5l3 3"/></svg>
const IcoRefresh = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 10a6 6 0 1 1 1.5 4"/><polyline points="4,14 4,10 8,10"/></svg>

// ── Per-image icon components ───────────────────────────────
const IcoNginx    = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><polygon points="10,2 18,6.5 18,13.5 10,18 2,13.5 2,6.5"/><path d="M6.5 14V8l7 6V8" strokeWidth="1.8"/></svg>
const IcoNodeJs   = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M10 2L3 6v8l7 4 7-4V6z"/><path d="M10 2v12M3 6l7 4 7-4" strokeWidth="1.4"/></svg>
const IcoPostgres = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><ellipse cx="10" cy="5" rx="7" ry="2.5"/><path d="M3 5v10c0 1.38 3.13 2.5 7 2.5s7-1.12 7-2.5V5"/><path d="M3 10c0 1.38 3.13 2.5 7 2.5s7-1.12 7-2.5"/></svg>
const IcoRedis    = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><ellipse cx="10" cy="12" rx="7" ry="3"/><path d="M3 12v3c0 1.66 3.13 3 7 3s7-1.34 7-3v-3"/><path d="M3 7l7-3.5L17 7l-7 3.5z"/></svg>
const IcoMysql    = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><ellipse cx="10" cy="5" rx="7" ry="2.5"/><path d="M3 5v10c0 1.38 3.13 2.5 7 2.5s7-1.12 7-2.5V5"/><path d="M3 10c0 1.38 3.13 2.5 7 2.5s7-1.12 7-2.5"/><path d="M14 13l2 2-2 2" strokeWidth="1.4"/></svg>
const IcoMongo    = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M10 2c0 0-5 4-5 9a5 5 0 0 0 10 0c0-5-5-9-5-9z"/><line x1="10" y1="14" x2="10" y2="18"/></svg>
const IcoPython   = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M7 2h3a3 3 0 0 1 3 3v3H7a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z"/><path d="M13 18h-3a3 3 0 0 1-3-3v-3h6a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1z"/><circle cx="9" cy="4.5" r="0.8" fill="currentColor" stroke="none"/><circle cx="11" cy="15.5" r="0.8" fill="currentColor" stroke="none"/></svg>
const IcoGoLang   = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="5" cy="10" r="2.5"/><circle cx="15" cy="10" r="2.5"/><path d="M7.5 10h5"/><path d="M13 7.5V5h2v5"/></svg>
const IcoGeneric  = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="14" height="14" rx="2.5"/><path d="M7 10l2 2 4-4"/></svg>

// ── Types ──────────────────────────────────────────────────
type MonitorKind   = 'http' | 'tcp' | 'icmp' | 'dns' | 'ws' | 'grpc'
type HttpMethod    = 'GET' | 'POST' | 'PUT' | 'HEAD' | 'OPTIONS' | 'PATCH'
type AlertChannel  = 'email' | 'webhook' | 'slack' | 'pagerduty'
type AssertionType = 'status' | 'body_contains' | 'body_not_contains' | 'header' | 'response_time'
type DnsRecord     = 'A' | 'AAAA' | 'CNAME' | 'MX' | 'TXT' | 'NS'
type QuickSource   = 'manual' | 'service' | 'container'

interface KVPair    { key: string; value: string }
interface Assertion { type: AssertionType; operator: string; value: string }
interface Region    { id: string; flag: string; name: string; code: string }

// ── Demo fallbacks (used when API is offline) ──────────────
const DEMO_SERVICES: Service[] = [
  { name: 'nginx',          description: 'A high performance web server', status: 'active',   cpu_pct: 0.2, mem_bytes: 12_000_000 },
  { name: 'postgresql',     description: 'PostgreSQL RDBMS server',       status: 'active',   cpu_pct: 1.1, mem_bytes: 84_000_000 },
  { name: 'redis',          description: 'Redis in-memory data store',    status: 'active',   cpu_pct: 0.4, mem_bytes: 8_000_000  },
  { name: 'node-api',       description: 'Node.js application server',    status: 'active',   cpu_pct: 3.2, mem_bytes: 120_000_000},
  { name: 'python-worker',  description: 'Celery async task worker',      status: 'inactive', cpu_pct: 0,   mem_bytes: 0          },
  { name: 'mysql',          description: 'MySQL/MariaDB database server', status: 'active',   cpu_pct: 0.8, mem_bytes: 60_000_000 },
  { name: 'sshd',           description: 'OpenSSH server daemon',         status: 'active',   cpu_pct: 0,   mem_bytes: 3_000_000  },
]

const DEMO_CONTAINERS: Container[] = [
  { id: 'a1b2c3', name: 'nginx-proxy',    image: 'nginx:alpine',     status: 'Up 3 days',   state: 'running',  cpu_pct: 0.1, mem_bytes: 14_000_000,  mem_limit: 256_000_000 },
  { id: 'd4e5f6', name: 'api-server',     image: 'node:18-alpine',   status: 'Up 2 days',   state: 'running',  cpu_pct: 3.4, mem_bytes: 145_000_000, mem_limit: 512_000_000 },
  { id: 'g7h8i9', name: 'postgres-db',   image: 'postgres:15',      status: 'Up 5 days',   state: 'running',  cpu_pct: 1.2, mem_bytes: 96_000_000,  mem_limit: 1_024_000_000 },
  { id: 'j1k2l3', name: 'redis-cache',   image: 'redis:7-alpine',   status: 'Up 5 days',   state: 'running',  cpu_pct: 0.3, mem_bytes: 9_000_000,   mem_limit: 128_000_000 },
  { id: 'm4n5o6', name: 'mongo-db',      image: 'mongo:6',          status: 'Up 1 day',    state: 'running',  cpu_pct: 0.9, mem_bytes: 68_000_000,  mem_limit: 512_000_000 },
  { id: 'p7q8r9', name: 'python-app',    image: 'python:3.11-slim', status: 'Up 12 hours', state: 'running',  cpu_pct: 2.1, mem_bytes: 88_000_000,  mem_limit: 256_000_000 },
  { id: 's1t2u3', name: 'go-microservice',image: 'golang:1.22',     status: 'Up 4 hours',  state: 'running',  cpu_pct: 0.5, mem_bytes: 22_000_000,  mem_limit: 256_000_000 },
  { id: 'v4w5x6', name: 'mysql-legacy',  image: 'mysql:8',          status: 'Exited (0)',  state: 'exited',   cpu_pct: 0,   mem_bytes: 0,           mem_limit: 512_000_000 },
]

// ── Inference helpers ──────────────────────────────────────
interface Inferred { kind: MonitorKind; port: string; target: string; tags: string[] }

function inferFromImage(image: string, containerName: string): Inferred {
  const img = image.toLowerCase()
  if (img.includes('nginx') || img.includes('apache') || img.includes('caddy') || img.includes('traefik'))
    return { kind: 'http', port: '80', target: 'http://localhost:80', tags: ['web', 'proxy'] }
  if (img.includes('postgres'))
    return { kind: 'tcp', port: '5432', target: 'localhost', tags: ['database', 'postgres'] }
  if (img.includes('redis'))
    return { kind: 'tcp', port: '6379', target: 'localhost', tags: ['cache', 'redis'] }
  if (img.includes('mysql') || img.includes('mariadb'))
    return { kind: 'tcp', port: '3306', target: 'localhost', tags: ['database', 'mysql'] }
  if (img.includes('mongo'))
    return { kind: 'tcp', port: '27017', target: 'localhost', tags: ['database', 'mongo'] }
  if (img.includes('node') || img.includes('express') || img.includes('next'))
    return { kind: 'http', port: '3000', target: 'http://localhost:3000', tags: ['nodejs', 'api'] }
  if (img.includes('python') || img.includes('django') || img.includes('flask') || img.includes('fastapi'))
    return { kind: 'http', port: '8000', target: 'http://localhost:8000', tags: ['python', 'api'] }
  if (img.includes('golang') || img.includes('go:'))
    return { kind: 'http', port: '8080', target: 'http://localhost:8080', tags: ['go', 'api'] }
  if (img.includes('rabbitmq'))
    return { kind: 'tcp', port: '5672', target: 'localhost', tags: ['messaging', 'rabbitmq'] }
  if (img.includes('kafka'))
    return { kind: 'tcp', port: '9092', target: 'localhost', tags: ['messaging', 'kafka'] }
  if (img.includes('elasticsearch'))
    return { kind: 'http', port: '9200', target: 'http://localhost:9200', tags: ['search', 'elastic'] }
  return { kind: 'http', port: '80', target: 'http://localhost:80', tags: [containerName] }
}

function inferFromService(svcName: string): Inferred {
  const n = svcName.toLowerCase().replace('.service', '')
  if (n.includes('nginx') || n.includes('apache') || n.includes('httpd'))
    return { kind: 'http', port: '80', target: 'http://localhost:80', tags: ['web'] }
  if (n.includes('postgres'))
    return { kind: 'tcp', port: '5432', target: 'localhost', tags: ['database', 'postgres'] }
  if (n.includes('redis'))
    return { kind: 'tcp', port: '6379', target: 'localhost', tags: ['cache', 'redis'] }
  if (n.includes('mysql') || n.includes('mariadb'))
    return { kind: 'tcp', port: '3306', target: 'localhost', tags: ['database', 'mysql'] }
  if (n.includes('mongo'))
    return { kind: 'tcp', port: '27017', target: 'localhost', tags: ['database', 'mongo'] }
  if (n.includes('node') || n.includes('express') || n.includes('next') || n.includes('api'))
    return { kind: 'http', port: '3000', target: 'http://localhost:3000', tags: ['nodejs', 'api'] }
  if (n.includes('python') || n.includes('django') || n.includes('flask') || n.includes('worker') || n.includes('celery'))
    return { kind: 'http', port: '8000', target: 'http://localhost:8000', tags: ['python'] }
  if (n.includes('ssh') || n.includes('sshd'))
    return { kind: 'tcp', port: '22', target: 'localhost', tags: ['ssh', 'infra'] }
  if (n.includes('smtp') || n.includes('mail') || n.includes('postfix'))
    return { kind: 'tcp', port: '25', target: 'localhost', tags: ['mail'] }
  return { kind: 'http', port: '80', target: 'http://localhost', tags: [n] }
}

function imageIcon(image: string) {
  const img = image.toLowerCase()
  if (img.includes('nginx') || img.includes('apache') || img.includes('caddy')) return <IcoNginx />
  if (img.includes('node') || img.includes('express') || img.includes('next'))  return <IcoNodeJs />
  if (img.includes('postgres'))   return <IcoPostgres />
  if (img.includes('redis'))      return <IcoRedis />
  if (img.includes('mysql') || img.includes('mariadb')) return <IcoMysql />
  if (img.includes('mongo'))      return <IcoMongo />
  if (img.includes('python') || img.includes('django') || img.includes('flask')) return <IcoPython />
  if (img.includes('golang') || img.includes('go:'))    return <IcoGoLang />
  return <IcoDocker />
}

function serviceIcon(name: string) {
  const n = name.toLowerCase()
  if (n.includes('nginx') || n.includes('apache')) return <IcoNginx />
  if (n.includes('node') || n.includes('api'))     return <IcoNodeJs />
  if (n.includes('postgres'))  return <IcoPostgres />
  if (n.includes('redis'))     return <IcoRedis />
  if (n.includes('mysql') || n.includes('mariadb')) return <IcoMysql />
  if (n.includes('mongo'))     return <IcoMongo />
  if (n.includes('python') || n.includes('django') || n.includes('celery')) return <IcoPython />
  if (n.includes('ssh'))       return <IcoServer />
  return <IcoGeneric />
}

function imageBadgeColor(image: string): string {
  const img = image.toLowerCase()
  if (img.includes('nginx'))    return '#22c55e'
  if (img.includes('node'))     return '#68d391'
  if (img.includes('postgres')) return '#63b3ed'
  if (img.includes('redis'))    return '#fc8181'
  if (img.includes('mysql'))    return '#f6ad55'
  if (img.includes('mongo'))    return '#68d391'
  if (img.includes('python'))   return '#f6e05e'
  if (img.includes('golang') || img.includes('go:')) return '#76e4f7'
  return '#a0aec0'
}

function fmtBytes(b: number): string {
  if (!b) return '—'
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`
  if (b < 1024 * 1024 * 1024) return `${(b / 1024 / 1024).toFixed(0)} MB`
  return `${(b / 1024 / 1024 / 1024).toFixed(1)} GB`
}

// ── Constants ──────────────────────────────────────────────
const REGIONS: Region[] = [
  { id: 'us-east', flag: '🇺🇸', name: 'US East',    code: 'us-east-1'   },
  { id: 'us-west', flag: '🇺🇸', name: 'US West',    code: 'us-west-2'   },
  { id: 'eu-west', flag: '🇪🇺', name: 'EU West',    code: 'eu-west-1'   },
  { id: 'eu-cent', flag: '🇩🇪', name: 'EU Central', code: 'eu-central-1'},
  { id: 'ap-sing', flag: '🇸🇬', name: 'Singapore',  code: 'ap-south-1'  },
  { id: 'ap-tok',  flag: '🇯🇵', name: 'Tokyo',      code: 'ap-east-1'   },
  { id: 'ap-syd',  flag: '🇦🇺', name: 'Sydney',     code: 'ap-syd-1'    },
  { id: 'sa-east', flag: '🇧🇷', name: 'São Paulo',  code: 'sa-east-1'   },
  { id: 'ca-cent', flag: '🇨🇦', name: 'Canada',     code: 'ca-central-1'},
]

const INTERVALS = [
  { label: '30s', value: 30  }, { label: '1m',  value: 60   },
  { label: '2m',  value: 120 }, { label: '5m',  value: 300  },
  { label: '10m', value: 600 }, { label: '30m', value: 1800 },
  { label: '1h',  value: 3600},
]

const SLA_TARGETS  = ['99.99%', '99.9%', '99.5%', '99%', '95%', 'Custom']
const DNS_RECORDS: DnsRecord[] = ['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'NS']
const ASSERTION_TYPES: { value: AssertionType; label: string }[] = [
  { value: 'status',            label: 'Status Code'        },
  { value: 'body_contains',     label: 'Body Contains'      },
  { value: 'body_not_contains', label: 'Body Not Contains'  },
  { value: 'header',            label: 'Header'             },
  { value: 'response_time',     label: 'Response Time'      },
]

const KIND_OPTS: { id: MonitorKind; label: string; icon: () => JSX.Element }[] = [
  { id: 'http', label: 'HTTP(S)',   icon: IcoHttp  },
  { id: 'tcp',  label: 'TCP',      icon: IcoTcp   },
  { id: 'icmp', label: 'ICMP',     icon: IcoPing  },
  { id: 'dns',  label: 'DNS',      icon: IcoDns   },
  { id: 'ws',   label: 'WebSocket',icon: IcoWs    },
  { id: 'grpc', label: 'gRPC',     icon: IcoGrpc  },
]

// ── Main component ─────────────────────────────────────────
interface Props { open: boolean; onClose: () => void }

export function MonitorForm({ open, onClose }: Props) {
  const qc = useQueryClient()

  // Tabs: 0=General 1=HTTP 2=Behavior 3=Alerting
  const [tab, setTab] = useState(0)

  // Quick source
  const [quickSource, setQuickSource] = useState<QuickSource>('manual')
  const [svcSearch,   setSvcSearch]   = useState('')
  const [ctnSearch,   setCtnSearch]   = useState('')
  const [autofilled,  setAutofilled]  = useState(false)

  // Tab 0: General
  const [name,     setName]     = useState('')
  const [kind,     setKind]     = useState<MonitorKind>('http')
  const [target,   setTarget]   = useState('')
  const [tags,     setTags]     = useState<string[]>([])
  const [tagInput, setTagInput] = useState('')
  const [notes,    setNotes]    = useState('')

  // HTTP specifics
  const [method,          setMethod]         = useState<HttpMethod>('GET')
  const [reqHeaders,      setReqHeaders]     = useState<KVPair[]>([{ key: '', value: '' }])
  const [reqBody,         setReqBody]        = useState('')
  const [assertions,      setAssertions]     = useState<Assertion[]>([{ type: 'status', operator: 'equals', value: '200' }])
  const [followRedirects, setFollowRedirects]= useState(true)
  const [verifySSL,       setVerifySSL]      = useState(true)
  const [sslExpiryDays,   setSslExpiryDays]  = useState('30')
  const [basicAuthUser,   setBasicAuthUser]  = useState('')
  const [basicAuthPass,   setBasicAuthPass]  = useState('')
  const [bearerToken,     setBearerToken]    = useState('')

  // TCP / DNS specific
  const [tcpPort,     setTcpPort]    = useState('')
  const [dnsRecord,   setDnsRecord]  = useState<DnsRecord>('A')
  const [dnsExpected, setDnsExpected]= useState('')
  const [dnsServer,   setDnsServer]  = useState('')

  // Tab 2: Behavior
  const [interval,          setInterval]         = useState(60)
  const [timeout,           setTimeout_]         = useState('10000')
  const [retries,           setRetries]          = useState('2')
  const [regions,           setRegions]          = useState<string[]>(['us-east', 'eu-west'])
  const [maintenanceWindow, setMaintenanceWindow]= useState(false)
  const [mwStart,           setMwStart]          = useState('02:00')
  const [mwEnd,             setMwEnd]            = useState('04:00')
  const [mwDays,            setMwDays]           = useState<string[]>(['sat', 'sun'])

  // Tab 3: Alerting
  const [alertChannels, setAlertChannels] = useState<AlertChannel[]>(['email'])
  const [webhookUrl,    setWebhookUrl]    = useState('')
  const [alertAfter,    setAlertAfter]    = useState('1')
  const [recoveryAlert, setRecoveryAlert] = useState(true)
  const [slaTarget,     setSlaTarget]     = useState('99.9%')
  const [customSla,     setCustomSla]     = useState('')
  const [escalateAfter, setEscalateAfter] = useState('5')

  const [err, setErr] = useState<string | null>(null)
  const tagRef = useRef<HTMLInputElement>(null)

  // ── Server data queries ──
  const { data: apiServices,   isLoading: svcLoading,   refetch: refetchSvc } =
    useQuery({ queryKey: ['services'],   queryFn: fetchServices,   retry: 1, enabled: open && quickSource === 'service'   })
  const { data: apiContainers, isLoading: ctnLoading,   refetch: refetchCtn } =
    useQuery({ queryKey: ['containers'], queryFn: fetchContainers, retry: 1, enabled: open && quickSource === 'container' })

  const services:   Service[]   = apiServices   ?? DEMO_SERVICES
  const containers: Container[] = apiContainers ?? DEMO_CONTAINERS

  // ── Mutation ──
  const mutation = useMutation({
    mutationFn: () => createUptimeMonitor({
      name:       name.trim(),
      kind:       kind === 'ws' || kind === 'grpc' || kind === 'dns' ? 'http' : kind,
      target:     kind === 'tcp' ? `${target}:${tcpPort}` : target.trim(),
      interval_s: interval,
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['uptime-monitors'] }); handleClose() },
    onError:   (e: Error) => setErr(e.message),
  })

  const handleClose = () => {
    setTab(0); setName(''); setTarget(''); setTags([]); setTagInput('')
    setNotes(''); setErr(null); setMethod('GET')
    setReqHeaders([{ key: '', value: '' }])
    setAssertions([{ type: 'status', operator: 'equals', value: '200' }])
    setFollowRedirects(true); setVerifySSL(true); setInterval(60)
    setTimeout_('10000'); setRetries('2'); setRegions(['us-east', 'eu-west'])
    setAlertChannels(['email']); setWebhookUrl(''); setRecoveryAlert(true)
    setSlaTarget('99.9%'); setQuickSource('manual'); setAutofilled(false)
    onClose()
  }

  const handleSubmit = () => {
    setErr(null)
    if (!name.trim())              { setErr('Monitor name is required');      setTab(0); return }
    if (!target.trim())            { setErr('Target URL / host is required'); setTab(0); return }
    if (kind === 'tcp' && !tcpPort){ setErr('TCP port is required');          setTab(0); return }
    mutation.mutate()
  }

  // ── Autofill from service ──
  const applyService = (svc: Service) => {
    const inf = inferFromService(svc.name)
    setName(`${svc.name} monitor`)
    setKind(inf.kind)
    setTarget(kind === 'tcp' ? inf.target : inf.target)
    if (inf.kind === 'tcp') setTcpPort(inf.port)
    setTags(inf.tags)
    setAutofilled(true)
    setQuickSource('manual')
  }

  // ── Autofill from container ──
  const applyContainer = (ctn: Container) => {
    const inf = inferFromImage(ctn.image, ctn.name)
    setName(`${ctn.name}`)
    setKind(inf.kind)
    setTarget(inf.target)
    if (inf.kind === 'tcp') setTcpPort(inf.port)
    setTags(inf.tags)
    setAutofilled(true)
    setQuickSource('manual')
  }

  // ── Tag helpers ──
  const addTag = (raw: string) => {
    const t = raw.trim().replace(/,/g, '')
    if (t && !tags.includes(t)) setTags(p => [...p, t])
    setTagInput('')
  }
  const handleTagKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag(tagInput) }
    if (e.key === 'Backspace' && !tagInput && tags.length) setTags(p => p.slice(0, -1))
  }

  // ── KV list helpers ──
  const addKv    = (list: KVPair[], set: (v: KVPair[]) => void) => set([...list, { key: '', value: '' }])
  const removeKv = (list: KVPair[], set: (v: KVPair[]) => void, i: number) => set(list.filter((_, j) => j !== i))
  const updateKv = (list: KVPair[], set: (v: KVPair[]) => void, i: number, field: 'key' | 'value', val: string) => {
    const n = [...list]; n[i] = { ...n[i], [field]: val }; set(n)
  }

  // ── Assertion helpers ──
  const addAssertion    = () => setAssertions(p => [...p, { type: 'status', operator: 'equals', value: '' }])
  const removeAssertion = (i: number) => setAssertions(p => p.filter((_, j) => j !== i))
  const updateAssertion = (i: number, field: keyof Assertion, val: string) =>
    setAssertions(p => { const n = [...p]; n[i] = { ...n[i], [field]: val }; return n })

  const toggleRegion  = (id: string) => setRegions(p => p.includes(id) ? p.filter(r => r !== id) : [...p, id])
  const toggleChannel = (ch: AlertChannel) => setAlertChannels(p => p.includes(ch) ? p.filter(c => c !== ch) : [...p, ch])
  const toggleMwDay   = (d: string) => setMwDays(p => p.includes(d) ? p.filter(x => x !== d) : [...p, d])
  const tabDone = (i: number) => {
    if (i === 0) return !!name.trim() && !!target.trim()
    if (i === 2) return regions.length > 0
    return false
  }

  const TABS = [
    { label: 'General',  icon: IcoHttp },
    { label: 'HTTP',     icon: IcoGear },
    { label: 'Behavior', icon: IcoPing },
    { label: 'Alerting', icon: IcoSla  },
  ]
  const MWDAYS = ['mon','tue','wed','thu','fri','sat','sun']

  // ── Filtered lists ──
  const filteredSvc = services.filter(s =>
    s.name.toLowerCase().includes(svcSearch.toLowerCase()) ||
    s.description.toLowerCase().includes(svcSearch.toLowerCase())
  )
  const filteredCtn = containers.filter(c =>
    c.name.toLowerCase().includes(ctnSearch.toLowerCase()) ||
    c.image.toLowerCase().includes(ctnSearch.toLowerCase())
  )

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Add Monitor"
      subtitle="Configure a new uptime / health-check monitor"
      size="xl"
      footer={
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
          <div className={styles.footerLeft}>
            <div className={styles.stepDots}>
              {TABS.map((_, i) => (
                <div
                  key={i}
                  className={`${styles.stepDot} ${tab === i ? styles.stepDotActive : ''} ${(tabDone(i) && tab !== i) ? styles.stepDotDone : ''}`}
                  onClick={() => setTab(i)}
                  style={{ cursor: 'pointer' }}
                />
              ))}
            </div>
            <span className={styles.stepLabel}>Step {tab + 1} of {TABS.length}</span>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {tab > 0 && <button className="btn btn-ghost" onClick={() => setTab(t => t - 1)}>Back</button>}
            <button className="btn btn-ghost" onClick={handleClose}>Cancel</button>
            {tab < TABS.length - 1
              ? <button className="btn btn-primary" onClick={() => setTab(t => t + 1)}>Next</button>
              : <button className="btn btn-primary" onClick={handleSubmit} disabled={mutation.isPending}>
                  {mutation.isPending && <Spinner size="sm" />} Create Monitor
                </button>
            }
          </div>
        </div>
      }
    >
      <div>
        {/* ── Tab bar ── */}
        <div className={styles.tabs}>
          {TABS.map((t, i) => (
            <div
              key={i}
              className={`${styles.tab} ${tab === i ? styles.tabActive : ''} ${(tabDone(i) && tab !== i) ? styles.tabDone : ''}`}
              onClick={() => setTab(i)}
            >
              <span className={styles.tabIcon}><t.icon /></span>
              {t.label}
            </div>
          ))}
        </div>

        {err && (
          <div className={styles.errBanner} style={{ marginBottom: 16 }}>
            <IcoWarn /> {err}
          </div>
        )}

        {/* ═══════════════ TAB 0: GENERAL ═══════════════ */}
        {tab === 0 && (
          <div className={styles.section}>

            {/* ── Quick Source picker ── */}
            <div className={styles.sectionLabel}>Quick Select Source</div>
            <div className={styles.quickSourceBar}>
              {([
                { id: 'manual',    label: 'Manual Entry',        icon: IcoEdit    },
                { id: 'service',   label: 'App / Service',       icon: IcoServer  },
                { id: 'container', label: 'Docker Container',    icon: IcoDocker  },
              ] as { id: QuickSource; label: string; icon: () => JSX.Element }[]).map(opt => (
                <div
                  key={opt.id}
                  className={`${styles.quickSourceCard} ${quickSource === opt.id ? styles.quickSourceCardActive : ''}`}
                  onClick={() => { setQuickSource(opt.id); setAutofilled(false) }}
                >
                  <span className={styles.quickSourceIcon}><opt.icon /></span>
                  <span className={styles.quickSourceLabel}>{opt.label}</span>
                </div>
              ))}
            </div>

            {/* ── Autofill notice ── */}
            {autofilled && (
              <div className={styles.autofillBanner}>
                <IcoCheck />
                Fields have been pre-filled from your server. Review and adjust before saving.
                <button className={styles.autofillDismiss} onClick={() => setAutofilled(false)}><IcoX /></button>
              </div>
            )}

            {/* ── Service browser ── */}
            {quickSource === 'service' && (
              <div className={styles.serverBrowser}>
                <div className={styles.browserHeader}>
                  <div className={styles.browserTitle}>
                    <IcoServer />
                    Running Services
                    {!apiServices && <span className={styles.demoPill}>Demo</span>}
                  </div>
                  <button className={styles.btnRefresh} onClick={() => refetchSvc()} title="Refresh">
                    <IcoRefresh />
                  </button>
                </div>
                <div className={styles.browserSearch}>
                  <IcoSearch />
                  <input
                    className={styles.browserSearchInput}
                    placeholder="Filter services…"
                    value={svcSearch}
                    onChange={e => setSvcSearch(e.target.value)}
                    autoFocus
                  />
                </div>
                <div className={styles.browserList}>
                  {svcLoading
                    ? Array.from({ length: 4 }).map((_, i) => <div key={i} className={styles.browserSkeleton} />)
                    : filteredSvc.length === 0
                      ? <div className={styles.browserEmpty}>No services match your filter</div>
                      : filteredSvc.map(svc => {
                          const inf = inferFromService(svc.name)
                          const isUp = svc.status === 'active'
                          return (
                            <div key={svc.name} className={`${styles.browserItem} ${!isUp ? styles.browserItemDown : ''}`} onClick={() => applyService(svc)}>
                              <div className={styles.browserItemIcon} style={{ color: isUp ? '#22c55e' : '#6b7280' }}>
                                {serviceIcon(svc.name)}
                              </div>
                              <div className={styles.browserItemBody}>
                                <div className={styles.browserItemName}>{svc.name}</div>
                                <div className={styles.browserItemMeta}>{svc.description}</div>
                              </div>
                              <div className={styles.browserItemStats}>
                                <span className={`${styles.browserItemStatus} ${isUp ? styles.statusUp : styles.statusDown}`}>
                                  <span className={`${styles.statusDot} ${isUp ? styles.statusDotUp : styles.statusDotDown}`}/>
                                  {svc.status}
                                </span>
                                {svc.mem_bytes > 0 && <span className={styles.browserItemMem}>{fmtBytes(svc.mem_bytes)}</span>}
                                <span className={styles.browserItemPort}>{inf.port}/{inf.kind.toUpperCase()}</span>
                              </div>
                              <div className={styles.browserItemArrow}>
                                <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="12" height="12"><polyline points="8,4 14,10 8,16"/></svg>
                              </div>
                            </div>
                          )
                        })
                  }
                </div>
              </div>
            )}

            {/* ── Container browser ── */}
            {quickSource === 'container' && (
              <div className={styles.serverBrowser}>
                <div className={styles.browserHeader}>
                  <div className={styles.browserTitle}>
                    <IcoDocker />
                    Docker Containers
                    {!apiContainers && <span className={styles.demoPill}>Demo</span>}
                  </div>
                  <button className={styles.btnRefresh} onClick={() => refetchCtn()} title="Refresh">
                    <IcoRefresh />
                  </button>
                </div>
                <div className={styles.browserSearch}>
                  <IcoSearch />
                  <input
                    className={styles.browserSearchInput}
                    placeholder="Filter by name or image…"
                    value={ctnSearch}
                    onChange={e => setCtnSearch(e.target.value)}
                    autoFocus
                  />
                </div>
                <div className={styles.browserList}>
                  {ctnLoading
                    ? Array.from({ length: 4 }).map((_, i) => <div key={i} className={styles.browserSkeleton} />)
                    : filteredCtn.length === 0
                      ? <div className={styles.browserEmpty}>No containers match your filter</div>
                      : filteredCtn.map(ctn => {
                          const inf   = inferFromImage(ctn.image, ctn.name)
                          const isRun = ctn.state === 'running'
                          const memPct = ctn.mem_limit > 0 ? Math.round(ctn.mem_bytes / ctn.mem_limit * 100) : 0
                          return (
                            <div key={ctn.id} className={`${styles.browserItem} ${!isRun ? styles.browserItemDown : ''}`} onClick={() => applyContainer(ctn)}>
                              <div className={styles.browserItemIcon} style={{ color: imageBadgeColor(ctn.image) }}>
                                {imageIcon(ctn.image)}
                              </div>
                              <div className={styles.browserItemBody}>
                                <div className={styles.browserItemName}>{ctn.name}</div>
                                <div className={styles.browserItemMeta}>
                                  <span className={styles.imageTag}>{ctn.image}</span>
                                </div>
                              </div>
                              <div className={styles.browserItemStats}>
                                <span className={`${styles.browserItemStatus} ${isRun ? styles.statusUp : styles.statusDown}`}>
                                  <span className={`${styles.statusDot} ${isRun ? styles.statusDotUp : styles.statusDotDown}`}/>
                                  {ctn.state}
                                </span>
                                {isRun && <span className={styles.browserItemMem}>{ctn.cpu_pct.toFixed(1)}% CPU</span>}
                                {isRun && ctn.mem_limit > 0 && (
                                  <div className={styles.memBar}>
                                    <div className={styles.memBarFill} style={{ width: `${memPct}%`, background: memPct > 80 ? '#ef4444' : memPct > 60 ? '#f59e0b' : '#22c55e' }}/>
                                  </div>
                                )}
                                <span className={styles.browserItemPort}>{inf.port}/{inf.kind.toUpperCase()}</span>
                              </div>
                              <div className={styles.browserItemArrow}>
                                <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="12" height="12"><polyline points="8,4 14,10 8,16"/></svg>
                              </div>
                            </div>
                          )
                        })
                  }
                </div>
              </div>
            )}

            {/* ── Monitor type ── */}
            <div className={styles.sectionLabel}>Monitor Type</div>
            <div className={styles.typeGrid}>
              {KIND_OPTS.map(opt => (
                <div
                  key={opt.id}
                  className={`${styles.typeCard} ${kind === opt.id ? styles.typeCardActive : ''}`}
                  onClick={() => setKind(opt.id)}
                >
                  <div className={styles.typeCardIcon}><opt.icon /></div>
                  <span className={styles.typeCardLabel}>{opt.label}</span>
                </div>
              ))}
            </div>

            {/* ── Identity ── */}
            <div className={styles.sectionLabel}>Identity</div>

            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel}>Monitor Name *</label>
              <input
                className={styles.fieldInput}
                placeholder="e.g. Production API — /healthz"
                value={name}
                onChange={e => setName(e.target.value)}
              />
            </div>

            {/* Target — adapts per kind */}
            {(kind === 'http' || kind === 'ws') && (
              <div className={styles.fieldGroup}>
                <label className={styles.fieldLabel}>{kind === 'ws' ? 'WebSocket URL *' : 'URL *'}</label>
                <input className={styles.fieldInput} placeholder={kind === 'ws' ? 'wss://api.example.com/ws' : 'https://api.example.com/health'} value={target} onChange={e => setTarget(e.target.value)} />
                <span className={styles.fieldHint}>Full URL including protocol. Query strings are allowed.</span>
              </div>
            )}
            {kind === 'tcp' && (
              <div className={`${styles.row} ${styles.row2}`}>
                <div className={styles.fieldGroup}>
                  <label className={styles.fieldLabel}>Host *</label>
                  <input className={styles.fieldInput} placeholder="db.example.com or 10.0.0.1" value={target} onChange={e => setTarget(e.target.value)} />
                </div>
                <div className={styles.fieldGroup}>
                  <label className={styles.fieldLabel}>Port *</label>
                  <input className={styles.fieldInput} type="number" placeholder="5432" min={1} max={65535} value={tcpPort} onChange={e => setTcpPort(e.target.value)} />
                </div>
              </div>
            )}
            {kind === 'icmp' && (
              <div className={styles.fieldGroup}>
                <label className={styles.fieldLabel}>Hostname / IP *</label>
                <input className={styles.fieldInput} placeholder="10.0.0.1 or server.example.com" value={target} onChange={e => setTarget(e.target.value)} />
              </div>
            )}
            {kind === 'dns' && (
              <>
                <div className={`${styles.row} ${styles.row3}`}>
                  <div className={styles.fieldGroup}>
                    <label className={styles.fieldLabel}>Domain *</label>
                    <input className={styles.fieldInput} placeholder="example.com" value={target} onChange={e => setTarget(e.target.value)} />
                  </div>
                  <div className={styles.fieldGroup}>
                    <label className={styles.fieldLabel}>Record Type</label>
                    <select className={styles.fieldSelect} value={dnsRecord} onChange={e => setDnsRecord(e.target.value as DnsRecord)}>
                      {DNS_RECORDS.map(r => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </div>
                  <div className={styles.fieldGroup}>
                    <label className={styles.fieldLabel}>DNS Server</label>
                    <input className={styles.fieldInput} placeholder="8.8.8.8 (default)" value={dnsServer} onChange={e => setDnsServer(e.target.value)} />
                  </div>
                </div>
                <div className={styles.fieldGroup}>
                  <label className={styles.fieldLabel}>Expected Value</label>
                  <input className={styles.fieldInput} placeholder="Leave blank to just verify resolution" value={dnsExpected} onChange={e => setDnsExpected(e.target.value)} />
                </div>
              </>
            )}
            {kind === 'grpc' && (
              <div className={`${styles.row} ${styles.row2}`}>
                <div className={styles.fieldGroup}>
                  <label className={styles.fieldLabel}>gRPC Host *</label>
                  <input className={styles.fieldInput} placeholder="grpc.example.com:50051" value={target} onChange={e => setTarget(e.target.value)} />
                </div>
                <div className={styles.fieldGroup}>
                  <label className={styles.fieldLabel}>Service Name</label>
                  <input className={styles.fieldInput} placeholder="grpc.health.v1.Health" defaultValue="" />
                </div>
              </div>
            )}

            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel}>Tags</label>
              <div className={styles.tagsWrap} onClick={() => tagRef.current?.focus()}>
                {tags.map(t => (
                  <span key={t} className={styles.tagChip}>
                    {t}
                    <span className={styles.tagChipRemove} onClick={e => { e.stopPropagation(); setTags(p => p.filter(x => x !== t)) }}>×</span>
                  </span>
                ))}
                <input ref={tagRef} className={styles.tagInput} placeholder={tags.length ? '' : 'Add tags — Enter or comma'} value={tagInput} onChange={e => setTagInput(e.target.value)} onKeyDown={handleTagKey} onBlur={() => tagInput && addTag(tagInput)} />
              </div>
              <span className={styles.fieldHint}>e.g. production, api, billing — used for filtering and alert routing.</span>
            </div>

            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel}>Notes</label>
              <textarea className={styles.fieldTextarea} placeholder="Optional — runbook URL, on-call contacts, expected behavior…" value={notes} onChange={e => setNotes(e.target.value)} rows={2} />
            </div>
          </div>
        )}

        {/* ═══════════════ TAB 1: HTTP ═══════════════ */}
        {tab === 1 && (
          <div className={styles.section}>
            <div className={styles.sectionLabel}>Request</div>
            <div className={`${styles.row} ${styles.row2}`}>
              <div className={styles.fieldGroup}>
                <label className={styles.fieldLabel}>HTTP Method</label>
                <select className={styles.fieldSelect} value={method} onChange={e => setMethod(e.target.value as HttpMethod)} disabled={kind !== 'http'}>
                  {(['GET','POST','PUT','HEAD','OPTIONS','PATCH'] as HttpMethod[]).map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
              <div className={styles.fieldGroup}>
                <label className={styles.fieldLabel}>Bearer Token</label>
                <input className={styles.fieldInput} type="password" placeholder="Token for Authorization header" value={bearerToken} onChange={e => setBearerToken(e.target.value)} disabled={kind !== 'http'} />
              </div>
            </div>
            <div className={`${styles.row} ${styles.row2}`}>
              <div className={styles.fieldGroup}>
                <label className={styles.fieldLabel}>Basic Auth — Username</label>
                <input className={styles.fieldInput} placeholder="username" value={basicAuthUser} onChange={e => setBasicAuthUser(e.target.value)} disabled={kind !== 'http'} />
              </div>
              <div className={styles.fieldGroup}>
                <label className={styles.fieldLabel}>Basic Auth — Password</label>
                <input className={styles.fieldInput} type="password" placeholder="password" value={basicAuthPass} onChange={e => setBasicAuthPass(e.target.value)} disabled={kind !== 'http'} />
              </div>
            </div>

            <div className={styles.sectionLabel}>Request Headers</div>
            <div className={styles.kvList}>
              {reqHeaders.map((kv, i) => (
                <div key={i} className={styles.kvRow}>
                  <input className={styles.fieldInput} placeholder="Header name" value={kv.key}   onChange={e => updateKv(reqHeaders, setReqHeaders, i, 'key',   e.target.value)} disabled={kind !== 'http'} />
                  <input className={styles.fieldInput} placeholder="Value"       value={kv.value} onChange={e => updateKv(reqHeaders, setReqHeaders, i, 'value', e.target.value)} disabled={kind !== 'http'} />
                  <button className={styles.btnRemove} onClick={() => removeKv(reqHeaders, setReqHeaders, i)} disabled={reqHeaders.length === 1}><IcoX /></button>
                </div>
              ))}
              <button className={styles.btnAdd} onClick={() => addKv(reqHeaders, setReqHeaders)} disabled={kind !== 'http'}><IcoPlus /> Add Header</button>
            </div>

            {(method === 'POST' || method === 'PUT' || method === 'PATCH') && (
              <>
                <div className={styles.sectionLabel}>Request Body</div>
                <textarea className={styles.fieldTextarea} placeholder={'{\n  "key": "value"\n}'} value={reqBody} onChange={e => setReqBody(e.target.value)} rows={5} disabled={kind !== 'http'} />
              </>
            )}

            <div className={styles.sectionLabel}>Response Assertions</div>
            <div className={styles.kvList}>
              {assertions.map((a, i) => (
                <div key={i} className={`${styles.kvRow} ${styles.kvRowWide}`}>
                  <select className={styles.fieldSelect} value={a.type} onChange={e => updateAssertion(i, 'type', e.target.value)} disabled={kind !== 'http'}>
                    {ASSERTION_TYPES.map(at => <option key={at.value} value={at.value}>{at.label}</option>)}
                  </select>
                  <select className={styles.fieldSelect} value={a.operator} onChange={e => updateAssertion(i, 'operator', e.target.value)} disabled={kind !== 'http'}>
                    {a.type === 'response_time'
                      ? ['less_than','greater_than'].map(o => <option key={o} value={o}>{o === 'less_than' ? '< (ms)' : '> (ms)'}</option>)
                      : ['equals','not_equals','contains','not_contains','starts_with','ends_with'].map(o => <option key={o} value={o}>{o.replace(/_/g,' ')}</option>)
                    }
                  </select>
                  <input className={styles.fieldInput} placeholder="Expected value" value={a.value} onChange={e => updateAssertion(i, 'value', e.target.value)} disabled={kind !== 'http'} />
                  <button className={styles.btnRemove} onClick={() => removeAssertion(i)}><IcoX /></button>
                </div>
              ))}
              <button className={styles.btnAdd} onClick={addAssertion} disabled={kind !== 'http'}><IcoPlus /> Add Assertion</button>
            </div>

            <div className={styles.sectionLabel}>TLS / Redirects</div>
            <div className={styles.toggleRow}>
              <div className={styles.toggleRowInfo}><span className={styles.toggleRowLabel}>Verify SSL Certificate</span><span className={styles.toggleRowDesc}>Fail the check if the certificate is invalid or expired</span></div>
              <label className={styles.toggle}><input type="checkbox" checked={verifySSL} onChange={e => setVerifySSL(e.target.checked)} disabled={kind !== 'http'} /><div className={styles.toggleTrack}/><div className={styles.toggleThumb}/></label>
            </div>
            <div className={styles.toggleRow}>
              <div className={styles.toggleRowInfo}><span className={styles.toggleRowLabel}>Follow Redirects</span><span className={styles.toggleRowDesc}>Automatically follow 3xx responses up to 10 hops</span></div>
              <label className={styles.toggle}><input type="checkbox" checked={followRedirects} onChange={e => setFollowRedirects(e.target.checked)} disabled={kind !== 'http'} /><div className={styles.toggleTrack}/><div className={styles.toggleThumb}/></label>
            </div>
            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel}>Alert if SSL cert expires within (days)</label>
              <div className={styles.inputSuffix}>
                <input className={styles.fieldInput} type="number" min={1} max={90} value={sslExpiryDays} onChange={e => setSslExpiryDays(e.target.value)} disabled={!verifySSL || kind !== 'http'} />
                <span className={styles.inputSuffixLabel}>days</span>
              </div>
            </div>
            {kind !== 'http' && (
              <div className={styles.errBanner} style={{ background: 'rgba(74,158,255,0.07)', border: '1px solid rgba(74,158,255,0.2)', color: 'var(--color-accent)' }}>
                <IcoWarn /> HTTP-specific settings only apply when monitor type is HTTP(S).
              </div>
            )}
          </div>
        )}

        {/* ═══════════════ TAB 2: BEHAVIOR ═══════════════ */}
        {tab === 2 && (
          <div className={styles.section}>
            <div className={styles.sectionLabel}>Check Interval</div>
            <div className={styles.intervalPills}>
              {INTERVALS.map(iv => (
                <div key={iv.value} className={`${styles.intervalPill} ${interval === iv.value ? styles.intervalPillActive : ''}`} onClick={() => setInterval(iv.value)}>{iv.label}</div>
              ))}
            </div>

            <div className={`${styles.row} ${styles.row3}`}>
              <div className={styles.fieldGroup}>
                <label className={styles.fieldLabel}>Timeout</label>
                <div className={styles.inputSuffix}><input className={styles.fieldInput} type="number" min={1000} max={60000} step={1000} value={timeout} onChange={e => setTimeout_(e.target.value)} /><span className={styles.inputSuffixLabel}>ms</span></div>
              </div>
              <div className={styles.fieldGroup}>
                <label className={styles.fieldLabel}>Retries before DOWN</label>
                <select className={styles.fieldSelect} value={retries} onChange={e => setRetries(e.target.value)}>
                  {['0','1','2','3','5'].map(v => <option key={v} value={v}>{v === '0' ? '0 — immediate' : v}</option>)}
                </select>
              </div>
              <div className={styles.fieldGroup}>
                <label className={styles.fieldLabel}>Max Latency Alert</label>
                <div className={styles.inputSuffix}><input className={styles.fieldInput} type="number" defaultValue={2000} min={100} max={30000} step={100} /><span className={styles.inputSuffixLabel}>ms</span></div>
              </div>
            </div>

            <div className={styles.sectionLabel}>Probe Regions</div>
            <div className={styles.regionsGrid}>
              {REGIONS.map(r => (
                <div key={r.id} className={`${styles.regionCard} ${regions.includes(r.id) ? styles.regionCardActive : ''}`} onClick={() => toggleRegion(r.id)}>
                  <span className={styles.regionFlag}>{r.flag}</span>
                  <div className={styles.regionInfo}><span className={styles.regionName}>{r.name}</span><span className={styles.regionCode}>{r.code}</span></div>
                  <div className={styles.regionCheck}>{regions.includes(r.id) && <IcoCheck />}</div>
                </div>
              ))}
            </div>

            <div className={styles.sectionLabel}>Maintenance Window</div>
            <div className={styles.toggleRow}>
              <div className={styles.toggleRowInfo}><span className={styles.toggleRowLabel}>Enable Maintenance Window</span><span className={styles.toggleRowDesc}>Suppress alerts and pause SLA tracking during scheduled windows</span></div>
              <label className={styles.toggle}><input type="checkbox" checked={maintenanceWindow} onChange={e => setMaintenanceWindow(e.target.checked)} /><div className={styles.toggleTrack}/><div className={styles.toggleThumb}/></label>
            </div>
            {maintenanceWindow && (
              <>
                <div className={`${styles.row} ${styles.row2}`}>
                  <div className={styles.fieldGroup}><label className={styles.fieldLabel}>Window Start (UTC)</label><input className={styles.fieldInput} type="time" value={mwStart} onChange={e => setMwStart(e.target.value)} /></div>
                  <div className={styles.fieldGroup}><label className={styles.fieldLabel}>Window End (UTC)</label><input className={styles.fieldInput} type="time" value={mwEnd} onChange={e => setMwEnd(e.target.value)} /></div>
                </div>
                <div className={styles.fieldGroup}>
                  <label className={styles.fieldLabel}>Repeat on days</label>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {MWDAYS.map(d => (
                      <div key={d} onClick={() => toggleMwDay(d)} style={{ padding: '5px 10px', borderRadius: 6, cursor: 'pointer', userSelect: 'none', fontSize: 11, fontWeight: 600, textTransform: 'capitalize', border: `1.5px solid ${mwDays.includes(d) ? 'var(--color-accent)' : 'var(--color-border)'}`, background: mwDays.includes(d) ? 'rgba(74,158,255,0.1)' : 'var(--color-surface-raised)', color: mwDays.includes(d) ? 'var(--color-accent)' : 'var(--color-text-muted)' }}>{d}</div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* ═══════════════ TAB 3: ALERTING ═══════════════ */}
        {tab === 3 && (
          <div className={styles.section}>
            <div className={styles.sectionLabel}>Alert Channels</div>
            <div className={styles.alertChannels}>
              {([
                { id: 'email',     label: 'Email',      Icon: IcoEmail, color: '#4a9eff', bg: 'rgba(74,158,255,0.12)'   },
                { id: 'webhook',   label: 'Webhook',    Icon: IcoHook,  color: '#a78bfa', bg: 'rgba(167,139,250,0.12)'  },
                { id: 'slack',     label: 'Slack',      Icon: IcoSlack, color: '#4ade80', bg: 'rgba(74,222,128,0.12)'   },
                { id: 'pagerduty', label: 'PagerDuty',  Icon: IcoPD,    color: '#fb923c', bg: 'rgba(251,146,60,0.12)'   },
              ] as { id: AlertChannel; label: string; Icon: () => JSX.Element; color: string; bg: string }[]).map(ch => (
                <div key={ch.id} className={`${styles.alertChannel} ${alertChannels.includes(ch.id) ? styles.alertChannelActive : ''}`} onClick={() => toggleChannel(ch.id)}>
                  <div className={styles.alertChannelIcon} style={{ background: ch.bg, color: ch.color }}><ch.Icon /></div>
                  <span className={styles.alertChannelName}>{ch.label}</span>
                </div>
              ))}
            </div>

            {alertChannels.includes('webhook') && (
              <div className={styles.fieldGroup}>
                <label className={styles.fieldLabel}>Webhook URL</label>
                <input className={styles.fieldInput} placeholder="https://hooks.example.com/notify" value={webhookUrl} onChange={e => setWebhookUrl(e.target.value)} />
                <span className={styles.fieldHint}>POST with JSON payload: event, monitor, status, latency, timestamp.</span>
              </div>
            )}

            <div className={`${styles.row} ${styles.row2}`}>
              <div className={styles.fieldGroup}>
                <label className={styles.fieldLabel}>Alert after N failures</label>
                <select className={styles.fieldSelect} value={alertAfter} onChange={e => setAlertAfter(e.target.value)}>
                  {['1','2','3','5','10'].map(v => <option key={v} value={v}>{v === '1' ? '1 — first failure' : `${v} consecutive`}</option>)}
                </select>
              </div>
              <div className={styles.fieldGroup}>
                <label className={styles.fieldLabel}>Escalate after (minutes)</label>
                <select className={styles.fieldSelect} value={escalateAfter} onChange={e => setEscalateAfter(e.target.value)}>
                  {['5','10','15','30','60'].map(v => <option key={v} value={v}>{v}m unresolved</option>)}
                </select>
              </div>
            </div>

            <div className={styles.toggleRow}>
              <div className={styles.toggleRowInfo}><span className={styles.toggleRowLabel}>Recovery Notification</span><span className={styles.toggleRowDesc}>Send alert when monitor returns to UP after an incident</span></div>
              <label className={styles.toggle}><input type="checkbox" checked={recoveryAlert} onChange={e => setRecoveryAlert(e.target.checked)} /><div className={styles.toggleTrack}/><div className={styles.toggleThumb}/></label>
            </div>

            <div className={styles.sectionLabel}>SLA Target</div>
            <div className={styles.slaPills}>
              {SLA_TARGETS.map(s => (
                <div key={s} className={`${styles.slaPill} ${slaTarget === s ? styles.slaPillActive : ''}`} onClick={() => setSlaTarget(s)}>{s}</div>
              ))}
            </div>
            {slaTarget === 'Custom' && (
              <div className={styles.fieldGroup} style={{ marginTop: 8 }}>
                <label className={styles.fieldLabel}>Custom SLA %</label>
                <div className={styles.inputSuffix}>
                  <input className={styles.fieldInput} type="number" min={0} max={100} step={0.01} placeholder="99.95" value={customSla} onChange={e => setCustomSla(e.target.value)} />
                  <span className={styles.inputSuffixLabel}>%</span>
                </div>
                <span className={styles.fieldHint}>{customSla ? `Allowed downtime: ${((100 - parseFloat(customSla || '0')) / 100 * 30 * 24 * 60).toFixed(1)} min/month` : 'Enter a value to see allowed downtime per month'}</span>
              </div>
            )}
            {slaTarget !== 'Custom' && slaTarget && (
              <div style={{ fontSize: 11, color: 'var(--color-text-dim)', marginTop: 4 }}>
                {(() => { const pct = parseFloat(slaTarget); const mins = ((100 - pct) / 100 * 30 * 24 * 60).toFixed(1); return `Allowed downtime at ${slaTarget}: ${mins} min/month · ${(parseFloat(mins) / 60).toFixed(2)}h/month` })()}
              </div>
            )}

            <div className={styles.sectionLabel}>Status Page</div>
            <div className={styles.toggleRow}>
              <div className={styles.toggleRowInfo}><span className={styles.toggleRowLabel}>Include in Public Status Page</span><span className={styles.toggleRowDesc}>Show this monitor's uptime history on the public-facing status page</span></div>
              <label className={styles.toggle}><input type="checkbox" defaultChecked /><div className={styles.toggleTrack}/><div className={styles.toggleThumb}/></label>
            </div>
            <div className={styles.toggleRow}>
              <div className={styles.toggleRowInfo}><span className={styles.toggleRowLabel}>Pause monitor on creation</span><span className={styles.toggleRowDesc}>Create the monitor without starting checks — activate it manually later</span></div>
              <label className={styles.toggle}><input type="checkbox" /><div className={styles.toggleTrack}/><div className={styles.toggleThumb}/></label>
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}

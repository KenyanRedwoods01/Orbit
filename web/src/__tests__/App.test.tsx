import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import App from '../App'
import { useAuthStore } from '../store/auth'

// ── Mock useSetupStatus so all App tests are instant ─────────────────────────
const mockUseSetupStatus = vi.fn()
vi.mock('../hooks/useSetupStatus', () => ({
  useSetupStatus: () => mockUseSetupStatus(),
  MAX_RETRIES: 20,
  RETRY_DELAY_MS: 1500,
}))

// ── Mock all heavy page components ───────────────────────────────────────────
vi.mock('../pages/login/LoginPage',             () => ({ default: () => <div data-testid="login-page">Login</div> }))
vi.mock('../pages/login/SetupPage',             () => ({ default: ({ onComplete }: { onComplete: () => void }) => <button data-testid="setup-page" onClick={onComplete}>Setup</button> }))
vi.mock('../pages/metrics/MetricsPage',         () => ({ default: () => <div data-testid="metrics-page">Metrics</div> }))
vi.mock('../pages/services/ServicesPage',       () => ({ default: () => <div data-testid="services-page">Services</div> }))
vi.mock('../pages/logs/LogsPage',               () => ({ default: () => <div data-testid="logs-page">Logs</div> }))
vi.mock('../pages/firewall/FirewallPage',       () => ({ default: () => <div data-testid="firewall-page">Firewall</div> }))
vi.mock('../pages/webserver/WebServerPage',     () => ({ default: () => <div data-testid="webserver-page">WebServer</div> }))
vi.mock('../pages/deploy/DeployPage',          () => ({ default: () => <div data-testid="deploy-page">Deploy</div> }))
vi.mock('../pages/deploy/DeploymentDetailPage',() => ({ default: () => <div>DeployDetail</div> }))
vi.mock('../pages/deploy/AllDeploymentsPage',  () => ({ default: () => <div>AllDeploys</div> }))
vi.mock('../pages/containers/ContainersPage',  () => ({ default: () => <div data-testid="containers-page">Containers</div> }))
vi.mock('../pages/uptime/UptimePage',          () => ({ default: () => <div data-testid="uptime-page">Uptime</div> }))
vi.mock('../pages/security/SecurityPage',      () => ({ default: () => <div data-testid="security-page">Security</div> }))
vi.mock('../pages/multiserver/MultiServerPage',() => ({ default: () => <div>MultiServer</div> }))
vi.mock('../pages/processes/ProcessesPage',    () => ({ default: () => <div>Processes</div> }))
vi.mock('../pages/processes/ProcessDetailPage',() => ({ default: () => <div>ProcessDetail</div> }))
vi.mock('../pages/uptime/IncidentPage',        () => ({ default: () => <div>Incident</div> }))
vi.mock('../pages/settings/SettingsPage',      () => ({ default: () => <div data-testid="settings-page">Settings</div> }))
vi.mock('../pages/ftp/FtpPage',               () => ({ default: () => <div>FTP</div> }))
vi.mock('../pages/mcp/McpPage',               () => ({ default: () => <div>MCP</div> }))
vi.mock('../pages/notifications/NotificationsPage', () => ({ default: () => <div>Notifications</div> }))
vi.mock('../pages/plugins/PluginsPage',        () => ({ default: () => <div>Plugins</div> }))
vi.mock('../pages/plugins/PluginDetailPage',   () => ({ default: () => <div>PluginDetail</div> }))
vi.mock('../pages/apps/AppsPage',              () => ({ default: () => <div>Apps</div> }))
vi.mock('../pages/apps/AppDetailPage',         () => ({ default: () => <div>AppDetail</div> }))
vi.mock('../pages/plugins/Fail2BanPage',       () => ({ default: () => <div>Fail2Ban</div> }))
vi.mock('../pages/plugins/CrowdSecPage',       () => ({ default: () => <div>CrowdSec</div> }))
vi.mock('../pages/plugins/WazuhPage',          () => ({ default: () => <div>Wazuh</div> }))
vi.mock('../pages/plugins/SuricataPage',       () => ({ default: () => <div>Suricata</div> }))
vi.mock('../pages/plugins/GithubActionsPage',  () => ({ default: () => <div>GithubActions</div> }))
vi.mock('../pages/multiserver/ServerDetailPage',() => ({ default: () => <div>ServerDetail</div> }))
vi.mock('../pages/ssh/SshPage',               () => ({ default: () => <div data-testid="ssh-page">SSH</div> }))
vi.mock('../pages/alerts/AlertRulesPage',      () => ({ default: () => <div>Alerts</div> }))
vi.mock('../pages/metrics/DiskPartitionPage',  () => ({ default: () => <div>DiskPartition</div> }))
vi.mock('../pages/ports/PortsPage',            () => ({ default: () => <div data-testid="ports-page">Ports</div> }))
vi.mock('../pages/database/DatabasePage',      () => ({ default: () => <div data-testid="database-page">Database</div> }))
vi.mock('../pages/profile/ProfilePage',        () => ({ default: () => <div data-testid="profile-page">Profile</div> }))
vi.mock('../components/layout/Layout',         () => {
  const { Outlet } = require('react-router-dom')
  return { default: () => <div data-testid="layout"><Outlet /></div> }
})

// ── Shared status fixtures ────────────────────────────────────────────────────
const LOADING_STATE = {
  setupRequired: null,
  loading: true,
  error: null,
  retryCount: 0,
  retry: vi.fn(),
}
const READY_NO_SETUP = {
  setupRequired: false,
  loading: false,
  error: null,
  retryCount: 0,
  retry: vi.fn(),
}
const READY_SETUP = {
  setupRequired: true,
  loading: false,
  error: null,
  retryCount: 0,
  retry: vi.fn(),
}
const ERROR_STATE = {
  setupRequired: null,
  loading: false,
  error: 'Unable to reach the server after 20 attempts. Please refresh.',
  retryCount: 20,
  retry: vi.fn(),
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
}

function renderApp(initialPath = '/') {
  const qc = makeQueryClient()
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[initialPath]}>
        <App />
      </MemoryRouter>
    </QueryClientProvider>
  )
}

function setAuth(user: { username: string; scope?: string } | null) {
  if (user) {
    useAuthStore.getState().setUser(user as never)
  } else {
    useAuthStore.getState().logout()
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  mockUseSetupStatus.mockReset()
  useAuthStore.getState().logout()
})

// ── Tier 1: Setup boot flow states ───────────────────────────────────────────

describe('Setup boot flow', () => {
  it('renders loading indicator while awaiting setup status', () => {
    mockUseSetupStatus.mockReturnValue(LOADING_STATE)
    renderApp('/')
    expect(screen.getByTestId('setup-loading')).toBeInTheDocument()
  })

  it('shows "attempt N of 20" message when retryCount > 0', () => {
    mockUseSetupStatus.mockReturnValue({ ...LOADING_STATE, retryCount: 4 })
    renderApp('/')
    expect(screen.getByText(/attempt 5 of 20/i)).toBeInTheDocument()
  })

  it('shows connecting message on first attempt (retryCount 0)', () => {
    mockUseSetupStatus.mockReturnValue(LOADING_STATE)
    renderApp('/')
    expect(screen.getByText(/connecting to server/i)).toBeInTheDocument()
  })

  it('shows error panel when max retries exhausted', () => {
    mockUseSetupStatus.mockReturnValue(ERROR_STATE)
    renderApp('/')
    expect(screen.getByTestId('setup-error')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument()
  })

  it('calls retry() when error Retry button is clicked', () => {
    const retryFn = vi.fn()
    mockUseSetupStatus.mockReturnValue({ ...ERROR_STATE, retry: retryFn })
    renderApp('/')
    screen.getByRole('button', { name: /retry/i }).click()
    expect(retryFn).toHaveBeenCalledOnce()
  })

  it('shows setup page when setup_required is true', () => {
    mockUseSetupStatus.mockReturnValue(READY_SETUP)
    renderApp('/setup')
    expect(screen.getByTestId('setup-page')).toBeInTheDocument()
  })

  it('shows app routes when setup_required is false', () => {
    mockUseSetupStatus.mockReturnValue(READY_NO_SETUP)
    setAuth({ username: 'alice', scope: 'admin' })
    renderApp('/metrics')
    expect(screen.getByTestId('metrics-page')).toBeInTheDocument()
  })

  it('redirects any route to /setup when setup is required', () => {
    mockUseSetupStatus.mockReturnValue(READY_SETUP)
    renderApp('/metrics')
    expect(screen.getByTestId('setup-page')).toBeInTheDocument()
  })
})

// ── Tier 2: RequireAuth guard ─────────────────────────────────────────────────

describe('RequireAuth guard', () => {
  beforeEach(() => {
    mockUseSetupStatus.mockReturnValue(READY_NO_SETUP)
  })

  it('redirects unauthenticated user from /metrics to /login', () => {
    setAuth(null)
    renderApp('/metrics')
    expect(screen.getByTestId('login-page')).toBeInTheDocument()
  })

  it('renders layout when user is present', () => {
    setAuth({ username: 'alice', scope: 'admin' })
    renderApp('/metrics')
    expect(screen.getByTestId('layout')).toBeInTheDocument()
  })

  it('renders metrics page when authenticated at /metrics', () => {
    setAuth({ username: 'alice', scope: 'admin' })
    renderApp('/metrics')
    expect(screen.getByTestId('metrics-page')).toBeInTheDocument()
  })
})

// ── Tier 3: Root redirect ─────────────────────────────────────────────────────

describe('Root redirect', () => {
  beforeEach(() => {
    mockUseSetupStatus.mockReturnValue(READY_NO_SETUP)
    setAuth({ username: 'admin', scope: 'admin' })
  })

  it('/ redirects to /metrics for authenticated users', () => {
    renderApp('/')
    expect(screen.getByTestId('metrics-page')).toBeInTheDocument()
  })

  it('unknown route redirects to / then /metrics', () => {
    renderApp('/this-does-not-exist')
    expect(screen.getByTestId('metrics-page')).toBeInTheDocument()
  })
})

// ── Tier 4: Protected routes require auth ─────────────────────────────────────

describe('Protected routes require authentication', () => {
  beforeEach(() => {
    mockUseSetupStatus.mockReturnValue(READY_NO_SETUP)
    setAuth(null)
  })

  const protectedRoutes = [
    '/database', '/ports', '/settings', '/ssh', '/security',
    '/firewall', '/containers', '/uptime',
  ]

  for (const route of protectedRoutes) {
    it(`${route} redirects to /login when unauthenticated`, () => {
      renderApp(route)
      expect(screen.getByTestId('login-page')).toBeInTheDocument()
    })
  }
})

// ── Tier 5: Route smoke tests ─────────────────────────────────────────────────

describe('Route smoke tests (authenticated)', () => {
  beforeEach(() => {
    mockUseSetupStatus.mockReturnValue(READY_NO_SETUP)
    setAuth({ username: 'admin', scope: 'admin' })
  })

  const routes: [string, string][] = [
    ['/metrics',    'metrics-page'],
    ['/logs',       'logs-page'],
    ['/firewall',   'firewall-page'],
    ['/ssh',        'ssh-page'],
    ['/ports',      'ports-page'],
    ['/database',   'database-page'],
    ['/settings',   'settings-page'],
    ['/profile',    'profile-page'],
    ['/services',   'services-page'],
    ['/containers', 'containers-page'],
    ['/uptime',     'uptime-page'],
    ['/security',   'security-page'],
    ['/webserver',  'webserver-page'],
    ['/deploy',     'deploy-page'],
  ]

  for (const [path, testId] of routes) {
    it(`${path} renders ${testId}`, () => {
      renderApp(path)
      expect(screen.getByTestId(testId)).toBeInTheDocument()
    })
  }
})

// ── Tier 6: Setup mode lockdown ───────────────────────────────────────────────

describe('Setup mode lockdown', () => {
  beforeEach(() => {
    mockUseSetupStatus.mockReturnValue(READY_SETUP)
  })

  it('visiting /login during setup redirects to /setup', () => {
    renderApp('/login')
    expect(screen.getByTestId('setup-page')).toBeInTheDocument()
    expect(screen.queryByTestId('login-page')).toBeNull()
  })

  it('visiting /metrics during setup redirects to /setup', () => {
    renderApp('/metrics')
    expect(screen.getByTestId('setup-page')).toBeInTheDocument()
  })
})

import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from '@/store/auth'
import { useSetupStatus } from '@/hooks/useSetupStatus'
import Layout from '@/components/layout/Layout'
import LoginPage from '@/pages/login/LoginPage'
import SetupPage from '@/pages/login/SetupPage'
import MetricsPage from '@/pages/metrics/MetricsPage'
import ServicesPage from '@/pages/services/ServicesPage'
import LogsPage from '@/pages/logs/LogsPage'
import FirewallPage from '@/pages/firewall/FirewallPage'
import WebServerPage from '@/pages/webserver/WebServerPage'
import DeployPage from '@/pages/deploy/DeployPage'
import DeploymentDetailPage from '@/pages/deploy/DeploymentDetailPage'
import AllDeploymentsPage from '@/pages/deploy/AllDeploymentsPage'
import ContainersPage from '@/pages/containers/ContainersPage'
import UptimePage from '@/pages/uptime/UptimePage'
import SecurityPage from '@/pages/security/SecurityPage'
import MultiServerPage from '@/pages/multiserver/MultiServerPage'
import ProcessesPage from '@/pages/processes/ProcessesPage'
import ProcessDetailPage from '@/pages/processes/ProcessDetailPage'
import IncidentPage from '@/pages/uptime/IncidentPage'
import SettingsPage from '@/pages/settings/SettingsPage'
import FtpPage from '@/pages/ftp/FtpPage'
import McpPage from '@/pages/mcp/McpPage'
import NotificationsPage from '@/pages/notifications/NotificationsPage'
import PluginsPage from '@/pages/plugins/PluginsPage'
import PluginDetailPage from '@/pages/plugins/PluginDetailPage'
import AppsPage from '@/pages/apps/AppsPage'
import AppDetailPage from '@/pages/apps/AppDetailPage'
import Fail2BanPage from '@/pages/plugins/Fail2BanPage'
import CrowdSecPage from '@/pages/plugins/CrowdSecPage'
import WazuhPage from '@/pages/plugins/WazuhPage'
import SuricataPage from '@/pages/plugins/SuricataPage'
import GithubActionsPage from '@/pages/plugins/GithubActionsPage'
import ServerDetailPage from '@/pages/multiserver/ServerDetailPage'
import SshPage from '@/pages/ssh/SshPage'
import AlertRulesPage from '@/pages/alerts/AlertRulesPage'
import DiskPartitionPage from '@/pages/metrics/DiskPartitionPage'
import PortsPage from '@/pages/ports/PortsPage'
import DatabasePage from '@/pages/database/DatabasePage'
import ProfilePage from '@/pages/profile/ProfilePage'

function RequireAuth({ children }: { children: React.ReactNode }) {
  const user = useAuthStore(s => s.user)
  if (!user) return <Navigate to="/login" replace />
  return <>{children}</>
}

const loadingStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  height: '100vh',
  flexDirection: 'column',
  gap: 16,
  fontFamily: 'system-ui, sans-serif',
  color: '#888',
  fontSize: 14,
}

export default function App() {
  const { setupRequired, loading, error, retryCount, retry } = useSetupStatus()

  if (loading) {
    return (
      <div style={loadingStyle} data-testid="setup-loading">
        <span>
          {retryCount > 0
            ? `Connecting to server… (attempt ${retryCount + 1} of 20)`
            : 'Connecting to server…'}
        </span>
      </div>
    )
  }

  if (error) {
    return (
      <div style={loadingStyle} data-testid="setup-error">
        <div style={{ color: '#f44336', maxWidth: 400, textAlign: 'center', lineHeight: 1.5 }}>
          {error}
        </div>
        <button
          onClick={retry}
          style={{
            padding: '6px 20px', borderRadius: 6, fontSize: 13, cursor: 'pointer',
            background: '#23272e', color: '#e0e0e0', border: '1px solid #444',
          }}
        >
          Retry
        </button>
      </div>
    )
  }

  if (setupRequired) {
    return (
      <Routes>
        <Route
          path="/setup"
          element={<SetupPage onComplete={() => retry()} />}
        />
        <Route path="*" element={<Navigate to="/setup" replace />} />
      </Routes>
    )
  }

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/setup" element={<Navigate to="/login" replace />} />
      <Route
        path="/"
        element={
          <RequireAuth>
            <Layout />
          </RequireAuth>
        }
      >
        <Route index element={<Navigate to="/metrics" replace />} />
        <Route path="metrics"    element={<MetricsPage />} />
        <Route path="services"   element={<ServicesPage />} />
        <Route path="logs"       element={<LogsPage />} />
        <Route path="firewall"   element={<FirewallPage />} />
        <Route path="webserver"  element={<WebServerPage />} />
        <Route path="deploy"                          element={<DeployPage />} />
        <Route path="deploy/deployments"              element={<AllDeploymentsPage />} />
        <Route path="deploy/deployments/:id"          element={<DeploymentDetailPage />} />
        <Route path="containers" element={<ContainersPage />} />
        <Route path="uptime"     element={<UptimePage />} />
        <Route path="security"   element={<SecurityPage />} />
        <Route path="servers"          element={<MultiServerPage />} />
        <Route path="servers/:id"      element={<ServerDetailPage />} />
        <Route path="processes"        element={<ProcessesPage />} />
        <Route path="processes/:pid"        element={<ProcessDetailPage />} />
        <Route path="uptime/incidents/:id"  element={<IncidentPage />} />
        <Route path="settings"             element={<SettingsPage />} />
        <Route path="ftp"                  element={<FtpPage />} />
        <Route path="mcp"                  element={<McpPage />} />
        <Route path="notifications"        element={<NotificationsPage />} />
        <Route path="apps"               element={<AppsPage />} />
        <Route path="apps/:id"           element={<AppDetailPage />} />
        <Route path="plugins"                element={<PluginsPage />} />
        <Route path="plugins/fail2ban"     element={<Fail2BanPage />} />
        <Route path="plugins/crowdsec"     element={<CrowdSecPage />} />
        <Route path="plugins/wazuh"        element={<WazuhPage />} />
        <Route path="plugins/suricata"       element={<SuricataPage />} />
        <Route path="plugins/github-actions" element={<GithubActionsPage />} />
        <Route path="plugins/:id"          element={<PluginDetailPage />} />
        <Route path="ssh"                  element={<SshPage />} />
        <Route path="alerts"               element={<AlertRulesPage />} />
        <Route path="metrics/disk/:mount"  element={<DiskPartitionPage />} />
        <Route path="ports"                element={<PortsPage />} />
        <Route path="database"             element={<DatabasePage />} />
        <Route path="profile"              element={<ProfilePage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

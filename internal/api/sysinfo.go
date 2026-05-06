package api

import (
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"runtime"

	gopscpu "github.com/shirou/gopsutil/v3/cpu"
	gopshost "github.com/shirou/gopsutil/v3/host"
	gopsload "github.com/shirou/gopsutil/v3/load"
	gopsmem "github.com/shirou/gopsutil/v3/mem"
)

type ServerInfoResponse struct {
	Hostname  string `json:"hostname"`
	IP        string `json:"ip"`
	PrivateIP string `json:"private_ip"`
	OS        string `json:"os"`
	Kernel    string `json:"kernel"`
	Arch      string `json:"arch"`
	CPUModel  string `json:"cpu_model"`
	CPUCores  int    `json:"cpu_cores"`
	TotalRAM  string `json:"total_ram"`
	Uptime    string `json:"uptime"`
	Load      string `json:"load"`
	Region    string `json:"region"`
	Provider  string `json:"provider"`
	Status    string `json:"status"`
}

func (s *Server) handleServerInfo(w http.ResponseWriter, r *http.Request) {
	info := ServerInfoResponse{
		Arch:   runtime.GOARCH,
		Status: "online",
	}

	// Host info: hostname, OS platform+version, kernel, uptime
	if h, err := gopshost.InfoWithContext(r.Context()); err == nil {
		info.Hostname = h.Hostname
		info.OS = fmt.Sprintf("%s %s", h.Platform, h.PlatformVersion)
		info.Kernel = h.KernelVersion
		uptimeSecs := h.Uptime
		days := uptimeSecs / 86400
		hours := (uptimeSecs % 86400) / 3600
		mins := (uptimeSecs % 3600) / 60
		switch {
		case days > 0:
			info.Uptime = fmt.Sprintf("%dd %dh %dm", days, hours, mins)
		case hours > 0:
			info.Uptime = fmt.Sprintf("%dh %dm", hours, mins)
		default:
			info.Uptime = fmt.Sprintf("%dm", mins)
		}
	}

	// CPU info
	if cpuInfo, err := gopscpu.InfoWithContext(r.Context()); err == nil && len(cpuInfo) > 0 {
		info.CPUModel = cpuInfo[0].ModelName
		info.CPUCores = int(cpuInfo[0].Cores)
	}
	if info.CPUCores == 0 {
		info.CPUCores = runtime.NumCPU()
	}

	// Memory total
	if vm, err := gopsmem.VirtualMemoryWithContext(r.Context()); err == nil {
		gb := float64(vm.Total) / (1024 * 1024 * 1024)
		if gb >= 1 {
			info.TotalRAM = fmt.Sprintf("%.0f GB", gb)
		} else {
			info.TotalRAM = fmt.Sprintf("%.0f MB", gb*1024)
		}
	}

	// Load averages
	if avg, err := gopsload.AvgWithContext(r.Context()); err == nil {
		info.Load = fmt.Sprintf("%.2f  %.2f  %.2f", avg.Load1, avg.Load5, avg.Load15)
	}

	// Network IPs: first non-loopback private and public IPv4
	if ifaces, err := net.Interfaces(); err == nil {
		for _, iface := range ifaces {
			if iface.Flags&net.FlagLoopback != 0 || iface.Flags&net.FlagUp == 0 {
				continue
			}
			addrs, _ := iface.Addrs()
			for _, addr := range addrs {
				var ipStr string
				switch v := addr.(type) {
				case *net.IPNet:
					ipStr = v.IP.String()
				case *net.IPAddr:
					ipStr = v.IP.String()
				}
				if ipStr == "" {
					continue
				}
				ip := net.ParseIP(ipStr)
				if ip == nil || ip.To4() == nil {
					continue
				}
				if isPrivateIP(ip) {
					if info.PrivateIP == "" {
						info.PrivateIP = ipStr
					}
				} else {
					if info.IP == "" {
						info.IP = ipStr
					}
				}
			}
		}
		if info.IP == "" {
			info.IP = info.PrivateIP
		}
	}

	// Region / provider from settings table (optional, admin-configurable)
	var region, provider string
	s.db.SQL.QueryRowContext(r.Context(), `SELECT value FROM settings WHERE key='region'`).Scan(&region)   //nolint:errcheck
	s.db.SQL.QueryRowContext(r.Context(), `SELECT value FROM settings WHERE key='provider'`).Scan(&provider) //nolint:errcheck
	info.Region = region
	info.Provider = provider

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(info) //nolint:errcheck
}

// isPrivateIP returns true for RFC-1918 / CGNAT address ranges.
func isPrivateIP(ip net.IP) bool {
	privateRanges := []string{
		"10.0.0.0/8",
		"172.16.0.0/12",
		"192.168.0.0/16",
		"100.64.0.0/10",
	}
	for _, cidr := range privateRanges {
		_, network, err := net.ParseCIDR(cidr)
		if err == nil && network.Contains(ip) {
			return true
		}
	}
	return false
}

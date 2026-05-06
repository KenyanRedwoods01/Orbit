package api

import (
        "fmt"
        "net/http"

        "github.com/orbit-sh/orbit/internal/collector"
)

// handlePrometheusMetrics serves live system metrics in Prometheus exposition text format.
// GET /metrics               — public, no auth required
// GET /api/metrics/prometheus — authenticated version (same handler, auth enforced by route)
func (s *Server) handlePrometheusMetrics(w http.ResponseWriter, r *http.Request) {
        snap, err := collector.Collect(r.Context())
        if err != nil {
                http.Error(w, "# ERROR: failed to collect metrics\n", http.StatusInternalServerError)
                return
        }

        w.Header().Set("Content-Type", "text/plain; version=0.0.4; charset=utf-8")
        ts := snap.Time.UnixMilli()

        help := func(name, desc, kind string) {
                fmt.Fprintf(w, "# HELP %s %s\n# TYPE %s %s\n", name, desc, name, kind) //nolint:errcheck
        }
        g := func(name string, val interface{}, labels ...string) {
                if len(labels) == 0 {
                        fmt.Fprintf(w, "%s %v %d\n", name, val, ts) //nolint:errcheck
                } else {
                        fmt.Fprintf(w, "%s{%s} %v %d\n", name, labels[0], val, ts) //nolint:errcheck
                }
        }

        // ── CPU ──────────────────────────────────────────────────────────────────
        help("orbit_cpu_used_percent", "CPU usage as a percentage (0–100)", "gauge")
        g("orbit_cpu_used_percent", snap.CPU.PercentTotal)
        if len(snap.CPU.PerCore) > 0 {
                help("orbit_cpu_core_used_percent", "Per-core CPU usage percentage", "gauge")
                for i, pct := range snap.CPU.PerCore {
                        fmt.Fprintf(w, "orbit_cpu_core_used_percent{core=\"%d\"} %g %d\n", i, pct, ts) //nolint:errcheck
                }
        }
        if snap.CPU.Times != nil {
                help("orbit_cpu_user_percent", "CPU time spent in user space (%)", "gauge")
                g("orbit_cpu_user_percent", snap.CPU.Times.User)
                help("orbit_cpu_system_percent", "CPU time spent in kernel space (%)", "gauge")
                g("orbit_cpu_system_percent", snap.CPU.Times.System)
                help("orbit_cpu_iowait_percent", "CPU time waiting for IO (%)", "gauge")
                g("orbit_cpu_iowait_percent", snap.CPU.Times.IOWait)
                help("orbit_cpu_steal_percent", "CPU steal time percentage (virtualisation)", "gauge")
                g("orbit_cpu_steal_percent", snap.CPU.Times.Steal)
        }

        // ── Memory ───────────────────────────────────────────────────────────────
        help("orbit_memory_total_bytes", "Total physical memory in bytes", "gauge")
        g("orbit_memory_total_bytes", snap.Memory.TotalBytes)
        help("orbit_memory_used_bytes", "Used physical memory in bytes", "gauge")
        g("orbit_memory_used_bytes", snap.Memory.UsedBytes)
        help("orbit_memory_available_bytes", "Available physical memory in bytes", "gauge")
        g("orbit_memory_available_bytes", snap.Memory.AvailableBytes)
        help("orbit_memory_buffers_bytes", "Memory used by kernel buffers in bytes", "gauge")
        g("orbit_memory_buffers_bytes", snap.Memory.BuffersBytes)
        help("orbit_memory_cached_bytes", "Memory used as page cache in bytes", "gauge")
        g("orbit_memory_cached_bytes", snap.Memory.CachedBytes)
        help("orbit_memory_used_percent", "Memory usage as a percentage (0–100)", "gauge")
        g("orbit_memory_used_percent", snap.Memory.UsedPercent)
        help("orbit_swap_total_bytes", "Total swap space in bytes", "gauge")
        g("orbit_swap_total_bytes", snap.Memory.SwapTotalBytes)
        help("orbit_swap_used_bytes", "Used swap space in bytes", "gauge")
        g("orbit_swap_used_bytes", snap.Memory.SwapUsedBytes)

        // ── Disk ─────────────────────────────────────────────────────────────────
        help("orbit_disk_total_bytes", "Total disk capacity in bytes per partition", "gauge")
        for _, d := range snap.Disk {
                fmt.Fprintf(w, "orbit_disk_total_bytes{device=%q,mount=%q} %d %d\n", d.Device, d.MountPoint, d.TotalBytes, ts) //nolint:errcheck
        }
        help("orbit_disk_used_bytes", "Used disk space in bytes per partition", "gauge")
        for _, d := range snap.Disk {
                fmt.Fprintf(w, "orbit_disk_used_bytes{device=%q,mount=%q} %d %d\n", d.Device, d.MountPoint, d.UsedBytes, ts) //nolint:errcheck
        }
        help("orbit_disk_used_percent", "Disk usage as a percentage per partition", "gauge")
        for _, d := range snap.Disk {
                fmt.Fprintf(w, "orbit_disk_used_percent{device=%q,mount=%q} %g %d\n", d.Device, d.MountPoint, d.UsedPercent, ts) //nolint:errcheck
        }
        help("orbit_disk_read_bytes_per_second", "Disk read throughput in bytes/s", "gauge")
        for _, d := range snap.Disk {
                fmt.Fprintf(w, "orbit_disk_read_bytes_per_second{device=%q,mount=%q} %d %d\n", d.Device, d.MountPoint, d.ReadBps, ts) //nolint:errcheck
        }
        help("orbit_disk_write_bytes_per_second", "Disk write throughput in bytes/s", "gauge")
        for _, d := range snap.Disk {
                fmt.Fprintf(w, "orbit_disk_write_bytes_per_second{device=%q,mount=%q} %d %d\n", d.Device, d.MountPoint, d.WriteBps, ts) //nolint:errcheck
        }
        help("orbit_disk_read_iops", "Disk read operations per second", "gauge")
        for _, d := range snap.Disk {
                fmt.Fprintf(w, "orbit_disk_read_iops{device=%q,mount=%q} %g %d\n", d.Device, d.MountPoint, d.ReadIOPS, ts) //nolint:errcheck
        }
        help("orbit_disk_write_iops", "Disk write operations per second", "gauge")
        for _, d := range snap.Disk {
                fmt.Fprintf(w, "orbit_disk_write_iops{device=%q,mount=%q} %g %d\n", d.Device, d.MountPoint, d.WriteIOPS, ts) //nolint:errcheck
        }
        help("orbit_disk_await_ms", "Average disk IO latency in milliseconds", "gauge")
        for _, d := range snap.Disk {
                fmt.Fprintf(w, "orbit_disk_await_ms{device=%q,mount=%q} %g %d\n", d.Device, d.MountPoint, d.AvgAwaitMs, ts) //nolint:errcheck
        }

        // ── Network ──────────────────────────────────────────────────────────────
        help("orbit_network_sent_bytes_per_second", "Network transmit throughput in bytes/s per interface", "gauge")
        for _, n := range snap.Network {
                fmt.Fprintf(w, "orbit_network_sent_bytes_per_second{iface=%q} %d %d\n", n.Interface, n.SentBps, ts) //nolint:errcheck
        }
        help("orbit_network_recv_bytes_per_second", "Network receive throughput in bytes/s per interface", "gauge")
        for _, n := range snap.Network {
                fmt.Fprintf(w, "orbit_network_recv_bytes_per_second{iface=%q} %d %d\n", n.Interface, n.RecvBps, ts) //nolint:errcheck
        }
        help("orbit_network_sent_bytes_total", "Cumulative bytes transmitted since boot", "counter")
        for _, n := range snap.Network {
                fmt.Fprintf(w, "orbit_network_sent_bytes_total{iface=%q} %d %d\n", n.Interface, n.BytesSent, ts) //nolint:errcheck
        }
        help("orbit_network_recv_bytes_total", "Cumulative bytes received since boot", "counter")
        for _, n := range snap.Network {
                fmt.Fprintf(w, "orbit_network_recv_bytes_total{iface=%q} %d %d\n", n.Interface, n.BytesRecv, ts) //nolint:errcheck
        }
        help("orbit_network_packets_sent_total", "Cumulative packets transmitted since boot", "counter")
        for _, n := range snap.Network {
                fmt.Fprintf(w, "orbit_network_packets_sent_total{iface=%q} %d %d\n", n.Interface, n.PacketsSent, ts) //nolint:errcheck
        }
        help("orbit_network_packets_recv_total", "Cumulative packets received since boot", "counter")
        for _, n := range snap.Network {
                fmt.Fprintf(w, "orbit_network_packets_recv_total{iface=%q} %d %d\n", n.Interface, n.PacketsRecv, ts) //nolint:errcheck
        }
        help("orbit_network_errors_in_total", "Cumulative inbound network errors since boot", "counter")
        for _, n := range snap.Network {
                fmt.Fprintf(w, "orbit_network_errors_in_total{iface=%q} %d %d\n", n.Interface, n.ErrIn, ts) //nolint:errcheck
        }
        help("orbit_network_errors_out_total", "Cumulative outbound network errors since boot", "counter")
        for _, n := range snap.Network {
                fmt.Fprintf(w, "orbit_network_errors_out_total{iface=%q} %d %d\n", n.Interface, n.ErrOut, ts) //nolint:errcheck
        }
        help("orbit_network_drops_in_total", "Cumulative inbound packet drops since boot", "counter")
        for _, n := range snap.Network {
                fmt.Fprintf(w, "orbit_network_drops_in_total{iface=%q} %d %d\n", n.Interface, n.DropIn, ts) //nolint:errcheck
        }
        help("orbit_network_drops_out_total", "Cumulative outbound packet drops since boot", "counter")
        for _, n := range snap.Network {
                fmt.Fprintf(w, "orbit_network_drops_out_total{iface=%q} %d %d\n", n.Interface, n.DropOut, ts) //nolint:errcheck
        }

        // ── Load averages ─────────────────────────────────────────────────────────
        help("orbit_load_avg_1", "1-minute system load average", "gauge")
        g("orbit_load_avg_1", snap.Load.Load1)
        help("orbit_load_avg_5", "5-minute system load average", "gauge")
        g("orbit_load_avg_5", snap.Load.Load5)
        help("orbit_load_avg_15", "15-minute system load average", "gauge")
        g("orbit_load_avg_15", snap.Load.Load15)

        // ── Host ─────────────────────────────────────────────────────────────────
        help("orbit_uptime_seconds_total", "System uptime in seconds since last boot", "counter")
        g("orbit_uptime_seconds_total", snap.Host.UptimeSeconds)
        help("orbit_processes_total", "Total number of running processes", "gauge")
        g("orbit_processes_total", snap.Host.Procs)

        // ── Top processes ─────────────────────────────────────────────────────────
        if len(snap.Procs) > 0 {
                help("orbit_process_cpu_percent", "Per-process CPU usage percentage for top processes", "gauge")
                for _, p := range snap.Procs {
                        if p.CPUPct < 0.1 {
                                continue
                        }
                        fmt.Fprintf(w, "orbit_process_cpu_percent{pid=\"%d\",name=%q} %g %d\n", p.PID, p.Name, p.CPUPct, ts) //nolint:errcheck
                }
                help("orbit_process_mem_rss_bytes", "Per-process resident set size (RSS) for top processes", "gauge")
                for _, p := range snap.Procs {
                        if p.MemRSS == 0 {
                                continue
                        }
                        fmt.Fprintf(w, "orbit_process_mem_rss_bytes{pid=\"%d\",name=%q} %d %d\n", p.PID, p.Name, p.MemRSS, ts) //nolint:errcheck
                }
        }
}

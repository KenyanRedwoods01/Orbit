// Package collector polls OS metrics via gopsutil.
package collector

import (
        "context"
        "fmt"
        "time"

        "github.com/shirou/gopsutil/v3/cpu"
        "github.com/shirou/gopsutil/v3/disk"
        gopshost "github.com/shirou/gopsutil/v3/host"
        gopsload "github.com/shirou/gopsutil/v3/load"
        "github.com/shirou/gopsutil/v3/mem"
        "github.com/shirou/gopsutil/v3/net"
        "github.com/shirou/gopsutil/v3/process"
)

// Snapshot holds a point-in-time reading of system metrics.
type Snapshot struct {
        Time    time.Time     `json:"time"`
        CPU     CPUStats      `json:"cpu"`
        Memory  MemoryStats   `json:"memory"`
        Disk    []DiskStats   `json:"disk"`
        Network []NetStats    `json:"network"`
        Procs   []ProcessStat `json:"processes"`
        Load    LoadStats     `json:"load"`
        Host    HostStats     `json:"host"`
}

// CPUTimes holds a breakdown of CPU time by mode (percentages summing to ~100).
type CPUTimes struct {
        User   float64 `json:"user"`
        System float64 `json:"system"`
        IOWait float64 `json:"iowait"`
        Steal  float64 `json:"steal"`
}

type CPUStats struct {
        PercentTotal float64   `json:"total_pct"`
        PerCore      []float64 `json:"per_core_pct"`
        Times        *CPUTimes `json:"times,omitempty"`
}

type MemoryStats struct {
        TotalBytes     uint64  `json:"total_bytes"`
        UsedBytes      uint64  `json:"used_bytes"`
        UsedPercent    float64 `json:"used_pct"`
        AvailableBytes uint64  `json:"available_bytes"`
        BuffersBytes   uint64  `json:"buffers_bytes"`
        CachedBytes    uint64  `json:"cached_bytes"`
        SwapTotalBytes uint64  `json:"swap_total_bytes"`
        SwapUsedBytes  uint64  `json:"swap_used_bytes"`
}

type DiskStats struct {
        Device      string  `json:"device"`
        MountPoint  string  `json:"mount"`
        TotalBytes  uint64  `json:"total_bytes"`
        UsedBytes   uint64  `json:"used_bytes"`
        UsedPercent float64 `json:"used_pct"`
        ReadBps     uint64  `json:"read_bps"`
        WriteBps    uint64  `json:"write_bps"`
        ReadIOPS    float64 `json:"read_iops"`
        WriteIOPS   float64 `json:"write_iops"`
        AvgAwaitMs  float64 `json:"avg_await_ms"`
}

type NetStats struct {
        Interface   string `json:"iface"`
        BytesSent   uint64 `json:"bytes_sent"`
        BytesRecv   uint64 `json:"bytes_recv"`
        SentBps     uint64 `json:"sent_bps"`
        RecvBps     uint64 `json:"recv_bps"`
        PacketsSent uint64 `json:"packets_sent"`
        PacketsRecv uint64 `json:"packets_recv"`
        ErrIn       uint64 `json:"err_in"`
        ErrOut      uint64 `json:"err_out"`
        DropIn      uint64 `json:"drop_in"`
        DropOut     uint64 `json:"drop_out"`
}

type ProcessStat struct {
        PID    int32   `json:"pid"`
        Name   string  `json:"name"`
        CPUPct float64 `json:"cpu_pct"`
        MemPct float32 `json:"mem_pct"`
        MemRSS uint64  `json:"mem_rss"`
        Status string  `json:"status"`
        User   string  `json:"user"`
}

// LoadStats holds the 1/5/15-minute load averages.
type LoadStats struct {
        Load1  float64 `json:"load1"`
        Load5  float64 `json:"load5"`
        Load15 float64 `json:"load15"`
}

// HostStats holds OS-level host metadata included with every snapshot.
type HostStats struct {
        UptimeSeconds uint64 `json:"uptime_seconds"`
        UptimeHuman   string `json:"uptime_human"`
        BootTime      uint64 `json:"boot_time"`
        Procs         uint64 `json:"procs"`
}

// previous network counters for bps calculation
var prevNetStats map[string]net.IOCountersStat
var prevNetTime time.Time

// previous disk io counters for bps calculation
var prevDiskStats map[string]disk.IOCountersStat
var prevDiskTime time.Time

// Collect reads a fresh Snapshot from the OS.
func Collect(ctx context.Context) (*Snapshot, error) {
        s := &Snapshot{Time: time.Now()}

        // CPU percent
        totals, err := cpu.PercentWithContext(ctx, 0, false)
        if err == nil && len(totals) > 0 {
                s.CPU.PercentTotal = totals[0]
        }
        perCore, _ := cpu.PercentWithContext(ctx, 0, true)
        s.CPU.PerCore = perCore

        // CPU time breakdown (user/sys/iowait/steal as percentages)
        if cpuTimes, err := cpu.TimesWithContext(ctx, false); err == nil && len(cpuTimes) > 0 {
                t := cpuTimes[0]
                total := t.User + t.System + t.Idle + t.Nice + t.Iowait + t.Irq + t.Softirq + t.Steal
                if total > 0 {
                        s.CPU.Times = &CPUTimes{
                                User:   t.User / total * 100,
                                System: t.System / total * 100,
                                IOWait: t.Iowait / total * 100,
                                Steal:  t.Steal / total * 100,
                        }
                }
        }

        // Memory
        vm, err := mem.VirtualMemoryWithContext(ctx)
        if err == nil {
                s.Memory = MemoryStats{
                        TotalBytes:     vm.Total,
                        UsedBytes:      vm.Used,
                        UsedPercent:    vm.UsedPercent,
                        AvailableBytes: vm.Available,
                        BuffersBytes:   vm.Buffers,
                        CachedBytes:    vm.Cached,
                }
        }
        swap, _ := mem.SwapMemoryWithContext(ctx)
        if swap != nil {
                s.Memory.SwapTotalBytes = swap.Total
                s.Memory.SwapUsedBytes = swap.Used
        }

        // Disk with IO bps
        parts, _ := disk.PartitionsWithContext(ctx, false)
        diskIOCounters, _ := disk.IOCountersWithContext(ctx)
        now := time.Now()

        for _, p := range parts {
                usage, err := disk.UsageWithContext(ctx, p.Mountpoint)
                if err != nil {
                        continue
                }
                ds := DiskStats{
                        Device:      p.Device,
                        MountPoint:  p.Mountpoint,
                        TotalBytes:  usage.Total,
                        UsedBytes:   usage.Used,
                        UsedPercent: usage.UsedPercent,
                }
                // Calculate disk IO bps and IOPS
                if diskIOCounters != nil && prevDiskStats != nil {
                        elapsed := now.Sub(prevDiskTime).Seconds()
                        if elapsed > 0 {
                                devName := p.Device
                                // Strip /dev/ prefix for matching
                                if len(devName) > 5 && devName[:5] == "/dev/" {
                                        devName = devName[5:]
                                }
                                if curr, ok := diskIOCounters[devName]; ok {
                                        if prev, ok2 := prevDiskStats[devName]; ok2 {
                                                ds.ReadBps = uint64(float64(curr.ReadBytes-prev.ReadBytes) / elapsed)
                                                ds.WriteBps = uint64(float64(curr.WriteBytes-prev.WriteBytes) / elapsed)
                                                ds.ReadIOPS = float64(curr.ReadCount-prev.ReadCount) / elapsed
                                                ds.WriteIOPS = float64(curr.WriteCount-prev.WriteCount) / elapsed
                                                ioCount := float64(curr.ReadCount-prev.ReadCount) + float64(curr.WriteCount-prev.WriteCount)
                                                ioTime := float64(curr.ReadTime-prev.ReadTime) + float64(curr.WriteTime-prev.WriteTime)
                                                if ioCount > 0 {
                                                        ds.AvgAwaitMs = ioTime / ioCount
                                                }
                                        }
                                }
                        }
                }
                s.Disk = append(s.Disk, ds)
        }
        // Update previous disk stats
        if diskIOCounters != nil {
                prevDiskStats = diskIOCounters
                prevDiskTime = now
        }

        // Network with bps
        ifaces, _ := net.IOCountersWithContext(ctx, true)
        elapsed := 0.0
        if !prevNetTime.IsZero() {
                elapsed = now.Sub(prevNetTime).Seconds()
        }
        newPrevNet := map[string]net.IOCountersStat{}
        for _, iface := range ifaces {
                newPrevNet[iface.Name] = iface
                ns := NetStats{
                        Interface:   iface.Name,
                        BytesSent:   iface.BytesSent,
                        BytesRecv:   iface.BytesRecv,
                        PacketsSent: iface.PacketsSent,
                        PacketsRecv: iface.PacketsRecv,
                        ErrIn:       iface.Errin,
                        ErrOut:      iface.Errout,
                        DropIn:      iface.Dropin,
                        DropOut:     iface.Dropout,
                }
                if elapsed > 0 && prevNetStats != nil {
                        if prev, ok := prevNetStats[iface.Name]; ok {
                                ns.SentBps = uint64(float64(iface.BytesSent-prev.BytesSent) / elapsed)
                                ns.RecvBps = uint64(float64(iface.BytesRecv-prev.BytesRecv) / elapsed)
                        }
                }
                s.Network = append(s.Network, ns)
        }
        prevNetStats = newPrevNet
        prevNetTime = now

        // Load averages
        if avg, err := gopsload.AvgWithContext(ctx); err == nil {
                s.Load = LoadStats{
                        Load1:  avg.Load1,
                        Load5:  avg.Load5,
                        Load15: avg.Load15,
                }
        }

        // Host uptime and boot time
        if h, err := gopshost.InfoWithContext(ctx); err == nil {
                up := h.Uptime
                days := up / 86400
                hours := (up % 86400) / 3600
                mins := (up % 3600) / 60
                var human string
                switch {
                case days > 0:
                        human = fmt.Sprintf("%dd %dh %dm", days, hours, mins)
                case hours > 0:
                        human = fmt.Sprintf("%dh %dm", hours, mins)
                default:
                        human = fmt.Sprintf("%dm", mins)
                }
                s.Host = HostStats{
                        UptimeSeconds: up,
                        UptimeHuman:   human,
                        BootTime:      h.BootTime,
                        Procs:         h.Procs,
                }
        }

        // Top processes (sorted by CPU/memory usage, capped at 50)
        procs, _ := process.ProcessesWithContext(ctx)
        for _, p := range procs {
                name, _ := p.NameWithContext(ctx)
                cpuPct, _ := p.CPUPercentWithContext(ctx)
                memPct, _ := p.MemoryPercentWithContext(ctx)
                memInfo, _ := p.MemoryInfoWithContext(ctx)
                status, _ := p.StatusWithContext(ctx)
                username, _ := p.UsernameWithContext(ctx)
                rss := uint64(0)
                if memInfo != nil {
                        rss = memInfo.RSS
                }
                statusStr := ""
                if len(status) > 0 {
                        statusStr = status[0]
                }
                s.Procs = append(s.Procs, ProcessStat{
                        PID:    p.Pid,
                        Name:   name,
                        CPUPct: cpuPct,
                        MemPct: memPct,
                        MemRSS: rss,
                        Status: statusStr,
                        User:   username,
                })
                if len(s.Procs) >= 50 {
                        break
                }
        }

        return s, nil
}

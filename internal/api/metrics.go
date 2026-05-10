package api

import (
	"context"
	"encoding/binary"
	"encoding/json"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gorilla/websocket"
	bolt "go.etcd.io/bbolt"

	"github.com/KenyanRedwoods01/Orbit/internal/collector"
	"github.com/KenyanRedwoods01/Orbit/internal/db"
)

var wsUpgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		origin := r.Header.Get("Origin")
		if origin == "" {
			return false
		}
		host := r.Host
		originHost := strings.TrimPrefix(strings.TrimPrefix(origin, "https://"), "http://")
		originHost = strings.Split(originHost, ":")[0]
		requestHost := strings.Split(host, ":")[0]
		if strings.EqualFold(originHost, requestHost) {
			return true
		}
		if originHost == "localhost" || originHost == "127.0.0.1" {
			return true
		}
		return false
	},
}

func (s *Server) handleMetricsSnapshot(w http.ResponseWriter, r *http.Request) {
	snap, err := collector.Collect(r.Context())
	if err != nil {
		http.Error(w, "failed to collect metrics", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(snap) //nolint:errcheck
}

func (s *Server) handleMetricsWS(w http.ResponseWriter, r *http.Request) {
	conn, err := wsUpgrader.Upgrade(w, r, nil)
	if err != nil {
		return
	}
	defer conn.Close()

	ticker := time.NewTicker(2 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-r.Context().Done():
			return
		case <-ticker.C:
			snap, err := collector.Collect(r.Context())
			if err != nil {
				continue
			}
			storeMetricSnapshot(s.db, snap)
			go s.evaluateAlertRules(r.Context(), snap)
			data, _ := json.Marshal(map[string]interface{}{
				"type":    "metrics",
				"payload": snap,
				"ts":      time.Now().UnixMilli(),
			})
			if err := conn.WriteMessage(websocket.TextMessage, data); err != nil {
				return
			}
		}
	}
}

// handleMetricsHistory returns stored metric snapshots for a time range.
// Query params: from (unix ms), to (unix ms), limit (default 360)
func (s *Server) handleMetricsHistory(w http.ResponseWriter, r *http.Request) {
	fromStr := r.URL.Query().Get("from")
	toStr := r.URL.Query().Get("to")
	limitStr := r.URL.Query().Get("limit")

	now := time.Now()
	fromTS := now.Add(-1 * time.Hour).UnixMilli()
	toTS := now.UnixMilli()
	limit := 360

	if fromStr != "" {
		if v, err := strconv.ParseInt(fromStr, 10, 64); err == nil {
			fromTS = v
		}
	}
	if toStr != "" {
		if v, err := strconv.ParseInt(toStr, 10, 64); err == nil {
			toTS = v
		}
	}
	if limitStr != "" {
		if v, err := strconv.Atoi(limitStr); err == nil && v > 0 {
			limit = v
		}
	}

	snaps := queryMetricHistory(s.db, fromTS, toTS, limit)
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(snaps) //nolint:errcheck
}

// MetricsSummary holds aggregated statistics over a rolling 24-hour window.
type MetricsSummary struct {
	Period        string  `json:"period"`
	DataPoints    int     `json:"data_points"`
	AvgCPU        float64 `json:"avg_cpu_pct"`
	PeakCPU       float64 `json:"peak_cpu_pct"`
	AvgMemory     float64 `json:"avg_mem_pct"`
	PeakMemory    float64 `json:"peak_mem_pct"`
	AvgDiskPct    float64 `json:"avg_disk_pct"`
	PeakDiskPct   float64 `json:"peak_disk_pct"`
	AvgNetSentBps uint64  `json:"avg_net_sent_bps"`
	AvgNetRecvBps uint64  `json:"avg_net_recv_bps"`
	PeakNetSent   uint64  `json:"peak_net_sent_bps"`
	PeakNetRecv   uint64  `json:"peak_net_recv_bps"`
	LoadAvg1      float64 `json:"load_avg_1"`
	LoadAvg5      float64 `json:"load_avg_5"`
	LoadAvg15     float64 `json:"load_avg_15"`
	UptimeHuman   string  `json:"uptime_human"`
	UptimeSeconds uint64  `json:"uptime_seconds"`
	HostProcs     uint64  `json:"host_procs"`
}

// handleMetricsSummary returns aggregated 24-hour statistics plus live host info.
func (s *Server) handleMetricsSummary(w http.ResponseWriter, r *http.Request) {
	now := time.Now()
	fromTS := now.Add(-24 * time.Hour).UnixMilli()
	toTS := now.UnixMilli()

	snaps := queryMetricHistory(s.db, fromTS, toTS, 2880) // up to 2880 points (30s interval × 2880 = 24h)

	sum := MetricsSummary{Period: "24h", DataPoints: len(snaps)}

	if len(snaps) > 0 {
		var (
			totalCPU, totalMem, totalDisk     float64
			totalNetSent, totalNetRecv         uint64
			peakCPU, peakMem, peakDisk         float64
			peakNetSent, peakNetRecv           uint64
		)
		for _, sn := range snaps {
			cpu := sn.CPU.PercentTotal
			mem := sn.Memory.UsedPercent
			totalCPU += cpu
			totalMem += mem
			if cpu > peakCPU {
				peakCPU = cpu
			}
			if mem > peakMem {
				peakMem = mem
			}
			// Disk: highest used_pct across all partitions
			diskPct := 0.0
			for _, d := range sn.Disk {
				if d.UsedPercent > diskPct {
					diskPct = d.UsedPercent
				}
			}
			totalDisk += diskPct
			if diskPct > peakDisk {
				peakDisk = diskPct
			}
			// Network
			var sent, recv uint64
			for _, n := range sn.Network {
				sent += n.SentBps
				recv += n.RecvBps
			}
			totalNetSent += sent
			totalNetRecv += recv
			if sent > peakNetSent {
				peakNetSent = sent
			}
			if recv > peakNetRecv {
				peakNetRecv = recv
			}
		}
		n := float64(len(snaps))
		sum.AvgCPU = totalCPU / n
		sum.PeakCPU = peakCPU
		sum.AvgMemory = totalMem / n
		sum.PeakMemory = peakMem
		sum.AvgDiskPct = totalDisk / n
		sum.PeakDiskPct = peakDisk
		sum.AvgNetSentBps = totalNetSent / uint64(len(snaps))
		sum.AvgNetRecvBps = totalNetRecv / uint64(len(snaps))
		sum.PeakNetSent = peakNetSent
		sum.PeakNetRecv = peakNetRecv

		// Use load and host stats from the most recent snapshot
		last := snaps[len(snaps)-1]
		sum.LoadAvg1 = last.Load.Load1
		sum.LoadAvg5 = last.Load.Load5
		sum.LoadAvg15 = last.Load.Load15
		sum.UptimeHuman = last.Host.UptimeHuman
		sum.UptimeSeconds = last.Host.UptimeSeconds
		sum.HostProcs = last.Host.Procs
	} else {
		// No history yet — collect a live snapshot for load/uptime
		if snap, err := collector.Collect(r.Context()); err == nil {
			sum.LoadAvg1 = snap.Load.Load1
			sum.LoadAvg5 = snap.Load.Load5
			sum.LoadAvg15 = snap.Load.Load15
			sum.UptimeHuman = snap.Host.UptimeHuman
			sum.UptimeSeconds = snap.Host.UptimeSeconds
			sum.HostProcs = snap.Host.Procs
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(sum) //nolint:errcheck
}

// runMetricsCollector stores metric snapshots to BoltDB every 30s
// and evaluates alert rules after each collection.
func (s *Server) runMetricsCollector(ctx context.Context) {
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()

	if snap, err := collector.Collect(ctx); err == nil {
		storeMetricSnapshot(s.db, snap)
		go s.evaluateAlertRules(ctx, snap)
	}

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			if snap, err := collector.Collect(ctx); err == nil {
				storeMetricSnapshot(s.db, snap)
				go s.evaluateAlertRules(ctx, snap)
			}
		}
	}
}

func storeMetricSnapshot(database *db.DB, snap *collector.Snapshot) {
	data, err := json.Marshal(snap)
	if err != nil {
		return
	}

	key := make([]byte, 8)
	binary.BigEndian.PutUint64(key, uint64(snap.Time.UnixMilli()))

	database.Metric.Update(func(tx *bolt.Tx) error { //nolint:errcheck
		b := tx.Bucket([]byte(db.MetricsBucket))
		if b == nil {
			return nil
		}
		if err := b.Put(key, data); err != nil {
			return err
		}
		cutoff := make([]byte, 8)
		binary.BigEndian.PutUint64(cutoff, uint64(time.Now().Add(-24*time.Hour).UnixMilli()))
		c := b.Cursor()
		for k, _ := c.First(); k != nil && string(k) < string(cutoff); k, _ = c.Next() {
			b.Delete(k) //nolint:errcheck
		}
		return nil
	})
}

func queryMetricHistory(database *db.DB, fromMS, toMS int64, limit int) []collector.Snapshot {
	var snaps []collector.Snapshot

	fromKey := make([]byte, 8)
	toKey := make([]byte, 8)
	binary.BigEndian.PutUint64(fromKey, uint64(fromMS))
	binary.BigEndian.PutUint64(toKey, uint64(toMS))

	database.Metric.View(func(tx *bolt.Tx) error { //nolint:errcheck
		b := tx.Bucket([]byte(db.MetricsBucket))
		if b == nil {
			return nil
		}
		c := b.Cursor()
		for k, v := c.Seek(fromKey); k != nil && string(k) <= string(toKey); k, v = c.Next() {
			var snap collector.Snapshot
			if err := json.Unmarshal(v, &snap); err == nil {
				snaps = append(snaps, snap)
				if len(snaps) >= limit {
					break
				}
			}
		}
		return nil
	})

	if snaps == nil {
		snaps = []collector.Snapshot{}
	}
	return snaps
}

package api

import (
	"net"
	"time"
)

func connectUnixSocket(path string) (net.Conn, error) {
	conn, err := net.DialTimeout("unix", path, 3*time.Second)
	if err != nil {
		return nil, err
	}
	conn.SetDeadline(time.Now().Add(5 * time.Second)) //nolint:errcheck
	return conn, nil
}

package api

import (
	"fmt"
	"io/fs"
	"syscall"
)

func fileOwner(info fs.FileInfo) string {
	if stat, ok := info.Sys().(*syscall.Stat_t); ok {
		return fmt.Sprintf("%d", stat.Uid)
	}
	return "0"
}

func fileGroup(info fs.FileInfo) string {
	if stat, ok := info.Sys().(*syscall.Stat_t); ok {
		return fmt.Sprintf("%d", stat.Gid)
	}
	return "0"
}

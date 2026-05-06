// TODO: replace database with actual module name
package database

import (
	"net/http"
	"github.com/orbit-sh/orbit/internal/plugin"
)

// Module implements plugin.Module.
type Module struct{}

var _ plugin.Module = (*Module)(nil)

func New() *Module { return &Module{} }

func (m *Module) Name() string { return "database" }
func (m *Module) Collect() error { return nil }
func (m *Module) Routes(mux *http.ServeMux) {}
func (m *Module) RequiredCapabilities() []string { return nil }
func (m *Module) Stop() error { return nil }

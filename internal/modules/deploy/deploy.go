// TODO: replace deploy with actual module name
package deploy

import (
	"net/http"
	"github.com/KenyanRedwoods01/Orbit/internal/plugin"
)

// Module implements plugin.Module.
type Module struct{}

var _ plugin.Module = (*Module)(nil)

func New() *Module { return &Module{} }

func (m *Module) Name() string { return "deploy" }
func (m *Module) Collect() error { return nil }
func (m *Module) Routes(mux *http.ServeMux) {}
func (m *Module) RequiredCapabilities() []string { return nil }
func (m *Module) Stop() error { return nil }

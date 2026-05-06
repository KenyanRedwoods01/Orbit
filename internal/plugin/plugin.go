// Package plugin defines the interface that all Orbit modules must implement.
// Community plugins and built-in modules use the same interface.
package plugin

import "net/http"

// Module is the interface every Orbit plugin must satisfy.
type Module interface {
	// Name returns the unique identifier for the module (e.g. "firewall").
	Name() string

	// Collect is called on a configurable interval to gather data.
	// Results are stored in the shared ring buffer or SQLite as appropriate.
	Collect() error

	// Routes registers the module's HTTP handlers on the provided ServeMux.
	// All routes should be prefixed with /api/<module-name>/.
	Routes(mux *http.ServeMux)

	// RequiredCapabilities returns the Linux capabilities the module needs.
	// The orbit daemon will verify these are available at startup.
	// Example: []string{"CAP_NET_ADMIN"} for the firewall module.
	RequiredCapabilities() []string

	// Stop is called when the module is being unloaded or the daemon is shutting down.
	Stop() error
}

// Registry holds all registered modules.
type Registry struct {
	modules []Module
}

// Register adds a module to the registry.
func (r *Registry) Register(m Module) {
	r.modules = append(r.modules, m)
}

// All returns all registered modules.
func (r *Registry) All() []Module {
	return r.modules
}

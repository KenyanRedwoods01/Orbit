package api

import (
	"embed"
	"io/fs"
	"net/http"
)

//go:embed all:static
var embeddedStatic embed.FS

// staticFiles is the HTTP file system serving the embedded React SPA.
// The React build output from web/dist is copied here at build time.
var staticFiles fs.FS

func init() {
	sub, err := fs.Sub(embeddedStatic, "static")
	if err != nil {
		panic(err)
	}
	staticFiles = sub
}

// spaHandler serves index.html for unknown paths (client-side routing).
type spaHandler struct {
	fs http.FileSystem
}

func (h spaHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	f, err := h.fs.Open(r.URL.Path)
	if err != nil {
		// Fall back to index.html for SPA routes
		r.URL.Path = "/"
	} else {
		f.Close()
	}
	http.FileServer(h.fs).ServeHTTP(w, r)
}

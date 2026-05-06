package api

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"strconv"
	"time"
)

type collabSession struct {
	ID           int64               `json:"id"`
	Name         string              `json:"name"`
	Token        string              `json:"token,omitempty"`
	CreatedBy    string              `json:"created_by"`
	CreatedAt    int64               `json:"created_at"`
	Participants []collabParticipant `json:"participants,omitempty"`
}

type collabParticipant struct {
	ID        int64  `json:"id"`
	SessionID int64  `json:"session_id"`
	Username  string `json:"username"`
	Email     string `json:"email"`
	Role      string `json:"role"`
	JoinedAt  int64  `json:"joined_at"`
}

func (s *Server) handleCollabSessionList(w http.ResponseWriter, r *http.Request) {
	rows, err := s.db.SQL.QueryContext(r.Context(),
		`SELECT id, name, created_by, created_at FROM ssh_collab_sessions ORDER BY id DESC`,
	)
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode([]collabSession{}) //nolint:errcheck
		return
	}
	defer rows.Close()

	var sessions []collabSession
	for rows.Next() {
		var cs collabSession
		rows.Scan(&cs.ID, &cs.Name, &cs.CreatedBy, &cs.CreatedAt) //nolint:errcheck
		sessions = append(sessions, cs)
	}
	if sessions == nil {
		sessions = []collabSession{}
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(sessions) //nolint:errcheck
}

func (s *Server) handleCollabSessionCreate(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Name      string `json:"name"`
		CreatedBy string `json:"created_by"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}
	if req.Name == "" {
		http.Error(w, "name is required", http.StatusBadRequest)
		return
	}

	token, err := generateCollabToken()
	if err != nil {
		http.Error(w, "token generation failed", http.StatusInternalServerError)
		return
	}

	res, err := s.db.SQL.ExecContext(r.Context(),
		`INSERT INTO ssh_collab_sessions (name, token, created_by) VALUES (?, ?, ?)`,
		req.Name, token, req.CreatedBy,
	)
	if err != nil {
		http.Error(w, "db error", http.StatusInternalServerError)
		return
	}
	id, _ := res.LastInsertId()

	cs := collabSession{
		ID: id, Name: req.Name, Token: token, CreatedBy: req.CreatedBy,
		CreatedAt: time.Now().Unix(),
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(cs) //nolint:errcheck
}

func (s *Server) handleCollabSessionDelete(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil {
		http.Error(w, "bad id", http.StatusBadRequest)
		return
	}
	s.db.SQL.ExecContext(r.Context(), `DELETE FROM ssh_collab_sessions WHERE id=?`, id) //nolint:errcheck
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handleCollabParticipantList(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil {
		http.Error(w, "bad id", http.StatusBadRequest)
		return
	}
	rows, err := s.db.SQL.QueryContext(r.Context(),
		`SELECT id, session_id, username, email, role, joined_at
		 FROM ssh_collab_participants WHERE session_id=? ORDER BY id`,
		id,
	)
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode([]collabParticipant{}) //nolint:errcheck
		return
	}
	defer rows.Close()

	var participants []collabParticipant
	for rows.Next() {
		var p collabParticipant
		rows.Scan(&p.ID, &p.SessionID, &p.Username, &p.Email, &p.Role, &p.JoinedAt) //nolint:errcheck
		participants = append(participants, p)
	}
	if participants == nil {
		participants = []collabParticipant{}
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(participants) //nolint:errcheck
}

func (s *Server) handleCollabParticipantAdd(w http.ResponseWriter, r *http.Request) {
	sessionID, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil {
		http.Error(w, "bad id", http.StatusBadRequest)
		return
	}
	var req collabParticipant
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}
	if req.Username == "" {
		http.Error(w, "username is required", http.StatusBadRequest)
		return
	}
	if req.Role == "" {
		req.Role = "read-only"
	}
	req.SessionID = sessionID
	req.JoinedAt = time.Now().Unix()

	res, err := s.db.SQL.ExecContext(r.Context(),
		`INSERT INTO ssh_collab_participants (session_id, username, email, role, joined_at)
		 VALUES (?, ?, ?, ?, ?)`,
		req.SessionID, req.Username, req.Email, req.Role, req.JoinedAt,
	)
	if err != nil {
		http.Error(w, "db error", http.StatusInternalServerError)
		return
	}
	req.ID, _ = res.LastInsertId()

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(req) //nolint:errcheck
}

func (s *Server) handleCollabParticipantUpdate(w http.ResponseWriter, r *http.Request) {
	pid, err := strconv.ParseInt(r.PathValue("pid"), 10, 64)
	if err != nil {
		http.Error(w, "bad id", http.StatusBadRequest)
		return
	}
	var req struct {
		Role string `json:"role"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}
	s.db.SQL.ExecContext(r.Context(), //nolint:errcheck
		`UPDATE ssh_collab_participants SET role=? WHERE id=?`, req.Role, pid,
	)
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handleCollabParticipantRemove(w http.ResponseWriter, r *http.Request) {
	pid, err := strconv.ParseInt(r.PathValue("pid"), 10, 64)
	if err != nil {
		http.Error(w, "bad id", http.StatusBadRequest)
		return
	}
	s.db.SQL.ExecContext(r.Context(), //nolint:errcheck
		`DELETE FROM ssh_collab_participants WHERE id=?`, pid,
	)
	w.WriteHeader(http.StatusNoContent)
}

func generateCollabToken() (string, error) {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return "collab_" + hex.EncodeToString(b), nil
}

package logutil

import (
	"bytes"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"time"

	"github.com/grafana/grafana-plugin-sdk-go/backend/log"
)

// EnableFileDump toggles JSON file dump logging globally.
var EnableFileDump bool

// SetFileDumpEnabled sets the global toggle for JSON file dump logging.
func SetFileDumpEnabled(enabled bool) {
	EnableFileDump = enabled
	if enabled {
		log.DefaultLogger.Warn("datastore: JSON file dump logging ENABLED (LOG_INFO_JSON_WRITE_FILE)")
	}
}

// PrettyJSON returns indented JSON when possible; otherwise returns trimmed raw text.
func PrettyJSON(b []byte) string {
	var out bytes.Buffer
	if json.Valid(b) {
		if err := json.Indent(&out, b, "", "  "); err == nil {
			return out.String()
		}
	}
	return string(bytes.TrimSpace(b))
}

// SafeFilename produces a filesystem-friendly name from an arbitrary string.
func SafeFilename(name string) string {
	if len(bytes.TrimSpace([]byte(name))) == 0 {
		return "unknown"
	}
	var b bytes.Buffer
	for _, r := range name {
		if (r >= 'a' && r <= 'z') ||
			(r >= 'A' && r <= 'Z') ||
			(r >= '0' && r <= '9') ||
			r == '-' || r == '_' || r == '.' {
			b.WriteRune(r)
		} else {
			b.WriteRune('_')
		}
	}
	return b.String()
}

// DumpJSONToFile writes pretty JSON to a timestamped file under a temp directory.
// Returns the path when successful.
func DumpJSONToFile(kind, id string, jsonBytes []byte) (string, error) {
	if !EnableFileDump {
		return "", nil
	}
	dir := filepath.Join(os.TempDir(), "riverbed-datastore-json")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return "", err
	}
	ts := time.Now().Format("20060102-150405.000")
	filename := SafeFilename(kind) + "-" + SafeFilename(id) + "-" + ts + ".json"
	path := filepath.Join(dir, filename)
	content := PrettyJSON(jsonBytes)
	if err := os.WriteFile(path, []byte(content), 0o600); err != nil {
		return "", fmt.Errorf("write file: %w", err)
	}
	return path, nil
}

// LogJSONPretty coordinates file dump and multi-line logging for readability.
func LogJSONPretty(title, kind, id string, jsonBytes []byte) {
	if !EnableFileDump {
		return
	}
	if path, err := DumpJSONToFile(kind, id, jsonBytes); err == nil && path != "" {
		log.DefaultLogger.Info("********** datastore: " + title + " file", "path", path)
	} else if err != nil {
		log.DefaultLogger.Warn("datastore: "+title+" file write failed", "err", err)
	}
}



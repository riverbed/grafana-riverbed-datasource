package transform

import "strings"

// toGrafanaUnit maps a Riverbed metric unit string into a Grafana field config
// unit identifier. It returns the mapped unit string and a boolean indicating
// whether the unit was known (explicitly mapped or recognized as a native
// Grafana unit). Unknown units fall back to a suffix-based unit so that values
// still render meaningfully in Grafana.
//
// This helper is intentionally small and data-driven; keep it in sync with the
// units exposed by the Riverbed info API via tests.
func toGrafanaUnit(upstream string) (string, bool) {
	u := strings.TrimSpace(upstream)
	if u == "" {
		return "", false
	}

	// Explicit mappings for units currently emitted by info.json, plus
	// canonical Grafana unit identifiers where they match.
	switch u {
	case "none":
		// No unit configured in Grafana.
		return "", true
	case "B":
		return "bytes", true
	case "bps", "KBps", "MBps", "Mbps":
		return u, true
	case "percent":
		return "percent", true
	case "ms":
		return "ms", true
	case "s":
		return "s", true
	}

	// If the upstream string already uses Grafana's structured unit syntax,
	// pass it through unchanged. This covers families like:
	//   - suffix:<text>
	//   - prefix:<text>
	//   - time:<format>
	//   - si:<pattern>
	//   - count:<unit>
	//   - currency:<code>
	if i := strings.IndexByte(u, ':'); i > 0 {
		switch u[:i] {
		case "suffix", "prefix", "time", "si", "count", "currency":
			return u, true
		}
	}

	// Fallback: treat as a custom suffix unit so that new/unknown units still
	// show up meaningfully in the UI without requiring an immediate plugin
	// release. Example: "MBps" -> "suffix:MBps".
	return "suffix:" + u, false
}



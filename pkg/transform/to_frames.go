package transform

import (
	"encoding/json"
	"fmt"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/grafana/grafana-plugin-sdk-go/data"
	api "github.com/riverbed/datastore/internal/api"
)

// JSONToFrames converts the upstream JSON payload into Grafana data.Frames.
// It accepts both shapes: { "data": { "queries": [...] } } and { "queries": [...] }.
func JSONToFrames(_ any, raw []byte) (data.Frames, error) {
	var parsed api.ResponseEnvelope
	if err := json.Unmarshal(raw, &parsed); err != nil {
		return nil, err
	}
	queries := api.ExtractQueries(parsed)
	if len(queries) == 0 {
		return data.Frames{}, nil
	}
	// Intentionally select ONLY the last sub-query result.
	// Riverbed APIs may return multiple staged sub-queries (e.g., current/comparedTo),
	// where the final stage is authoritative. This datasource intentionally surfaces
	// only the last one. See docs in grafana/funcspec.md and grafana/designspec.md.
	last := queries[len(queries)-1]
	// If upstream indicates per-query error, emit empty frame with error notice.
	if last.Meta.Error != nil {
		f := data.NewFrame("")
		f.Meta = &data.FrameMeta{
			Notices: []data.Notice{{
				Severity: data.NoticeSeverityError,
				Text:     formatNoticeText(last.ID, last.Meta, last.Meta.Error),
			}},
		}
		return data.Frames{f}, nil
	}
	if last.Meta.TimeSeries {
		frames := framesFromTimeSeries(last)
		attachWarningNotices(frames, last)
		return frames, nil
	}
	frames := framesFromSummary(last)
	attachWarningNotices(frames, last)
	return frames, nil
}

// parseEpoch parses a string epoch into time.Time, supporting seconds and milliseconds.
// Returns false when parsing fails.
func parseEpoch(ts string) (time.Time, bool) {
	v, err := strconv.ParseInt(ts, 10, 64)
	if err != nil {
		return time.Time{}, false
	}
	// Heuristic: values >= 1e12 are very likely milliseconds since epoch.
	if v >= 1_000_000_000_000 {
		return time.Unix(0, v*int64(time.Millisecond)), true
	}
	return time.Unix(v, 0), true
}

// labelFromKeys builds a human readable label from the row keys using meta order,
// skipping hidden and .custom. keys. Non-strings are JSON-stringified deterministically.
func labelFromKeys(keys map[string]any, metaKeys []api.ResponseKey) string {
	if keys == nil {
		return ""
	}
	labels := make([]string, 0, len(metaKeys))
	for _, mk := range metaKeys {
		if mk.Hidden {
			continue
		}
		if strings.Contains(mk.ID, ".custom.") {
			continue
		}
		v, ok := keys[mk.ID]
		if !ok {
			continue
		}
		switch vv := v.(type) {
		case string:
			labels = append(labels, vv)
		default:
			b, _ := json.Marshal(v)
			labels = append(labels, string(b))
		}
	}
	return strings.Join(labels, " - ")
}

func framesFromTimeSeries(q api.ResponseQuery) data.Frames {
	// Collect unique timestamps (string key → parsed time) with robust parsing.
	tsMap := map[string]time.Time{}
	for _, dp := range q.Data {
		for ts := range dp.TimeSeries {
			if _, seen := tsMap[ts]; seen {
				continue
			}
			if t, ok := parseEpoch(ts); ok {
				tsMap[ts] = t
			}
		}
	}
	// Build a stable, numerically sorted list of timestamp keys.
	tsKeys := make([]string, 0, len(tsMap))
	for k := range tsMap {
		tsKeys = append(tsKeys, k)
	}
	sort.Slice(tsKeys, func(i, j int) bool {
		ai, _ := strconv.ParseInt(tsKeys[i], 10, 64)
		aj, _ := strconv.ParseInt(tsKeys[j], 10, 64)
		return ai < aj
	})
	// Time column.
	times := make([]time.Time, len(tsKeys))
	for i, k := range tsKeys {
		times[i] = tsMap[k]
	}
	// Keep frame name empty to preserve existing golden expectations.
	frame := data.NewFrame("", data.NewField("time", nil, times))
	nKeys := len(q.Data)
	nMetrics := len(q.Meta.Metrics)
	for _, dp := range q.Data {
		keyLabel := labelFromKeys(dp.Keys, q.Meta.Keys)
		// Build Grafana-native labels only for cases where we keep metric-only series names.
		// For the new default behavior (multi-metric + multi-series), we avoid attaching labels
		// to prevent Grafana from rendering legend entries like: "Metric {k=v,...}".
		var lbls data.Labels
		if nMetrics <= 1 || nKeys <= 1 {
			if nMetrics > 1 {
				lbls = data.Labels{}
				for _, k := range q.Meta.Keys {
					if k.Hidden || strings.Contains(k.ID, ".custom.") {
						continue
					}
					if v, ok := dp.Keys[k.ID]; ok {
						switch vv := v.(type) {
						case string:
							lbls[k.Name] = vv
						default:
							b, _ := json.Marshal(v)
							lbls[k.Name] = string(b)
						}
					}
				}
			}
		}
		for _, m := range q.Meta.Metrics {
			// New default legend behavior:
			// - Multi-metric + multi-series: "Metric of key1 - key2 - ..."
			// - Preserve previous behavior otherwise.
			name := ""
			if nMetrics > 1 && nKeys > 1 {
				// Avoid labels to prevent Grafana's "{labels}" legend formatting.
				lbls = nil
				name = fmt.Sprintf("%s of %s", m.Name, keyLabel)
			} else {
				// Original naming behavior:
				// - If multiple keys: start with key label
				// - If multiple metrics: append " - <Metric Name>"
				// - Fallback to metric name if empty
				if nKeys > 1 {
					name = keyLabel
				}
				if nMetrics > 1 {
					if len(strings.TrimSpace(name)) > 0 {
						name += " - "
					}
					name += m.Name
				}
				// When labels are present (multi-metric), prefer metric-only name and
				// rely on labels for key differentiation to avoid legend duplication.
				if len(lbls) > 0 && nKeys > 1 {
					name = m.Name
				}
				if strings.TrimSpace(name) == "" {
					name = m.Name
				}
			}
			values := make([]*float64, len(tsKeys))
			for i, k := range tsKeys {
				if tsEntry, ok := dp.TimeSeries[k]; ok {
					values[i] = tsEntry[m.ID]
				}
			}
			field := data.NewField(name, lbls, values)
			if u, _ := toGrafanaUnit(m.Unit); u != "" {
				if field.Config == nil {
					field.Config = &data.FieldConfig{}
				}
				field.Config.Unit = u
			}
			frame.Fields = append(frame.Fields, field)
		}
	}
	return data.Frames{frame}
}

func framesFromSummary(q api.ResponseQuery) data.Frames {
	type col struct {
		name   string
		id     string
		isKey  bool
		metric *api.ResponseMetric
	}
	cols := make([]col, 0, len(q.Meta.Keys)+len(q.Meta.Metrics))
	for _, k := range q.Meta.Keys {
		// Exclude hidden keys and any keys whose ID contains ".custom." from table columns,
		// per funcspec field naming rules (custom dimensions should not appear in labels/columns).
		if k.Hidden {
			continue
		}
		if strings.Contains(k.ID, ".custom.") {
			continue
		}
		cols = append(cols, col{name: k.Name, id: k.ID, isKey: true})
	}
	for i := range q.Meta.Metrics {
		m := &q.Meta.Metrics[i]
		cols = append(cols, col{name: m.Name, id: m.ID, isKey: false, metric: m})
	}

	strCols := make([][]string, len(cols))
	numCols := make([][]*float64, len(cols))
	for i := range cols {
		if cols[i].isKey {
			strCols[i] = []string{}
		} else {
			numCols[i] = []*float64{}
		}
	}
	for _, dp := range q.Data {
		for i, c := range cols {
			if c.isKey {
				var sval string
				if v, ok := dp.Keys[c.id]; ok {
					if s, ok := v.(string); ok {
						sval = s
					} else {
						b, _ := json.Marshal(v)
						sval = string(b)
					}
				}
				strCols[i] = append(strCols[i], sval)
			} else {
				var f *float64
				if v, ok := dp.Metrics[c.id]; ok {
					f = v
				}
				numCols[i] = append(numCols[i], f)
			}
		}
	}
	fields := data.Fields{}
	for i, c := range cols {
		if c.isKey {
			fields = append(fields, data.NewField(c.name, nil, strCols[i]))
		} else {
			field := data.NewField(c.name, nil, numCols[i])
			if c.metric != nil {
				if u, _ := toGrafanaUnit(c.metric.Unit); u != "" {
					if field.Config == nil {
						field.Config = &data.FieldConfig{}
					}
					field.Config.Unit = u
				}
			}
			fields = append(fields, field)
		}
	}
	// Keep frame name empty to preserve existing golden expectations.
	return data.Frames{data.NewFrame("", fields...)}
}

// formatNoticeText builds: "[stage] Type BaseUrl — message"
func formatNoticeText(stage string, meta api.ResponseMeta, n *api.ResponseNotice) string {
	if n == nil {
		return ""
	}
	parts := []string{}
	s := strings.TrimSpace(stage)
	if s != "" {
		parts = append(parts, fmt.Sprintf("[%s]", s))
	}
	dsType := ""
	base := ""
	if len(meta.DataSources) > 0 {
		dsType = strings.TrimSpace(meta.DataSources[0].Type)
		base = strings.TrimSpace(meta.DataSources[0].BaseURL)
	}
	if dsType != "" {
		parts = append(parts, dsType)
	}
	if base != "" {
		parts = append(parts, base)
	}
	msg := strings.TrimSpace(n.Message)
	text := strings.Join(parts, " ")
	if text != "" && msg != "" {
		return text + " — " + msg
	}
	if msg != "" {
		return msg
	}
	return text
}

func attachWarningNotices(frames data.Frames, q api.ResponseQuery) {
	if q.Meta.Warning == nil {
		return
	}
	text := formatNoticeText(q.ID, q.Meta, q.Meta.Warning)
	if text == "" {
		return
	}
	for _, f := range frames {
		if f.Meta == nil {
			f.Meta = &data.FrameMeta{}
		}
		f.Meta.Notices = append(f.Meta.Notices, data.Notice{
			Severity: data.NoticeSeverityWarning,
			Text:     text,
		})
	}
}

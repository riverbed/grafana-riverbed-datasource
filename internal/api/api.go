package api

import (
	"encoding/json"
	"strings"
)

// Shared response models used by plugin and transform.

// ResponseMetric describes a single metric returned by the Riverbed queries API.
// The optional Unit field is populated from meta.metrics[].unit when present and
// is later mapped onto Grafana field configuration units by the transform layer.
type ResponseMetric struct {
	ID   string `json:"id"`
	Name string `json:"name"`
	Type string `json:"type"`
	Unit string `json:"unit,omitempty"`
}

type ResponseKey struct {
	ID     string `json:"id"`
	Name   string `json:"name"`
	Type   string `json:"type"`
	Hidden bool   `json:"hidden"`
}

type ResponseNotice struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

type ResponseDataSource struct {
	Name    string `json:"name"`
	Type    string `json:"type"`
	BaseURL string `json:"baseUrl"`
}

type ResponseMeta struct {
	TimeSeries bool                `json:"timeSeries"`
	Keys       []ResponseKey       `json:"keys"`
	Metrics    []ResponseMetric    `json:"metrics"`
	Warning    *ResponseNotice     `json:"warning,omitempty"`
	Error      *ResponseNotice     `json:"error,omitempty"`
	DataSources []ResponseDataSource `json:"dataSources,omitempty"`
}

type ResponseDataPoint struct {
	Keys       map[string]any                 `json:"keys"`
	Metrics    map[string]*float64            `json:"metrics"`
	TimeSeries map[string]map[string]*float64 `json:"timeSeries"`
}

type ResponseQuery struct {
	ID        string             `json:"id,omitempty"`
	Meta      ResponseMeta       `json:"meta"`
	Data      []ResponseDataPoint `json:"data"`
	NextLink  string             `json:"@nextLink"`
	TotalCount int               `json:"totalCount"`
}

type ResponseEnvelope struct {
	Data struct {
		Queries []ResponseQuery `json:"queries"`
	} `json:"data"`
	Queries []ResponseQuery `json:"queries"`
}

// ExtractQueries normalizes both shapes to a flat slice of queries.
func ExtractQueries(env ResponseEnvelope) []ResponseQuery {
	if len(env.Data.Queries) > 0 {
		return env.Data.Queries
	}
	return env.Queries
}

// PickPreferredQuery returns the preferred query (by id) when present.
// When not found, returns last query and false; returns zero value and false when empty.
func PickPreferredQuery(qs []ResponseQuery, preferred string) (ResponseQuery, bool) {
	for _, q := range qs {
		if strings.TrimSpace(q.ID) == preferred {
			return q, true
		}
	}
	if len(qs) == 0 {
		return ResponseQuery{}, false
	}
	return qs[len(qs)-1], false
}

// DecodeEnvelope parses bytes into ResponseEnvelope.
func DecodeEnvelope(b []byte) (ResponseEnvelope, error) {
	var env ResponseEnvelope
	err := json.Unmarshal(b, &env)
	return env, err
}



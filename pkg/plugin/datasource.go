package plugin

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"sort"
	"strings"
	"time"

	"github.com/grafana/grafana-plugin-sdk-go/backend"
	"github.com/grafana/grafana-plugin-sdk-go/backend/instancemgmt"
	"github.com/grafana/grafana-plugin-sdk-go/backend/log"
	"github.com/grafana/grafana-plugin-sdk-go/data"
	auth "github.com/riverbed/datastore/internal/auth"
	api "github.com/riverbed/datastore/internal/api"
	logutil "github.com/riverbed/datastore/internal/logutil"
	"github.com/riverbed/datastore/pkg/buildinfo"
	tr "github.com/riverbed/datastore/pkg/transform"
)

const tokenSkew = 5 * time.Minute // safety window before expiry
const preferredQueryID = "current" // preferred query id returned by API

var LOG_INFO_JSON_WRITE_FILE = false  // hardcoded, not a parameter, for security reasons

func init() {
	// CI will grep for this token in test logs if someone enables file dump logging at runtime.
	if LOG_INFO_JSON_WRITE_FILE {
		log.DefaultLogger.Warn("datastore: JSON file dump logging ENABLED (LOG_INFO_JSON_WRITE_FILE)")
	}
	// Propagate flag to logging module to ensure low-level protection.
	logutil.SetFileDumpEnabled(LOG_INFO_JSON_WRITE_FILE)
}

// #region agent log
// debugLog appends a single NDJSON debug line to the shared debug log file.
func debugLog(hypothesisId, location, message string, data map[string]any) {
	f, err := os.OpenFile(`debug.log`, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0o644)
	if err != nil {
		return
	}
	payload := map[string]any{
		"sessionId":   "debug-session",
		"runId":       "pre-fix",
		"hypothesisId": hypothesisId,
		"location":    location,
		"message":     message,
		"data":        data,
		"timestamp":   time.Now().UnixMilli(),
	}
	b, err := json.Marshal(payload)
	if err != nil {
		_ = f.Close()
		return
	}
	_, _ = f.Write(append(b, '\n'))
	_ = f.Close()
}

// #endregion

// Make sure Datasource implements required interfaces. This is important to do
// since otherwise we will only get a not implemented error response from plugin in
// runtime. In this example datasource instance implements backend.QueryDataHandler,
// backend.CheckHealthHandler interfaces. Plugin should not implement all these
// interfaces - only those which are required for a particular task.
var (
    _ backend.QueryDataHandler    = (*Datasource)(nil)
    _ backend.CheckHealthHandler  = (*Datasource)(nil)
    _ backend.CallResourceHandler = (*Datasource)(nil)
	_ instancemgmt.InstanceDisposer = (*Datasource)(nil)
)

// NewDatasource creates a new datasource instance.
func NewDatasource(s backend.DataSourceInstanceSettings) (instancemgmt.Instance, error) {
    // Parse ordered OAuth2 + base settings from JSONData/SecureJSONData
    type jsonData struct {
        TokenURL           string `json:"tokenUrl"`
        Scope              string `json:"scope"`
        APIBaseURL         string `json:"apiBaseUrl"`
        TenantID           string `json:"tenantId"`
        ClientID           string `json:"clientId"`
        InfoAPIVersion     string `json:"infoApiVersion"`
        QueriesAPIVersion  string `json:"queriesApiVersion"`
        RequestTimeoutSeconds int `json:"requestTimeoutSeconds"`
        PollMaxSeconds        int `json:"pollMaxSeconds"`
        PollIntervalMs        int `json:"pollIntervalMs"`
		MaxPageRequests       int `json:"maxPageRequests"`
		MaxRows               int `json:"maxRows"`
    }
    type secureData struct {
        ClientSecret string `json:"clientSecret"`
    }

    jd := jsonData{}
    if len(s.JSONData) > 0 {
        _ = json.Unmarshal(s.JSONData, &jd)
    }
    sd := secureData{}
    if len(s.DecryptedSecureJSONData) > 0 {
        if v, ok := s.DecryptedSecureJSONData["clientSecret"]; ok {
            sd.ClientSecret = v
        }
    }

    ds := &Datasource{
        httpClient:        &http.Client{Timeout: 60 * time.Second},
        tokenURL:          jd.TokenURL,
        scope:             jd.Scope,
        baseURL:           strings.TrimRight(jd.APIBaseURL, "/"),
        tenantID:          jd.TenantID,
        clientID:          jd.ClientID,
        clientSecret:      sd.ClientSecret,
        infoAPIVersion:    jd.InfoAPIVersion,
        queriesAPIVersion: jd.QueriesAPIVersion,
    }
    // set defaults
    if jd.PollMaxSeconds <= 0 { jd.PollMaxSeconds = 60 }
    if jd.PollIntervalMs <= 0 { jd.PollIntervalMs = 500 }
    // Clamp poll settings to safe ranges
    if jd.PollMaxSeconds < 5 { jd.PollMaxSeconds = 5 }
    if jd.PollMaxSeconds > 600 { jd.PollMaxSeconds = 600 }
    if jd.PollIntervalMs < 100 { jd.PollIntervalMs = 100 }
    if jd.PollIntervalMs > 60000 { jd.PollIntervalMs = 60000 }
    ds.requestTimeoutSeconds = jd.RequestTimeoutSeconds
    ds.pollMaxSeconds = jd.PollMaxSeconds
    ds.pollIntervalMs = jd.PollIntervalMs
	// Pagination limits with defaults
	if jd.MaxPageRequests <= 0 { jd.MaxPageRequests = 20 }
	if jd.MaxRows <= 0 { jd.MaxRows = 2_000_000 }
    // Clamp pagination safety caps
    if jd.MaxPageRequests > 100 { jd.MaxPageRequests = 100 }
    if jd.MaxPageRequests < 1 { jd.MaxPageRequests = 1 }
    if jd.MaxRows > 10_000_000 { jd.MaxRows = 10_000_000 }
	ds.maxPageRequests = jd.MaxPageRequests
	ds.maxRows = jd.MaxRows

    // Configure OAuth2 token sources (client credentials + caching)
    base := &auth.ClientCredentialsSource{
        HTTPClient:   ds.httpClient,
        TokenURL:     ds.tokenURL,
        ClientID:     ds.clientID,
        ClientSecret: ds.clientSecret,
        Scope:        ds.scope,
    }
    ds.tokenBase = base
    ds.tokenSource = &auth.CachingTokenSource{
        Base:          base,
        RefreshMargin: tokenSkew,
    }
    ds.tokenRefreshMargin = tokenSkew

    debugLog("H1", "datasource.go:NewDatasource", "NewDatasource settings",
        map[string]any{
            "infoApiVersion":     jd.InfoAPIVersion,
            "queriesApiVersion":  jd.QueriesAPIVersion,
            "dsInfoApiVersion":   ds.infoAPIVersion,
            "dsQueriesApiVersion": ds.queriesAPIVersion,
        },
    )
    return ds, nil
}

// Datasource is an example datasource which can respond to data queries, reports
// its health and has streaming skills.
type Datasource struct{
    httpClient   *http.Client
    // OAuth2
    tokenSource  auth.TokenSource
    tokenBase    *auth.ClientCredentialsSource
    tokenRefreshMargin time.Duration
    tokenURL     string
    scope        string
    baseURL      string
    tenantID         string
    clientID         string
    clientSecret     string
    // Per-endpoint API versions.
    infoAPIVersion    string
    queriesAPIVersion string

    // Async/poll config
    requestTimeoutSeconds int
    pollMaxSeconds        int
    pollIntervalMs        int
    // Pagination safety limits
    maxPageRequests       int
    maxRows               int
}

// resolveInfoVersion returns the API version to use for info endpoints.
// Preference order: explicit infoAPIVersion -> default 1.0.
func (d *Datasource) resolveInfoVersion() string {
    info := strings.TrimSpace(d.infoAPIVersion)
    resolved := info
    if resolved == "" {
        resolved = "1.0"
    }
    debugLog("H2", "datasource.go:resolveInfoVersion", "resolveInfoVersion",
        map[string]any{"infoApiVersion": info, "resolved": resolved},
    )
    return resolved
}

// resolveQueriesVersion returns the API version to use for queries endpoints.
// Preference order: explicit queriesAPIVersion -> default 1.0.
func (d *Datasource) resolveQueriesVersion() string {
    queries := strings.TrimSpace(d.queriesAPIVersion)
    resolved := queries
    if resolved == "" {
        resolved = "1.0"
    }
    debugLog("H3", "datasource.go:resolveQueriesVersion", "resolveQueriesVersion",
        map[string]any{"queriesApiVersion": queries, "resolved": resolved},
    )
    return resolved
}

// Dispose implements datasource.Instance (called on settings change)
func (d *Datasource) Dispose() {}

// QueryData handles multiple queries and returns multiple responses.
// req contains the queries []DataQuery (where each query contains RefID as a unique identifier).
// The QueryDataResponse contains a map of RefID to the response for each query, and each response
// contains Frames ([]*Frame).
func (d *Datasource) QueryData(ctx context.Context, req *backend.QueryDataRequest) (*backend.QueryDataResponse, error) {
	// create response struct
	response := backend.NewQueryDataResponse()

	// loop over queries and execute them individually.
	for _, q := range req.Queries {
		res := d.query(ctx, req.PluginContext, q)

		// save the response in a hashmap
		// based on with RefID as identifier
		response.Responses[q.RefID] = res
	}

	return response, nil
}

// Query model received from frontend
type queryModel struct{
    QueryText string `json:"queryText"`
}

// Minimal shapes for Data Ocean response used for framing (shared via internal/api)

// Pagination GET payload shape: { "query": { ... } }
type responseQueryPage struct {
    Query api.ResponseQuery `json:"query"`
}
// Upstream API error models (for 4xx/5xx)
type apiInnerError struct {
    ErrorID string `json:"ErrorId"`
}

type apiErrorDetail struct {
    Code       string        `json:"code"`
    Message    string        `json:"message"`
    Target     string        `json:"target"`
    InnerError apiInnerError `json:"innererror"`
}

type apiError struct {
    Code       string           `json:"code"`
    Message    string           `json:"message"`
    Details    []apiErrorDetail `json:"details"`
    InnerError apiInnerError    `json:"innererror"`
}

func buildAPISummary(errObj apiError) string {
    if len(errObj.Details) == 0 {
        return strings.TrimSpace(errObj.Message)
    }
    parts := make([]string, 0, len(errObj.Details))
    for _, d := range errObj.Details {
        text := d.Message
        if d.Target != "" {
            text = d.Target + ": " + d.Message
        }
        parts = append(parts, text)
    }
    // Example: "Invalid request: properties: required; timeRange: required"
    prefix := strings.TrimSpace(errObj.Message)
    if prefix == "" {
        return strings.Join(parts, "; ")
    }
    return prefix + ": " + strings.Join(parts, "; ")
}

func toNotices(details []apiErrorDetail) []data.Notice {
    if len(details) == 0 {
        return nil
    }
    notices := make([]data.Notice, 0, len(details))
    for _, d := range details {
        text := d.Message
        if d.Target != "" {
            text = d.Target + ": " + d.Message
        }
        notices = append(notices, data.Notice{Severity: data.NoticeSeverityError, Text: text})
    }
    return notices
}


func injectTimeRange(body map[string]any, from, to time.Time) {
    body["timeRange"] = map[string]any{
        "startTime": fmt.Sprintf("%d", from.Unix()),
        "endTime":   fmt.Sprintf("%d", to.Unix()),
    }
}

// Frames conversion moved to pkg/transform
// Local helpers used by tests that assert naming rules.
func labelFromKeys(keys map[string]any) string {
    if keys == nil {
        return ""
    }
    ordered := make([]string, 0, len(keys))
    for k := range keys {
        if strings.Contains(k, ".custom.") {
            continue
        }
        ordered = append(ordered, k)
    }
    sort.Strings(ordered)
    labels := make([]string, 0, len(ordered))
    for _, k := range ordered {
        v := keys[k]
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

// formatSeriesName:
// - Multiple keys: "<keyLabel> - <metricLabel>"
// - Single key: "<metricLabel>"
// - Fallback to metric label when the computed name is empty
func formatSeriesName(nKeys int, keyLabel, metricLabel string) string {
    name := ""
    if nKeys > 1 {
        name = keyLabel
    }
    if len(strings.TrimSpace(name)) > 0 {
        name += " - "
    }
    name += metricLabel
    if strings.TrimSpace(name) == "" {
        return metricLabel
    }
    return name
}

// framesFromTimeSeries reproduces the plugin's time-series naming rules for tests.
func framesFromTimeSeries(q api.ResponseQuery) data.Frames {
    // unique, sorted timestamps (seconds)
    tsSet := map[int64]struct{}{}
    for _, dp := range q.Data {
        for ts := range dp.TimeSeries {
            var s int64
            fmt.Sscan(ts, &s)
            tsSet[s] = struct{}{}
        }
    }
    timestamps := make([]int64, 0, len(tsSet))
    for s := range tsSet { timestamps = append(timestamps, s) }
    sort.Slice(timestamps, func(i, j int) bool { return timestamps[i] < timestamps[j] })

    times := make([]time.Time, len(timestamps))
    for i, s := range timestamps { times[i] = time.Unix(s, 0) }

    frame := data.NewFrame("", data.NewField("time", nil, times))
    nKeys := len(q.Data)
    for _, dp := range q.Data {
        keyLabel := labelFromKeys(dp.Keys)
        for _, m := range q.Meta.Metrics {
            name := formatSeriesName(nKeys, keyLabel, m.Name)
            values := make([]*float64, len(timestamps))
            for i, s := range timestamps {
                sval := fmt.Sprintf("%d", s)
                var v *float64
                if tsEntry, ok := dp.TimeSeries[sval]; ok { v = tsEntry[m.ID] }
                values[i] = v
            }
            frame.Fields = append(frame.Fields, data.NewField(name, nil, values))
        }
    }
    return data.Frames{frame}
}

func (d *Datasource) query(ctx context.Context, pCtx backend.PluginContext, q backend.DataQuery) backend.DataResponse {
    var dr backend.DataResponse
    // Parse query model
	var qm queryModel
    if err := json.Unmarshal(q.JSON, &qm); err != nil {
		return backend.ErrDataResponse(backend.StatusBadRequest, fmt.Sprintf("json unmarshal: %v", err.Error()))
	}
    // Build request body
    var body map[string]any
    if strings.TrimSpace(qm.QueryText) == "" {
        return backend.ErrDataResponse(backend.StatusBadRequest, "empty queryText")
    }
    if err := json.Unmarshal([]byte(qm.QueryText), &body); err != nil {
        return backend.ErrDataResponse(backend.StatusBadRequest, fmt.Sprintf("invalid queryText JSON: %v", err.Error()))
    }
    // Log the effective time range for which this query is executed.
    // Use Error level for now to ensure high visibility in logs.
    fromLocal := q.TimeRange.From.In(time.Local).Format(time.RFC3339)
    toLocal := q.TimeRange.To.In(time.Local).Format(time.RFC3339)
    log.DefaultLogger.Debug(
        "datastore: executing query time range",
        "refId", q.RefID,
        "fromLocal", fromLocal,
        "toLocal", toLocal,
    )
    injectTimeRange(body, q.TimeRange.From, q.TimeRange.To)
    b, _ := json.Marshal(body)

    ver := d.resolveQueriesVersion()
    path := "/api/data.store.query/" + ver + "/tenants/" + url.PathEscape(d.tenantID) + "/queries"
    // add X-Request-Timeout if configured
    resp, err := d.proxyRequestWithHeaders(ctx, http.MethodPost, path, b, map[string]string{
        "X-Request-Timeout": func() string { if d.requestTimeoutSeconds > 0 { return fmt.Sprintf("%d", d.requestTimeoutSeconds) } else { return "" } }(),
    })
    if err != nil {
        dr.Error = err
        return dr
    }
    if resp.StatusCode == http.StatusAccepted {
        log.DefaultLogger.Info("datastore: query 202 Accepted", "path", path)
        // Poll Location until 200 or timeout
        loc := resp.Header.Get("Location")
        _ = resp.Body.Close()
        if loc == "" {
            log.DefaultLogger.Error("datastore: 202 without Location header")
            dr.Error = fmt.Errorf("202 Accepted without Location header")
            return dr
        }
        // resolve relative locations
        if strings.HasPrefix(loc, "/") {
            loc = strings.TrimRight(d.baseURL, "/") + loc
        }
        log.DefaultLogger.Debug("datastore: polling started", "location", loc, "maxSeconds", d.pollMaxSeconds, "intervalMs", d.pollIntervalMs)
        deadline := time.Now().Add(time.Duration(d.pollMaxSeconds) * time.Second)
        interval := time.Duration(d.pollIntervalMs) * time.Millisecond
        for {
            if ctx.Err() != nil {
                log.DefaultLogger.Warn("datastore: polling cancelled", "err", ctx.Err())
                dr.Error = ctx.Err()
                return dr
            }
            if time.Now().After(deadline) {
                log.DefaultLogger.Error("datastore: polling timeout", "deadline", deadline)
                dr.Error = fmt.Errorf("poll timeout waiting for query completion")
                return dr
            }
            req, cancel, e := d.newUpstreamRequest(ctx, http.MethodGet, loc, nil, nil)
            if e != nil {
                dr.Error = e
                return dr
            }
            r, e := d.httpClient.Do(req)
            if e != nil {
                cancel()
                log.DefaultLogger.Error("datastore: polling request failed", "err", e)
                dr.Error = e
                return dr
            }
            if r.StatusCode == http.StatusOK {
                log.DefaultLogger.Debug("datastore: polling completed", "status", r.Status)
                r.Body = &bodyWithCancel{ReadCloser: r.Body, cancel: cancel}
                resp = r
                break
            }
            cancel()
            _ = r.Body.Close()
            time.Sleep(interval)
            if interval < 2*time.Second { interval *= 2 }
        }
    }
    defer resp.Body.Close()
    if resp.StatusCode != http.StatusOK {
        // Attempt to parse structured API error body and expose to panel/inspector
        b, _ := io.ReadAll(resp.Body)
        var apiErr apiError
        if err := json.Unmarshal(b, &apiErr); err == nil && (apiErr.Code != "" || apiErr.Message != "") {
            // Build concise summary for panel error
            summary := buildAPISummary(apiErr)
            dr.Error = fmt.Errorf("%s: %s", strings.TrimSpace(apiErr.Code), strings.TrimSpace(summary))
            // Attach notices and full JSON to frame meta for inspector
            frame := data.NewFrame("error")
            frame.Meta = &data.FrameMeta{
                Notices: toNotices(apiErr.Details),
                Custom: map[string]any{
                    "apiError": apiErr,
                    "status":   resp.Status,
                },
            }
            dr.Frames = data.Frames{frame}
            return dr
        }
        // Fallback: use raw response body as the error message
        raw := sanitizeErrorBody(b, 2048)
        if raw == "" { raw = resp.Status }
        dr.Error = fmt.Errorf("query failed: %s", raw)
        frame := data.NewFrame("error")
        frame.Meta = &data.FrameMeta{
            Notices: []data.Notice{{Severity: data.NoticeSeverityError, Text: raw}},
            Custom:  map[string]any{"status": resp.Status},
        }
        dr.Frames = data.Frames{frame}
        return dr
    }
    var parsed api.ResponseEnvelope
    if err := json.NewDecoder(resp.Body).Decode(&parsed); err != nil {
        dr.Error = err
        return dr
    }
	frames, ferr := d.processQueryResponse(ctx, parsed, q.RefID)
	if ferr != nil {
		dr.Error = ferr
		return dr
	}
	dr.Frames = frames
	return dr
}

// pageAll follows @nextLink and aggregates data points with safety limits.
func (d *Datasource) pageAll(ctx context.Context, start api.ResponseQuery) (api.ResponseQuery, error) {
    agg := start
    if agg.NextLink == "" {
        return agg, nil
    }
    // Pre-allocate rows when TotalCount is known to reduce reallocations
    if agg.TotalCount > len(agg.Data) {
        target := agg.TotalCount
        if d.maxRows > 0 && target > d.maxRows {
            target = d.maxRows
        }
        buf := make([]api.ResponseDataPoint, len(agg.Data), target)
        copy(buf, agg.Data)
        agg.Data = buf
    }
    log.DefaultLogger.Debug("datastore: pagination start",
        "hasNext", agg.NextLink != "",
        "nextLink", agg.NextLink,
        "initialRows", len(agg.Data),
        "maxPageRequests", d.maxPageRequests,
        "maxRows", d.maxRows,
    )
    pageCount := 0
    rowCount := len(agg.Data)
    next := agg.NextLink
    for next != "" {
        pageCount++
        if d.maxPageRequests > 0 && pageCount > d.maxPageRequests {
            log.DefaultLogger.Error("datastore: pagination max pages exceeded", "maxPageRequests", d.maxPageRequests, "pageCount", pageCount)
            return agg, fmt.Errorf("pagination stopped: exceeded MaxPageRequests=%d", d.maxPageRequests)
        }
        // Fetch next page
        rq, err := d.fetchPage(ctx, next)
        if err != nil {
            return agg, err
        }
        // Append rows
        agg.Data = append(agg.Data, rq.Data...)
        rowCount += len(rq.Data)
        if d.maxRows > 0 && rowCount > d.maxRows {
            log.DefaultLogger.Error("datastore: pagination max rows exceeded", "maxRows", d.maxRows, "rows", rowCount)
            return agg, fmt.Errorf("pagination stopped: exceeded MaxRows=%d", d.maxRows)
        }
        next = rq.NextLink
    }
    // Clear NextLink after aggregation
    agg.NextLink = ""
    log.DefaultLogger.Debug("datastore: pagination done", "pages", pageCount, "rowsTotal", rowCount)
    return agg, nil
}

// fetchPage supports absolute and relative next links and decodes the payload.
func (d *Datasource) fetchPage(ctx context.Context, next string) (api.ResponseQuery, error) {
    var rq api.ResponseQuery
    var resp *http.Response
    var err error
    // Relative link: use proxyRequest (which prefixes baseURL)
    if strings.HasPrefix(next, "/") {
        resp, err = d.proxyRequest(ctx, http.MethodGet, next, nil)
        if err != nil {
            return rq, err
        }
    } else if strings.HasPrefix(next, "http://") || strings.HasPrefix(next, "https://") {
        // Absolute link: build request manually
        req, cancel, e := d.newUpstreamRequest(ctx, http.MethodGet, next, nil, nil)
        if e != nil {
            return rq, e
        }
        resp, err = d.httpClient.Do(req)
        if err != nil {
            cancel()
            return rq, err
        }
        defer cancel()
    } else {
        return rq, fmt.Errorf("unsupported nextLink format")
    }
    defer resp.Body.Close()
    if resp.StatusCode != http.StatusOK {
        b, _ := io.ReadAll(resp.Body)
        return rq, fmt.Errorf("pagination request failed: %s %s", resp.Status, strings.TrimSpace(string(b)))
    }
    // Decode as { "query": { ... } } first
    var page responseQueryPage
    buf, _ := io.ReadAll(resp.Body)
	// Pretty-print the JSON page body for debugging
	logutil.LogJSONPretty("pagination page JSON", "url", next, buf)
    if err := json.Unmarshal(buf, &page); err == nil && (len(page.Query.Data) > 0 || page.Query.NextLink != "" || len(page.Query.Meta.Metrics) > 0) {
        return page.Query, nil
    }
    // Fallback to full envelope with queries
    var parsed api.ResponseEnvelope
    if err := json.Unmarshal(buf, &parsed); err == nil {
        qs := api.ExtractQueries(parsed)
		if len(qs) > 0 {
			if picked, ok := api.PickPreferredQuery(qs, preferredQueryID); ok {
				return picked, nil
			}
			log.DefaultLogger.Warn("datastore: '" + preferredQueryID + "' query not found; using last")
			return qs[len(qs)-1], nil
		} else {
			// Gracefully stop pagination if no query present
			log.DefaultLogger.Warn("datastore: pagination response contained no queries; stopping")
			return rq, nil
        }
    }
	// Gracefully stop pagination on unexpected shapes
	log.DefaultLogger.Warn("datastore: unexpected pagination payload; stopping")
	return rq, nil
}

// CheckHealth handles health checks sent from Grafana to the plugin.
// The main use case for these health checks is the test button on the
// datasource configuration page which allows users to verify that
// a datasource is working as expected.
func (d *Datasource) CheckHealth(ctx context.Context, _ *backend.CheckHealthRequest) (*backend.CheckHealthResult, error) {
    // Call dedicated ping endpoints for both info and queries APIs to validate credentials and versions.
    log.DefaultLogger.Info("datastore: CheckHealth start",
        "baseURL", d.baseURL,
        "tokenURL", d.tokenURL,
        "scope", d.scope,
        "tenantID", d.tenantID,
        "clientID", d.clientID,
    )
    infoVer := d.resolveInfoVersion()
    queriesVer := d.resolveQueriesVersion()

    if err := validateAPIVersion(infoVer); err != nil {
        return &backend.CheckHealthResult{
            Status:  backend.HealthStatusError,
            Message: fmt.Sprintf("Invalid info API version: %s", err.Error()),
        }, nil
    }
    if err := validateAPIVersion(queriesVer); err != nil {
        return &backend.CheckHealthResult{
            Status:  backend.HealthStatusError,
            Message: fmt.Sprintf("Invalid queries API version: %s", err.Error()),
        }, nil
    }

    infoPath := "/api/data.store.info/" + infoVer + "/tenants/" + url.PathEscape(d.tenantID) + "/ping"
    debugLog("H4", "datasource.go:CheckHealth", "CheckHealth info ping",
        map[string]any{"version": infoVer, "path": infoPath},
    )
    log.DefaultLogger.Info("datastore: CheckHealth ping info", "method", http.MethodGet, "path", infoPath)
    infoResp, err := d.proxyRequest(ctx, http.MethodGet, infoPath, nil)
    if err != nil {
        return &backend.CheckHealthResult{
            Status:  backend.HealthStatusError,
            Message: fmt.Sprintf("info API test failed: %s", err.Error()),
        }, nil
    }
    defer infoResp.Body.Close()
    if infoResp.StatusCode != http.StatusOK {
        return &backend.CheckHealthResult{
            Status:  backend.HealthStatusError,
            Message: fmt.Sprintf("info API test failed: %s", infoResp.Status),
        }, nil
    }

    queriesPath := "/api/data.store.query/" + queriesVer + "/tenants/" + url.PathEscape(d.tenantID) + "/ping"
    debugLog("H7", "datasource.go:CheckHealth", "CheckHealth queries ping",
        map[string]any{"version": queriesVer, "path": queriesPath},
    )
    log.DefaultLogger.Info("datastore: CheckHealth ping queries", "method", http.MethodGet, "path", queriesPath)
    queriesResp, err := d.proxyRequest(ctx, http.MethodGet, queriesPath, nil)
    if err != nil {
        return &backend.CheckHealthResult{
            Status:  backend.HealthStatusError,
            Message: fmt.Sprintf("queries API test failed: %s", err.Error()),
        }, nil
    }
    defer queriesResp.Body.Close()
    if queriesResp.StatusCode != http.StatusOK {
        return &backend.CheckHealthResult{
            Status:  backend.HealthStatusError,
            Message: fmt.Sprintf("queries API test failed: %s", queriesResp.Status),
        }, nil
    }

    return &backend.CheckHealthResult{
        Status:  backend.HealthStatusOk,
        Message: "Success (info and queries APIs healthy)",
    }, nil
}

// CallResource exposes proxy endpoints for the frontend
func (d *Datasource) CallResource(ctx context.Context, req *backend.CallResourceRequest, sender backend.CallResourceResponseSender) error {
    switch req.Path {
    case "proxy/info":
        ver := d.resolveInfoVersion()
        debugLog("H5", "datasource.go:CallResource[info]", "CallResource info resolved version",
            map[string]any{"version": ver},
        )
        if err := validateAPIVersion(ver); err != nil {
            _ = sender.Send(&backend.CallResourceResponse{Status: http.StatusBadRequest, Body: []byte(err.Error())})
            return nil
        }
        resp, err := d.proxyRequest(ctx, http.MethodGet, "/api/data.store.info/"+ver+"/tenants/"+url.PathEscape(d.tenantID)+"/info", nil)
        if err != nil {
            _ = sender.Send(&backend.CallResourceResponse{Status: http.StatusBadGateway, Body: []byte(err.Error())})
            return nil
        }
        defer resp.Body.Close()
        b, _ := io.ReadAll(resp.Body)
        // Debug upstream error responses for proxy/info without logging secrets.
        if resp.StatusCode >= http.StatusBadRequest {
            debugLog("A1", "datasource.go:CallResource[info]", "Upstream info API returned error",
                map[string]any{
                    "status": resp.StatusCode,
                    "body":   sanitizeErrorBody(b, 256),
                },
            )
        }
        _ = sender.Send(&backend.CallResourceResponse{Status: resp.StatusCode, Body: b, Headers: map[string][]string{"Content-Type": {"application/json"}}})
        return nil
    case "proxy/queries":
        // Forward POST body as-is
        body := req.Body
        ver := d.resolveQueriesVersion()
        debugLog("H6", "datasource.go:CallResource[queries]", "CallResource queries resolved version",
            map[string]any{"version": ver},
        )
        if err := validateAPIVersion(ver); err != nil {
            _ = sender.Send(&backend.CallResourceResponse{Status: http.StatusBadRequest, Body: []byte(err.Error())})
            return nil
        }
        resp, err := d.proxyRequest(ctx, http.MethodPost, "/api/data.store.query/"+ver+"/tenants/"+url.PathEscape(d.tenantID)+"/queries", body)
        if err != nil {
            _ = sender.Send(&backend.CallResourceResponse{Status: http.StatusBadGateway, Body: []byte(err.Error())})
            return nil
        }
        defer resp.Body.Close()
        b, _ := io.ReadAll(resp.Body)
        _ = sender.Send(&backend.CallResourceResponse{Status: resp.StatusCode, Body: b, Headers: map[string][]string{"Content-Type": {"application/json"}}})
        return nil
    default:
        _ = sender.Send(&backend.CallResourceResponse{Status: http.StatusNotFound, Body: []byte("not found")})
        return nil
    }
}

// bearer returns the current access token string from the token source.
func (d *Datasource) bearer(ctx context.Context) (string, error) {
    if d.tokenSource == nil {
        return "", errors.New("OAuth2 configuration incomplete")
    }
    tok, err := d.tokenSource.Token(ctx)
    if err != nil {
        return "", err
    }
    if tok == nil || strings.TrimSpace(tok.AccessToken) == "" {
        return "", errors.New("empty access token")
    }
    return tok.AccessToken, nil
}

// withTimeout returns a child context with a per-request timeout derived from settings.
func (d *Datasource) withTimeout(ctx context.Context) (context.Context, context.CancelFunc) {
    if d.requestTimeoutSeconds > 0 {
        return context.WithTimeout(ctx, time.Duration(d.requestTimeoutSeconds)*time.Second)
    }
    return context.WithTimeout(ctx, 60*time.Second)
}

// userAgent returns the UA string for upstream Data Store calls.
func (d *Datasource) userAgent() string {
	version := strings.TrimSpace(buildinfo.Version)
	if version == "" || version == "unset" {
		version = "dev"
	}
	return "grafana-datastore-plugin/" + version
}

// newUpstreamRequest builds a request with timeout, auth, UA, and extra headers.
func (d *Datasource) newUpstreamRequest(ctx context.Context, method, fullURL string, body io.Reader, extra map[string]string) (*http.Request, context.CancelFunc, error) {
	tctx, cancel := d.withTimeout(ctx)
	req, err := http.NewRequestWithContext(tctx, method, fullURL, body)
	if err != nil {
		cancel()
		return nil, nil, err
	}
	if ua := d.userAgent(); ua != "" {
		req.Header.Set("User-Agent", ua)
	}
	for k, v := range extra {
		if v != "" {
			req.Header.Set(k, v)
		}
	}
	token, te := d.bearer(ctx)
	if te != nil {
		cancel()
		return nil, nil, te
	}
	req.Header.Set("Authorization", "Bearer "+token)
	return req, cancel, nil
}

// bodyWithCancel cancels the request context when the body is closed.
type bodyWithCancel struct {
    io.ReadCloser
    cancel context.CancelFunc
}

func (b *bodyWithCancel) Close() error {
    err := b.ReadCloser.Close()
    if b.cancel != nil {
        b.cancel()
    }
    return err
}

// prettyJSON returns indented JSON when possible; otherwise returns trimmed raw text.
// (moved JSON pretty/file logging to internal/logutil)

// proxyRequest builds the full URL to the upstream and executes with bearer auth
func (d *Datasource) proxyRequest(ctx context.Context, method, path string, body []byte) (*http.Response, error) {
	return d.proxyRequestWithHeaders(ctx, method, path, body, nil)
}

// proxyRequestWithHeaders same as proxyRequest but allows extra headers
func (d *Datasource) proxyRequestWithHeaders(ctx context.Context, method, path string, body []byte, extra map[string]string) (*http.Response, error) {
    if d.baseURL == "" || d.tenantID == "" {
        return nil, errors.New("missing base URL or tenant ID")
    }
    fullURL := strings.TrimRight(d.baseURL, "/") + path
    var rdr *bytes.Reader
    if method == http.MethodPost {
        if len(body) == 0 {
            body = []byte("{}")
        }
        rdr = bytes.NewReader(body)
    } else {
        rdr = bytes.NewReader(nil)
    }
	headers := map[string]string{}
	if method == http.MethodPost {
		headers["Content-Type"] = "application/json"
		// Readable outgoing JSON logging
		logutil.LogJSONPretty("outgoing JSON", "url", fullURL, body)
	}
	for k, v := range extra {
		headers[k] = v
	}
	req, cancel, err := d.newUpstreamRequest(ctx, method, fullURL, rdr, headers)
	if err != nil {
		return nil, err
	}
	resp, err := d.httpClient.Do(req)
    if err != nil {
        cancel()
        return nil, err
    }
	// Read, pretty-print, and restore the response body for callers
	rb, _ := io.ReadAll(resp.Body)
	_ = resp.Body.Close()
	// Readable incoming JSON logging
	logutil.LogJSONPretty("incoming JSON", "status", resp.Status, rb)
	resp.Body = &bodyWithCancel{ReadCloser: io.NopCloser(bytes.NewReader(rb)), cancel: cancel}
    return resp, nil
}

// sanitizeErrorBody trims, limits size, and strips control characters from error bodies.
func sanitizeErrorBody(b []byte, max int) string {
    s := string(b)
    // strip control characters except common whitespace
    s = strings.Map(func(r rune) rune {
        if r < 32 && r != '\n' && r != '\r' && r != '\t' {
            return -1
        }
        return r
    }, s)
    s = strings.TrimSpace(s)
    if max > 0 && len(s) > max {
        s = s[:max] + "..."
    }
    return s
}

// validateAPIVersion enforces support for API versions 1.x only.
func validateAPIVersion(ver string) error {
    if ver == "" {
        return nil
    }
    if !strings.HasPrefix(ver, "1") || (len(ver) > 1 && ver[1] != '.') {
        return fmt.Errorf("This version of the plugin only support APIs of version 1.x")
    }
    return nil
}

// processQueryResponse applies selection, optional pagination, and transforms
// the selected query into Grafana frames.
func (d *Datasource) processQueryResponse(ctx context.Context, parsed api.ResponseEnvelope, refID string) (data.Frames, error) {
	// Support both shapes
	queries := api.ExtractQueries(parsed)
	if len(queries) == 0 {
		log.DefaultLogger.Warn("datastore: response contained no queries")
		return data.Frames{}, nil
	}
	// Prefer preferredQueryID; warn if missing
	var picked api.ResponseQuery
	if q, ok := api.PickPreferredQuery(queries, preferredQueryID); ok {
		picked = q
	} else {
		log.DefaultLogger.Warn("datastore: '" + preferredQueryID + "' query not found; using last")
		picked = queries[len(queries)-1]
	}
	// Follow pagination if @nextLink present
	agg, err := d.pageAll(ctx, picked)
	if err != nil {
		return nil, err
	}
	// Reuse shared transformer: wrap aggregated query as { "queries": [ ... ] }
	raw, _ := json.Marshal(map[string]any{"queries": []api.ResponseQuery{agg}})
	frames, ferr := tr.JSONToFrames(nil, raw)
	if ferr != nil {
		return nil, ferr
	}
	// Optional: write converted frames to file for debugging
	if fb, merr := json.Marshal(frames); merr == nil {
		logutil.LogJSONPretty("converted frames JSON", "refId", refID, fb)
	} else {
		log.DefaultLogger.Warn("datastore: frames JSON marshal failed", "err", merr)
	}
	return frames, nil
}

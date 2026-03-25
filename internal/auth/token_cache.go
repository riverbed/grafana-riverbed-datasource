package auth

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"
)

// Clock provides current time (allows faking in tests).
type Clock interface{ Now() time.Time }

type realClock struct{}

func (realClock) Now() time.Time { return time.Now() }

// Token is a minimal access token with expiry.
type Token struct {
	AccessToken string
	Expiry      time.Time
}

// TokenSource returns an access token, possibly cached.
type TokenSource interface {
	Token(ctx context.Context) (*Token, error)
}

// ClientCredentialsSource performs a client-credentials grant each time Token is called.
type ClientCredentialsSource struct {
	HTTPClient   *http.Client
	TokenURL     string
	ClientID     string
	ClientSecret string
	Scope        string
	Clock        Clock
}

func (s *ClientCredentialsSource) Token(ctx context.Context) (*Token, error) {
	if s.HTTPClient == nil {
		s.HTTPClient = http.DefaultClient
	}
	if s.Clock == nil {
		s.Clock = realClock{}
	}
	if s.TokenURL == "" || s.ClientID == "" || s.ClientSecret == "" {
		return nil, errors.New("OAuth2 configuration incomplete")
	}
	form := url.Values{}
	form.Set("grant_type", "client_credentials")
	form.Set("client_id", s.ClientID)
	form.Set("client_secret", s.ClientSecret)
	if s.Scope != "" {
		form.Set("scope", s.Scope)
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, s.TokenURL, strings.NewReader(form.Encode()))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	resp, err := s.HTTPClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, errors.New("token request failed: " + resp.Status)
	}
	var tr struct {
		AccessToken string `json:"access_token"`
		ExpiresIn   int    `json:"expires_in"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&tr); err != nil {
		return nil, err
	}
	if tr.AccessToken == "" {
		return nil, errors.New("empty access_token")
	}
	exp := s.Clock.Now().Add(time.Duration(tr.ExpiresIn) * time.Second)
	if tr.ExpiresIn == 0 {
		exp = s.Clock.Now().Add(3600 * time.Second)
	}
	return &Token{AccessToken: tr.AccessToken, Expiry: exp}, nil
}

// CachingTokenSource wraps a base source with an in-memory cache and preemptive refresh margin.
type CachingTokenSource struct {
	Base          TokenSource
	Clock         Clock
	RefreshMargin time.Duration

	mu    sync.Mutex
	token *Token
}

func (s *CachingTokenSource) Token(ctx context.Context) (*Token, error) {
	if s.Clock == nil {
		s.Clock = realClock{}
	}
	now := s.Clock.Now()
	s.mu.Lock()
	tok := s.token
	if tok != nil && tok.Expiry.Sub(now) > s.RefreshMargin {
		// cached
		s.mu.Unlock()
		return tok, nil
	}
	s.mu.Unlock()

	// refresh under lock
	s.mu.Lock()
	defer s.mu.Unlock()
	// re-check after acquiring lock
	now = s.Clock.Now()
	if s.token != nil && s.token.Expiry.Sub(now) > s.RefreshMargin {
		return s.token, nil
	}
	nt, err := s.Base.Token(ctx)
	if err != nil {
		return nil, err
	}
	s.token = nt
	return nt, nil
}

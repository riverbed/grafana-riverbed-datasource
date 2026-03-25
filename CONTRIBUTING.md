# Contributing

## Development
- Node: use `.nvmrc` (Node 22). Install deps with `npm install`.
- Backend: `mage -v` builds Go binaries.
- Dev server: `npm run server`.
- Frontend watch: `npm run dev`.

## Testing
- Unit tests: `npm run test:ci` (frontend) and `go test ./...` (backend).
- E2E (Playwright): `npm run e2e` (requires `npm run server` first).

## Coding standards
- TypeScript: strict types; avoid `any` in core paths.
- Go: prefer context-aware calls; avoid global state; log at appropriate levels.
- Lint: `npm run lint` and `go vet ./...`.

## Pull requests
- Add tests with functional changes.
- Update `CHANGELOG.md` under Unreleased with a brief summary.
- Keep PRs focused and small when possible.



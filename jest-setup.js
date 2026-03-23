// Jest setup provided by Grafana scaffolding
import './.config/jest-setup';

// Clipboard fallback: by default, make clipboard unavailable so tests can assert error paths.
try {
  if (!('clipboard' in navigator)) {
    Object.assign(navigator, {
      clipboard: {
        writeText: async () => {
          throw new Error('Clipboard unavailable');
        },
        readText: async () => {
          throw new Error('Clipboard unavailable');
        },
      },
    });
  }
} catch {}

// Minimal monaco stub to avoid crashes in tests that touch autocomplete setup.
try {
  const w = typeof window !== 'undefined' ? window : global;
  if (!w.monaco) {
    const noop = () => {};
    w.monaco = {
      Range: class Range {
        constructor(startLineNumber, startColumn, endLineNumber, endColumn) {
          this.startLineNumber = startLineNumber;
          this.startColumn = startColumn;
          this.endLineNumber = endLineNumber;
          this.endColumn = endColumn;
        }
      },
      languages: {
        json: {
          jsonDefaults: {
            setDiagnosticsOptions: noop,
          },
        },
      },
    };
  }
} catch {}

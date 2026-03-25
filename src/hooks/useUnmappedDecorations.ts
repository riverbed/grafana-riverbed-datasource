import { useEffect, useRef } from 'react';

type Params = {
  editor: any;
  monaco: any;
  unmappedPaths: string[];
  jsonText: string;
};

export function useUnmappedDecorations({ editor, monaco, unmappedPaths, jsonText }: Params) {
  const decorationsRef = useRef<string[] | null>(null);

  useEffect(() => {
    if (!editor || !monaco) {
      return;
    }
    const model = editor.getModel?.();
    if (!model) {
      return;
    }
    // If editor doesn't support decorations in this environment (e.g., tests), skip gracefully
    if (
      typeof editor.deltaDecorations !== 'function' ||
      typeof model.getValue !== 'function' ||
      typeof model.getPositionAt !== 'function' ||
      !monaco?.Range
    ) {
      return;
    }
    const text: string = model.getValue();

    // Helpers to find path-aware key ranges
    const findTopLevelKeyRanges = (key: string): any[] => {
      const ranges: any[] = [];
      let i = 0;
      let inStr = false;
      let quote = '"';
      let esc = false;
      let objDepth = 0;
      while (i < text.length) {
        const ch = text[i];
        if (inStr) {
          if (esc) {
            esc = false;
          } else if (ch === '\\\\') {
            esc = true;
          } else if (ch === quote) {
            inStr = false;
          }
          i++;
          continue;
        }
        if (ch === '"' || ch === "'") {
          quote = ch;
          inStr = true;
          const strStart = i + 1;
          // scan string
          let j = i + 1,
            eEsc = false;
          while (j < text.length) {
            const cj = text[j];
            if (eEsc) {
              eEsc = false;
            } else if (cj === '\\\\') {
              eEsc = true;
            } else if (cj === quote) {
              break;
            }
            j++;
          }
          const strEnd = j;
          const keyText = text.slice(strStart, strEnd);
          // peek ahead for colon at same depth
          let k = j + 1;
          while (k < text.length && /\\s/.test(text[k] ?? '')) {
            k++;
          }
          if (k < text.length && (text[k] ?? '') === ':' && objDepth === 1 && keyText === key) {
            const startPos = model.getPositionAt(strStart);
            const endPos = model.getPositionAt(strStart + key.length);
            ranges.push({
              range: new monaco.Range(startPos.lineNumber, startPos.column, endPos.lineNumber, endPos.column),
              options: { inlineClassName: 'json-unmapped', stickiness: 1 },
            });
          }
          // advance past string terminator
          i = Math.min(j + 1, text.length);
          continue;
        }
        if (ch === '{') {
          objDepth++;
        } else if (ch === '}') {
          objDepth = Math.max(0, objDepth - 1);
        }
        i++;
      }
      return ranges;
    };

    const findObjectRangeAfterKey = (key: string): { start: number; end: number } | null => {
      // Find "key": { ... } at top-level (objDepth == 1)
      let i = 0;
      let inStr = false;
      let quote = '"';
      let esc = false;
      let objDepth = 0;
      while (i < text.length) {
        const ch = text[i];
        if (inStr) {
          if (esc) {
            esc = false;
          } else if (ch === '\\\\') {
            esc = true;
          } else if (ch === quote) {
            inStr = false;
          }
          i++;
          continue;
        }
        if (ch === '"' || ch === "'") {
          quote = ch;
          inStr = true;
          const strStart = i + 1;
          let j = i + 1,
            eEsc = false;
          while (j < text.length) {
            const cj = text[j];
            if (eEsc) {
              eEsc = false;
            } else if (cj === '\\\\') {
              eEsc = true;
            } else if (cj === quote) {
              break;
            }
            j++;
          }
          const keyText = text.slice(strStart, j);
          let k = j + 1;
          while (k < text.length && /\\s/.test(text[k] ?? '')) {
            k++;
          }
          if (k < text.length && (text[k] ?? '') === ':' && objDepth === 1 && keyText === key) {
            // find object start
            k++;
            while (k < text.length && /\\s/.test(text[k] ?? '')) {
              k++;
            }
            if ((text[k] ?? '') !== '{') {
              return null;
            }
            // match braces
            let depth = 0;
            let p = k;
            let inS = false,
              escS = false,
              q = '"';
            while (p < text.length) {
              const cp = text[p];
              if (inS) {
                if (escS) {
                  escS = false;
                } else if (cp === '\\\\') {
                  escS = true;
                } else if (cp === q) {
                  inS = false;
                }
              } else {
                if (cp === '"' || cp === "'") {
                  q = cp;
                  inS = true;
                } else if (cp === '{') {
                  depth++;
                } else if (cp === '}') {
                  depth--;
                  if (depth === 0) {
                    return { start: k, end: p + 1 };
                  }
                }
              }
              p++;
            }
            return null;
          }
          i = Math.min(j + 1, text.length);
          continue;
        }
        if (ch === '{') {
          objDepth++;
        } else if (ch === '}') {
          objDepth = Math.max(0, objDepth - 1);
        }
        i++;
      }
      return null;
    };

    const findFiltersSubKeyRanges = (subKey: string): any[] => {
      const ranges: any[] = [];
      const objRange = findObjectRangeAfterKey('filters');
      if (!objRange) {
        return ranges;
      }
      const slice = text.slice(objRange.start, objRange.end);
      // Scan within filters object for direct property subKey
      let i = 0;
      let inStr = false;
      let quote = '"';
      let esc = false;
      let depth = 0;
      while (i < slice.length) {
        const ch = slice[i];
        if (inStr) {
          if (esc) {
            esc = false;
          } else if (ch === '\\\\') {
            esc = true;
          } else if (ch === quote) {
            inStr = false;
          }
          i++;
          continue;
        }
        if (ch === '"' || ch === "'") {
          quote = ch;
          inStr = true;
          const strStart = i + 1;
          let j = i + 1,
            eEsc = false;
          while (j < slice.length) {
            const cj = slice[j];
            if (eEsc) {
              eEsc = false;
            } else if (cj === '\\\\') {
              eEsc = true;
            } else if (cj === quote) {
              break;
            }
            j++;
          }
          const keyText = slice.slice(strStart, j);
          let k = j + 1;
          while (k < slice.length && /\\s/.test(slice[k] ?? '')) {
            k++;
          }
          if (k < slice.length && (slice[k] ?? '') === ':' && depth === 1 && keyText === subKey) {
            const absStart = objRange.start + strStart;
            const startPos = model.getPositionAt(absStart);
            const endPos = model.getPositionAt(absStart + subKey.length);
            ranges.push({
              range: new monaco.Range(startPos.lineNumber, startPos.column, endPos.lineNumber, endPos.column),
              options: { inlineClassName: 'json-unmapped', stickiness: 1 },
            });
          }
          i = Math.min(j + 1, slice.length);
          continue;
        }
        if (ch === '{') {
          depth++;
        } else if (ch === '}') {
          depth = Math.max(0, depth - 1);
        }
        i++;
      }
      return ranges;
    };

    const ranges: any[] = [];
    for (const p of unmappedPaths || []) {
      if (p === '$.filters.keys') {
        // highlight keys within filters only if unmapped (rare); skip to avoid noise
        continue;
      }
      const mTop = p.match(/^\$\.([^.]+)$/);
      if (mTop && mTop[1]) {
        ranges.push(...findTopLevelKeyRanges(mTop[1] as string));
        continue;
      }
      const mFilt = p.match(/^\$\.filters\.([^.]+)$/);
      if (mFilt && mFilt[1]) {
        ranges.push(...findFiltersSubKeyRanges(mFilt[1] as string));
        continue;
      }
    }
    // Apply decorations
    decorationsRef.current = editor.deltaDecorations(decorationsRef.current || [], ranges);
  }, [editor, monaco, unmappedPaths, jsonText]);
}


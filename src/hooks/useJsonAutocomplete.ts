import { useEffect, useRef } from 'react';
import { setupJsonAutocomplete } from '../json/jsonAutocomplete';

export function useJsonAutocomplete(editor: any, monaco: any, opts: { info: any; currentQueryType: any | null }) {
  const disposeRef = useRef<null | (() => void)>(null);
  useEffect(() => {
    if (!editor || !monaco) {
      return;
    }
    try {
      disposeRef.current = setupJsonAutocomplete(editor, monaco, opts);
    } catch {
      // ignore
    }
    return () => {
      try { disposeRef.current?.(); } catch {}
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, monaco, opts.info, opts.currentQueryType]);
}



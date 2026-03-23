import { useState, useRef, useCallback, useEffect } from 'react';

type Params = {
  initialHeight: number;
  onChange: (height: number) => void;
};

export function useEditorResizer({ initialHeight, onChange }: Params) {
  const [editorHeight, setEditorHeight] = useState<number>(initialHeight);
  const heightRef = useRef<number>(initialHeight);
  const isDraggingRef = useRef<boolean>(false);
  const startYRef = useRef<number>(0);
  const startHeightRef = useRef<number>(0);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [isHover, setIsHover] = useState<boolean>(false);

  useEffect(() => {
    heightRef.current = editorHeight;
  }, [editorHeight]);

  // Sync internal state if prop changes (e.g. from query load) - optional, but good practice if initialHeight can update
  useEffect(() => {
    if (Math.abs(heightRef.current - initialHeight) > 1) {
      setEditorHeight(initialHeight);
    }
  }, [initialHeight]);

  const clampHeight = (h: number) => Math.max(120, Math.min(1200, h));

  const onMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      e.preventDefault();
      isDraggingRef.current = true;
      setIsDragging(true);
      startYRef.current = e.clientY;
      startHeightRef.current = heightRef.current;

      const onMouseMove = (ev: MouseEvent) => {
        if (!isDraggingRef.current) {
          return;
        }
        const deltaY = ev.clientY - startYRef.current;
        const newHeight = clampHeight(startHeightRef.current + deltaY);
        setEditorHeight(newHeight);
      };

      const onMouseUp = () => {
        if (!isDraggingRef.current) {
          return;
        }
        isDraggingRef.current = false;
        setIsDragging(false);
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);
        onChange(heightRef.current);
      };

      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
    },
    [onChange]
  );

  return {
    editorHeight,
    onMouseDown,
    isDragging,
    isHover,
    setIsHover,
  };
}


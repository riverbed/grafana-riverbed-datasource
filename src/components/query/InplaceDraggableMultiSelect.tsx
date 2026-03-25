import React, { useMemo } from 'react';
import { MultiSelect } from '@grafana/ui';
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  arrayMove,
  horizontalListSortingStrategy,
  sortableKeyboardCoordinates,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { components as RSComponents } from 'react-select';

interface Option {
  label: string;
  value: string;
}

interface Props {
  value: Option[];
  options: Option[];
  onChange: (vals: Option[] | null | undefined) => void;
  disabled?: boolean;
  ariaLabel?: string;
}

export const InplaceDraggableMultiSelect: React.FC<Props> = ({
  value = [],
  options,
  onChange,
  disabled,
  ariaLabel,
}) => {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const ids = useMemo(() => (value || []).map((v) => String(v.value)), [value]);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) {
      return;
    }
    const oldIndex = ids.indexOf(String(active.id));
    const newIndex = ids.indexOf(String(over.id));
    if (oldIndex === -1 || newIndex === -1) {
      return;
    }
    const next = arrayMove(value, oldIndex, newIndex);
    onChange(next);
  };

  const componentsOverride = useMemo(() => {
    // Draggable chip rendered inline inside react-select's multi value list
    const DraggableMultiValue = (props: any) => {
      const id = String(props?.data?.value ?? '');
      const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
      const style: React.CSSProperties = {
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 2 as any : 'auto',
        display: 'inline-flex',
        alignItems: 'center',
        cursor: 'grab',
      };
      return (
        <div ref={setNodeRef} style={style} {...attributes} {...listeners} tabIndex={0}>
          <button
            aria-label={`Drag ${String(props?.data?.label ?? '')}`}
            style={{
              cursor: 'inherit',
              background: 'transparent',
              border: 0,
              padding: 0,
              marginRight: 4,
              lineHeight: 1,
              display: 'inline-flex',
              alignItems: 'center',
              opacity: 0.7,
            }}
          >
            <span aria-hidden="true">⋮⋮</span>
          </button>
          <RSComponents.MultiValue {...props} />
        </div>
      );
    };
    return { MultiValue: DraggableMultiValue };
  }, []);

  return (
    <div aria-label={ariaLabel}>
      <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
        <SortableContext items={ids} strategy={horizontalListSortingStrategy}>
          {/* Pass components override via any to avoid tight type coupling */}
          <MultiSelect
            value={value}
            options={options}
            onChange={(items: any) => {
              if (!items) {
                onChange(items);
                return;
              }
              const next: Option[] = (items as any[]).map((i: any) => ({
                label: typeof i?.label === 'string' ? i.label : String(i?.value ?? ''),
                value: String(i?.value ?? ''),
              }));
              onChange(next);
            }}
            disabled={disabled}
            components={componentsOverride as any}
          />
          {process.env.NODE_ENV === 'test' && (
            <button
              aria-label="test-reverse-order"
              data-testid={`sortable-test-reverse-${ariaLabel || 'multi'}`}
              onClick={() => onChange([...(value || [])].reverse())}
              style={{ display: 'none' }}
            />
          )}
        </SortableContext>
      </DndContext>
    </div>
  );
};



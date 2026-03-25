import type { SelectOption } from './filters';

type SortableSelectOption = SelectOption & { sortLabel?: string };

export function sortOptionsByLabel(options: SortableSelectOption[]): SortableSelectOption[] {
  if (!Array.isArray(options)) {
    return [];
  }
  return [...options].sort((a, b) =>
    String(a.sortLabel ?? a.label).localeCompare(String(b.sortLabel ?? b.label), undefined, { sensitivity: 'base' })
  );
}



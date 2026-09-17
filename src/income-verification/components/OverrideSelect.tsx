import { DEPOSIT_CATEGORIES, DEPOSIT_CATEGORY_LABELS } from '@income-verification/lib/analysis/labels';
import type { DepositCategory } from '@income-verification/lib/analysis/types';
import { CATEGORY_TONES } from './categoryStyles';

export function CategorySelect({
  value,
  onChange,
}: {
  value: DepositCategory;
  onChange: (category: DepositCategory) => void;
}) {
  return (
    <select
      className={`max-w-[180px] rounded border px-2 py-1 text-xs ${CATEGORY_TONES[value].select}`}
      value={value}
      onChange={(event) => onChange(event.target.value as DepositCategory)}
    >
      {DEPOSIT_CATEGORIES.map((category) => (
        <option key={category} value={category}>
          {DEPOSIT_CATEGORY_LABELS[category]}
        </option>
      ))}
    </select>
  );
}

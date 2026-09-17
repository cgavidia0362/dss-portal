import { DEPOSIT_CATEGORY_LABELS } from '@income-verification/lib/analysis/labels';
import type { DepositCategory } from '@income-verification/lib/analysis/types';
import { CATEGORY_TONES } from './categoryStyles';

export function CategoryBadge({ category }: { category: DepositCategory }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded border px-1.5 py-0.5 text-[11px] font-medium ${CATEGORY_TONES[category].badge}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${CATEGORY_TONES[category].dot}`} />
      {DEPOSIT_CATEGORY_LABELS[category]}
    </span>
  );
}

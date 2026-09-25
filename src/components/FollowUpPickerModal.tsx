import { useEffect, useMemo, useState } from 'react';
import { Clock } from 'lucide-react';
import { clampFollowUpAt, followUpPresetOptions } from '../lib/callActivity';

interface FollowUpPickerModalProps {
  open: boolean;
  saving?: boolean;
  onClose: () => void;
  onConfirm: (at: Date) => void;
}

function toTimeInputValue(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

export default function FollowUpPickerModal({
  open,
  saving = false,
  onClose,
  onConfirm,
}: FollowUpPickerModalProps) {
  const [now, setNow] = useState(() => new Date());
  const [customTime, setCustomTime] = useState('');
  const [selectedAt, setSelectedAt] = useState<Date | null>(null);
  const [customError, setCustomError] = useState('');

  useEffect(() => {
    if (!open) return;
    const stamped = new Date();
    const presets = followUpPresetOptions(stamped);
    setNow(stamped);
    setCustomError('');
    setSelectedAt(presets[0]?.at || stamped);
    setCustomTime(toTimeInputValue(presets[0]?.at || stamped));
  }, [open]);

  const presets = useMemo(() => followUpPresetOptions(now), [now]);

  if (!open) return null;

  const applyCustomTime = (value: string) => {
    setCustomTime(value);
    const [hours, minutes] = value.split(':').map(Number);
    if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
      setSelectedAt(null);
      setCustomError('Pick a time later today.');
      return;
    }
    const desired = new Date(now);
    desired.setHours(hours, minutes, 0, 0);
    const clamped = clampFollowUpAt(desired, now);
    if (!clamped) {
      setSelectedAt(null);
      setCustomError('Choose a time later today, before midnight, and within 12 hours.');
      return;
    }
    setCustomError('');
    setSelectedAt(clamped);
  };

  const confirmDueNow = () => {
    onConfirm(new Date());
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-dss-surface border border-dss-border rounded-dss w-full max-w-md p-5 shadow-sm"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start gap-3 mb-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-dss-sm border border-orange-200 bg-orange-50 text-orange-800">
            <Clock className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-dss-ink">Follow Up reminder</h3>
            <p className="text-sm text-dss-muted mt-0.5">
              Pick a time later today. It comes back to the queue when due, and leftover reminders reset at midnight.
            </p>
          </div>
        </div>

        {presets.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-4">
            {presets.map(option => {
              const active = selectedAt?.getTime() === option.at.getTime();
              return (
                <button
                  key={option.hours}
                  type="button"
                  onClick={() => {
                    setSelectedAt(option.at);
                    setCustomTime(toTimeInputValue(option.at));
                    setCustomError('');
                  }}
                  className={`px-3 py-1.5 rounded-full border text-xs font-medium transition ${
                    active
                      ? 'bg-orange-50 border-orange-300 text-orange-900'
                      : 'border-dss-border text-dss-ink/80 hover:bg-dss-canvas'
                  }`}
                >
                  {option.hours}h
                </button>
              );
            })}
          </div>
        )}

        <label className="block text-xs text-dss-muted uppercase tracking-wider mb-1.5">Time today</label>
        <input
          type="time"
          value={customTime}
          onChange={e => applyCustomTime(e.target.value)}
          className="w-full px-3 py-2.5 bg-dss-canvas border border-dss-border rounded-dss-sm text-sm text-dss-ink mb-2 focus:outline-none focus:ring-2 focus:ring-dss-accent/30"
        />
        {customError && <p className="text-xs text-dss-danger mb-3">{customError}</p>}

        <div className="flex justify-end gap-2 mt-4">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-dss-sm border border-dss-border text-dss-ink/80 text-sm hover:bg-dss-canvas"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={confirmDueNow}
            disabled={saving}
            className="px-4 py-2 rounded-dss-sm border border-dss-border text-dss-ink/80 text-sm hover:bg-dss-canvas disabled:opacity-50"
          >
            Due now
          </button>
          <button
            type="button"
            disabled={saving || !selectedAt}
            onClick={() => selectedAt && onConfirm(selectedAt)}
            className="px-4 py-2 rounded-dss-sm bg-orange-600 hover:bg-orange-500 text-white text-sm font-medium disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Set reminder'}
          </button>
        </div>
      </div>
    </div>
  );
}

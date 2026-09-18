import { useState } from 'react';
import { Pencil, Trash2, Check, X } from 'lucide-react';

interface NoteItemProps {
  id: string;
  noteText: string;
  createdByName: string;
  createdAt: string | Date;
  canEdit: boolean;
  onUpdate: (id: string, text: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

export default function NoteItem({
  id, noteText, createdByName, createdAt, canEdit, onUpdate, onDelete,
}: NoteItemProps) {
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(noteText);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    const text = editText.trim();
    if (!text) return;
    setSaving(true);
    try {
      await onUpdate(id, text);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Delete this note?')) return;
    setSaving(true);
    try {
      await onDelete(id);
    } finally {
      setSaving(false);
    }
  };

  const dateLabel = createdAt instanceof Date
    ? createdAt.toLocaleString()
    : new Date(createdAt).toLocaleString();

  return (
    <div className="bg-dss-canvas px-3 py-2 rounded-dss-sm border border-dss-border">
      {editing ? (
        <div className="space-y-2">
          <textarea
            value={editText}
            onChange={e => setEditText(e.target.value)}
            rows={2}
            className="w-full px-3 py-2 bg-dss-surface border border-dss-border rounded-dss-sm text-sm text-dss-ink focus:outline-none focus:ring-1 focus:ring-dss-accent/30 resize-none"
            autoFocus
          />
          <div className="flex gap-2">
            <button
              onClick={handleSave}
              disabled={saving || !editText.trim()}
              className="flex items-center gap-1 px-3 py-1.5 bg-dss-success hover:bg-green-700 disabled:opacity-50 text-white rounded text-xs transition"
            >
              <Check className="w-3 h-3" /> Save
            </button>
            <button
              onClick={() => { setEditing(false); setEditText(noteText); }}
              disabled={saving}
              className="flex items-center gap-1 px-3 py-1.5 bg-dss-canvas hover:bg-dss-muted text-dss-ink rounded text-xs transition"
            >
              <X className="w-3 h-3" /> Cancel
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm text-dss-ink flex-1">{noteText}</p>
            {canEdit && (
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => { setEditText(noteText); setEditing(true); }}
                  disabled={saving}
                  className="p-1 text-dss-muted hover:text-dss-accent transition"
                  title="Edit note"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={handleDelete}
                  disabled={saving}
                  className="p-1 text-dss-muted hover:text-dss-danger transition"
                  title="Delete note"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
          <p className="text-xs text-dss-muted mt-1">{createdByName} · {dateLabel}</p>
        </>
      )}
    </div>
  );
}

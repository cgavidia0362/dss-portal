import { formatFileSize } from '@income-verification/lib/analysis/format';

export function UploadPanel({
  files,
  error,
  onFiles,
  onSampleFile,
  onRemove,
  onAnalyze,
}: {
  files: File[];
  error: string | null;
  onFiles: (files: FileList | null) => void;
  onSampleFile?: (file: File) => void;
  onRemove: (index: number) => void;
  onAnalyze: () => void;
}) {
  return (
    <section className="mx-auto max-w-3xl rounded border border-slate-200 bg-white">
      <div className="border-b border-slate-200 px-6 py-4">
        <h2 className="text-base font-semibold">Upload financial documents</h2>
        <p className="mt-1 text-sm text-slate-600">
          Extract and categorize incoming deposits from bank statements, TurboPass reports, and CSV
          transaction exports. Inclusion is decided during underwriter review. Up to 8 files, 15 MB
          each. Files are processed in this session only and are removed after analysis.
        </p>
      </div>

      <div className="px-6 py-5">
        <label
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            onFiles(event.dataTransfer.files);
          }}
          className="flex cursor-pointer flex-col items-center rounded border border-dashed border-slate-400 bg-slate-50 px-6 py-12 text-center hover:border-slate-600 hover:bg-slate-100"
        >
          <span className="text-sm font-medium text-slate-800">Drag and drop documents</span>
          <span className="mt-1 text-sm text-slate-500">
            PDF · CSV · JPEG/PNG · up to 8 files · 15 MB each
          </span>
          <input
            type="file"
            className="hidden"
            multiple
            accept=".pdf,.csv,.txt,.jpg,.jpeg,.png"
            onChange={(event) => {
              onFiles(event.target.files);
              event.target.value = '';
            }}
          />
        </label>

        {files.length > 0 && (
          <ul className="mt-4 divide-y divide-slate-200 border border-slate-200">
            {files.map((file, index) => (
              <li key={`${file.name}-${index}`} className="flex items-center justify-between px-3 py-2 text-sm">
                <div>
                  <p className="font-medium text-slate-800">{file.name}</p>
                  <p className="text-xs text-slate-500">
                    {formatFileSize(file.size)}
                  </p>
                </div>
                <button
                  type="button"
                  className="text-xs font-medium text-slate-600 hover:text-slate-900"
                  onClick={() => onRemove(index)}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}

        {error && (
          <p className="mt-4 border-l-2 border-red-700 bg-red-50 px-3 py-2 text-sm text-red-800">
            {error}
          </p>
        )}

        <div className="mt-5 flex items-center justify-between gap-3">
          <button
            type="button"
            className="text-xs font-medium text-slate-600 underline-offset-2 hover:text-slate-900 hover:underline"
            onClick={async () => {
              const response = await fetch('/sample-transactions.csv');
              const blob = await response.blob();
              const file = new File([blob], 'sample-transactions.csv', { type: 'text/csv' });
              if (onSampleFile) onSampleFile(file);
            }}
          >
            Load sample transactions
          </button>
          <button
            type="button"
            disabled={files.length === 0}
            onClick={onAnalyze}
            className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
          >
            Analyze Income
          </button>
        </div>
      </div>
    </section>
  );
}

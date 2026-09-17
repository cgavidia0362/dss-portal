import { describe, expect, it } from 'vitest';
import { validateUpload } from '../files';
import { MAX_FILE_BYTES, MAX_FILES } from '../limits';

describe('upload limits', () => {
  it('rejects more than 8 files', () => {
    const files = Array.from({ length: MAX_FILES + 1 }, (_, index) => ({
      fileName: `file-${index}.csv`,
      bytes: new Uint8Array([1]),
      mimeType: 'text/csv',
    }));
    expect(() => validateUpload(files)).toThrow('Upload at most 8 files per analysis.');
  });

  it('rejects files over 15MB', () => {
    expect(() =>
      validateUpload([
        {
          fileName: 'huge.pdf',
          bytes: new Uint8Array(MAX_FILE_BYTES + 1),
          mimeType: 'application/pdf',
        },
      ])
    ).toThrow('File exceeds the 15MB size limit.');
  });
});

import { describe, expect, it } from 'vitest';
import { copyPdfBytes } from '../pdf';

describe('pdf buffer ownership', () => {
  it('copyPdfBytes returns an independent buffer', () => {
    const source = new Uint8Array([1, 2, 3, 4]);
    const copy = copyPdfBytes(source);
    copy[0] = 9;
    copy.fill(0);
    expect(source[0]).toBe(1);
    expect(source.byteLength).toBe(4);
    expect(copy.byteLength).toBe(4);
  });
});

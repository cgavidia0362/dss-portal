import { describe, expect, it } from 'vitest';
import { assertPoiPathname, requestedPoiPathname, sanitizeUploadFileName } from '../path';

describe('poi blob pathnames', () => {
  it('accepts stored poi objects with a random suffix', () => {
    expect(assertPoiPathname('poi/statement-NoOVGDVcqSPc7VYCUAGnTzLTG2qEM2.pdf')).toBe(
      'poi/statement-NoOVGDVcqSPc7VYCUAGnTzLTG2qEM2.pdf'
    );
  });

  it('builds a poi/ pathname from a client filename', () => {
    expect(requestedPoiPathname('../../Bank Statement 1.pdf')).toBe('poi/Bank_Statement_1.pdf');
  });

  it('rejects URLs, traversal, and other namespaces', () => {
    const rejected = [
      'https://example.com/poi/file.pdf',
      'http://evil.test/secret',
      'poi/../etc/passwd',
      '/poi/file.pdf',
      'poi/file/../x.pdf',
      'poi/nested/file.pdf',
      'other/file.pdf',
      'poi/file.pdf?download=1',
      'poi/file%2e%2epdf',
      'poi/',
      '',
    ];
    for (const value of rejected) {
      expect(() => assertPoiPathname(value)).toThrow('Invalid document reference.');
    }
  });

  it('sanitizes uploaded names without using path segments', () => {
    expect(sanitizeUploadFileName('C:\\Users\\a\\file.csv')).toBe('file.csv');
  });
});

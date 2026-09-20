import { describe, expect, it } from 'vitest';
import { assessSourceCompleteness, parsePrintedPageLabel } from '../pageSequence';
import { buildPreflight } from '../preflight';

const PAGE = (n: number, of: number, extra = '') => `
JPMorgan Chase Bank, N.A.
May 23, 2026 through June 23, 2026
Chase Total Checking 000002907827999
Page ${n} of ${of}
Deposits and Additions 1,000.00
${extra}
`;

describe('printed page-sequence completeness', () => {
  it('marks Page 1 of 4 + Page 3 of 4 as a likely incomplete source', () => {
    const completeness = assessSourceCompleteness([
      PAGE(1, 4),
      PAGE(3, 4, '07/24 Zelle Payment From Example Sender 40.00 380.23'),
    ]);
    expect(completeness.state).toBe('likely_incomplete');
    expect(completeness.expectedPrintedPageCount).toBe(4);
    expect(completeness.observedPrintedPages).toEqual([1, 3]);
    expect(completeness.missingPrintedPages).toEqual([2, 4]);
    expect(completeness.sequenceIntact).toBe(false);
  });

  it('parses Spanish Página X de Y', () => {
    const label = parsePrintedPageLabel(`
JPMorgan Chase Bank, N.A.
Página 2 de 4
Detalle de transacciones
`);
    expect(label).toEqual({ page: 2, of: 4 });
    const completeness = assessSourceCompleteness([
      'Página 1 de 4\nMayo 23, 2026 through Junio 23, 2026',
      'Página 3 de 4\ncontinuación',
    ]);
    expect(completeness.missingPrintedPages).toEqual([2, 4]);
    expect(completeness.state).toBe('likely_incomplete');
  });

  it('reports multiple missing pages', () => {
    const completeness = assessSourceCompleteness([
      'June 24, 2026 through July 22, 2026\nPage 1 of 6',
      'Page 3 of 6',
      'Page 5 of 6',
    ]);
    expect(completeness.missingPrintedPages).toEqual([2, 4, 6]);
    expect(completeness.expectedPrintedPageCount).toBe(6);
  });

  it('detects duplicate printed pages', () => {
    const completeness = assessSourceCompleteness([PAGE(1, 4), PAGE(1, 4), PAGE(2, 4)]);
    expect(completeness.duplicatePrintedPages).toEqual([1]);
    expect(completeness.state).toBe('likely_incomplete');
  });

  it('treats concatenated statements as independent page sequences', () => {
    const preflight = buildPreflight({
      fileName: 'chase-concat.pdf',
      pages: [
        `
JPMorgan Chase Bank, N.A.
May 23, 2026 through June 23, 2026
Page 1 of 2
`,
        `
May 23, 2026 through June 23, 2026
Page 2 of 2
`,
        `
JPMorgan Chase Bank, N.A.
June 24, 2026 through July 22, 2026
Page 1 of 6
`,
        `
June 24, 2026 through July 22, 2026
Page 3 of 6
`,
      ],
    });
    expect(preflight.segments).toHaveLength(2);
    expect(preflight.segments[0]?.sourceCompleteness.state).toBe('complete');
    expect(preflight.segments[0]?.sourceCompleteness.sequenceIntact).toBe(true);
    expect(preflight.segments[1]?.sourceCompleteness.state).toBe('likely_incomplete');
    expect(preflight.segments[1]?.sourceCompleteness.missingPrintedPages).toEqual([2, 4, 5, 6]);
    expect(preflight.sourceCompletenessState).toBe('likely_incomplete');
  });

  it('marks a complete printed sequence as complete', () => {
    const completeness = assessSourceCompleteness([
      'Page 1 of 3\nJuly 23, 2026 through August 24, 2026',
      'Page 2 of 3',
      'Page 3 of 3',
    ]);
    expect(completeness.state).toBe('complete');
    expect(completeness.missingPrintedPages).toEqual([]);
    expect(completeness.duplicatePrintedPages).toEqual([]);
    expect(completeness.sequenceIntact).toBe(true);
  });

  it('does not double-count transactions from duplicated printed pages', () => {
    const creditPage = `
JPMorgan Chase Bank, N.A.
May 23, 2026 through June 23, 2026
Chase Total Checking 000002907827999
Page 1 of 1
Deposits and Additions 40.00
05/24 Zelle Payment From Example Sender 40.00 380.23
`;
    const preflight = buildPreflight({
      fileName: 'chase-dup.pdf',
      pages: [creditPage, creditPage],
    });
    expect(preflight.segments).toHaveLength(1);
    expect(preflight.segments[0]?.sourceCompleteness.duplicatePrintedPages).toEqual([1]);
    expect(preflight.segments[0]?.pageTexts).toHaveLength(1);
  });
});

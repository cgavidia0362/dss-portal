import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { buildExcelWorkbook, exportRowsToExcel, joinNotesForExcel } from '../exportExcel';

describe('joinNotesForExcel', () => {
  it('returns an empty string when there are no notes', () => {
    expect(joinNotesForExcel([])).toBe('');
  });

  it('joins rep notes with author so they show in the spreadsheet', () => {
    expect(joinNotesForExcel([
      { noteText: 'Left voicemail', createdByName: 'Stephan' },
      { noteText: '  Will call back tomorrow  ', createdByName: 'Yuridy V.' },
    ])).toBe('Stephan: Left voicemail | Yuridy V.: Will call back tomorrow');
  });

  it('skips blank notes and still includes text without an author', () => {
    expect(joinNotesForExcel([
      { noteText: '   ', createdByName: 'Stephan' },
      { noteText: 'Needs docs', createdByName: '' },
    ])).toBe('Needs docs');
  });
});

describe('Calls and Notes Excel exports', () => {
  it('puts account notes in the Calls spreadsheet Notes column', () => {
    const rows = [
      {
        'App ID': 'DTBFJ6821943',
        Dealer: 'northwest motors inc',
        Customer: 'Maria Lorena Rodriguez Aguila',
        State: 'IL',
        Amount: 20227,
        Date: '10/20',
        'Status Last': 'Counter',
        Activity: 'Oct 21 · Stephan',
        'FU Status': 'No Answer',
        'Assigned to': 'Stephan',
        Notes: joinNotesForExcel([
          { noteText: 'Left voicemail with receptionist', createdByName: 'Stephan' },
          { noteText: 'Will try again tomorrow', createdByName: 'Stephan' },
        ]),
      },
      {
        'App ID': 'DTBFJ6821463',
        Dealer: 'mundo auto sales',
        Customer: 'Calixto Bueno Parra',
        State: 'IL',
        Amount: 22978,
        Date: '10/20',
        'Status Last': 'Pending Approval',
        Activity: '',
        'FU Status': 'No Call',
        'Assigned to': 'Stephan',
        Notes: joinNotesForExcel([]),
      },
    ];

    const wb = buildExcelWorkbook(rows, 'Calls');
    const table = XLSX.utils.sheet_to_json<(string | number)[]>(wb.Sheets.Calls, { header: 1 });
    expect(table[0]).toContain('Notes');
    expect(table[1][10]).toBe(
      'Stephan: Left voicemail with receptionist | Stephan: Will try again tomorrow',
    );
    expect(table[2][10]).toBe('');
  });

  it('puts each note in the Notes tab spreadsheet with loss-reason flags', () => {
    const rows = [
      {
        'App ID': 'DTBFJ6821678',
        Dealer: 'fanatic motors',
        Customer: 'Luis Rodriguez Ruiz',
        Source: 'Calls',
        Status: 'No Deal',
        APR: 1,
        Fees: '',
        Stips: '',
        Other: '',
        'No reason': '',
        Detail: '11% APR at another dealer',
        By: 'Stephan',
        Date: '10/21/2026, 2:31:00 PM',
      },
    ];

    const wb = buildExcelWorkbook(rows, 'Notes');
    const json = XLSX.utils.sheet_to_json<Record<string, string | number>>(wb.Sheets.Notes);
    expect(json[0].APR).toBe(1);
    expect(json[0].Detail).toBe('11% APR at another dealer');
    expect(json[0].By).toBe('Stephan');
    expect(json[0].Source).toBe('Calls');
  });

  it('writes a real xlsx file with the Notes column', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'dss-export-'));
    const filename = join(dir, 'calls-notes-test.xlsx');
    try {
      exportRowsToExcel(
        [{
          'App ID': 'DTBFJ6821943',
          Dealer: 'northwest motors inc',
          Notes: joinNotesForExcel([
            { noteText: 'Left voicemail', createdByName: 'Stephan' },
          ]),
        }],
        'Calls',
        filename,
      );
      const wb = XLSX.read(await readFile(filename), { type: 'buffer' });
      const json = XLSX.utils.sheet_to_json<Record<string, string>>(wb.Sheets.Calls);
      expect(json[0].Notes).toBe('Stephan: Left voicemail');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

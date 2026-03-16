export type UserRole = 'admin' | 'rep';

export interface User {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
}

export interface Call {
  id: string;
  applicationId: string;
  dealerName: string;
  state: string;
  buyerFinal: number;
  statusLast: string;
  timestampSubmit: Date;
  submittedDate: string;
  assignedTo?: string;
  assignedToName?: string;
  fuStatus?: 'Deal' | 'No Deal' | 'Pending' | 'No Answer';
  updatedAt: Date;
}

export interface CallNote {
  id: string;
  callId: string;
  noteText: string;
  createdBy: string;
  createdByName: string;
  createdAt: Date;
}

export interface Upload {
  id: string;
  uploadedBy: string;
  uploadedByName: string;
  uploadedAt: Date;
  filename: string;
  rowCount: number;
  insertedCount: number;
  updatedCount: number;
  errorCount: number;
}

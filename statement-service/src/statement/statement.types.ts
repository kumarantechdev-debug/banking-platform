export type StatementStatus = 'GENERATED' | 'PENDING' | 'FAILED';

export interface BankingAccount {
  id?: number;
  accountId?: number;
  accountNumber?: string;
  customerId?: number;
  balance?: number | string;
  currentBalance?: number | string;
  availableBalance?: number | string;
  openingBalance?: number | string;
  closingBalance?: number | string;
  currency?: string;
  status?: string;
}

export interface BankingTransaction {
  id?: number;
  transferId?: number | null;
  accountId?: number;
  transactionDate?: string | Date;
  type?: string;
  transactionType?: string;
  amount?: number | string;
  description?: string;
  credit?: number | string;
  debit?: number | string;
  balanceAfter?: number | string;
  direction?: string;
  isAccountOpening?: boolean;
}

export interface BankingTransactionHistory {
  transactions: BankingTransaction[];
  openingBalance: string;
  closingBalance: string;
  total: number;
  snapshotAt: string;
}

export interface StatementRecord {
  id: number;
  accountId: number;
  fromDate: string;
  toDate: string;
  openingBalance: string | null;
  closingBalance: string | null;
  generatedAt: Date | null;
  status: string | null;
  transactions?: StatementTransactionRecord[];
}

export interface StatementTransactionRecord {
  id: number;
  statementId: number;
  transferId: number | null;
  transactionDate: Date | null;
  transactionType: string | null;
  amount: string | null;
  description: string | null;
  balanceAfter: string | null;
  isAccountOpening?: boolean;
}

export interface GenerateStatementRequest {
  accountId: number;
  fromDate: string;
  toDate: string;
}

export interface GenerateStatementResponse {
  statement: StatementRecord;
  success: boolean;
  message: string;
}

export interface GetStatementRequest {
  statementId: number;
}

export interface GetStatementResponse {
  statement: StatementRecord | null;
  found: boolean;
}

export interface GetStatementByIdWithTransactionsRequest {
  statementId: number;
  transactionType?: string;
  fromDate?: string;
  toDate?: string;
  page?: number;
  limit?: number;
  paginate?: boolean;
}

export interface GetStatementByIdWithTransactionsResponse {
  statement: StatementRecord | null;
  found: boolean;
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface StatementFilterRequest {
  accountId: number;
  fromDate: string;
  toDate: string;
  transactionType?: string;
  page?: number;
  limit?: number;
}

export interface StatementFilterResponse {
  transactions: StatementTransactionRecord[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface StatementFileResponse {
  fileName: string;
  contentType: string;
  content: Buffer;
}

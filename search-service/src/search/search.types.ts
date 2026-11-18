export interface CustomerRecord {
  id: string;
  name: string;
  city: string;
  state: string;
  mobile: string;
  status: string;
}

export interface SearchCustomersRequest {
  q?: string;
  limit?: number;
}

export interface SearchCustomersResponse {
  customers: CustomerRecord[];
  total: number;
}

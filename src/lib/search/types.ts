export interface SearchResultClient {
  id: string;
  name: string;
  email: string | null;
}

export interface SearchResultProperty {
  id: string;
  name: string;
  address: string;
  clientName: string;
  clientId: string;
}

export interface SearchResultProject {
  id: string;
  name: string;
  type: 'maintenance' | 'remodel';
  propertyName: string;
  clientName: string;
  clientId: string;
}

export interface SearchResultMaintenancePlan {
  id: string;
  name: string;
  status: string;
  propertyName: string;
  clientName: string;
  clientId: string;
}

export interface SearchResultDecision {
  id: string;
  title: string;
  projectName: string;
  clientName: string;
  clientId: string;
  projectId: string;
}

export interface SearchResultStaff {
  id: string;
  name: string;
  role: string;
  email: string;
}

export interface SearchResults {
  clients: SearchResultClient[];
  properties: SearchResultProperty[];
  projects: SearchResultProject[];
  maintenance_plans: SearchResultMaintenancePlan[];
  decisions: SearchResultDecision[];
  staff: SearchResultStaff[];
}

export const EMPTY_RESULTS: SearchResults = {
  clients: [],
  properties: [],
  projects: [],
  maintenance_plans: [],
  decisions: [],
  staff: [],
};

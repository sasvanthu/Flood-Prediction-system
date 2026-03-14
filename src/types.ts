export interface WeatherData {
  location: string;
  temp: number;
  humidity: number;
  wind: number;
  rain: number;
  drainage: number;
  riskScore: number;
  riskCategory: 'Low' | 'Medium' | 'High';
  timestamp: string;
  isSimulation?: boolean;
}

export interface HistoricalData {
  id: number;
  timestamp: string;
  location: string;
  rainfall_mm: number;
  temperature: number;
  humidity: number;
  wind_speed: number;
  drainage_capacity: number;
  flood_occurred: number;
}

export interface FloodReport {
  id: number;
  timestamp: string;
  location: string;
  lat: number;
  lon: number;
  water_level: string;
  description: string;
  image_url: string;
}

export interface SafeShelter {
  id: number;
  timestamp: string;
  address: string;
  lat: number;
  lon: number;
  capacity: number;
  contact_number: string;
}

export interface EmergencyAlert {
  id: number;
  timestamp: string;
  message: string;
  type: 'warning' | 'danger' | 'info';
  location: string;
}

export interface AnalyticsData {
  totalReports: number;
  activeFloodZones: number;
  numberOfShelters: number;
  evacuatedUsers: number;
  modelAccuracy?: number | null;
  modelF1?: number | null;
  modelVersion?: string | null;
  liveDataFreshnessMinutes?: number | null;
  liveSource?: string | null;
}

export interface ModelMetricsData {
  city: string;
  sampleSize: number;
  accuracy: number;
  precision: number;
  recall: number;
  f1: number;
  confusionMatrix: {
    tp: number;
    tn: number;
    fp: number;
    fn: number;
  };
  modelVersion: string;
  evaluatedAt: string;
}

export interface LiveFeedSnapshot {
  fetched_at: string;
  city: string;
  temp: number;
  humidity: number;
  wind: number;
  rain: number;
  drainage: number;
  risk_score: number;
  risk_category: 'Low' | 'Medium' | 'High';
  source: string;
}

export interface LiveFeedData {
  city: string;
  source: string | null;
  freshnessMinutes: number | null;
  snapshots: LiveFeedSnapshot[];
}

export interface City {
  name: string;
  lat: number;
  lon: number;
}

export const CITIES: City[] = [
  { name: 'Chennai', lat: 13.0827, lon: 80.2707 },
  { name: 'Mumbai', lat: 19.0760, lon: 72.8777 },
  { name: 'Bangalore', lat: 12.9716, lon: 77.5946 },
];

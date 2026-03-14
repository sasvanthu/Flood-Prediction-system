import React, { useState, useEffect, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Circle, useMap, useMapEvents, Polyline } from 'react-leaflet';
import L from 'leaflet';
import { 
  CloudRain, 
  Droplets, 
  Wind, 
  Thermometer, 
  AlertTriangle, 
  Activity, 
  Map as MapIcon, 
  BarChart3,
  Settings,
  Info,
  Bell,
  Camera,
  Home,
  Navigation,
  ShieldAlert,
  Users
} from 'lucide-react';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  AreaChart,
  Area
} from 'recharts';
import { format } from 'date-fns';
import { WeatherData, HistoricalData, City, CITIES, FloodReport, SafeShelter, EmergencyAlert, AnalyticsData, ModelMetricsData, LiveFeedData } from './types';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// @ts-ignore
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

const shelterIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

const reportIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

type LocationRisk = Pick<WeatherData, 'riskScore' | 'riskCategory'>;

type AppTab = 'overview' | 'citizen' | 'admin';

const DASHBOARD_SECTIONS = {
  overviewHero: 'overview-hero',
  overviewCapabilities: 'overview-capabilities',
  overviewMap: 'overview-map',
  overviewAnalytics: 'overview-analytics',
  citizenReport: 'citizen-report',
  citizenShelter: 'citizen-shelter',
  adminMetrics: 'admin-metrics',
  adminSimulation: 'admin-simulation'
} as const;

type DashboardSectionId = (typeof DASHBOARD_SECTIONS)[keyof typeof DASHBOARD_SECTIONS];

type DashboardRoute = {
  tab: AppTab;
  sectionId: DashboardSectionId;
  actionLabel: string;
};

type CapabilityItem = {
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  tone: string;
  route: DashboardRoute;
};

const PLATFORM_CAPABILITIES: CapabilityItem[] = [
  {
    title: 'Community Flood Reporting',
    description: 'Citizens upload real-time flood images and ground reports so authorities can respond faster.',
    icon: Camera,
    tone: 'border-red-200 bg-gradient-to-br from-red-50 to-white',
    route: {
      tab: 'citizen',
      sectionId: DASHBOARD_SECTIONS.citizenReport,
      actionLabel: 'Open reporting form'
    }
  },
  {
    title: 'Safe Shelter Network',
    description: 'Residents can voluntarily register safe spaces in their homes for nearby high-risk communities.',
    icon: Home,
    tone: 'border-blue-200 bg-gradient-to-br from-blue-50 to-white',
    route: {
      tab: 'citizen',
      sectionId: DASHBOARD_SECTIONS.citizenShelter,
      actionLabel: 'Open shelter registration'
    }
  },
  {
    title: 'Safest Route Navigation',
    description: 'Evacuation paths prioritize lower flood exposure, not just shortest distance to shelter.',
    icon: Navigation,
    tone: 'border-emerald-200 bg-gradient-to-br from-emerald-50 to-white',
    route: {
      tab: 'overview',
      sectionId: DASHBOARD_SECTIONS.overviewMap,
      actionLabel: 'Open evacuation map'
    }
  },
  {
    title: 'AI-Driven Prediction',
    description: 'XGBoost-based prediction uses rainfall, drainage capacity, elevation, and historical flood trends.',
    icon: Activity,
    tone: 'border-violet-200 bg-gradient-to-br from-violet-50 to-white',
    route: {
      tab: 'admin',
      sectionId: DASHBOARD_SECTIONS.adminSimulation,
      actionLabel: 'Open AI simulation'
    }
  },
  {
    title: 'Multi-Source Data Integration',
    description: 'Combines weather APIs, satellite imagery, drainage infrastructure inputs, and CCTV traffic feeds.',
    icon: CloudRain,
    tone: 'border-cyan-200 bg-gradient-to-br from-cyan-50 to-white',
    route: {
      tab: 'overview',
      sectionId: DASHBOARD_SECTIONS.overviewHero,
      actionLabel: 'View integrated feeds'
    }
  },
  {
    title: 'Visual Risk Dashboard',
    description: 'Color-coded flood risk zones in Green, Yellow, and Red for instant situational awareness.',
    icon: BarChart3,
    tone: 'border-amber-200 bg-gradient-to-br from-amber-50 to-white',
    route: {
      tab: 'overview',
      sectionId: DASHBOARD_SECTIONS.overviewAnalytics,
      actionLabel: 'Open risk dashboard'
    }
  },
  {
    title: 'Community + Authority Collaboration',
    description: 'Connects citizens, disaster teams, and administrators in one coordinated response workspace.',
    icon: Users,
    tone: 'border-slate-300 bg-gradient-to-br from-slate-50 to-white',
    route: {
      tab: 'admin',
      sectionId: DASHBOARD_SECTIONS.adminMetrics,
      actionLabel: 'Open response metrics'
    }
  },
  {
    title: 'Proactive Disaster Response',
    description: 'Prevention-first workflows reduce losses by predicting floods before severe damage occurs.',
    icon: ShieldAlert,
    tone: 'border-teal-200 bg-gradient-to-br from-teal-50 to-white',
    route: {
      tab: 'overview',
      sectionId: DASHBOARD_SECTIONS.overviewHero,
      actionLabel: 'Back to control center'
    }
  }
];

const INTEGRATED_STREAMS = [
  { source: 'Weather APIs', detail: 'Rainfall + humidity telemetry' },
  { source: 'Satellite Imagery', detail: 'Cloud and water spread tracking' },
  { source: 'Drainage Infrastructure', detail: 'Capacity and overflow indicators' },
  { source: 'CCTV Traffic Feeds', detail: 'Road accessibility and congestion' }
];

function planarDistanceMeters(origin: [number, number], destination: [number, number]) {
  const latDelta = (destination[0] - origin[0]) * 111000;
  const avgLat = ((origin[0] + destination[0]) / 2) * (Math.PI / 180);
  const lonDelta = (destination[1] - origin[1]) * 111000 * Math.cos(avgLat);
  return Math.hypot(latDelta, lonDelta);
}

function scoreShelterSafety(
  origin: [number, number],
  shelter: SafeShelter,
  riskCenter: [number, number],
  riskScore: number
) {
  const shelterPoint: [number, number] = [shelter.lat, shelter.lon];
  const travelDistance = planarDistanceMeters(origin, shelterPoint);
  const shelterToCenterDistance = planarDistanceMeters(shelterPoint, riskCenter);

  // Penalize shelters closer to flood center when risk is high, but still respect travel distance.
  const riskPenalty = riskScore * (2200 / Math.max(shelterToCenterDistance, 180));
  const capacityBias = 240 / Math.max(shelter.capacity, 1);
  return travelDistance * (1 + riskPenalty) + capacityBias;
}

function buildSafeFirstRoute(
  origin: [number, number],
  destination: [number, number],
  riskCenter: [number, number],
  riskScore: number
): [number, number][] {
  if (riskScore < 0.45) {
    return [origin, destination];
  }

  const midpoint: [number, number] = [
    (origin[0] + destination[0]) / 2,
    (origin[1] + destination[1]) / 2
  ];

  let escapeLat = midpoint[0] - riskCenter[0];
  let escapeLng = midpoint[1] - riskCenter[1];

  if (Math.abs(escapeLat) + Math.abs(escapeLng) < 0.0001) {
    escapeLat = 0.018;
    escapeLng = -0.012;
  }

  const detourStrength = riskScore > 0.7 ? 0.55 : 0.35;
  const detourPoint: [number, number] = [
    midpoint[0] + escapeLat * detourStrength,
    midpoint[1] + escapeLng * detourStrength
  ];

  return [origin, detourPoint, destination];
}

function ChangeView({ center }: { center: [number, number] }) {
  const map = useMap();
  map.setView(center, map.getZoom());
  return null;
}

function MapEvents({ onMapClick }: { onMapClick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      onMapClick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

export default function App() {
  const [selectedCity, setSelectedCity] = useState<City>(CITIES[0]);
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [historical, setHistorical] = useState<HistoricalData[]>([]);
  const [reports, setReports] = useState<FloodReport[]>([]);
  const [shelters, setShelters] = useState<SafeShelter[]>([]);
  const [alerts, setAlerts] = useState<EmergencyAlert[]>([]);
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [modelMetrics, setModelMetrics] = useState<ModelMetricsData | null>(null);
  const [liveFeed, setLiveFeed] = useState<LiveFeedData | null>(null);
  
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<AppTab>('overview');
  const [pendingSectionId, setPendingSectionId] = useState<DashboardSectionId | null>(null);
  
  // Admin Simulation State
  const [simValues, setSimValues] = useState({ rainfall: 120, humidity: 85, drainage: 0.3, elevation: 10, soilMoisture: 60 });
  
  // Citizen Forms State
  const [reportForm, setReportForm] = useState({ waterLevel: 'ankle', description: '', imageUrl: '' });
  const [shelterForm, setShelterForm] = useState({ address: '', capacity: 10, contactNumber: '' });
  
  // Evacuation Route State
  const [userLocation, setUserLocation] = useState<[number, number] | null>(null);
  const [evacRoute, setEvacRoute] = useState<[number, number][] | null>(null);
  const [clickedRisk, setClickedRisk] = useState<LocationRisk | null>(null);
  const [selectedEvacShelter, setSelectedEvacShelter] = useState<SafeShelter | null>(null);
  const [routeMode, setRouteMode] = useState<'direct' | 'safe-detour' | null>(null);

  const integratedStreams = useMemo(() => {
    const freshness = liveFeed?.freshnessMinutes;
    const freshnessStatus = typeof freshness === 'number' && freshness <= 20 ? 'Live' : 'Delayed';
    const liveSource = liveFeed?.source ?? analytics?.liveSource ?? 'syncing';
    const modelAccuracy = modelMetrics?.accuracy ?? analytics?.modelAccuracy ?? null;

    return [
      {
        source: 'Weather APIs',
        detail: weather
          ? `Rain ${weather.rain.toFixed(1)}mm | Humidity ${weather.humidity.toFixed(0)}% | Source ${liveSource}`
          : 'Rainfall + humidity telemetry',
        status: freshnessStatus,
      },
      {
        source: 'Satellite Imagery',
        detail: 'Cloud and water spread tracking',
        status: 'Monitored',
      },
      {
        source: 'Drainage Infrastructure',
        detail:
          weather?.drainage != null
            ? `Estimated drainage capacity ${(weather.drainage * 100).toFixed(0)}%`
            : 'Capacity and overflow indicators',
        status: 'Monitored',
      },
      {
        source: 'ML Accuracy',
        detail:
          modelAccuracy != null
            ? `Model accuracy ${(modelAccuracy * 100).toFixed(1)}% (${modelMetrics?.sampleSize ?? 0} samples)`
            : 'Model validation feed warming up',
        status: modelAccuracy != null ? 'Live' : 'Delayed',
      },
    ];
  }, [liveFeed, analytics?.liveSource, analytics?.modelAccuracy, modelMetrics, weather]);

  const fetchData = async (city: City) => {
    setLoading(true);
    try {
      const [weatherRes, histRes, reportsRes, sheltersRes, alertsRes, analyticsRes, metricsRes, liveFeedRes] = await Promise.all([
        fetch(`/api/weather?city=${city.name}&lat=${city.lat}&lon=${city.lon}`),
        fetch(`/api/historical?city=${city.name}`),
        fetch('/api/reports'),
        fetch('/api/shelters'),
        fetch('/api/alerts'),
        fetch('/api/analytics'),
        fetch(`/api/model/metrics?city=${city.name}`),
        fetch(`/api/live-feed?city=${city.name}`)
      ]);

      const [
        weatherData,
        historicalData,
        reportsData,
        sheltersData,
        alertsData,
        analyticsData,
        metricsData,
        liveFeedData,
      ] = await Promise.all([
        weatherRes.json(),
        histRes.json(),
        reportsRes.json(),
        sheltersRes.json(),
        alertsRes.json(),
        analyticsRes.json(),
        metricsRes.json(),
        liveFeedRes.json(),
      ]);

      setWeather(weatherData);
      setHistorical(historicalData);
      setReports(reportsData);
      setShelters(sheltersData);
      setAlerts(alertsData);
      setAnalytics(analyticsData);
      setModelMetrics(metricsData);
      setLiveFeed(liveFeedData);
      
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setUserLocation(null);
    setEvacRoute(null);
    setClickedRisk(null);
    setSelectedEvacShelter(null);
    setRouteMode(null);
    fetchData(selectedCity);
  }, [selectedCity]);

  const runSimulation = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/predict', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rainfall: simValues.rainfall,
          humidity: simValues.humidity,
          drainageCapacity: simValues.drainage,
          elevation: simValues.elevation,
          soilMoisture: simValues.soilMoisture,
          city: selectedCity.name
        })
      });
      const data = await res.json();
      setWeather(prev => prev ? { ...prev, ...data, isSimulation: true } : data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleImageFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) {
      return;
    }

    if (file.size > 4 * 1024 * 1024) {
      alert('Please upload an image smaller than 4 MB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setReportForm(prev => ({ ...prev, imageUrl: reader.result }));
      }
    };
    reader.readAsDataURL(file);
  };

  const submitReport = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await fetch('/api/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          location: selectedCity.name,
          lat: selectedCity.lat + (Math.random() - 0.5) * 0.05,
          lon: selectedCity.lon + (Math.random() - 0.5) * 0.05,
          ...reportForm
        })
      });
      setReportForm({ waterLevel: 'ankle', description: '', imageUrl: '' });
      fetchData(selectedCity);
      alert('Report submitted successfully!');
    } catch (err) {
      console.error(err);
    }
  };

  const submitShelter = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await fetch('/api/shelter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lat: selectedCity.lat + (Math.random() - 0.5) * 0.05,
          lon: selectedCity.lon + (Math.random() - 0.5) * 0.05,
          ...shelterForm
        })
      });
      setShelterForm({ address: '', capacity: 10, contactNumber: '' });
      fetchData(selectedCity);
      alert('Shelter registered successfully!');
    } catch (err) {
      console.error(err);
    }
  };

  const handleMapClick = async (lat: number, lng: number) => {
    const origin: [number, number] = [lat, lng];
    setUserLocation(origin);
    setClickedRisk(null);

    let locationRiskScore = weather?.riskScore || 0.25;

    // Fetch prediction for clicked location
    try {
      const res = await fetch('/api/predict', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          rainfall: weather?.rain || 0, 
          humidity: weather?.humidity || 70, 
          drainageCapacity: 0.5, 
          elevation: 15, 
          soilMoisture: 60, 
          city: 'Selected Location' 
        })
      });
      const data = await res.json();
      setClickedRisk(data);
      if (typeof data.riskScore === 'number') {
        locationRiskScore = data.riskScore;
      }
    } catch (err) {
      console.error(err);
    }

    if (shelters.length === 0) {
      setEvacRoute(null);
      setSelectedEvacShelter(null);
      setRouteMode(null);
      return;
    }

    const riskCenter: [number, number] = [selectedCity.lat, selectedCity.lon];
    const rankedShelters = shelters
      .map(shelter => ({
        shelter,
        score: scoreShelterSafety(origin, shelter, riskCenter, locationRiskScore)
      }))
      .sort((a, b) => a.score - b.score);

    const safestShelter = rankedShelters[0]?.shelter;
    if (!safestShelter) {
      return;
    }

    const destination: [number, number] = [safestShelter.lat, safestShelter.lon];
    const safeRoute = buildSafeFirstRoute(origin, destination, riskCenter, locationRiskScore);

    setSelectedEvacShelter(safestShelter);
    setEvacRoute(safeRoute);
    setRouteMode(safeRoute.length > 2 ? 'safe-detour' : 'direct');
  };

  const chartData = useMemo(() => {
    return [...historical].reverse().map(h => ({
      time: format(new Date(h.timestamp), 'HH:mm'),
      rainfall: h.rainfall_mm,
      risk: (h.rainfall_mm / 150) * 100
    }));
  }, [historical]);

  const reportImageLinkValue = reportForm.imageUrl.startsWith('data:image') ? '' : reportForm.imageUrl;

  const scrollToDashboardSection = (sectionId: DashboardSectionId) => {
    const section = document.getElementById(sectionId);
    if (!section) {
      return false;
    }

    section.scrollIntoView({ behavior: 'smooth', block: 'start' });
    return true;
  };

  const routeToDashboardSection = (tab: AppTab, sectionId: DashboardSectionId) => {
    if (activeTab !== tab) {
      setActiveTab(tab);
      setPendingSectionId(sectionId);
      return;
    }

    if (!scrollToDashboardSection(sectionId)) {
      setPendingSectionId(sectionId);
    }
  };

  useEffect(() => {
    if (!pendingSectionId) {
      return;
    }

    const timer = window.setTimeout(() => {
      if (scrollToDashboardSection(pendingSectionId)) {
        setPendingSectionId(null);
      }
    }, 140);

    return () => window.clearTimeout(timer);
  }, [activeTab, pendingSectionId]);

  return (
    <div className="min-h-screen flex flex-col font-sans bg-slate-50 text-slate-900">
      {/* Top Navigation Bar */}
      <header className="bg-slate-900 text-white p-4 flex justify-between items-center shadow-lg z-[1001] sticky top-0">
        <div className="flex items-center gap-3">
          <div className="bg-blue-500 p-2 rounded-lg">
            <Droplets className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">Urban Flood AI Monitoring System</h1>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-[0.2em]">Predictive Early Warning + Community Coordination</p>
          </div>
        </div>
        
        <div className="flex items-center gap-6">
          <div className="hidden md:flex items-center gap-4 text-sm font-medium text-slate-300">
            <span className="flex items-center gap-1"><Thermometer className="w-4 h-4 text-orange-400"/> {weather?.temp?.toFixed(1)}°C</span>
            <span className="flex items-center gap-1"><CloudRain className="w-4 h-4 text-blue-400"/> {weather?.rain?.toFixed(1)}mm</span>
            <span className="flex items-center gap-1"><Droplets className="w-4 h-4 text-cyan-400"/> {weather?.humidity}%</span>
          </div>
          
          {weather?.riskScore && weather.riskScore > 0.6 && (
            <div className="flex items-center gap-2 bg-red-500/20 text-red-400 px-4 py-1.5 rounded-full border border-red-500/30 animate-pulse">
              <AlertTriangle className="w-4 h-4" />
              <span className="text-xs font-bold uppercase tracking-wider">High Risk</span>
            </div>
          )}
          
          <button className="relative p-2 text-slate-300 hover:text-white transition-colors">
            <Bell className="w-5 h-5" />
            {alerts.length > 0 && (
              <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full animate-ping"></span>
            )}
          </button>
        </div>
      </header>

      {/* Main Layout */}
      <main className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        {/* Left Sidebar - Navigation & Alerts */}
        <aside className="w-full lg:w-80 bg-white border-r border-slate-200 flex flex-col h-full overflow-y-auto">
          <div className="p-6 border-b border-slate-100">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 block">Current City</label>
            <select 
              className="w-full bg-slate-50 border border-slate-200 text-slate-700 rounded-xl p-3 font-semibold focus:ring-2 focus:ring-blue-500 outline-none"
              value={selectedCity.name}
              onChange={(e) => setSelectedCity(CITIES.find(c => c.name === e.target.value) || CITIES[0])}
            >
              {CITIES.map(city => (
                <option key={city.name} value={city.name}>{city.name}</option>
              ))}
            </select>
          </div>

          <div className="p-4 flex flex-col gap-2">
            <button 
              onClick={() => {
                setActiveTab('overview');
                setPendingSectionId(null);
              }}
              className={cn("flex items-center gap-3 p-3 rounded-xl font-semibold transition-all text-left", activeTab === 'overview' ? "bg-blue-50 text-blue-700" : "text-slate-600 hover:bg-slate-50")}
            >
              <MapIcon className="w-5 h-5" /> Real-Time Map & Analytics
            </button>
            <button 
              onClick={() => {
                setActiveTab('citizen');
                setPendingSectionId(null);
              }}
              className={cn("flex items-center gap-3 p-3 rounded-xl font-semibold transition-all text-left", activeTab === 'citizen' ? "bg-blue-50 text-blue-700" : "text-slate-600 hover:bg-slate-50")}
            >
              <Users className="w-5 h-5" /> Citizen Portal
            </button>
            <button 
              onClick={() => {
                setActiveTab('admin');
                setPendingSectionId(null);
              }}
              className={cn("flex items-center gap-3 p-3 rounded-xl font-semibold transition-all text-left", activeTab === 'admin' ? "bg-blue-50 text-blue-700" : "text-slate-600 hover:bg-slate-50")}
            >
              <ShieldAlert className="w-5 h-5" /> Admin Console
            </button>
          </div>

          <div className="mt-auto p-6 border-t border-slate-100">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-yellow-500"/> Emergency Alerts
            </label>
            <div className="space-y-3">
              {alerts.length === 0 ? (
                <p className="text-xs text-slate-400 italic">No active alerts.</p>
              ) : (
                alerts.slice(0, 3).map(alert => (
                  <div key={alert.id} className={cn(
                    "p-3 rounded-xl border-l-4 text-xs font-medium shadow-sm",
                    alert.type === 'danger' ? "bg-red-50 border-red-500 text-red-800" : "bg-yellow-50 border-yellow-500 text-yellow-800"
                  )}>
                    <p className="font-bold mb-1">{alert.location}</p>
                    <p>{alert.message}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        </aside>

        {/* Right Content Area */}
        <div className="flex-1 overflow-y-auto p-6 bg-slate-50">
          
          {/* OVERVIEW TAB */}
          {activeTab === 'overview' && (
            <div className="space-y-6 max-w-7xl mx-auto">
              <section className="relative overflow-hidden rounded-3xl border border-cyan-200 bg-gradient-to-br from-slate-900 via-cyan-950 to-slate-900 text-white p-8 shadow-lg">
                <div className="absolute -top-14 -right-10 h-56 w-56 rounded-full bg-cyan-300/20 blur-3xl" />
                <div className="absolute -bottom-16 -left-10 h-52 w-52 rounded-full bg-emerald-300/20 blur-3xl" />
                <div className="relative space-y-4">
                  <p className="text-xs font-bold uppercase tracking-[0.2em] text-cyan-100">Proactive Disaster Response</p>
                  <h2 className="text-3xl md:text-4xl font-black leading-tight max-w-4xl">
                    Predict floods early, coordinate citizens and teams, and evacuate through safer routes.
                  </h2>
                  <p className="max-w-3xl text-sm md:text-base text-cyan-50/90">
                    UrbanFlood AI unifies live conditions, community intelligence, and authority action in one shared operational view.
                  </p>

                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 pt-2">
                    {integratedStreams.map(stream => (
                      <div key={stream.source} className="rounded-xl border border-cyan-100/20 bg-white/10 p-3 backdrop-blur-sm">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-xs font-bold uppercase tracking-wider text-cyan-50">{stream.source}</p>
                          <span className={cn(
                            'rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider',
                            stream.status === 'Live'
                              ? 'bg-emerald-300/25 text-emerald-100'
                              : stream.status === 'Delayed'
                              ? 'bg-amber-300/25 text-amber-100'
                              : 'bg-cyan-300/20 text-cyan-100'
                          )}>
                            {stream.status}
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-cyan-100/85">{stream.detail}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </section>

              <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                {PLATFORM_CAPABILITIES.map((capability, index) => {
                  const Icon = capability.icon;
                  return (
                    <article
                      key={capability.title}
                      className={cn('capability-card rounded-2xl border p-5 shadow-sm', capability.tone)}
                      style={{ animationDelay: `${index * 70}ms` }}
                    >
                      <div className="flex items-center gap-3">
                        <div className="rounded-xl bg-white p-2.5 text-slate-700 shadow-sm border border-slate-100">
                          <Icon className="w-5 h-5" />
                        </div>
                        <h3 className="text-sm font-black text-slate-900 leading-tight">{capability.title}</h3>
                      </div>
                      <p className="mt-3 text-xs leading-relaxed text-slate-600">{capability.description}</p>
                    </article>
                  );
                })}
              </section>

              {/* Map Section */}
              <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden h-[500px] relative">
                <div className="absolute top-4 right-4 z-[1000] bg-white/90 backdrop-blur p-4 rounded-2xl shadow-lg border border-slate-200 w-72 max-w-[calc(100%-2rem)]">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">Map Legend</h3>
                  <div className="space-y-2 text-sm font-medium text-slate-700">
                    <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-red-500 opacity-50" /> High Risk Zone</div>
                    <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-yellow-500 opacity-50" /> Alert Zone</div>
                    <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-emerald-500 opacity-50" /> Lower Risk Zone</div>
                    <div className="flex items-center gap-2"><img src={reportIcon.options.iconUrl} className="w-4 h-6" alt="Report" /> Flood Report</div>
                    <div className="flex items-center gap-2"><img src={shelterIcon.options.iconUrl} className="w-4 h-6" alt="Shelter" /> Safe Shelter</div>
                  </div>
                  <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-2.5">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Safe Route Engine</p>
                    <p className="text-[10px] text-slate-500 mt-1">
                      {routeMode === 'safe-detour'
                        ? 'Detour activated to reduce flood exposure before reaching shelter.'
                        : routeMode === 'direct'
                        ? 'Direct safe corridor selected for current location.'
                        : 'Click anywhere on the map to generate the safest evacuation route.'}
                    </p>
                    {selectedEvacShelter && (
                      <p className="text-[10px] mt-1.5 font-semibold text-slate-700">
                        Shelter Target: {selectedEvacShelter.address}
                      </p>
                    )}
                  </div>
                </div>
                
                <MapContainer center={[selectedCity.lat, selectedCity.lon]} zoom={12} style={{ height: '100%', width: '100%' }} zoomControl={false}>
                  <ChangeView center={[selectedCity.lat, selectedCity.lon]} />
                  <MapEvents onMapClick={handleMapClick} />
                  <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                  
                  {/* Risk Zone */}
                  <Circle 
                    center={[selectedCity.lat, selectedCity.lon]}
                    radius={3000}
                    pathOptions={{ 
                      fillColor: weather?.riskScore && weather.riskScore > 0.6 ? '#ef4444' : weather?.riskScore && weather.riskScore > 0.3 ? '#f59e0b' : '#10b981',
                      color: 'transparent',
                      fillOpacity: 0.3
                    }}
                  />

                  {/* Reports */}
                  {reports.map(report => (
                    <Marker key={`report-${report.id}`} position={[report.lat, report.lon]} icon={reportIcon}>
                      <Popup>
                        <div className="font-sans">
                          <h4 className="font-bold text-red-600">Flood Report</h4>
                          <p className="text-xs mt-1"><strong>Water Level:</strong> {report.water_level}</p>
                          <p className="text-xs mt-1">{report.description}</p>
                          {report.image_url && (
                            <img
                              src={report.image_url}
                              alt="Citizen flood report"
                              className="mt-2 h-24 w-full rounded-lg object-cover border border-slate-200"
                            />
                          )}
                        </div>
                      </Popup>
                    </Marker>
                  ))}

                  {/* Shelters */}
                  {shelters.map(shelter => (
                    <Marker key={`shelter-${shelter.id}`} position={[shelter.lat, shelter.lon]} icon={shelterIcon}>
                      <Popup>
                        <div className="font-sans">
                          <h4 className="font-bold text-blue-600">Safe Shelter</h4>
                          <p className="text-xs mt-1"><strong>Address:</strong> {shelter.address}</p>
                          <p className="text-xs mt-1"><strong>Capacity:</strong> {shelter.capacity} people</p>
                          <p className="text-xs mt-1"><strong>Contact:</strong> {shelter.contact_number}</p>
                        </div>
                      </Popup>
                    </Marker>
                  ))}

                  {/* Evacuation Route */}
                  {userLocation && evacRoute && (
                    <>
                      <Marker position={userLocation}>
                        <Popup>
                          <div className="font-sans min-w-[150px]">
                            <h4 className="font-bold text-slate-900 mb-1">Clicked Location</h4>
                            {clickedRisk ? (
                              <>
                                <div className={cn(
                                  "px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider inline-block mb-2",
                                  clickedRisk.riskCategory === 'High' ? "bg-red-100 text-red-700" : 
                                  clickedRisk.riskCategory === 'Medium' ? "bg-yellow-100 text-yellow-700" : 
                                  "bg-emerald-100 text-emerald-700"
                                )}>
                                  {clickedRisk.riskCategory} Risk
                                </div>
                                <p className="text-xs text-slate-600">Probability: {(clickedRisk.riskScore * 100).toFixed(0)}%</p>
                                <p className="text-[10px] text-teal-700 mt-2 font-semibold">
                                  {routeMode === 'safe-detour'
                                    ? 'Safe detour mapped to lower-risk shelter access.'
                                    : 'Direct safe corridor mapped to shelter.'}
                                </p>
                                {selectedEvacShelter && (
                                  <p className="text-[10px] text-slate-500 mt-1">Shelter: {selectedEvacShelter.address}</p>
                                )}
                              </>
                            ) : (
                              <p className="text-xs text-slate-500">Calculating risk...</p>
                            )}
                          </div>
                        </Popup>
                      </Marker>
                      <Polyline
                        positions={evacRoute}
                        color={routeMode === 'safe-detour' ? '#0d9488' : '#2563eb'}
                        weight={5}
                        dashArray={routeMode === 'safe-detour' ? '12, 8' : undefined}
                      />
                    </>
                  )}
                </MapContainer>
              </div>

              {/* Analytics Panels */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Prediction Result */}
                <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 flex flex-col items-center justify-center text-center">
                  <h2 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-4">Current Prediction</h2>
                  <div className="relative mb-4">
                    <svg className="w-32 h-32 transform -rotate-90">
                      <circle cx="64" cy="64" r="56" className="stroke-slate-100 fill-none" strokeWidth="12" />
                      <circle
                        cx="64" cy="64" r="56"
                        className={cn("fill-none transition-all duration-1000 ease-out", 
                          weather?.riskScore && weather.riskScore > 0.6 ? "stroke-red-500" : weather?.riskScore && weather.riskScore > 0.3 ? "stroke-yellow-500" : "stroke-emerald-500"
                        )}
                        strokeWidth="12"
                        strokeDasharray={2 * Math.PI * 56}
                        strokeDashoffset={2 * Math.PI * 56 * (1 - (weather?.riskScore || 0))}
                        strokeLinecap="round"
                      />
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <span className="text-3xl font-black text-slate-900">{((weather?.riskScore || 0) * 100).toFixed(0)}%</span>
                    </div>
                  </div>
                  <div className={cn(
                    "px-4 py-2 rounded-xl border-2 font-bold text-sm",
                    weather?.riskCategory === 'High' ? "bg-red-50 border-red-200 text-red-700" : 
                    weather?.riskCategory === 'Medium' ? "bg-yellow-50 border-yellow-200 text-yellow-700" : 
                    "bg-emerald-50 border-emerald-200 text-emerald-700"
                  )}>
                    {weather?.riskCategory || 'Low'} Risk
                  </div>
                  <div className="mt-5 grid grid-cols-3 gap-2 w-full text-[10px] font-bold uppercase tracking-wider">
                    <div className="rounded-lg bg-emerald-50 text-emerald-700 py-2">Green</div>
                    <div className="rounded-lg bg-yellow-50 text-yellow-700 py-2">Yellow</div>
                    <div className="rounded-lg bg-red-50 text-red-700 py-2">Red</div>
                  </div>
                </div>

                {/* Charts */}
                <div className="lg:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6">
                    <h2 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-4">Rainfall Trends</h2>
                    <div className="h-48">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={chartData}>
                          <defs>
                            <linearGradient id="colorRain" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                              <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                          <XAxis dataKey="time" axisLine={false} tickLine={false} tick={{fontSize: 10, fill: '#94a3b8'}} />
                          <YAxis axisLine={false} tickLine={false} tick={{fontSize: 10, fill: '#94a3b8'}} />
                          <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }} />
                          <Area type="monotone" dataKey="rainfall" stroke="#3b82f6" fillOpacity={1} fill="url(#colorRain)" strokeWidth={3} />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                  
                  <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6">
                    <h2 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-4">Risk Probability</h2>
                    <div className="h-48">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={chartData}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                          <XAxis dataKey="time" axisLine={false} tickLine={false} tick={{fontSize: 10, fill: '#94a3b8'}} />
                          <YAxis axisLine={false} tickLine={false} tick={{fontSize: 10, fill: '#94a3b8'}} />
                          <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }} />
                          <Line type="monotone" dataKey="risk" stroke="#ef4444" strokeWidth={3} dot={{ r: 4, fill: '#ef4444' }} activeDot={{ r: 6 }} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* CITIZEN TAB */}
          {activeTab === 'citizen' && (
            <div className="max-w-5xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* Report Flood */}
              <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-8">
                <div className="flex items-center gap-3 mb-6">
                  <div className="bg-red-100 p-3 rounded-xl text-red-600"><Camera className="w-6 h-6" /></div>
                  <div>
                    <h2 className="text-xl font-bold text-slate-900">Community Flood Reporting</h2>
                    <p className="text-sm text-slate-500">Share real-time images and ground reports for faster action.</p>
                  </div>
                </div>
                <form onSubmit={submitReport} className="space-y-5">
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-2">Water Level</label>
                    <select 
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 outline-none focus:ring-2 focus:ring-blue-500"
                      value={reportForm.waterLevel}
                      onChange={e => setReportForm({...reportForm, waterLevel: e.target.value})}
                    >
                      <option value="ankle">Ankle Deep</option>
                      <option value="knee">Knee Deep</option>
                      <option value="waist">Waist Deep</option>
                      <option value="above_waist">Above Waist</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-2">Description</label>
                    <textarea 
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 outline-none focus:ring-2 focus:ring-blue-500 min-h-[100px]"
                      placeholder="Describe the situation..."
                      value={reportForm.description}
                      onChange={e => setReportForm({...reportForm, description: e.target.value})}
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-2">Flood Image (Optional)</label>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleImageFileChange}
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-900 file:px-3 file:py-1.5 file:text-xs file:font-bold file:text-white hover:file:bg-slate-700"
                    />
                    <input
                      type="url"
                      className="mt-3 w-full bg-slate-50 border border-slate-200 rounded-xl p-3 outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Or paste image URL"
                      value={reportImageLinkValue}
                      onChange={e => setReportForm({ ...reportForm, imageUrl: e.target.value })}
                    />
                    {reportForm.imageUrl && (
                      <img
                        src={reportForm.imageUrl}
                        alt="Flood upload preview"
                        className="mt-3 h-28 w-full rounded-xl border border-slate-200 object-cover"
                      />
                    )}
                  </div>
                  <button type="submit" className="w-full bg-red-600 text-white font-bold py-3 rounded-xl hover:bg-red-700 transition-colors">
                    Submit Community Report
                  </button>
                </form>
              </div>

              {/* Register Shelter */}
              <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-8">
                <div className="flex items-center gap-3 mb-6">
                  <div className="bg-blue-100 p-3 rounded-xl text-blue-600"><Home className="w-6 h-6" /></div>
                  <div>
                    <h2 className="text-xl font-bold text-slate-900">Register Safe Shelter</h2>
                    <p className="text-sm text-slate-500">Offer your place as a temporary shelter.</p>
                  </div>
                </div>
                <form onSubmit={submitShelter} className="space-y-5">
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-2">Address</label>
                    <input 
                      type="text"
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Full address"
                      value={shelterForm.address}
                      onChange={e => setShelterForm({...shelterForm, address: e.target.value})}
                      required
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-bold text-slate-700 mb-2">Capacity (People)</label>
                      <input 
                        type="number" min="1"
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 outline-none focus:ring-2 focus:ring-blue-500"
                        value={shelterForm.capacity}
                        onChange={e => setShelterForm({...shelterForm, capacity: parseInt(e.target.value)})}
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-bold text-slate-700 mb-2">Contact Number</label>
                      <input 
                        type="tel"
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="+1 234..."
                        value={shelterForm.contactNumber}
                        onChange={e => setShelterForm({...shelterForm, contactNumber: e.target.value})}
                        required
                      />
                    </div>
                  </div>
                  <button type="submit" className="w-full bg-blue-600 text-white font-bold py-3 rounded-xl hover:bg-blue-700 transition-colors">
                    Register Shelter
                  </button>
                </form>
              </div>
            </div>
          )}

          {/* ADMIN TAB */}
          {activeTab === 'admin' && (
            <div className="max-w-7xl mx-auto space-y-8">
              {/* Admin Metrics */}
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                <StatCard label="Total Reports" value={analytics?.totalReports.toString() || '0'} icon={AlertTriangle} color="text-red-500" />
                <StatCard label="Active Flood Zones" value={analytics?.activeFloodZones.toString() || '0'} icon={MapIcon} color="text-orange-500" />
                <StatCard label="Safe Shelters" value={analytics?.numberOfShelters.toString() || '0'} icon={Home} color="text-emerald-500" />
                <StatCard label="Evacuated Users" value={analytics?.evacuatedUsers.toString() || '0'} icon={Users} color="text-blue-500" />
                <StatCard
                  label="Model Accuracy"
                  value={
                    modelMetrics?.accuracy != null
                      ? `${(modelMetrics.accuracy * 100).toFixed(1)}%`
                      : analytics?.modelAccuracy != null
                      ? `${(analytics.modelAccuracy * 100).toFixed(1)}%`
                      : 'N/A'
                  }
                  icon={Activity}
                  color="text-violet-500"
                />
                <StatCard
                  label="Live Feed Freshness"
                  value={
                    liveFeed?.freshnessMinutes != null
                      ? `${liveFeed.freshnessMinutes} min`
                      : analytics?.liveDataFreshnessMinutes != null
                      ? `${analytics.liveDataFreshnessMinutes} min`
                      : 'N/A'
                  }
                  icon={CloudRain}
                  color="text-cyan-500"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Model Version</p>
                  <p className="mt-1 text-sm font-semibold text-slate-800">{modelMetrics?.modelVersion || analytics?.modelVersion || 'heuristic-v2'}</p>
                </div>
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Latest Evaluation</p>
                  <p className="mt-1 text-sm font-semibold text-slate-800">
                    {modelMetrics?.evaluatedAt ? format(new Date(modelMetrics.evaluatedAt), 'PPpp') : 'Pending'}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Primary Data Source</p>
                  <p className="mt-1 text-sm font-semibold text-slate-800">{liveFeed?.source || analytics?.liveSource || 'syncing'}</p>
                </div>
              </div>

              {/* Simulation Panel */}
              <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-8">
                <div className="flex items-center gap-3 mb-8">
                  <div className="bg-slate-900 p-3 rounded-xl text-white"><Settings className="w-6 h-6" /></div>
                  <div>
                    <h2 className="text-xl font-bold text-slate-900">Flood Prediction Simulation</h2>
                    <p className="text-sm text-slate-500">Adjust rainfall, humidity, drainage capacity, elevation, and soil moisture to simulate XGBoost predictions.</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 mb-8">
                  <SimSlider label="Rainfall (mm)" value={simValues.rainfall} min={0} max={300} onChange={v => setSimValues({...simValues, rainfall: v})} />
                  <SimSlider label="Humidity (%)" value={simValues.humidity} min={0} max={100} onChange={v => setSimValues({...simValues, humidity: v})} />
                  <SimSlider label="Drainage Capacity" value={simValues.drainage} min={0} max={1} step={0.1} onChange={v => setSimValues({...simValues, drainage: v})} />
                  <SimSlider label="Elevation (m)" value={simValues.elevation} min={0} max={100} onChange={v => setSimValues({...simValues, elevation: v})} />
                  <SimSlider label="Soil Moisture (%)" value={simValues.soilMoisture} min={0} max={100} onChange={v => setSimValues({...simValues, soilMoisture: v})} />
                </div>

                <div className="flex items-center gap-6 p-6 bg-slate-50 rounded-2xl border border-slate-100">
                  <button 
                    onClick={runSimulation}
                    disabled={loading}
                    className="bg-slate-900 text-white px-8 py-4 rounded-xl font-bold uppercase tracking-widest hover:bg-slate-800 transition-all disabled:opacity-50"
                  >
                    {loading ? 'Running...' : 'Run Simulation'}
                  </button>
                  
                  {weather?.isSimulation && (
                    <div className="flex items-center gap-4">
                      <div className="text-sm font-bold text-slate-500 uppercase">Result:</div>
                      <div className={cn(
                        "px-4 py-2 rounded-xl border-2 font-bold text-lg",
                        weather.riskCategory === 'High' ? "bg-red-50 border-red-200 text-red-700" : 
                        weather.riskCategory === 'Medium' ? "bg-yellow-50 border-yellow-200 text-yellow-700" : 
                        "bg-emerald-50 border-emerald-200 text-emerald-700"
                      )}>
                        {weather.riskCategory} Risk ({((weather.riskScore || 0) * 100).toFixed(0)}%)
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

        </div>
      </main>
    </div>
  );
}

function StatCard({ label, value, icon: Icon, color }: { label: string, value: string, icon: any, color: string }) {
  return (
    <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex items-center gap-4">
      <div className={cn("p-4 rounded-2xl bg-slate-50", color)}>
        <Icon className="w-6 h-6" />
      </div>
      <div>
        <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">{label}</p>
        <p className="text-3xl font-black text-slate-900 tracking-tight">{value}</p>
      </div>
    </div>
  );
}

function SimSlider({ label, value, min, max, step = 1, onChange }: { label: string, value: number, min: number, max: number, step?: number, onChange: (v: number) => void }) {
  return (
    <div>
      <div className="flex justify-between text-sm font-bold text-slate-700 mb-2">
        <span>{label}</span>
        <span className="text-blue-600">{value}</span>
      </div>
      <input 
        type="range" min={min} max={max} step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
      />
    </div>
  );
}

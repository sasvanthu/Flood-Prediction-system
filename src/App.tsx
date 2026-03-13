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
import { WeatherData, HistoricalData, City, CITIES, FloodReport, SafeShelter, EmergencyAlert, AnalyticsData } from './types';
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
  
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'citizen' | 'admin'>('overview');
  
  // Admin Simulation State
  const [simValues, setSimValues] = useState({ rainfall: 120, humidity: 85, drainage: 0.3, elevation: 10, soilMoisture: 60 });
  
  // Citizen Forms State
  const [reportForm, setReportForm] = useState({ waterLevel: 'ankle', description: '', imageUrl: '' });
  const [shelterForm, setShelterForm] = useState({ address: '', capacity: 10, contactNumber: '' });
  
  // Evacuation Route State
  const [userLocation, setUserLocation] = useState<[number, number] | null>(null);
  const [evacRoute, setEvacRoute] = useState<[number, number][] | null>(null);
  const [clickedRisk, setClickedRisk] = useState<any>(null);

  const fetchData = async (city: City) => {
    setLoading(true);
    try {
      const [weatherRes, histRes, reportsRes, sheltersRes, alertsRes, analyticsRes] = await Promise.all([
        fetch(`/api/weather?city=${city.name}&lat=${city.lat}&lon=${city.lon}`),
        fetch(`/api/historical?city=${city.name}`),
        fetch('/api/reports'),
        fetch('/api/shelters'),
        fetch('/api/alerts'),
        fetch('/api/analytics')
      ]);
      
      const weatherData = await weatherRes.json();
      setWeather(weatherData);
      setHistorical(await histRes.json());
      setReports(await reportsRes.json());
      setShelters(await sheltersRes.json());
      setAlerts(await alertsRes.json());
      setAnalytics(await analyticsRes.json());
      
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData(selectedCity);
  }, [selectedCity]);

  const runSimulation = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/predict', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...simValues, city: selectedCity.name })
      });
      const data = await res.json();
      setWeather(prev => prev ? { ...prev, ...data, isSimulation: true } : data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
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
    setUserLocation([lat, lng]);
    
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
      // We could store this in state to show in the popup
      setClickedRisk(data);
    } catch (err) {
      console.error(err);
    }

    // Find nearest shelter
    if (shelters.length > 0) {
      let nearest = shelters[0];
      let minDist = Math.pow(lat - nearest.lat, 2) + Math.pow(lng - nearest.lon, 2);
      for (let i = 1; i < shelters.length; i++) {
        const dist = Math.pow(lat - shelters[i].lat, 2) + Math.pow(lng - shelters[i].lon, 2);
        if (dist < minDist) {
          minDist = dist;
          nearest = shelters[i];
        }
      }
      setEvacRoute([[lat, lng], [nearest.lat, nearest.lon]]);
    }
  };

  const chartData = useMemo(() => {
    return [...historical].reverse().map(h => ({
      time: format(new Date(h.timestamp), 'HH:mm'),
      rainfall: h.rainfall_mm,
      risk: (h.rainfall_mm / 150) * 100
    }));
  }, [historical]);

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
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-[0.2em]">Predictive Early Warning</p>
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
              onClick={() => setActiveTab('overview')}
              className={cn("flex items-center gap-3 p-3 rounded-xl font-semibold transition-all text-left", activeTab === 'overview' ? "bg-blue-50 text-blue-700" : "text-slate-600 hover:bg-slate-50")}
            >
              <MapIcon className="w-5 h-5" /> Real-Time Map & Analytics
            </button>
            <button 
              onClick={() => setActiveTab('citizen')}
              className={cn("flex items-center gap-3 p-3 rounded-xl font-semibold transition-all text-left", activeTab === 'citizen' ? "bg-blue-50 text-blue-700" : "text-slate-600 hover:bg-slate-50")}
            >
              <Users className="w-5 h-5" /> Citizen Portal
            </button>
            <button 
              onClick={() => setActiveTab('admin')}
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
              {/* Map Section */}
              <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden h-[500px] relative">
                <div className="absolute top-4 right-4 z-[1000] bg-white/90 backdrop-blur p-4 rounded-2xl shadow-lg border border-slate-200 w-64">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">Map Legend</h3>
                  <div className="space-y-2 text-sm font-medium text-slate-700">
                    <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-red-500 opacity-50" /> High Risk Zone</div>
                    <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-yellow-500 opacity-50" /> Alert Zone</div>
                    <div className="flex items-center gap-2"><img src={reportIcon.options.iconUrl} className="w-4 h-6" alt="Report" /> Flood Report</div>
                    <div className="flex items-center gap-2"><img src={shelterIcon.options.iconUrl} className="w-4 h-6" alt="Shelter" /> Safe Shelter</div>
                  </div>
                  <p className="text-[10px] text-slate-400 mt-3 italic">Click anywhere on the map to find the nearest evacuation route.</p>
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
                                <p className="text-[10px] text-blue-600 mt-2 font-semibold">Evacuation route mapped to nearest shelter.</p>
                              </>
                            ) : (
                              <p className="text-xs text-slate-500">Calculating risk...</p>
                            )}
                          </div>
                        </Popup>
                      </Marker>
                      <Polyline positions={evacRoute} color="#3b82f6" weight={4} dashArray="10, 10" />
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
                    <h2 className="text-xl font-bold text-slate-900">Report a Flood</h2>
                    <p className="text-sm text-slate-500">Help authorities by reporting incidents.</p>
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
                  <button type="submit" className="w-full bg-red-600 text-white font-bold py-3 rounded-xl hover:bg-red-700 transition-colors">
                    Submit Report
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
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard label="Total Reports" value={analytics?.totalReports.toString() || '0'} icon={AlertTriangle} color="text-red-500" />
                <StatCard label="Active Flood Zones" value={analytics?.activeFloodZones.toString() || '0'} icon={MapIcon} color="text-orange-500" />
                <StatCard label="Safe Shelters" value={analytics?.numberOfShelters.toString() || '0'} icon={Home} color="text-emerald-500" />
                <StatCard label="Evacuated Users" value={analytics?.evacuatedUsers.toString() || '0'} icon={Users} color="text-blue-500" />
              </div>

              {/* Simulation Panel */}
              <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-8">
                <div className="flex items-center gap-3 mb-8">
                  <div className="bg-slate-900 p-3 rounded-xl text-white"><Settings className="w-6 h-6" /></div>
                  <div>
                    <h2 className="text-xl font-bold text-slate-900">Flood Prediction Simulation</h2>
                    <p className="text-sm text-slate-500">Adjust parameters to simulate XGBoost model predictions.</p>
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

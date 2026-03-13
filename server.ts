import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';
import Database from 'better-sqlite3';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

// Database Setup
const db = new Database('flood_data.db');
db.exec(`
  CREATE TABLE IF NOT EXISTS historical_weather (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    location TEXT,
    rainfall_mm REAL,
    temperature REAL,
    humidity REAL,
    wind_speed REAL,
    drainage_capacity REAL,
    flood_occurred INTEGER
  );
  
  CREATE TABLE IF NOT EXISTS flood_reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    location TEXT,
    lat REAL,
    lon REAL,
    water_level TEXT,
    description TEXT,
    image_url TEXT
  );

  CREATE TABLE IF NOT EXISTS safe_shelters (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    address TEXT,
    lat REAL,
    lon REAL,
    capacity INTEGER,
    contact_number TEXT
  );

  CREATE TABLE IF NOT EXISTS emergency_alerts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    message TEXT,
    type TEXT,
    location TEXT
  );
`);

// Seed initial data if empty
const rowCount = db.prepare('SELECT COUNT(*) as count FROM historical_weather').get() as { count: number };
if (rowCount.count === 0) {
  const insert = db.prepare(`
    INSERT INTO historical_weather (location, rainfall_mm, temperature, humidity, wind_speed, drainage_capacity, flood_occurred)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  
  const locations = ['Chennai', 'Mumbai', 'Bangalore'];
  locations.forEach(loc => {
    // Generate a realistic trend (increasing rainfall)
    for (let i = 0; i < 24; i++) {
      const baseRain = i > 15 ? 80 : 20; // Simulate a storm building up
      const rain = baseRain + Math.random() * 40;
      const drainage = 0.3 + Math.random() * 0.4;
      const flooded = rain > 100 && drainage < 0.4 ? 1 : 0;
      insert.run(loc, rain, 24 + Math.random() * 8, 70 + Math.random() * 25, 8 + Math.random() * 12, drainage, flooded);
    }
  });
  console.log('Database seeded with enhanced historical data');
  
  // Seed some alerts
  const insertAlert = db.prepare('INSERT INTO emergency_alerts (message, type, location) VALUES (?, ?, ?)');
  insertAlert.run('High rainfall warning for coastal areas', 'warning', 'Chennai');
  insertAlert.run('Drainage overflow alert in downtown', 'danger', 'Mumbai');
}

// Module 2: Flood Prediction Logic (Mocking a trained model)
// In a real scenario, this would load a model trained with XGBoost/RandomForest
function predictFloodRisk(rainfall: number, humidity: number, drainage: number, elevation: number = 10, soilMoisture: number = 50): number {
  // Heuristic based on common flood patterns
  // High rainfall + High Humidity + Low Drainage + Low Elevation + High Soil Moisture = High Risk
  let score = (rainfall / 150) * 0.4 + (humidity / 100) * 0.1 + (1 - drainage) * 0.2 + (1 - Math.min(elevation / 50, 1)) * 0.1 + (soilMoisture / 100) * 0.2;
  return Math.min(Math.max(score, 0), 1);
}

app.use(express.json());

// API Routes
app.get('/api/weather', async (req, res) => {
  const { lat, lon, city } = req.query;
  const apiKey = process.env.OPENWEATHER_API_KEY;

  try {
    let weatherData;
    if (apiKey) {
      const response = await axios.get(`https://api.openweathermap.org/data/2.5/weather`, {
        params: {
          lat,
          lon,
          q: city,
          appid: apiKey,
          units: 'metric'
        }
      });
      weatherData = {
        location: response.data.name,
        temp: response.data.main.temp,
        humidity: response.data.main.humidity,
        wind: response.data.wind.speed,
        rain: response.data.rain ? response.data.rain['1h'] || 0 : 0,
        timestamp: new Date().toISOString()
      };
    } else {
      // Mock data if no API key
      weatherData = {
        location: city || 'Chennai',
        temp: 28 + Math.random() * 5,
        humidity: 70 + Math.random() * 20,
        wind: 10 + Math.random() * 10,
        rain: Math.random() > 0.7 ? 80 + Math.random() * 50 : Math.random() * 20,
        timestamp: new Date().toISOString()
      };
    }

    // Module 2: Generate Prediction
    const drainage = 0.5; // Simulated drainage capacity
    const riskScore = predictFloodRisk(weatherData.rain, weatherData.humidity, drainage);

    res.json({
      ...weatherData,
      drainage,
      riskScore,
      riskCategory: riskScore > 0.6 ? 'High' : riskScore > 0.3 ? 'Medium' : 'Low'
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch weather data' });
  }
});

app.get('/api/historical', (req, res) => {
  const { city } = req.query;
  const data = db.prepare('SELECT * FROM historical_weather WHERE location = ? ORDER BY timestamp DESC LIMIT 10').all(city || 'Chennai');
  res.json(data);
});

// Module 5: Simulation Endpoint (now /api/predict)
app.post('/api/predict', (req, res) => {
  const { rainfall, elevation, drainageCapacity, soilMoisture, humidity, city } = req.body;
  const riskScore = predictFloodRisk(Number(rainfall), Number(humidity), Number(drainageCapacity), Number(elevation), Number(soilMoisture));
  
  res.json({
    location: city || 'Simulated Location',
    riskScore,
    riskCategory: riskScore > 0.6 ? 'High' : riskScore > 0.3 ? 'Medium' : 'Low',
    timestamp: new Date().toISOString(),
    isSimulation: true
  });
});

app.post('/api/report', (req, res) => {
  const { location, lat, lon, waterLevel, description, imageUrl } = req.body;
  const insert = db.prepare('INSERT INTO flood_reports (location, lat, lon, water_level, description, image_url) VALUES (?, ?, ?, ?, ?, ?)');
  const info = insert.run(location, lat, lon, waterLevel, description, imageUrl || '');
  res.json({ success: true, id: info.lastInsertRowid });
});

app.get('/api/reports', (req, res) => {
  const data = db.prepare('SELECT * FROM flood_reports ORDER BY timestamp DESC').all();
  res.json(data);
});

app.post('/api/shelter', (req, res) => {
  const { address, lat, lon, capacity, contactNumber } = req.body;
  const insert = db.prepare('INSERT INTO safe_shelters (address, lat, lon, capacity, contact_number) VALUES (?, ?, ?, ?, ?)');
  const info = insert.run(address, lat, lon, capacity, contactNumber);
  res.json({ success: true, id: info.lastInsertRowid });
});

app.get('/api/shelters', (req, res) => {
  const data = db.prepare('SELECT * FROM safe_shelters ORDER BY timestamp DESC').all();
  res.json(data);
});

app.get('/api/alerts', (req, res) => {
  const data = db.prepare('SELECT * FROM emergency_alerts ORDER BY timestamp DESC LIMIT 10').all();
  res.json(data);
});

app.get('/api/analytics', (req, res) => {
  const totalReports = db.prepare('SELECT COUNT(*) as count FROM flood_reports').get() as { count: number };
  const totalShelters = db.prepare('SELECT COUNT(*) as count FROM safe_shelters').get() as { count: number };
  const activeZones = db.prepare('SELECT COUNT(*) as count FROM historical_weather WHERE flood_occurred = 1 AND timestamp > datetime("now", "-1 day")').get() as { count: number };
  
  res.json({
    totalReports: totalReports.count,
    activeFloodZones: activeZones.count,
    numberOfShelters: totalShelters.count,
    evacuatedUsers: totalShelters.count * 15 // Mocked number
  });
});

// Vite Integration
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running at http://localhost:${PORT}`);
  });
}

startServer();

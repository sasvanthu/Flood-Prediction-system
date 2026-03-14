import axios from 'axios';
import Database from 'better-sqlite3';
import dotenv from 'dotenv';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT ?? 3000);
const DB_PATH = process.env.SQLITE_DB_PATH ?? path.join(process.cwd(), 'flood_data.db');
const LIVE_WEATHER_MAX_AGE_MINUTES = Number(process.env.LIVE_WEATHER_MAX_AGE_MINUTES ?? 20);
const MODEL_VERSION = process.env.MODEL_VERSION ?? 'heuristic-v2';

type RiskCategory = 'Low' | 'Medium' | 'High';

type WeatherSnapshot = {
  location: string;
  lat: number;
  lon: number;
  temp: number;
  humidity: number;
  wind: number;
  rain: number;
  drainage: number;
  riskScore: number;
  riskCategory: RiskCategory;
  source: string;
  timestamp: string;
};

type BinaryMetrics = {
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
};

const CITY_COORDINATES: Record<string, { lat: number; lon: number }> = {
  chennai: { lat: 13.0827, lon: 80.2707 },
  mumbai: { lat: 19.076, lon: 72.8777 },
  bangalore: { lat: 12.9716, lon: 77.5946 },
};

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

app.use(express.json({ limit: '6mb' }));

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function toFiniteNumber(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeCity(rawCity: unknown): string {
  const city = String(rawCity ?? 'Chennai').trim();
  return city.length > 0 ? city : 'Chennai';
}

function cityKey(city: string): string {
  return city.trim().toLowerCase();
}

function resolveCoordinates(city: string, latParam: unknown, lonParam: unknown): { lat: number; lon: number } {
  const fallback = CITY_COORDINATES[cityKey(city)] ?? CITY_COORDINATES.chennai;
  return {
    lat: toFiniteNumber(latParam, fallback.lat),
    lon: toFiniteNumber(lonParam, fallback.lon),
  };
}

function classifyRisk(score: number): RiskCategory {
  if (score > 0.6) {
    return 'High';
  }
  if (score > 0.3) {
    return 'Medium';
  }
  return 'Low';
}

function predictFloodRisk(
  rainfall: number,
  humidity: number,
  drainage: number,
  elevation: number = 10,
  soilMoisture: number = 50,
  windSpeed: number = 10,
): number {
  const score =
    (rainfall / 160) * 0.36 +
    (humidity / 100) * 0.12 +
    (1 - clamp(drainage, 0, 1)) * 0.2 +
    (1 - Math.min(elevation / 60, 1)) * 0.1 +
    (soilMoisture / 100) * 0.15 +
    (Math.min(windSpeed, 40) / 40) * 0.07;

  return clamp(score, 0, 1);
}

function calculateFreshnessMinutes(timestamp: string): number {
  const ageMs = Date.now() - new Date(timestamp).getTime();
  return Math.max(0, Math.round(ageMs / 60000));
}

function bootstrapSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS historical_weather (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp TEXT NOT NULL DEFAULT (datetime('now')),
      location TEXT NOT NULL,
      rainfall_mm REAL NOT NULL,
      temperature REAL NOT NULL,
      humidity REAL NOT NULL,
      wind_speed REAL NOT NULL,
      drainage_capacity REAL NOT NULL,
      flood_occurred INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS flood_reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp TEXT NOT NULL DEFAULT (datetime('now')),
      location TEXT NOT NULL,
      lat REAL NOT NULL,
      lon REAL NOT NULL,
      water_level TEXT NOT NULL,
      description TEXT NOT NULL,
      image_url TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS safe_shelters (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp TEXT NOT NULL DEFAULT (datetime('now')),
      address TEXT NOT NULL,
      lat REAL NOT NULL,
      lon REAL NOT NULL,
      capacity INTEGER NOT NULL,
      contact_number TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS emergency_alerts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp TEXT NOT NULL DEFAULT (datetime('now')),
      message TEXT NOT NULL,
      type TEXT NOT NULL,
      location TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS live_weather_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fetched_at TEXT NOT NULL DEFAULT (datetime('now')),
      city TEXT NOT NULL,
      lat REAL NOT NULL,
      lon REAL NOT NULL,
      temp REAL NOT NULL,
      humidity REAL NOT NULL,
      wind REAL NOT NULL,
      rain REAL NOT NULL,
      drainage REAL NOT NULL,
      risk_score REAL NOT NULL,
      risk_category TEXT NOT NULL,
      source TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS model_evaluations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      evaluated_at TEXT NOT NULL DEFAULT (datetime('now')),
      city TEXT NOT NULL,
      sample_size INTEGER NOT NULL,
      accuracy REAL NOT NULL,
      precision REAL NOT NULL,
      recall REAL NOT NULL,
      f1_score REAL NOT NULL,
      tp INTEGER NOT NULL,
      tn INTEGER NOT NULL,
      fp INTEGER NOT NULL,
      fn INTEGER NOT NULL,
      model_version TEXT NOT NULL,
      notes TEXT NOT NULL DEFAULT ''
    );

    CREATE INDEX IF NOT EXISTS idx_historical_location_timestamp
      ON historical_weather(location, timestamp DESC);

    CREATE INDEX IF NOT EXISTS idx_reports_timestamp
      ON flood_reports(timestamp DESC);

    CREATE INDEX IF NOT EXISTS idx_alerts_location_timestamp
      ON emergency_alerts(location, timestamp DESC);

    CREATE INDEX IF NOT EXISTS idx_snapshots_city_timestamp
      ON live_weather_snapshots(city, fetched_at DESC);

    CREATE INDEX IF NOT EXISTS idx_model_eval_city_timestamp
      ON model_evaluations(city, evaluated_at DESC);
  `);
}

function averageDrainageCapacity(city: string): number {
  const row = db
    .prepare(
      `SELECT AVG(drainage_capacity) AS avg_drainage
       FROM historical_weather
       WHERE location = ? AND timestamp >= datetime('now', '-7 day')`,
    )
    .get(city) as { avg_drainage: number | null };

  if (row?.avg_drainage == null) {
    return Number((0.35 + Math.random() * 0.4).toFixed(2));
  }

  return Number(clamp(row.avg_drainage, 0, 1).toFixed(2));
}

function seedMockData() {
  const weatherCount = db.prepare('SELECT COUNT(*) AS cnt FROM historical_weather').get() as { cnt: number };
  if (weatherCount.cnt > 0) {
    return;
  }

  const insertHistorical = db.prepare(`
    INSERT INTO historical_weather
      (timestamp, location, rainfall_mm, temperature, humidity, wind_speed, drainage_capacity, flood_occurred)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertShelter = db.prepare(`
    INSERT INTO safe_shelters (address, lat, lon, capacity, contact_number)
    VALUES (?, ?, ?, ?, ?)
  `);

  const insertReport = db.prepare(`
    INSERT INTO flood_reports (timestamp, location, lat, lon, water_level, description)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const insertAlert = db.prepare(`
    INSERT INTO emergency_alerts (timestamp, message, type, location)
    VALUES (?, ?, ?, ?)
  `);

  const transaction = db.transaction(() => {
    const weatherCities = [
      { name: 'Chennai', baseTemp: 30 },
      { name: 'Mumbai', baseTemp: 28 },
      { name: 'Bangalore', baseTemp: 23 },
    ];

    for (const city of weatherCities) {
      for (let h = 71; h >= 0; h -= 1) {
        const timestamp = new Date(Date.now() - h * 3600_000).toISOString();
        const rainfall = Number((5 + Math.random() * 140).toFixed(1));
        const humidity = Number((58 + Math.random() * 38).toFixed(1));
        const wind = Number((4 + Math.random() * 18).toFixed(1));
        const drainage = Number((0.28 + Math.random() * 0.5).toFixed(2));
        const temperature = Number((city.baseTemp + (Math.random() - 0.5) * 5).toFixed(1));
        const riskScore = predictFloodRisk(rainfall, humidity, drainage, 12, 55, wind);
        const floodOccurred = riskScore >= 0.62 ? 1 : 0;

        insertHistorical.run(
          timestamp,
          city.name,
          rainfall,
          temperature,
          humidity,
          wind,
          drainage,
          floodOccurred,
        );
      }
    }

    const shelters = [
      ['Rajaji Hall, Chennai', 13.0829, 80.2746, 500, '+91-44-25360001'],
      ['Tambaram Relief Camp, Chennai', 12.9246, 80.1155, 600, '+91-44-22265000'],
      ['NSCI Dome, Mumbai', 19.0144, 72.821, 800, '+91-22-24960333'],
      ['BKC Convention Centre, Mumbai', 19.0608, 72.8686, 1500, '+91-22-66524600'],
      ['Palace Grounds, Bangalore', 13.0058, 77.5817, 3000, '+91-80-23337400'],
      ['BBMP Community Hall, Bangalore', 12.9304, 77.5831, 400, '+91-80-22975555'],
    ] as const;

    for (const shelter of shelters) {
      insertShelter.run(...shelter);
    }

    const reports = [
      ['Chennai', 13.0569, 80.2425, 'knee', 'Velachery subway flooded after overnight rainfall.'],
      ['Mumbai', 19.0176, 72.8562, 'knee', 'Hindmata junction water level rising quickly.'],
      ['Bangalore', 12.9384, 77.6242, 'waist', 'Bellandur side roads waterlogged and blocked.'],
    ] as const;

    for (const report of reports) {
      insertReport.run(new Date().toISOString(), ...report);
    }

    const alerts = [
      ['IMD heavy rainfall advisory in effect for coastal districts.', 'warning', 'Chennai'],
      ['Mithi river level nearing danger mark; monitor low-lying zones.', 'danger', 'Mumbai'],
      ['Flash flood watch active for ORR and Bellandur corridor.', 'warning', 'Bangalore'],
    ] as const;

    for (const alert of alerts) {
      insertAlert.run(new Date().toISOString(), ...alert);
    }
  });

  transaction();
  console.log('Seeded mock records into SQLite database.');
}

function persistWeatherSnapshot(snapshot: WeatherSnapshot) {
  db.prepare(
    `INSERT INTO live_weather_snapshots
      (fetched_at, city, lat, lon, temp, humidity, wind, rain, drainage, risk_score, risk_category, source)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    snapshot.timestamp,
    snapshot.location,
    snapshot.lat,
    snapshot.lon,
    snapshot.temp,
    snapshot.humidity,
    snapshot.wind,
    snapshot.rain,
    snapshot.drainage,
    snapshot.riskScore,
    snapshot.riskCategory,
    snapshot.source,
  );

  db.prepare(
    `INSERT INTO historical_weather
      (timestamp, location, rainfall_mm, temperature, humidity, wind_speed, drainage_capacity, flood_occurred)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    snapshot.timestamp,
    snapshot.location,
    snapshot.rain,
    snapshot.temp,
    snapshot.humidity,
    snapshot.wind,
    snapshot.drainage,
    snapshot.riskScore >= 0.62 ? 1 : 0,
  );
}

function getLatestSnapshot(city: string): (WeatherSnapshot & { fetched_at: string }) | null {
  const row = db
    .prepare(
      `SELECT fetched_at, city, lat, lon, temp, humidity, wind, rain, drainage, risk_score, risk_category, source
       FROM live_weather_snapshots
       WHERE city = ?
       ORDER BY fetched_at DESC
       LIMIT 1`,
    )
    .get(city) as
    | {
        fetched_at: string;
        city: string;
        lat: number;
        lon: number;
        temp: number;
        humidity: number;
        wind: number;
        rain: number;
        drainage: number;
        risk_score: number;
        risk_category: RiskCategory;
        source: string;
      }
    | undefined;

  if (!row) {
    return null;
  }

  return {
    fetched_at: row.fetched_at,
    location: row.city,
    lat: row.lat,
    lon: row.lon,
    temp: row.temp,
    humidity: row.humidity,
    wind: row.wind,
    rain: row.rain,
    drainage: row.drainage,
    riskScore: row.risk_score,
    riskCategory: row.risk_category,
    source: row.source,
    timestamp: row.fetched_at,
  };
}

function syntheticWeather(city: string, lat: number, lon: number): WeatherSnapshot {
  const presets: Record<string, { temp: number; humidity: number; rain: number }> = {
    chennai: { temp: 31, humidity: 85, rain: 94 },
    mumbai: { temp: 28, humidity: 80, rain: 72 },
    bangalore: { temp: 24, humidity: 74, rain: 46 },
  };

  const preset = presets[cityKey(city)] ?? { temp: 28, humidity: 76, rain: 38 };
  const drainage = averageDrainageCapacity(city);
  const temp = Number((preset.temp + (Math.random() - 0.5) * 3).toFixed(1));
  const humidity = Number((preset.humidity + (Math.random() - 0.5) * 10).toFixed(1));
  const wind = Number((7 + Math.random() * 12).toFixed(1));
  const rain = Number(Math.max(0, preset.rain + (Math.random() - 0.5) * 24).toFixed(1));
  const riskScore = Number(predictFloodRisk(rain, humidity, drainage, 10, 55, wind).toFixed(3));

  return {
    location: city,
    lat,
    lon,
    temp,
    humidity,
    wind,
    rain,
    drainage,
    riskScore,
    riskCategory: classifyRisk(riskScore),
    source: 'synthetic-fallback',
    timestamp: new Date().toISOString(),
  };
}

async function fetchOpenWeather(city: string, lat: number, lon: number): Promise<WeatherSnapshot | null> {
  const apiKey = process.env.OPENWEATHER_API_KEY?.trim();
  if (!apiKey) {
    return null;
  }

  const response = await axios.get('https://api.openweathermap.org/data/2.5/weather', {
    params: { lat, lon, appid: apiKey, units: 'metric' },
    timeout: 7000,
  });

  const rainfall = Number(response.data.rain?.['1h'] ?? ((response.data.rain?.['3h'] ?? 0) / 3));
  const humidity = Number(response.data.main?.humidity ?? 70);
  const temp = Number(response.data.main?.temp ?? 28);
  const wind = Number(response.data.wind?.speed ?? 8);
  const drainage = averageDrainageCapacity(city);
  const riskScore = Number(predictFloodRisk(rainfall, humidity, drainage, 10, 55, wind).toFixed(3));

  return {
    location: response.data.name || city,
    lat,
    lon,
    temp,
    humidity,
    wind,
    rain: Number(rainfall.toFixed(1)),
    drainage,
    riskScore,
    riskCategory: classifyRisk(riskScore),
    source: 'openweather',
    timestamp: new Date().toISOString(),
  };
}

async function fetchOpenMeteo(city: string, lat: number, lon: number): Promise<WeatherSnapshot | null> {
  const response = await axios.get('https://api.open-meteo.com/v1/forecast', {
    params: {
      latitude: lat,
      longitude: lon,
      current: 'temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m',
    },
    timeout: 7000,
  });

  const current = response.data.current;
  if (!current) {
    return null;
  }

  const rain = Number(current.precipitation ?? 0);
  const humidity = Number(current.relative_humidity_2m ?? 70);
  const temp = Number(current.temperature_2m ?? 28);
  const wind = Number(current.wind_speed_10m ?? 8);
  const drainage = averageDrainageCapacity(city);
  const riskScore = Number(predictFloodRisk(rain, humidity, drainage, 10, 55, wind).toFixed(3));

  return {
    location: city,
    lat,
    lon,
    temp,
    humidity,
    wind,
    rain: Number(rain.toFixed(1)),
    drainage,
    riskScore,
    riskCategory: classifyRisk(riskScore),
    source: 'open-meteo',
    timestamp: new Date().toISOString(),
  };
}

async function buildLiveSnapshot(city: string, lat: number, lon: number): Promise<WeatherSnapshot> {
  try {
    const openWeatherData = await fetchOpenWeather(city, lat, lon);
    if (openWeatherData) {
      return openWeatherData;
    }
  } catch (error) {
    console.warn('OpenWeather fetch failed:', error instanceof Error ? error.message : String(error));
  }

  try {
    const openMeteoData = await fetchOpenMeteo(city, lat, lon);
    if (openMeteoData) {
      return openMeteoData;
    }
  } catch (error) {
    console.warn('Open-Meteo fetch failed:', error instanceof Error ? error.message : String(error));
  }

  return syntheticWeather(city, lat, lon);
}

function calculateMetrics(city: string | null): BinaryMetrics {
  const rows = city
    ? (db
        .prepare(
          `SELECT rainfall_mm, humidity, drainage_capacity, wind_speed, flood_occurred
           FROM historical_weather
           WHERE location = ?
           ORDER BY timestamp DESC
           LIMIT 500`,
        )
        .all(city) as Array<{ rainfall_mm: number; humidity: number; drainage_capacity: number; wind_speed: number; flood_occurred: number }>)
    : (db
        .prepare(
          `SELECT rainfall_mm, humidity, drainage_capacity, wind_speed, flood_occurred
           FROM historical_weather
           ORDER BY timestamp DESC
           LIMIT 1000`,
        )
        .all() as Array<{ rainfall_mm: number; humidity: number; drainage_capacity: number; wind_speed: number; flood_occurred: number }>);

  if (rows.length === 0) {
    return {
      sampleSize: 0,
      accuracy: 0,
      precision: 0,
      recall: 0,
      f1: 0,
      confusionMatrix: { tp: 0, tn: 0, fp: 0, fn: 0 },
    };
  }

  let tp = 0;
  let tn = 0;
  let fp = 0;
  let fn = 0;

  for (const row of rows) {
    const probability = predictFloodRisk(
      Number(row.rainfall_mm),
      Number(row.humidity),
      Number(row.drainage_capacity),
      12,
      55,
      Number(row.wind_speed),
    );
    const prediction = probability >= 0.55 ? 1 : 0;
    const actual = Number(row.flood_occurred) === 1 ? 1 : 0;

    if (prediction === 1 && actual === 1) tp += 1;
    if (prediction === 0 && actual === 0) tn += 1;
    if (prediction === 1 && actual === 0) fp += 1;
    if (prediction === 0 && actual === 1) fn += 1;
  }

  const sampleSize = rows.length;
  const accuracy = sampleSize ? (tp + tn) / sampleSize : 0;
  const precision = tp + fp ? tp / (tp + fp) : 0;
  const recall = tp + fn ? tp / (tp + fn) : 0;
  const f1 = precision + recall ? (2 * precision * recall) / (precision + recall) : 0;

  return {
    sampleSize,
    accuracy: Number(accuracy.toFixed(4)),
    precision: Number(precision.toFixed(4)),
    recall: Number(recall.toFixed(4)),
    f1: Number(f1.toFixed(4)),
    confusionMatrix: { tp, tn, fp, fn },
  };
}

function persistMetrics(city: string | null, metrics: BinaryMetrics, notes: string) {
  db.prepare(
    `INSERT INTO model_evaluations
      (evaluated_at, city, sample_size, accuracy, precision, recall, f1_score, tp, tn, fp, fn, model_version, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    new Date().toISOString(),
    city ?? 'ALL',
    metrics.sampleSize,
    metrics.accuracy,
    metrics.precision,
    metrics.recall,
    metrics.f1,
    metrics.confusionMatrix.tp,
    metrics.confusionMatrix.tn,
    metrics.confusionMatrix.fp,
    metrics.confusionMatrix.fn,
    MODEL_VERSION,
    notes,
  );
}

function latestMetrics(city: string | null) {
  const row = city
    ? (db
        .prepare(
          `SELECT city, sample_size, accuracy, precision, recall, f1_score, tp, tn, fp, fn, model_version, evaluated_at
           FROM model_evaluations
           WHERE city = ?
           ORDER BY evaluated_at DESC
           LIMIT 1`,
        )
        .get(city) as
        | {
            city: string;
            sample_size: number;
            accuracy: number;
            precision: number;
            recall: number;
            f1_score: number;
            tp: number;
            tn: number;
            fp: number;
            fn: number;
            model_version: string;
            evaluated_at: string;
          }
        | undefined)
    : (db
        .prepare(
          `SELECT city, sample_size, accuracy, precision, recall, f1_score, tp, tn, fp, fn, model_version, evaluated_at
           FROM model_evaluations
           ORDER BY evaluated_at DESC
           LIMIT 1`,
        )
        .get() as
        | {
            city: string;
            sample_size: number;
            accuracy: number;
            precision: number;
            recall: number;
            f1_score: number;
            tp: number;
            tn: number;
            fp: number;
            fn: number;
            model_version: string;
            evaluated_at: string;
          }
        | undefined);

  if (!row) {
    return null;
  }

  return {
    city: row.city,
    sampleSize: row.sample_size,
    accuracy: row.accuracy,
    precision: row.precision,
    recall: row.recall,
    f1: row.f1_score,
    confusionMatrix: {
      tp: row.tp,
      tn: row.tn,
      fp: row.fp,
      fn: row.fn,
    },
    modelVersion: row.model_version,
    evaluatedAt: row.evaluated_at,
  };
}

app.get('/api/health', (_req, res) => {
  try {
    const tableCounts = {
      historical: (db.prepare('SELECT COUNT(*) AS cnt FROM historical_weather').get() as { cnt: number }).cnt,
      reports: (db.prepare('SELECT COUNT(*) AS cnt FROM flood_reports').get() as { cnt: number }).cnt,
      shelters: (db.prepare('SELECT COUNT(*) AS cnt FROM safe_shelters').get() as { cnt: number }).cnt,
      alerts: (db.prepare('SELECT COUNT(*) AS cnt FROM emergency_alerts').get() as { cnt: number }).cnt,
      snapshots: (db.prepare('SELECT COUNT(*) AS cnt FROM live_weather_snapshots').get() as { cnt: number }).cnt,
      evaluations: (db.prepare('SELECT COUNT(*) AS cnt FROM model_evaluations').get() as { cnt: number }).cnt,
    };

    res.json({
      status: 'ok',
      db: {
        provider: 'sqlite',
        path: DB_PATH,
        writable: true,
      },
      tables: tableCounts,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

app.get('/api/weather', async (req, res) => {
  const city = normalizeCity(req.query.city);
  const coords = resolveCoordinates(city, req.query.lat, req.query.lon);
  const forceRefresh = String(req.query.force ?? '0') === '1';

  try {
    const cached = getLatestSnapshot(city);
    if (cached && !forceRefresh) {
      const freshnessMinutes = calculateFreshnessMinutes(cached.fetched_at);
      if (freshnessMinutes <= LIVE_WEATHER_MAX_AGE_MINUTES) {
        return res.json({
          ...cached,
          source: `${cached.source}:cache`,
          freshnessMinutes,
          cached: true,
        });
      }
    }

    const snapshot = await buildLiveSnapshot(city, coords.lat, coords.lon);
    persistWeatherSnapshot(snapshot);

    res.json({
      ...snapshot,
      freshnessMinutes: 0,
      cached: false,
    });
  } catch (error) {
    console.error('Failed to fetch weather:', error);
    res.status(500).json({ error: 'Failed to fetch weather data' });
  }
});

app.get('/api/live-feed', (req, res) => {
  const city = req.query.city ? normalizeCity(req.query.city) : null;

  try {
    const snapshots = city
      ? (db
          .prepare(
            `SELECT fetched_at, city, lat, lon, temp, humidity, wind, rain, drainage, risk_score, risk_category, source
             FROM live_weather_snapshots
             WHERE city = ?
             ORDER BY fetched_at DESC
             LIMIT 24`,
          )
          .all(city) as Array<Record<string, unknown>>)
      : (db
          .prepare(
            `SELECT fetched_at, city, lat, lon, temp, humidity, wind, rain, drainage, risk_score, risk_category, source
             FROM live_weather_snapshots
             ORDER BY fetched_at DESC
             LIMIT 72`,
          )
          .all() as Array<Record<string, unknown>>);

    const latest = snapshots[0] as { fetched_at?: string; source?: string } | undefined;
    const freshnessMinutes = latest?.fetched_at ? calculateFreshnessMinutes(latest.fetched_at) : null;

    res.json({
      city: city ?? 'ALL',
      source: latest?.source ?? null,
      freshnessMinutes,
      snapshots,
    });
  } catch (error) {
    console.error('Failed to load live feed:', error);
    res.status(500).json({ error: 'DB error while loading live feed' });
  }
});

app.get('/api/historical', (req, res) => {
  const city = normalizeCity(req.query.city);
  const requestedLimit = toFiniteNumber(req.query.limit, 48);
  const limit = Math.round(clamp(requestedLimit, 12, 240));

  try {
    const rows = db
      .prepare(
        `SELECT id, timestamp, location, rainfall_mm, temperature, humidity, wind_speed, drainage_capacity, flood_occurred
         FROM historical_weather
         WHERE location = ?
         ORDER BY timestamp DESC
         LIMIT ?`,
      )
      .all(city, limit);

    res.json(rows);
  } catch (error) {
    console.error('Failed to load history:', error);
    res.status(500).json({ error: 'DB error while loading history' });
  }
});

app.post('/api/predict', (req, res) => {
  const rainfall = toFiniteNumber(req.body?.rainfall, 0);
  const humidity = toFiniteNumber(req.body?.humidity, 70);
  const drainageCapacity = clamp(toFiniteNumber(req.body?.drainageCapacity, 0.5), 0, 1);
  const elevation = Math.max(0, toFiniteNumber(req.body?.elevation, 10));
  const soilMoisture = clamp(toFiniteNumber(req.body?.soilMoisture, 55), 0, 100);
  const wind = Math.max(0, toFiniteNumber(req.body?.windSpeed, 10));
  const city = normalizeCity(req.body?.city);

  const riskScore = Number(
    predictFloodRisk(rainfall, humidity, drainageCapacity, elevation, soilMoisture, wind).toFixed(3),
  );

  res.json({
    location: city,
    rainfall,
    humidity,
    drainage: drainageCapacity,
    riskScore,
    riskCategory: classifyRisk(riskScore),
    timestamp: new Date().toISOString(),
    isSimulation: true,
  });
});

app.post('/api/report', (req, res) => {
  const location = normalizeCity(req.body?.location);
  const lat = toFiniteNumber(req.body?.lat, NaN);
  const lon = toFiniteNumber(req.body?.lon, NaN);
  const waterLevel = String(req.body?.waterLevel ?? '').trim();
  const description = String(req.body?.description ?? '').trim();
  const imageUrl = String(req.body?.imageUrl ?? '').trim();

  if (!Number.isFinite(lat) || !Number.isFinite(lon) || !waterLevel || description.length < 5) {
    return res.status(400).json({ error: 'Missing or invalid report fields' });
  }

  try {
    const result = db
      .prepare(
        `INSERT INTO flood_reports (timestamp, location, lat, lon, water_level, description, image_url)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(new Date().toISOString(), location, lat, lon, waterLevel, description.slice(0, 2000), imageUrl);

    res.json({ success: true, id: result.lastInsertRowid });
  } catch (error) {
    console.error('Failed to create report:', error);
    res.status(500).json({ error: 'DB error while saving report' });
  }
});

app.get('/api/reports', (_req, res) => {
  try {
    const rows = db
      .prepare(
        `SELECT id, timestamp, location, lat, lon, water_level, description, image_url
         FROM flood_reports
         ORDER BY timestamp DESC`,
      )
      .all();

    res.json(rows);
  } catch (error) {
    console.error('Failed to load reports:', error);
    res.status(500).json({ error: 'DB error while loading reports' });
  }
});

app.post('/api/shelter', (req, res) => {
  const address = String(req.body?.address ?? '').trim();
  const lat = toFiniteNumber(req.body?.lat, NaN);
  const lon = toFiniteNumber(req.body?.lon, NaN);
  const capacity = Math.round(toFiniteNumber(req.body?.capacity, 0));
  const contactNumber = String(req.body?.contactNumber ?? '').trim();

  if (!address || !Number.isFinite(lat) || !Number.isFinite(lon) || capacity < 1 || !contactNumber) {
    return res.status(400).json({ error: 'Missing or invalid shelter fields' });
  }

  try {
    const result = db
      .prepare(
        `INSERT INTO safe_shelters (timestamp, address, lat, lon, capacity, contact_number)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(new Date().toISOString(), address.slice(0, 255), lat, lon, capacity, contactNumber.slice(0, 50));

    res.json({ success: true, id: result.lastInsertRowid });
  } catch (error) {
    console.error('Failed to create shelter:', error);
    res.status(500).json({ error: 'DB error while saving shelter' });
  }
});

app.get('/api/shelters', (_req, res) => {
  try {
    const rows = db
      .prepare(
        `SELECT id, timestamp, address, lat, lon, capacity, contact_number
         FROM safe_shelters
         ORDER BY capacity DESC`,
      )
      .all();

    res.json(rows);
  } catch (error) {
    console.error('Failed to load shelters:', error);
    res.status(500).json({ error: 'DB error while loading shelters' });
  }
});

app.get('/api/alerts', (req, res) => {
  const city = req.query.city ? normalizeCity(req.query.city) : null;

  try {
    const rows = city
      ? db
          .prepare(
            `SELECT id, timestamp, message, type, location
             FROM emergency_alerts
             WHERE location = ?
             ORDER BY timestamp DESC
             LIMIT 30`,
          )
          .all(city)
      : db
          .prepare(
            `SELECT id, timestamp, message, type, location
             FROM emergency_alerts
             ORDER BY timestamp DESC
             LIMIT 30`,
          )
          .all();

    res.json(rows);
  } catch (error) {
    console.error('Failed to load alerts:', error);
    res.status(500).json({ error: 'DB error while loading alerts' });
  }
});

app.get('/api/analytics', (_req, res) => {
  try {
    const totalReports = (db.prepare('SELECT COUNT(*) AS cnt FROM flood_reports').get() as { cnt: number }).cnt;
    const numberOfShelters = (db.prepare('SELECT COUNT(*) AS cnt FROM safe_shelters').get() as { cnt: number }).cnt;
    const activeFloodZones = (
      db
        .prepare(
          `SELECT COUNT(*) AS cnt
           FROM historical_weather
           WHERE flood_occurred = 1 AND timestamp >= datetime('now', '-1 day')`,
        )
        .get() as { cnt: number }
    ).cnt;

    const latestSnapshot = db
      .prepare(
        `SELECT fetched_at, source
         FROM live_weather_snapshots
         ORDER BY fetched_at DESC
         LIMIT 1`,
      )
      .get() as { fetched_at: string; source: string } | undefined;

    const latestEvaluation = latestMetrics(null);

    res.json({
      totalReports,
      activeFloodZones,
      numberOfShelters,
      evacuatedUsers: numberOfShelters * 15,
      modelAccuracy: latestEvaluation?.accuracy ?? null,
      modelF1: latestEvaluation?.f1 ?? null,
      modelVersion: latestEvaluation?.modelVersion ?? MODEL_VERSION,
      liveDataFreshnessMinutes: latestSnapshot?.fetched_at
        ? calculateFreshnessMinutes(latestSnapshot.fetched_at)
        : null,
      liveSource: latestSnapshot?.source ?? null,
    });
  } catch (error) {
    console.error('Failed to load analytics:', error);
    res.status(500).json({ error: 'DB error while loading analytics' });
  }
});

app.post('/api/model/evaluate', (req, res) => {
  const city = req.body?.city ? normalizeCity(req.body.city) : null;

  try {
    const metrics = calculateMetrics(city);
    persistMetrics(city, metrics, 'manual-evaluation');

    res.json({
      city: city ?? 'ALL',
      ...metrics,
      modelVersion: MODEL_VERSION,
      evaluatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Failed to evaluate model:', error);
    res.status(500).json({ error: 'Failed to evaluate model' });
  }
});

app.get('/api/model/metrics', (req, res) => {
  const city = req.query.city ? normalizeCity(req.query.city) : null;

  try {
    let metrics = latestMetrics(city);

    if (!metrics) {
      const generated = calculateMetrics(city);
      persistMetrics(city, generated, 'on-demand-bootstrap');
      metrics = latestMetrics(city);
    }

    res.json(
      metrics ?? {
        city: city ?? 'ALL',
        sampleSize: 0,
        accuracy: 0,
        precision: 0,
        recall: 0,
        f1: 0,
        confusionMatrix: { tp: 0, tn: 0, fp: 0, fn: 0 },
        modelVersion: MODEL_VERSION,
        evaluatedAt: new Date().toISOString(),
      },
    );
  } catch (error) {
    console.error('Failed to load model metrics:', error);
    res.status(500).json({ error: 'DB error while loading model metrics' });
  }
});

async function startServer() {
  bootstrapSchema();
  seedMockData();

  if (!latestMetrics(null)) {
    const baseline = calculateMetrics(null);
    persistMetrics(null, baseline, 'bootstrap-initialization');
  }

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Flood server running on http://localhost:${PORT}`);
    console.log(`SQLite database path: ${DB_PATH}`);
  });
}

startServer().catch((error) => {
  console.error('Server startup failed:', error);
  process.exit(1);
});

process.on('SIGINT', () => {
  db.close();
  process.exit(0);
});

process.on('SIGTERM', () => {
  db.close();
  process.exit(0);
});

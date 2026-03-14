# Urban Flood AI Monitoring System

Production-focused flood intelligence platform with:

- live weather ingestion
- persistent database storage
- flood-risk prediction
- model accuracy tracking
- citizen reporting and shelter coordination

## Core Capabilities

- Live weather pipeline with provider fallback:
  OpenWeather when API key is present, Open-Meteo as fallback, synthetic fallback as last resort.
- Durable database with SQLite (file-based, zero setup)
- Automatic schema bootstrap and seeded starter data
- Flood prediction endpoint for simulation and map-risk workflows
- Stored ML evaluation metrics:
  accuracy, precision, recall, F1 score, and confusion matrix (TP/TN/FP/FN).
- Business-facing health and analytics endpoints
- React dashboard with admin KPIs and live-feed freshness

## Tech Stack

- Frontend: React, Vite, Tailwind CSS, Leaflet, Recharts
- Backend: Express + TypeScript
- Database: SQLite via better-sqlite3
- Data sources: OpenWeather, Open-Meteo
- Optional offline model training: Python (XGBoost)

## Project Structure

- server.ts: Express API, DB schema, live ingestion, model metrics
- src/App.tsx: Dashboard UI and map workflows
- src/types.ts: Shared frontend API models
- flood_data.db: SQLite database file (auto-created)
- train model.py: Optional Python training script

## Environment Configuration

Copy [.env.example](.env.example) to .env and update values as needed.

Available variables:

- OPENWEATHER_API_KEY
- SQLITE_DB_PATH
- LIVE_WEATHER_MAX_AGE_MINUTES
- MODEL_VERSION
- PORT

## Run Locally

1. Install dependencies:
   npm install
2. Create and configure .env from [.env.example](.env.example)
3. Start the app:
   npm run dev
4. Open:
   [http://localhost:3000](http://localhost:3000)

## Build and Start

- Build frontend:
  npm run build
- Start server:
  npm start

## API Overview

### Health and Platform

- GET /api/health
- GET /api/analytics

### Live Data

- GET /api/weather?city=Chennai&lat=13.0827&lon=80.2707
- GET /api/live-feed?city=Chennai

### Prediction and Model Quality

- POST /api/predict
- GET /api/model/metrics?city=Chennai
- POST /api/model/evaluate

### Citizen and Operations

- GET /api/historical?city=Chennai
- GET /api/reports
- POST /api/report
- GET /api/shelters
- POST /api/shelter
- GET /api/alerts

## Example Prediction Request

```json
{
  "rainfall": 140,
  "humidity": 88,
  "drainageCapacity": 0.35,
  "elevation": 12,
  "soilMoisture": 62,
  "windSpeed": 14,
  "city": "Chennai"
}
```

## Optional Python Model Training

The repository includes [train model.py](train%20model.py) for offline model experimentation.

Install Python dependencies in your environment:

- pandas
- numpy
- scikit-learn
- xgboost
- matplotlib
- joblib

Then run:

python "train model.py"

## Business Readiness Notes

- The backend is resilient to live-data provider failures via layered fallback.
- DB schema, metrics persistence, and health checks support operational observability.
- Admin dashboard surfaces model accuracy and data freshness for decision-making.
- For production scale, add:
  authentication and role-based access, request rate limiting, centralized logging and monitoring,
  and backup strategy for SQLite or migration to managed PostgreSQL.

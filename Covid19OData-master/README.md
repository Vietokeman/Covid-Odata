# Covid19 OData

Comprehensive example: an ASP.NET Core Web API (OData) + React client that serves COVID-19 time series data.

This repository contains:

- `Covid19.Server/` - ASP.NET Core 8 Web API that exposes OData endpoints and reads/writes data via Entity Framework Core (PostgreSQL).
- `covid19.client/` - React + TypeScript front-end (Vite) that visualizes the data on a world map and treemap.

This README explains how to set up the database, run the server and client locally, seed the database from CSV, and query the OData endpoints.

**Contents**
- **Overview**
- **Architecture**
- **Prerequisites**
- **Configuration**
- **Run locally**
- **Seeding data**
- **API / OData examples**
- **Development notes & troubleshooting**

---

## Overview

The project migrated the original CSV-based data source into a PostgreSQL database and exposes combined datasets via OData. The client fetches aggregated country-level snapshots and visualizes them.

Key features
- ASP.NET Core 8 with OData support (filter/select/order/count/expand)
- EF Core 8 + Npgsql provider for PostgreSQL
- React + Vite client with a map and treemap visualization
- CSV-based seeding (services under `Covid19.Server/Services`) and a `SeedController` endpoint to trigger seeding

## Architecture

- Server: `Covid19.Server`
	- `ApplicationDbContext` defines DbSets for `CovidConfirmedCase`, `CovidDeathCase`, `CovidRecoverCase`, `CovidDailyReport`, `CovidDataPoint`.
	- Services: `CovidConfirmService`, `CovidDeathService`, `CovidRecoverService`, `CovidDataService`, `DailyReportService`.
	- Controllers expose OData endpoints under `/odata` and an API controller to trigger seeding at `/api/seed/seed`.

- Client: `covid19.client`
	- Vite + React + TypeScript app in `covid19.client/src`.
	- Fetches OData at runtime and displays progress while loading.

## Prerequisites

- .NET 8 SDK
- Node.js (16+ recommended) and npm
- PostgreSQL (local or remote)
- Optional: `dotnet-ef` tool to run EF migrations from the command line

## Configuration

The default PostgreSQL connection string is in `Covid19.Server/appsettings.json`. Edit it before running in a production environment.

Example (already in repo):

```
"ConnectionStrings": {
	"DefaultConnection": "Host=localhost;Port=5432;Database=covid19_db;Username=postgres;Password=YOUR_PASSWORD"
}
```

Replace `YOUR_PASSWORD` with your PostgreSQL password. You can also use environment variables or user secrets for safer credential handling.

## Run locally

Run the server and client in separate terminals.

1) PostgreSQL: create the target database (example using psql):

```powershell
psql -U postgres -h localhost -p 5432
CREATE DATABASE covid19_db;
\q
```

2) Server (from repository root):

```powershell
cd Covid19.Server
dotnet restore
# (optional) add migrations if missing
# dotnet tool install --global dotnet-ef
# dotnet ef migrations add InitialCreate
# dotnet ef database update

dotnet run
```

The server will start and expose OData endpoints under `https://localhost:{PORT}/odata` (check console for the exact port; common dev port used in workspace is 7049).

3) Client (in a second terminal):

```powershell
cd covid19.client
npm install
npm run dev
```

Open the client URL printed by Vite (normally `http://localhost:5173`) and the client will fetch data from the server.

## Seeding data

The server contains CSV seeding logic in `Covid19.Server/Services/*Service.cs`. A controller is provided to trigger seeding manually.

To seed the database after the server is running, send a POST request to:

```
POST https://localhost:{PORT}/api/seed/seed
```

Example using PowerShell (insecure for self-signed HTTPS):

```powershell
Invoke-RestMethod -Uri https://localhost:7049/api/seed/seed -Method Post
```

If seeding runs successfully you should see a `200 OK` response and the DB tables populated.

## API & OData examples

Main OData endpoints (under `/odata`):

- `/odata/CovidData` — combined data points (Confirmed/Deaths/Recovered)
- `/odata/CovidConfirmed` — confirmed case entities
- `/odata/CovidDeath` — death case entities
- `/odata/CovidRecover` — recovered case entities
- `/odata/CovidDailyReports` — daily report entities

Examples:

Get latest 1000 combined rows:

```
GET https://localhost:7049/odata/CovidData?$orderby=Date desc&$top=1000
```

Filter by country and date range:

```
GET https://localhost:7049/odata/CovidData?$filter=CountryRegion eq 'US' and Date ge 2020-01-01 and Date le 2020-12-31
```

Select only a few fields:

```
GET https://localhost:7049/odata/CovidData?$select=CountryRegion,Date,Confirmed,Deaths
```

Note: OData options like `$filter`, `$select`, `$orderby`, `$count`, and `$expand` are enabled on the server.

## Development notes

- The server uses EF Core with Npgsql provider. The `ApplicationDbContext` configures `timestamp with time zone` for date/time fields.
- To add or update database schema:

```
dotnet ef migrations add <Name>
dotnet ef database update
```

- The React client implements progressive fetching with UI progress updates while loading large datasets. See `covid19.client/src/App.tsx` for the logic.

## Troubleshooting

- If the client shows CORS or network errors, ensure the server `UseCors("AllowReactApp")` policy is active and the server is reachable at the expected HTTPS port.
- If HTTPS certificate errors occur when calling the API from the client, accept the dev certificate in your browser or run the client using the same origin as server (SPA proxy) or use `curl.exe -k` for testing.
- If EF migrations fail, ensure `dotnet-ef` tool is installed and the `DefaultConnection` string is correct.

## Contributing

Contributions welcome. Typical workflow:

1. Fork repository
2. Create feature branch
3. Add tests / verify client + server run
4. Submit a PR with description

## License

Project includes a `LICENSE.txt` file in the repository root — consult that for license terms.

---

If you want, I can also:
- add a short Vietnamese translation for the README,
- create a `README.md` inside `covid19.client/` with local dev tips, or
- commit and push the README for you.

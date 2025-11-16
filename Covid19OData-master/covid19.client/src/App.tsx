import { useCallback, useEffect, useState, useMemo } from "react";
import {
    ComposableMap,
    Geographies,
    Geography,
} from "react-simple-maps";
import { scaleLinear } from "d3-scale";
import { Treemap } from "recharts";
import "./App.css";
import type { CovidData, CountryData } from "./covid.ts";

const geoUrl = "map.json";

function App() {
    const [data, setData] = useState<CountryData[]>([]);
    const [rawData, setRawData] = useState<CountryData[]>([]); // Cache raw data
    const [loading, setLoading] = useState(true);
    const [loadingProgress, setLoadingProgress] = useState<string>("");
    const [error, setError] = useState<string | null>(null);
    const [selectedMetric, setSelectedMetric] = useState<
        "Confirmed" | "Deaths" | "Recovered"
    >("Confirmed");
    const [tooltip, setTooltip] = useState<{
        x: number;
        y: number;
        content: string;
    } | null>(null);
    const [hoveredCell, setHoveredCell] = useState<string | null>(null);
    const [totals, setTotals] = useState({
        Confirmed: 0,
        Deaths: 0,
        Recovered: 0,
        LastUpdate: ""
    });

    const fetchData = useCallback(async () => {
        try {
            setLoading(true);
            setError(null);
            console.log("🔵 Starting fetch...");

            let allData: CovidData[] = [];
            let nextUrl: string | null =
                "https://localhost:7049/odata/CovidData?$orderby=Date desc&$top=1000000";
            let pageCount = 0;

            while (nextUrl) {
                try {
                    const response: Response = await fetch(nextUrl);

                    if (!response.ok)
                        throw new Error(`HTTP error! status: ${response.status}`);

                    const json = await response.json();
                    const pageData = json.value || [];

                    if (pageData.length === 0) {
                        break;
                    }

                    // Process data in chunks of 10,000
                    let processedInThisResponse = 0;
                    while (processedInThisResponse < pageData.length) {
                        const chunkEnd = Math.min(processedInThisResponse + 10000, pageData.length);
                        const chunk = pageData.slice(processedInThisResponse, chunkEnd);
                        allData = allData.concat(chunk);
                        processedInThisResponse = chunkEnd;
                        pageCount++;

                        // Update progress display for every 10,000 rows
                        setLoadingProgress(`⏳ Loading page ${pageCount}... Total: ${allData.length.toLocaleString()} rows`);

                        // Small delay so user can see the progress
                        await new Promise(resolve => setTimeout(resolve, 200));
                    }

                    nextUrl = json["@odata.nextLink"] || null;

                } catch (pageError) {
                    console.error(`Error fetching:`, pageError);
                    break;
                }
            }

            setLoadingProgress(`Processing ${allData.length} total records...`);
            console.log(`Finished loading: ${pageCount} pages, ${allData.length} total records`);

            const latestByCountry: Record<string, CountryData> = {};
            allData.forEach((item: CovidData) => {
                const country = item.CountryRegion;
                const date = new Date(item.Date);

                if (
                    !latestByCountry[country] ||
                    new Date(latestByCountry[country].LastUpdate) < date
                ) {
                    latestByCountry[country] = {
                        CountryRegion: country,
                        Confirmed: item.Confirmed,
                        Deaths: item.Deaths,
                        Recovered: item.Recovered,
                        LastUpdate: item.Date,
                    };
                }
            });

            const mapped = Object.values(latestByCountry).sort(
                (a, b) => b.Confirmed - a.Confirmed // Sort by Confirmed initially
            );
            setRawData(mapped); // Cache the raw data
            setData(mapped);

            // Calculate totals
            const totalConfirmed = mapped.reduce((sum, d) => sum + d.Confirmed, 0);
            const totalDeaths = mapped.reduce((sum, d) => sum + d.Deaths, 0);
            const totalRecovered = mapped.reduce((sum, d) => sum + d.Recovered, 0);
            const lastUpdate = mapped.length > 0 ? mapped[0].LastUpdate : "";

            setTotals({
                Confirmed: totalConfirmed,
                Deaths: totalDeaths,
                Recovered: totalRecovered,
                LastUpdate: lastUpdate
            });

            console.log(`Final result: ${mapped.length} countries processed`);

        } catch (err) {
            console.error('Fetch error:', err);
            setError(err instanceof Error ? err.message : "Failed to fetch data");
        } finally {
            setLoading(false);
            setLoadingProgress("");
        }
    }, []); // Empty dependency - only fetch once!

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    // Re-sort data when metric changes without refetching
    useEffect(() => {
        if (rawData.length > 0) {
            const sorted = [...rawData].sort(
                (a, b) => b[selectedMetric] - a[selectedMetric]
            );
            setData(sorted);
        }
    }, [selectedMetric, rawData]);

    const colorScale = useMemo(() => {
        if (data.length === 0)
            return scaleLinear<string>().domain([0, 1]).range(["#f7f7f7", "#f7f7f7"]);

        const maxCases = Math.max(...data.map((d) => d[selectedMetric]));
        const minCases = Math.min(
            ...data.filter((d) => d[selectedMetric] > 0).map((d) => d[selectedMetric])
        );

        return scaleLinear<string>()
            .domain([
                0,
                Math.log10(minCases + 1),
                Math.log10(maxCases * 0.1),
                Math.log10(maxCases * 0.5),
                Math.log10(maxCases),
            ])
            .range(["#f7f7f7", "#fee5d9", "#fcae91", "#fb6a4a", "#cb181d"]);
    }, [data, selectedMetric]);
    const formatNumber = useCallback((num: number) => new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(num), []);

    const findCountryData = useCallback((geoName: string): CountryData | undefined => {
        let countryData = data.find((d) => d.CountryRegion === geoName);
        if (!countryData) {
            const nameMapping: Record<string, string> = {
                "United States of America": "US",
                "South Korea": "Korea, South",
                "North Korea": "Korea, North",
                "Czech Republic": "Czechia",
                Myanmar: "Burma",
                "Democratic Republic of the Congo": "Congo (Kinshasa)",
                "Republic of the Congo": "Congo (Brazzaville)",
                "Ivory Coast": "Cote d'Ivoire",
                "East Timor": "Timor-Leste",
                Swaziland: "Eswatini",
            };
            const mappedName = nameMapping[geoName];
            if (mappedName)
                countryData = data.find((d) => d.CountryRegion === mappedName);

            if (!countryData) {
                countryData = data.find(
                    (d) =>
                        d.CountryRegion.toLowerCase().includes(geoName.toLowerCase()) ||
                        geoName.toLowerCase().includes(d.CountryRegion.toLowerCase())
                );
            }
        }
        return countryData;
    }, [data]);

    const handleMouseEnter = useCallback((event: React.MouseEvent, geo: { properties: { name: string } }) => {
        const countryData = findCountryData(geo.properties.name);
        const value = countryData ? countryData[selectedMetric] : 0;
        const lastUpdate = countryData
            ? new Date(countryData.LastUpdate).toLocaleDateString()
            : "N/A";

        setTooltip({
            x: event.clientX,
            y: event.clientY,
            content: `${geo.properties.name}: ${formatNumber(
                value
            )} ${selectedMetric} (${lastUpdate})`,
        });
    }, [findCountryData, selectedMetric, formatNumber]);
    const handleMouseLeave = useCallback(() => setTooltip(null), []);

    const handleTreemapCellEnter = useCallback((event: React.MouseEvent, name: string, size: number) => {
        setHoveredCell(name);
        setTooltip({
            x: event.clientX,
            y: event.clientY,
            content: `${name}: ${formatNumber(size)} ${selectedMetric}`,
        });
    }, [formatNumber, selectedMetric]);

    const handleTreemapCellLeave = useCallback(() => {
        setHoveredCell(null);
        setTooltip(null);
    }, []);

    // Top 50 countries optimized for treemap layout to fill completely
    const treemapData = useMemo(() => {
        const top50 = data.slice(0, 50);
        // Ensure minimum size for small countries to avoid hidden cells
        const minSize = Math.max(...top50.map(d => d[selectedMetric])) * 0.01;
        return top50.map((d) => ({
            name: d.CountryRegion,
            size: Math.max(d[selectedMetric], minSize),
        }));
    }, [data, selectedMetric]);

    // Responsive treemap dimensions - optimized for top 50 full fill
    const getTreemapDimensions = () => {
        const width = window.innerWidth;
        if (width <= 480) {
            return { width: width - 30, height: 450 };
        } else if (width <= 768) {
            return { width: width - 50, height: 550 };
        } else if (width <= 1024) {
            return { width: width - 80, height: 650 };
        } else {
            return { width: 1250, height: 750 };
        }
    };

    const [treemapDimensions, setTreemapDimensions] = useState(getTreemapDimensions());

    useEffect(() => {
        const handleResize = () => {
            setTreemapDimensions(getTreemapDimensions());
        };

        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    if (loading) {
        return (
            <div className="app-container">
                <div className="loading">
                    <div className="loading-spinner"></div>
                    <div style={{ fontSize: "1.4rem", fontWeight: "bold", marginTop: "20px" }}>Loading COVID-19 Data...</div>
                    {loadingProgress && (
                        <div className="loading-progress">
                            {loadingProgress}
                        </div>
                    )}
                </div>
            </div>
        );
    }
    if (error) {
        return (
            <div className="app-container">
                <div className="error">
                    Error loading data: {error}
                    <button onClick={fetchData} style={{ marginLeft: "10px" }}>
                        Retry
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="app-container">
            <div className="header">
                <h1>🌍 COVID-19 Global Dashboard</h1>
                <div className="summary">
                    <div className="summary-item confirmed">
                        <span className="label">Total Confirmed</span>
                        <span className="value">{formatNumber(totals.Confirmed)}</span>
                    </div>
                    <div className="summary-item deaths">
                        <span className="label">Total Deaths</span>
                        <span className="value">{formatNumber(totals.Deaths)}</span>
                    </div>
                    <div className="summary-item recovered">
                        <span className="label">Total Recovered</span>
                        <span className="value">{formatNumber(totals.Recovered)}</span>
                    </div>
                </div>
                <div className="metric-selector">
                    <button
                        className={`confirmed ${selectedMetric === "Confirmed" ? "active" : ""
                            }`}
                        onClick={() => setSelectedMetric("Confirmed")}
                    >
                        🔵 Confirmed
                    </button>
                    <button
                        className={`deaths ${selectedMetric === "Deaths" ? "active" : ""
                            }`}
                        onClick={() => setSelectedMetric("Deaths")}
                    >
                        🔴 Deaths
                    </button>
                    <button
                        className={`recovered ${selectedMetric === "Recovered" ? "active" : ""
                            }`}
                        onClick={() => setSelectedMetric("Recovered")}
                    >
                        🟢 Recovered
                    </button>
                </div>
            </div>

            {/* Bản đồ */}
            <div className="map-container">
                <ComposableMap
                    projection="geoEqualEarth"
                    projectionConfig={{ scale: 160, center: [0, 20] }}
                    width={1000}
                    height={600}
                    style={{ width: "100%", height: "auto" }}
                >
                    <Geographies geography={geoUrl}>
                        {({ geographies }) =>
                            geographies.map((geo) => {
                                const countryData = findCountryData(geo.properties.name);
                                const value = countryData ? countryData[selectedMetric] : 0;
                                const color =
                                    value > 0 ? colorScale(Math.log10(value + 1)) : "#f7f7f7";

                                return (
                                    <Geography
                                        key={geo.rsmKey}
                                        geography={geo}
                                        fill={color}
                                        stroke="#ffffff"
                                        strokeWidth={0.5}
                                        style={{
                                            default: { outline: "none" },
                                            hover: {
                                                fill: "#2c3e50",
                                                outline: "none",
                                                cursor: "pointer",
                                                strokeWidth: 1,
                                            },
                                            pressed: { fill: "#34495e", outline: "none" },
                                        }}
                                        onMouseEnter={(event) => handleMouseEnter(event, geo)}
                                        onMouseLeave={handleMouseLeave}
                                    />
                                );
                            })
                        }
                    </Geographies>
                </ComposableMap>
            </div>

            {/* Treemap */}
            <div className="treemap-container">
                <div className="treemap-header">
                    <h2>
                        🏆 Top 50 Countries - {selectedMetric} Cases
                    </h2>
                </div>
                <div className="treemap-wrapper">
                    <div className="treemap-chart">
                        <Treemap
                            width={treemapDimensions.width}
                            height={treemapDimensions.height}
                            data={treemapData}
                            dataKey="size"
                            stroke="#fff"
                            fill="#82ca9d"
                            animationBegin={0}
                            animationDuration={0}
                            isAnimationActive={false}
                            content={({ x, y, width, height, name, size }) => {
                                if (width <= 60 || height <= 30) return <g></g>;

                                // Calculate opacity based on size for better visual hierarchy
                                const maxSize = Math.max(...treemapData.map(d => d.size));
                                const opacity = 0.75 + (size / maxSize) * 0.25;

                                // Dynamic font size based on cell size and screen size
                                const baseFontSize = treemapDimensions.width <= 480 ? 10 : treemapDimensions.width <= 768 ? 12 : 14;
                                const fontSize = Math.min(width / 8, height / 4, baseFontSize);
                                const smallFont = fontSize * 0.85;

                                // Professional color scheme with depth
                                const colorSchemes = {
                                    Confirmed: {
                                        primary: 'rgb(52, 152, 219)',
                                        secondary: 'rgb(41, 128, 185)',
                                        accent: 'rgba(52, 152, 219, 0.2)'
                                    },
                                    Deaths: {
                                        primary: 'rgb(231, 76, 60)',
                                        secondary: 'rgb(192, 57, 43)',
                                        accent: 'rgba(231, 76, 60, 0.2)'
                                    },
                                    Recovered: {
                                        primary: 'rgb(46, 204, 113)',
                                        secondary: 'rgb(39, 174, 96)',
                                        accent: 'rgba(46, 204, 113, 0.2)'
                                    }
                                };

                                const scheme = colorSchemes[selectedMetric];

                                // Create unique gradient ID
                                const gradientId = `grad-${name?.replace(/[^a-zA-Z0-9]/g, '')}-${selectedMetric}`;
                                const isHovered = hoveredCell === name;

                                return (
                                    <g
                                        className="treemap-cell-fixed"
                                        onMouseEnter={(event) => handleTreemapCellEnter(event, name, size)}
                                        onMouseLeave={handleTreemapCellLeave}
                                        style={{ cursor: 'pointer' }}
                                    >
                                        <defs>
                                            <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
                                                <stop offset="0%" stopColor={scheme.primary} stopOpacity={opacity} />
                                                <stop offset="100%" stopColor={scheme.secondary} stopOpacity={opacity * 0.9} />
                                            </linearGradient>
                                            <filter id={`shadow-${gradientId}`}>
                                                <feDropShadow dx="0" dy="2" stdDeviation="3" floodOpacity="0.3" />
                                            </filter>
                                        </defs>
                                        <rect
                                            x={x}
                                            y={y}
                                            width={width}
                                            height={height}
                                            fill={`url(#${gradientId})`}
                                            stroke={isHovered ? "#2c3e50" : "rgba(255, 255, 255, 0.9)"}
                                            strokeWidth={isHovered ? 3 : 2.5}
                                            rx={6}
                                            ry={6}
                                            style={{
                                                filter: isHovered ? `brightness(1.15) url(#shadow-${gradientId})` : 'none',
                                            }}
                                        />
                                        {/* Country Name */}
                                        <text
                                            x={x + width / 2}
                                            y={y + height / 2 - fontSize / 2}
                                            textAnchor="middle"
                                            fill="#fff"
                                            fontSize={fontSize}
                                            fontWeight={isHovered ? "700" : "600"}
                                            style={{
                                                textShadow: '0 2px 6px rgba(0, 0, 0, 0.7)',
                                                pointerEvents: 'none',
                                                letterSpacing: '0.3px'
                                            }}
                                        >
                                            {name}
                                        </text>
                                        {/* Case Count */}
                                        <text
                                            x={x + width / 2}
                                            y={y + height / 2 + fontSize / 2 + 2}
                                            textAnchor="middle"
                                            fill="rgba(255, 255, 255, 0.95)"
                                            fontSize={smallFont}
                                            fontWeight={isHovered ? "600" : "500"}
                                            style={{
                                                textShadow: '0 1px 4px rgba(0, 0, 0, 0.5)',
                                                pointerEvents: 'none'
                                            }}
                                        >
                                            {formatNumber(size)}
                                        </text>
                                    </g>
                                );
                            }}
                        >
                        </Treemap>
                    </div>
                </div>
            </div>

            {/* Tooltip Map */}
            {tooltip && (
                <div
                    className="tooltip"
                    style={{ left: tooltip.x + 10, top: tooltip.y - 30 }}
                >
                    {tooltip.content}
                </div>
            )}

            {/* Footer */}
            <footer className="footer">
                <p>Last updated: {totals.LastUpdate ? new Date(totals.LastUpdate).toLocaleDateString() : "N/A"} | Data source: COVID-19 API</p>
            </footer>
        </div>
    );
}

export default App;

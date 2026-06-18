
"use strict";

// ─────────────────────────────────────────────
// API ENDPOINTS
// ─────────────────────────────────────────────
const GEO_API = "https://geocoding-api.open-meteo.com/v1/search";
const WEATHER_API = "https://api.open-meteo.com/v1/forecast";

// ─────────────────────────────────────────────
// WMO WEATHER INTERPRETATION CODE MAP
// Maps WMO code → { label, emoji }
// https://open-meteo.com/en/docs#weathervariables
// ─────────────────────────────────────────────
const WMO_CODES = {
  0: { label: "Clear sky", emoji: "☀️" },
  1: { label: "Mainly clear", emoji: "🌤️" },
  2: { label: "Partly cloudy", emoji: "⛅" },
  3: { label: "Overcast", emoji: "☁️" },
  45: { label: "Foggy", emoji: "🌫️" },
  48: { label: "Icy fog", emoji: "🌫️" },
  51: { label: "Light drizzle", emoji: "🌦️" },
  53: { label: "Drizzle", emoji: "🌦️" },
  55: { label: "Heavy drizzle", emoji: "🌧️" },
  56: { label: "Freezing drizzle", emoji: "🌨️" },
  57: { label: "Heavy frz. drizzle", emoji: "🌨️" },
  61: { label: "Slight rain", emoji: "🌧️" },
  63: { label: "Rain", emoji: "🌧️" },
  65: { label: "Heavy rain", emoji: "🌧️" },
  66: { label: "Freezing rain", emoji: "🌨️" },
  67: { label: "Heavy frz. rain", emoji: "🌨️" },
  71: { label: "Slight snow", emoji: "🌨️" },
  73: { label: "Snow", emoji: "❄️" },
  75: { label: "Heavy snow", emoji: "❄️" },
  77: { label: "Snow grains", emoji: "🌨️" },
  80: { label: "Slight showers", emoji: "🌦️" },
  81: { label: "Showers", emoji: "🌧️" },
  82: { label: "Heavy showers", emoji: "⛈️" },
  85: { label: "Snow showers", emoji: "🌨️" },
  86: { label: "Heavy snow showers", emoji: "❄️" },
  95: { label: "Thunderstorm", emoji: "⛈️" },
  96: { label: "Thunderstorm + hail", emoji: "⛈️" },
  99: { label: "Heavy thunderstorm", emoji: "⛈️" },
};

// ─────────────────────────────────────────────
// DOM REFERENCES
// ─────────────────────────────────────────────
const cityInput = document.getElementById("cityInput");
const searchBtn = document.getElementById("searchBtn");
const loadingOverlay = document.getElementById("loadingOverlay");
const errorBanner = document.getElementById("errorBanner");
const errorMessage = document.getElementById("errorMessage");
const errorClose = document.getElementById("errorClose");
const emptyState = document.getElementById("emptyState");
const weatherContent = document.getElementById("weatherContent");

// Current weather fields
const cityNameEl = document.getElementById("cityName");
const countryBadgeEl = document.getElementById("countryBadge");
const conditionLabelEl = document.getElementById("conditionLabel");
const tempMainEl = document.getElementById("tempMain");
const feelsLikeEl = document.getElementById("feelsLike");
const weatherIconEl = document.getElementById("weatherIconLarge");
const humidityEl = document.getElementById("humidity");
const windSpeedEl = document.getElementById("windSpeed");
const visibilityEl = document.getElementById("visibility");
const forecastStrip = document.getElementById("forecastStrip");

// Chart
let hourlyChart = null;

// ─────────────────────────────────────────────
// UTILITY HELPERS
// ─────────────────────────────────────────────

/** Return { label, emoji } for a WMO weather code */
function getWeatherInfo(code) {
  return WMO_CODES[code] ?? { label: "Unknown", emoji: "🌡️" };
}

/** Format a date string (YYYY-MM-DD) → "Mon", "Tue", … */
function getDayName(dateStr, short = true) {
  const date = new Date(dateStr + "T00:00:00");
  return date.toLocaleDateString("en-US", {
    weekday: short ? "short" : "long",
  });
}

/** Return "Today" for today's date, otherwise the short day name */
function getForecastLabel(dateStr) {
  const today = new Date().toISOString().slice(0, 10);
  return dateStr === today ? "Today" : getDayName(dateStr);
}

/** Round a number to one decimal place */
function round1 = (n) {return Math.round(n * 10) / 10;}

// ─────────────────────────────────────────────
// UI STATE HELPERS
// ─────────────────────────────────────────────

function showLoading() {
  loadingOverlay.hidden = false;
  searchBtn.disabled = true;
}

function hideLoading() {
  loadingOverlay.hidden = true;
  searchBtn.disabled = false;
}

function showError(msg) {
  errorMessage.textContent = msg;
  errorBanner.hidden = false;
}

function hideError() {
  errorBanner.hidden = true;
}

function showWeatherContent() {
  emptyState.hidden = true;
  weatherContent.hidden = false;
  // Re-trigger fade-up animation
  weatherContent.style.animation = "none";
  requestAnimationFrame(() => {
    weatherContent.style.animation = "";
  });
}

function showEmptyState() {
  emptyState.hidden = false;
  weatherContent.hidden = true;
}

// ─────────────────────────────────────────────
// API CALLS
// ─────────────────────────────────────────────


async function geocodeCity(cityName) {
  const url = `${GEO_API}?name=${encodeURIComponent(cityName)}&count=1&language=en&format=json`;
  const response = await fetch(url);

  if (!response.ok) throw new Error("NETWORK_ERROR");

  const data = await response.json();

  if (!data.results || data.results.length === 0) {
    throw new Error("CITY_NOT_FOUND");
  }

  const { name, country, country_code, latitude, longitude } = data.results[0];
  return { name, country, countryCode: country_code, latitude, longitude };
}

/**
 * Fetch weather data for given coordinates
 * Returns both current and forecast data
 */
async function fetchWeather(lat, lon) {
  const params = new URLSearchParams({
    latitude: lat,
    longitude: lon,
    current: [
      "temperature_2m",
      "apparent_temperature",
      "weather_code",
      "relative_humidity_2m",
      "wind_speed_10m",
      "visibility",
    ].join(","),
    hourly: "temperature_2m",
    daily: ["weather_code", "temperature_2m_max", "temperature_2m_min"].join(
      ",",
    ),
    timezone: "auto",
    forecast_days: 6,
    forecast_hours: 24,
  });

  const url = `${WEATHER_API}?${params}`;
  const response = await fetch(url);

  if (!response.ok) throw new Error("NETWORK_ERROR");

  return response.json();
}

// ─────────────────────────────────────────────
// RENDER FUNCTIONS
// ─────────────────────────────────────────────

/** Render the current weather hero card */
function renderCurrentWeather(locationData, weatherData) {
  const c = weatherData.current;
  const info = getWeatherInfo(c.weather_code);

  cityNameEl.textContent = locationData.name;
  countryBadgeEl.textContent = locationData.countryCode ?? locationData.country;
  conditionLabelEl.textContent = info.label;
  tempMainEl.textContent = Math.round(c.temperature_2m);
  feelsLikeEl.textContent = Math.round(c.apparent_temperature);
  weatherIconEl.textContent = info.emoji;
  humidityEl.textContent = `${c.relative_humidity_2m}%`;
  windSpeedEl.textContent = `${round1(c.wind_speed_10m)} km/h`;

  // Visibility: API returns metres; convert to km
  const visKm =
    c.visibility != null ? `${round1(c.visibility / 1000)} km` : "N/A";
  visibilityEl.textContent = visKm;
}

/** Render the 5-day forecast strip */
function renderForecast(weatherData) {
  const { daily } = weatherData;
  // Use days 0–4 (today + 4 more)
  const days = daily.time.slice(0, 5);

  forecastStrip.innerHTML = days
    .map((dateStr, i) => {
      const info = getWeatherInfo(daily.weather_code[i]);
      const label = getForecastLabel(dateStr);
      const isToday = i === 0;
      const high = Math.round(daily.temperature_2m_max[i]);
      const low = Math.round(daily.temperature_2m_min[i]);

      return `
      <div class="forecast-card ${isToday ? "today" : ""}">
        <span class="forecast-day">${label}</span>
        <span class="forecast-emoji">${info.emoji}</span>
        <div class="forecast-temps">
          <span class="forecast-high">${high}°</span>
          <span class="forecast-low">${low}°</span>
        </div>
      </div>
    `;
    })
    .join("");
}

/** Render the 24-hour temperature chart using Chart.js */
function renderHourlyChart(weatherData) {
  const { hourly } = weatherData;

  // Take first 24 hours
  const labels = hourly.time.slice(0, 24).map((t) => {
    const hour = new Date(t).getHours();
    return hour === 0
      ? "12am"
      : hour < 12
        ? `${hour}am`
        : hour === 12
          ? "12pm"
          : `${hour - 12}pm`;
  });

  const temps = hourly.temperature_2m.slice(0, 24);

  // Destroy existing chart if re-rendering
  if (hourlyChart) {
    hourlyChart.destroy();
    hourlyChart = null;
  }

  const ctx = document.getElementById("hourlyChart").getContext("2d");

  // Gradient fill
  const gradient = ctx.createLinearGradient(0, 0, 0, 240);
  gradient.addColorStop(0, "rgba(56,189,248,0.35)");
  gradient.addColorStop(0.6, "rgba(56,189,248,0.08)");
  gradient.addColorStop(1, "rgba(56,189,248,0)");

  hourlyChart = new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "Temperature (°C)",
          data: temps,
          borderColor: "#38BDF8",
          borderWidth: 2.5,
          backgroundColor: gradient,
          fill: true,
          tension: 0.4,
          pointRadius: 3,
          pointHoverRadius: 6,
          pointBackgroundColor: "#38BDF8",
          pointBorderColor: "#0F1A2E",
          pointBorderWidth: 2,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: "#131D30",
          titleColor: "#7A90B0",
          bodyColor: "#E2EAF4",
          borderColor: "#1E2D45",
          borderWidth: 1,
          padding: 12,
          cornerRadius: 10,
          callbacks: {
            label: (ctx) => ` ${ctx.parsed.y}°C`,
          },
        },
      },
      scales: {
        x: {
          grid: { color: "rgba(30,45,69,0.6)", drawBorder: false },
          ticks: {
            color: "#4A5F7A",
            font: { family: "Inter", size: 11 },
            maxRotation: 0,
            // Show every 3 hours on mobile
            callback(val, idx) {
              return idx % 3 === 0 ? this.getLabelForValue(val) : "";
            },
          },
        },
        y: {
          grid: { color: "rgba(30,45,69,0.6)", drawBorder: false },
          ticks: {
            color: "#4A5F7A",
            font: { family: "Inter", size: 11 },
            callback: (v) => `${v}°`,
          },
        },
      },
    },
  });
}

// ─────────────────────────────────────────────
// MAIN SEARCH ORCHESTRATOR
// ─────────────────────────────────────────────

async function searchWeather(cityName) {
  if (!cityName.trim()) return;

  hideError();
  showLoading();

  try {
    // Step 1: Geocode city → coordinates
    const locationData = await geocodeCity(cityName);

    // Step 2: Fetch forecast data
    const weatherData = await fetchWeather(
      locationData.latitude,
      locationData.longitude,
    );

    // Step 3: Render all sections
    renderCurrentWeather(locationData, weatherData);
    renderForecast(weatherData);
    renderHourlyChart(weatherData);

    // Step 4: Show content + save to localStorage
    showWeatherContent();
    localStorage.setItem("skyview_last_city", locationData.name);
  } catch (err) {
    console.error(err);

    if (err.message === "CITY_NOT_FOUND") {
      showError("City not found. Please try again.");
    } else {
      showError("Something went wrong. Check your connection.");
    }
  } finally {
    hideLoading();
  }
}

// ─────────────────────────────────────────────
// EVENT LISTENERS
// ─────────────────────────────────────────────

// Search button click
searchBtn.addEventListener("click", () => {
  searchWeather(cityInput.value.trim());
});

// Enter key in input
cityInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {searchWeather(cityInput.value.trim());}                          
});

// Dismiss error banner
errorClose.addEventListener("click", hideError);

// ─────────────────────────────────────────────
// INIT — Load last searched city from localStorage
// ─────────────────────────────────────────────
(function init() {
  const lastCity = localStorage.getItem("skyview_last_city");
  if (lastCity) {
    cityInput.value = lastCity;
    searchWeather(lastCity);
  } else {
    showEmptyState();
  }
})();

const axios = require('axios');
const moment = require('moment');

// Coordenadas de Biscayne Bay, Miami FL
const LOCATION = {
  latitude: 25.7311,
  longitude: -80.1621,
  name: 'Biscayne Bay, Miami FL'
};

// NOAA Weather Station ID para Miami area
const NOAA_STATION_ID = 'MKYF1'; // Miami - Key Biscayne Station
const NOAA_BUOY_ID = '41009'; // Canaveral 20 NM East of Cape Canaveral (más cercana)

// Cache configuration
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutos
let dataCache = {
  current: { data: null, timestamp: null },
  forecast: { data: null, timestamp: null },
  tides: { data: null, timestamp: null },
  alerts: { data: null, timestamp: null },
  buoy: { data: null, timestamp: null }
};

/**
 * Verifica si el cache es válido
 */
function isCacheValid(cacheEntry) {
  if (!cacheEntry.data || !cacheEntry.timestamp) return false;
  return (Date.now() - cacheEntry.timestamp) < CACHE_DURATION;
}

/**
 * Actualiza el cache
 */
function updateCache(key, data) {
  dataCache[key] = {
    data: data,
    timestamp: Date.now()
  };
}

/**
 * Obtiene condiciones actuales desde NOAA Weather API
 */
async function getCurrentConditions() {
  try {
    // Verificar cache
    if (isCacheValid(dataCache.current)) {
      console.log('📦 Returning cached current conditions');
      return dataCache.current.data;
    }

    console.log('🌊 Fetching current marine conditions from NOAA...');
    
    // Get weather grid point for location
    const pointResponse = await axios.get(
      `https://api.weather.gov/points/${LOCATION.latitude},${LOCATION.longitude}`,
      {
        headers: {
          'User-Agent': 'NadakiExcursions/1.0 (contact@nadakiexcursions.com)',
          'Accept': 'application/json'
        },
        timeout: 10000
      }
    );

    const forecastUrl = pointResponse.data.properties.forecast;
    const observationStationsUrl = pointResponse.data.properties.observationStations;

    // Get latest observation
    const stationsResponse = await axios.get(observationStationsUrl, {
      headers: {
        'User-Agent': 'NadakiExcursions/1.0 (contact@nadakiexcursions.com)',
        'Accept': 'application/json'
      },
      timeout: 10000
    });

    const stationId = stationsResponse.data.features[0]?.id;
    if (!stationId) throw new Error('No observation station found');

    const observationResponse = await axios.get(
      `${stationId}/observations/latest`,
      {
        headers: {
          'User-Agent': 'NadakiExcursions/1.0 (contact@nadakiexcursions.com)',
          'Accept': 'application/json'
        },
        timeout: 10000
      }
    );

    const obs = observationResponse.data.properties;
    
    // Parse and format data
    const currentData = {
      location: LOCATION.name,
      timestamp: new Date().toISOString(),
      temperature: {
        air: obs.temperature?.value ? Math.round(obs.temperature.value * 9/5 + 32) : null,
        water: null, // Water temp will be sourced from buoy data, not available in weather station obs
        unit: '°F'
      },
      wind: {
        speed: obs.windSpeed?.value ? Math.round(obs.windSpeed.value * 0.621371) : null, // m/s to mph
        direction: obs.windDirection?.value || null,
        gust: obs.windGust?.value ? Math.round(obs.windGust.value * 0.621371) : null,
        unit: 'mph'
      },
      visibility: {
        distance: obs.visibility?.value ? Math.round(obs.visibility.value * 0.000621371) : null, // meters to miles
        unit: 'miles'
      },
      conditions: {
        description: obs.textDescription || 'Clear',
        icon: obs.icon || null
      },
      humidity: obs.relativeHumidity?.value || null,
      pressure: obs.barometricPressure?.value ? Math.round(obs.barometricPressure.value * 0.0002953) : null, // Pa to inHg
      dewpoint: obs.dewpoint?.value ? Math.round(obs.dewpoint.value * 9/5 + 32) : null
    };

    updateCache('current', currentData);
    return currentData;
    
  } catch (error) {
    console.error('❌ Error fetching current conditions:', error.message);
    
    // Return fallback data
    return {
      location: LOCATION.name,
      timestamp: new Date().toISOString(),
      error: 'Data temporarily unavailable',
      temperature: { air: 78, water: 76, unit: '°F' },
      wind: { speed: 10, direction: 120, gust: 15, unit: 'mph' },
      visibility: { distance: 10, unit: 'miles' },
      conditions: { description: 'Partly Cloudy', icon: null },
      humidity: 70,
      pressure: 30.1,
      dewpoint: 68
    };
  }
}

/**
 * Obtiene pronóstico marino de 3 días desde NOAA
 */
async function getMarineForecast() {
  try {
    // Verificar cache
    if (isCacheValid(dataCache.forecast)) {
      console.log('📦 Returning cached forecast');
      return dataCache.forecast.data;
    }

    console.log('🌊 Fetching marine forecast from NOAA...');
    
    const pointResponse = await axios.get(
      `https://api.weather.gov/points/${LOCATION.latitude},${LOCATION.longitude}`,
      {
        headers: {
          'User-Agent': 'NadakiExcursions/1.0 (contact@nadakiexcursions.com)',
          'Accept': 'application/json'
        },
        timeout: 10000
      }
    );

    const forecastUrl = pointResponse.data.properties.forecast;
    
    const forecastResponse = await axios.get(forecastUrl, {
      headers: {
        'User-Agent': 'NadakiExcursions/1.0 (contact@nadakiexcursions.com)',
        'Accept': 'application/json'
      },
      timeout: 10000
    });

    const periods = forecastResponse.data.properties.periods.slice(0, 6); // 3 días (día/noche)
    
    const forecastData = {
      location: LOCATION.name,
      timestamp: new Date().toISOString(),
      periods: periods.map(period => ({
        name: period.name,
        startTime: period.startTime,
        endTime: period.endTime,
        temperature: period.temperature,
        temperatureUnit: period.temperatureUnit,
        windSpeed: period.windSpeed,
        windDirection: period.windDirection,
        shortForecast: period.shortForecast,
        detailedForecast: period.detailedForecast,
        icon: period.icon
      }))
    };

    updateCache('forecast', forecastData);
    return forecastData;
    
  } catch (error) {
    console.error('❌ Error fetching forecast:', error.message);
    
    return {
      location: LOCATION.name,
      timestamp: new Date().toISOString(),
      error: 'Forecast temporarily unavailable',
      periods: []
    };
  }
}

/**
 * Obtiene datos de mareas desde NOAA Tides & Currents API
 */
async function getTidesData() {
  try {
    // Verificar cache
    if (isCacheValid(dataCache.tides)) {
      console.log('📦 Returning cached tides data');
      return dataCache.tides.data;
    }

    console.log('🌊 Fetching tides data from NOAA...');
    
    // NOAA Station for Miami Beach - 8723214
    const stationId = '8723214';
    const today = moment().format('YYYYMMDD');
    const tomorrow = moment().add(2, 'days').format('YYYYMMDD');
    
    const response = await axios.get(
      `https://api.tidesandcurrents.noaa.gov/api/prod/datagetter`,
      {
        params: {
          begin_date: today,
          end_date: tomorrow,
          station: stationId,
          product: 'predictions',
          datum: 'MLLW',
          time_zone: 'lst_ldt',
          interval: 'hilo',
          units: 'english',
          format: 'json',
          application: 'NadakiExcursions'
        },
        timeout: 10000
      }
    );

    const predictions = response.data.predictions || [];
    
    const tidesData = {
      location: LOCATION.name,
      station: 'Miami Beach (8723214)',
      timestamp: new Date().toISOString(),
      tides: predictions.map(pred => ({
        time: pred.t,
        height: parseFloat(pred.v),
        type: pred.type === 'H' ? 'High' : 'Low',
        unit: 'ft'
      }))
    };

    updateCache('tides', tidesData);
    return tidesData;
    
  } catch (error) {
    console.error('❌ Error fetching tides:', error.message);
    
    return {
      location: LOCATION.name,
      station: 'Miami Beach',
      timestamp: new Date().toISOString(),
      error: 'Tides data temporarily unavailable',
      tides: []
    };
  }
}

/**
 * Obtiene alertas marinas activas desde NOAA
 */
async function getMarineAlerts() {
  try {
    // Verificar cache
    if (isCacheValid(dataCache.alerts)) {
      console.log('📦 Returning cached alerts');
      return dataCache.alerts.data;
    }

    console.log('🌊 Fetching marine alerts from NOAA...');
    
    // Get alerts for Miami-Dade County
    const response = await axios.get(
      `https://api.weather.gov/alerts/active`,
      {
        params: {
          point: `${LOCATION.latitude},${LOCATION.longitude}`,
          status: 'actual',
          message_type: 'alert'
        },
        headers: {
          'User-Agent': 'NadakiExcursions/1.0 (contact@nadakiexcursions.com)',
          'Accept': 'application/json'
        },
        timeout: 10000
      }
    );

    const features = response.data.features || [];
    
    const alertsData = {
      location: LOCATION.name,
      timestamp: new Date().toISOString(),
      count: features.length,
      alerts: features.map(alert => {
        const props = alert.properties;
        return {
          id: props.id,
          event: props.event,
          headline: props.headline,
          severity: props.severity,
          certainty: props.certainty,
          urgency: props.urgency,
          description: props.description,
          instruction: props.instruction,
          onset: props.onset,
          expires: props.expires,
          areaDesc: props.areaDesc
        };
      }).filter(alert => {
        // Filter for marine-related alerts
        const marineKeywords = ['marine', 'small craft', 'gale', 'storm', 'hurricane', 'coastal', 'rip current', 'surf'];
        const eventLower = alert.event.toLowerCase();
        return marineKeywords.some(keyword => eventLower.includes(keyword));
      })
    };

    updateCache('alerts', alertsData);
    return alertsData;
    
  } catch (error) {
    console.error('❌ Error fetching alerts:', error.message);
    
    return {
      location: LOCATION.name,
      timestamp: new Date().toISOString(),
      count: 0,
      alerts: [],
      error: 'Alerts temporarily unavailable'
    };
  }
}

/**
 * Obtiene datos de boyas cercanas desde NOAA NDBC
 */
async function getBuoyData() {
  try {
    // Verificar cache
    if (isCacheValid(dataCache.buoy)) {
      console.log('📦 Returning cached buoy data');
      return dataCache.buoy.data;
    }

    console.log('🌊 Fetching buoy data from NOAA NDBC...');
    
    // Get latest observation from buoy
    const response = await axios.get(
      `https://www.ndbc.noaa.gov/data/realtime2/${NOAA_BUOY_ID}.txt`,
      {
        timeout: 10000,
        responseType: 'text'
      }
    );

    // Parse the fixed-width text format
    const lines = response.data.split('\n');
    if (lines.length < 3) throw new Error('Invalid buoy data format');
    
    // Line 0: Headers, Line 1: Units, Line 2: Latest data
    const headers = lines[0].split(/\s+/);
    const latest = lines[2].split(/\s+/);
    
    // Create data object
    const buoyDataRaw = {};
    headers.forEach((header, index) => {
      buoyDataRaw[header] = latest[index];
    });

    const buoyData = {
      location: `Buoy ${NOAA_BUOY_ID}`,
      buoyId: NOAA_BUOY_ID,
      timestamp: new Date().toISOString(),
      wave: {
        height: buoyDataRaw.WVHT && buoyDataRaw.WVHT !== 'MM' ? parseFloat(buoyDataRaw.WVHT) * 3.28084 : null, // meters to feet
        period: buoyDataRaw.DPD && buoyDataRaw.DPD !== 'MM' ? parseFloat(buoyDataRaw.DPD) : null,
        direction: buoyDataRaw.MWD && buoyDataRaw.MWD !== 'MM' ? parseFloat(buoyDataRaw.MWD) : null,
        unit: 'ft'
      },
      wind: {
        speed: buoyDataRaw.WSPD && buoyDataRaw.WSPD !== 'MM' ? Math.round(parseFloat(buoyDataRaw.WSPD) * 0.621371) : null, // m/s to mph
        direction: buoyDataRaw.WDIR && buoyDataRaw.WDIR !== 'MM' ? parseFloat(buoyDataRaw.WDIR) : null,
        gust: buoyDataRaw.GST && buoyDataRaw.GST !== 'MM' ? Math.round(parseFloat(buoyDataRaw.GST) * 0.621371) : null,
        unit: 'mph'
      },
      temperature: {
        water: buoyDataRaw.WTMP && buoyDataRaw.WTMP !== 'MM' ? Math.round(parseFloat(buoyDataRaw.WTMP) * 9/5 + 32) : null,
        air: buoyDataRaw.ATMP && buoyDataRaw.ATMP !== 'MM' ? Math.round(parseFloat(buoyDataRaw.ATMP) * 9/5 + 32) : null,
        unit: '°F'
      },
      pressure: buoyDataRaw.PRES && buoyDataRaw.PRES !== 'MM' ? Math.round(parseFloat(buoyDataRaw.PRES) * 0.02953) : null // hPa to inHg
    };

    updateCache('buoy', buoyData);
    return buoyData;
    
  } catch (error) {
    console.error('❌ Error fetching buoy data:', error.message);
    
    return {
      location: `Buoy ${NOAA_BUOY_ID}`,
      buoyId: NOAA_BUOY_ID,
      timestamp: new Date().toISOString(),
      error: 'Buoy data temporarily unavailable',
      wave: { height: null, period: null, direction: null, unit: 'ft' },
      wind: { speed: null, direction: null, gust: null, unit: 'mph' },
      temperature: { water: null, air: null, unit: '°F' },
      pressure: null
    };
  }
}

/**
 * Obtiene resumen completo de condiciones marinas
 */
async function getMarineSummary() {
  try {
    console.log('🌊 Generating marine conditions summary...');
    
    const [current, forecast, tides, alerts, buoy] = await Promise.all([
      getCurrentConditions(),
      getMarineForecast(),
      getTidesData(),
      getMarineAlerts(),
      getBuoyData()
    ]);

    // Merge water temperature from buoy into current conditions
    if (buoy && buoy.temperature && buoy.temperature.water) {
      current.temperature.water = buoy.temperature.water;
    }

    // Determine safety rating
    const safetyRating = calculateSafetyRating({ current, alerts, buoy });

    return {
      location: LOCATION.name,
      coordinates: LOCATION,
      timestamp: new Date().toISOString(),
      safetyRating,
      current,
      forecast,
      tides: tides.tides.slice(0, 8), // Next 8 tide changes
      alerts,
      buoy
    };
    
  } catch (error) {
    console.error('❌ Error generating marine summary:', error.message);
    throw error;
  }
}

/**
 * Calcula el nivel de seguridad basado en condiciones
 */
function calculateSafetyRating(data) {
  const { current, alerts, buoy } = data;
  
  let score = 100;
  let conditions = [];
  
  // Check alerts
  if (alerts.count > 0) {
    const highSeverity = alerts.alerts.some(a => 
      a.severity === 'Severe' || a.severity === 'Extreme'
    );
    if (highSeverity) {
      score -= 50;
      conditions.push('Active weather alerts');
    } else {
      score -= 25;
      conditions.push('Weather advisory');
    }
  }
  
  // Check wind speed
  if (current.wind.speed > 25) {
    score -= 30;
    conditions.push('High winds');
  } else if (current.wind.speed > 15) {
    score -= 15;
    conditions.push('Moderate winds');
  }
  
  // Check wave height
  if (buoy.wave.height && buoy.wave.height > 6) {
    score -= 30;
    conditions.push('High waves');
  } else if (buoy.wave.height && buoy.wave.height > 4) {
    score -= 15;
    conditions.push('Moderate waves');
  }
  
  // Check visibility
  if (current.visibility.distance < 2) {
    score -= 25;
    conditions.push('Poor visibility');
  } else if (current.visibility.distance < 5) {
    score -= 10;
    conditions.push('Reduced visibility');
  }
  
  // Determine rating
  let rating, color, recommendation;
  
  if (score >= 80) {
    rating = 'EXCELLENT';
    color = 'green';
    recommendation = 'Excellent conditions for boating';
  } else if (score >= 60) {
    rating = 'GOOD';
    color = 'green';
    recommendation = 'Good conditions, monitor weather';
  } else if (score >= 40) {
    rating = 'FAIR';
    color = 'yellow';
    recommendation = 'Caution advised, check updates';
  } else if (score >= 20) {
    rating = 'POOR';
    color = 'orange';
    recommendation = 'Not recommended for inexperienced boaters';
  } else {
    rating = 'DANGEROUS';
    color = 'red';
    recommendation = 'Boating not recommended';
  }
  
  return {
    score,
    rating,
    color,
    recommendation,
    conditions
  };
}

/**
 * Limpia el cache (útil para pruebas)
 */
function clearCache() {
  dataCache = {
    current: { data: null, timestamp: null },
    forecast: { data: null, timestamp: null },
    tides: { data: null, timestamp: null },
    alerts: { data: null, timestamp: null },
    buoy: { data: null, timestamp: null }
  };
  console.log('🧹 Marine conditions cache cleared');
}

module.exports = {
  getCurrentConditions,
  getMarineForecast,
  getTidesData,
  getMarineAlerts,
  getBuoyData,
  getMarineSummary,
  clearCache,
  LOCATION
};

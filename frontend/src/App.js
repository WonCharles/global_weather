import React, { useRef, useState, useEffect, Suspense, useCallback } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Stars, Html } from '@react-three/drei';
import * as THREE from 'three';

// --- Helper Functions ---

// 위도/경도 -> 3D 벡터 변환
const getVectorFromLatLon = (lat, lon, radius) => {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);
  const x = -(radius * Math.sin(phi) * Math.cos(theta));
  const z = radius * Math.sin(phi) * Math.sin(theta);
  const y = radius * Math.cos(phi);
  return new THREE.Vector3(x, y, z);
};

// WMO 날씨 코드 -> 날씨 설명 변환
const getWeatherDescription = (code) => {
  const codes = {
    0: 'Clear sky', 1: 'Mainly clear', 2: 'Partly cloudy', 3: 'Overcast',
    45: 'Fog', 48: 'Rime fog',
    51: 'Light drizzle', 53: 'Moderate drizzle', 55: 'Dense drizzle',
    61: 'Slight rain', 63: 'Moderate rain', 65: 'Heavy rain',
    80: 'Slight rain showers', 81: 'Moderate rain showers', 82: 'Violent rain showers',
    95: 'Thunderstorm',
  };
  return codes[code] || 'Unknown weather';
};

// --- 3D Components ---

// 날씨 정보 패널
function WeatherInfo({ weather, countryName, position, onClose }) {
  const [isDragging, setIsDragging] = useState(false);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [startDrag, setStartDrag] = useState({ x: 0, y: 0 });

  const handleMouseDown = useCallback((e) => {
    setIsDragging(true);
    setStartDrag({ x: e.clientX - offset.x, y: e.clientY - offset.y });
  }, [offset]);

  const handleMouseMove = useCallback((e) => {
    if (!isDragging) return;
    setOffset({ x: e.clientX - startDrag.x, y: e.clientY - startDrag.y });
  }, [isDragging, startDrag]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    } else {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, handleMouseMove, handleMouseUp]);

  if (!weather) return null;

  // 3일치 예보만 슬라이스
  const dailyForecast = weather.daily.time.slice(0, 3);

  return (
    <Html position={position}>
      <div
        onMouseDown={handleMouseDown}
        style={{
          background: 'rgba(25, 25, 25, 0.85)', color: 'white', padding: '8px', borderRadius: '4px',
          border: '1px solid white', width: '140px', fontFamily: 'sans-serif', fontSize: '10px',
          position: 'absolute', // Make it draggable in 2D screen space
          left: `${offset.x}px`, top: `${offset.y}px`, // Apply drag offset
          transform: 'translate(-50%, -110%)', // Initial positioning relative to 3D point
          cursor: isDragging ? 'grabbing' : 'grab',
          userSelect: 'none',
          zIndex: 1000 // Ensure it's on top
        }}
      >
        <button onClick={onClose} style={{ position: 'absolute', top: 2, right: 2, background: 'none', border: 'none', color: 'white', fontSize: '14px', cursor: 'pointer' }}>&times;</button>
        <h3 style={{ margin: 0, fontSize: '12px', borderBottom: '1px solid #555', paddingBottom: '3px' }}>
          Weather {countryName && `for ${countryName}`}
        </h3>
        <p style={{ margin: '5px 0 0' }}><b>Now:</b> {weather.current.temperature_2m}°C, {getWeatherDescription(weather.current.weather_code)}</p>
        <p style={{ margin: '3px 0 5px' }}><b>Wind:</b> {weather.current.wind_speed_10m} km/h</p>
        <h4 style={{ margin: '5px 0 3px', borderTop: '1px solid #555', paddingTop: '5px' }}>3-Day Forecast</h4>
        <div style={{ maxHeight: '60px', overflowY: 'auto' }}>
          {dailyForecast.map((date, i) => (
            <div key={date} style={{ display: 'flex', justifyContent: 'space-between', padding: '1px 0' }}>
              <span>{new Date(date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</span>
              <span>{getWeatherDescription(weather.daily.weather_code[i])}</span>
              <span>{weather.daily.temperature_2m_max[i]}° / {weather.daily.temperature_2m_min[i]}°</span>
            </div>
          ))}
        </div>
      </div>
    </Html>
  );
}

// 기상 이변 마커
function EventMarkers() {
  const [events, setEvents] = useState([]);
  const [activeEvent, setActiveEvent] = useState(null);

  useEffect(() => {
    const fetchEvents = async () => {
      try {
        const response = await fetch('https://eonet.gsfc.nasa.gov/api/v2.1/events?status=open&limit=20&categories=severeStorms,volcanoes,wildfires');
        const { events } = await response.json();
        setEvents(events);
      } catch (error) {
        console.error("Failed to fetch NASA EONET events:", error);
      }
    };
    fetchEvents();
  }, []);

  return events.map(event => {
    const [lon, lat] = event.geometries[0].coordinates;
    const position = getVectorFromLatLon(lat, lon, 1.01);
    const color = event.categories[0].id === 'severeStorms' ? 'orange' : (event.categories[0].id === 'volcanoes' ? 'red' : 'yellow');

    return (
      <mesh key={event.id} position={position} scale={2} onClick={() => setActiveEvent(event)}>
        <coneGeometry args={[0.015, 0.06, 8]} />
        <meshBasicMaterial color={color} />
        {activeEvent === event && (
          <Html position={[0, 0.05, 0]}>
            <div style={{ background: 'rgba(0,0,0,0.7)', color: 'white', padding: '5px 10px', borderRadius: '3px', fontSize: '12px', width: '150px' }}>
              <b>{event.title}</b>
              <p>{event.categories[0].title}</p>
              <button onClick={() => setActiveEvent(null)} style={{color: 'white', background: 'none', border: 'none'}}>Close</button>
            </div>
          </Html>
        )}
      </mesh>
    );
  });
}

// ISS 위성 추적기
function SatelliteTracker() {
  const [issPosition, setIssPosition] = useState({ lat: 0, lon: 0 });
  const issRef = useRef();

  useEffect(() => {
    const fetchIssPosition = async () => {
      try {
        const response = await fetch('https://api.wheretheiss.at/v1/satellites/25544');
        const data = await response.json();
        setIssPosition({ lat: data.latitude, lon: data.longitude });
      } catch (error) {
        console.error("Failed to fetch ISS position:", error);
      }
    };
    const interval = setInterval(fetchIssPosition, 2000);
    return () => clearInterval(interval);
  }, []);

  useFrame(() => {
    if (issRef.current) {
      const positionVec = getVectorFromLatLon(issPosition.lat, issPosition.lon, 1.2);
      issRef.current.position.lerp(positionVec, 0.1); // 부드러운 이동
    }
  });

  return (
    <mesh ref={issRef}>
      <boxGeometry args={[0.02, 0.02, 0.02]} />
      <meshStandardMaterial color="lightblue" emissive="lightblue" emissiveIntensity={2} />
    </mesh>
  );
}

// 지구본 컴포넌트
function Sphere({ onGlobeClick, isInteractingWithGlobe }) {
  const mesh = useRef();
  const texture = new THREE.TextureLoader().load('https://threejs.org/examples/textures/land_ocean_ice_cloud_2048.jpg');

  useFrame(() => {
    if (!isInteractingWithGlobe) {
      mesh.current.rotation.y += 0.0005; // 느린 자동 회전
    }
  });

  const handleClick = (event) => {
    event.stopPropagation();
    const { point } = event;
    const phi = Math.acos(point.y / point.length());
    const theta = Math.atan2(point.x, point.z);
    const lat = 90 - (phi * 180) / Math.PI;
    const lon = (theta * 180) / Math.PI;
    const position = getVectorFromLatLon(lat, lon, 1.05);
    onGlobeClick(lat, lon, position);
  };

  return (
    <mesh ref={mesh} scale={2} onClick={handleClick}>
      <sphereGeometry args={[1, 64, 64]} />
      <meshStandardMaterial map={texture} bumpScale={0.005} />
    </mesh>
  );
}

// --- Main App Component ---

function App() {
  const [weather, setWeather] = useState(null);
  const [clickedInfo, setClickedInfo] = useState({ position: null, countryName: null });
  const [isInteractingWithGlobe, setIsInteractingWithGlobe] = useState(false);

  const handleGlobeClick = async (lat, lon, position) => {
    setClickedInfo({ position, countryName: null }); // Reset country name
    
    // Fetch weather data
    try {
      const weatherResponse = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code,wind_speed_10m&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=auto`);
      const weatherData = await weatherResponse.json();
      setWeather(weatherData);
    } catch (error) {
      console.error("Failed to fetch weather data:", error);
      setWeather(null);
    }

    // Fetch country name
    try {
      const geoResponse = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=18&addressdetails=1`);
      const geoData = await geoResponse.json();
      if (geoData.address && geoData.address.country) {
        setClickedInfo(prev => ({ ...prev, countryName: geoData.address.country }));
      } else {
        setClickedInfo(prev => ({ ...prev, countryName: 'Unknown Country' }));
      }
    } catch (error) {
      console.error("Failed to fetch country name:", error);
      setClickedInfo(prev => ({ ...prev, countryName: 'Unknown Country' }));
    }
  };

  const handleCloseWeather = () => {
    setWeather(null);
    setClickedInfo({ position: null, countryName: null });
  }

  return (
    <div style={{ width: "100vw", height: "100vh", background: 'black' }}>
      <Canvas>
        <ambientLight intensity={0.6} />
        <pointLight position={[10, 10, 10]} intensity={1.5} />
        <Suspense fallback={null}>
          <Stars radius={200} depth={50} count={10000} factor={6} />
          <Sphere onGlobeClick={handleGlobeClick} isInteractingWithGlobe={isInteractingWithGlobe} />
          {weather && clickedInfo.position && <WeatherInfo weather={weather} countryName={clickedInfo.countryName} position={clickedInfo.position} onClose={handleCloseWeather} />}
          <EventMarkers />
          <SatelliteTracker />
        </Suspense>
        <OrbitControls 
          enableZoom={true} 
          enablePan={false} 
          minDistance={2.5} 
          maxDistance={10}
          onStart={() => setIsInteractingWithGlobe(true)}
          onEnd={() => setIsInteractingWithGlobe(false)}
        />
      </Canvas>
      <div style={{ position: 'absolute', top: '20px', left: '20px', color: 'white', background: 'rgba(0,0,0,0.5)', padding: '10px', borderRadius: '5px' }}>
        <h1>3D Interactive Weather Globe</h1>
        <p>Click the globe for weather, or explore events and the ISS.</p>
      </div>
    </div>
  );
}

export default App;

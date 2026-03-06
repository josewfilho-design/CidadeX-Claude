import { useState, useEffect, useRef, useCallback } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import {
  X, Volume2, VolumeX, AlertTriangle, Navigation,
  CornerUpRight, CornerUpLeft, ArrowUp, RotateCcw,
  GitFork, Mic, MicOff, Locate, MapPin, Gauge
} from "lucide-react";
import { type RouteStep, type TrafficAlert, ALERT_TYPES, VOICE_RATES } from "./types";
import {
  formatDistance, formatDuration, pointNearRoute, haversineDistance,
  createRouteArrows, calcBearing, interpolatePosition, getAdaptiveZoom
} from "./utils";
import { type SpeedCamera, findNearbyCamera } from "./speedCameras";

interface NavigationFullscreenProps {
  steps: RouteStep[];
  routeCoords: [number, number][];
  origin: [number, number];
  dest: [number, number];
  routeInfo: { distance: number; duration: number };
  alerts: TrafficAlert[];
  alertImpact: { count: number; penalty: number };
  voiceEnabled: boolean;
  voiceSpeed: "slow" | "normal" | "fast";
  speedCameras: SpeedCamera[];
  onClose: () => void;
  onReportAlert: () => void;
  isNight: boolean;
}

function getManeuverIcon(instruction: string) {
  if (instruction.includes("esquerda") || instruction.includes("Esquerda")) return CornerUpLeft;
  if (instruction.includes("direita") || instruction.includes("Direita")) return CornerUpRight;
  if (instruction.includes("Retorno")) return RotateCcw;
  if (instruction.includes("bifurcação")) return GitFork;
  return ArrowUp;
}

function extractStreetName(instruction: string): string {
  const match = instruction.match(/na (.+)$/);
  return match ? match[1] : "";
}

function extractManeuverLabel(instruction: string): string {
  const match = instruction.match(/^(.+?) na /);
  return match ? match[1] : instruction;
}

const CAR_SVG_DAY = `<svg viewBox="0 0 40 40" width="40" height="40" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <filter id="carShadow" x="-50%" y="-50%" width="200%" height="200%">
      <feDropShadow dx="0" dy="3" stdDeviation="3" flood-color="rgba(0,0,0,0.4)"/>
    </filter>
  </defs>
  <g filter="url(#carShadow)">
    <path d="M20 4 L28 16 L26 32 Q20 36 14 32 L12 16 Z" fill="#00B8E6" stroke="white" stroke-width="2"/>
    <circle cx="20" cy="18" r="4" fill="white" opacity="0.9"/>
  </g>
</svg>`;

const CAR_SVG_NIGHT = `<svg viewBox="0 0 40 40" width="40" height="40" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <filter id="carShadowN" x="-50%" y="-50%" width="200%" height="200%">
      <feDropShadow dx="0" dy="3" stdDeviation="4" flood-color="rgba(74,232,196,0.35)"/>
    </filter>
  </defs>
  <g filter="url(#carShadowN)">
    <path d="M20 4 L28 16 L26 32 Q20 36 14 32 L12 16 Z" fill="#4AE8C4" stroke="rgba(255,255,255,0.8)" stroke-width="2"/>
    <circle cx="20" cy="18" r="4" fill="white" opacity="0.9"/>
  </g>
</svg>`;

const NavigationFullscreen = ({
  steps, routeCoords, origin, dest, routeInfo,
  alerts, alertImpact, voiceEnabled: initialVoice, voiceSpeed: initialSpeed,
  speedCameras, onClose, onReportAlert, isNight,
}: NavigationFullscreenProps) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<L.Map | null>(null);
  const routeLayer = useRef<L.LayerGroup | null>(null);
  const trailLayer = useRef<L.LayerGroup | null>(null);
  const userMarkerRef = useRef<L.Marker | null>(null);
  const watchId = useRef<number | null>(null);
  const animFrameRef = useRef<number | null>(null);

  const [activeStep, setActiveStep] = useState(0);
  const [speed, setSpeed] = useState(0);
  const [voiceOn, setVoiceOn] = useState(initialVoice);
  const [soundOn, setSoundOn] = useState(true);
  const [nearbyAlert, setNearbyAlert] = useState<{ type: string; distance: number; icon?: string } | null>(null);
  const alertDismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [remainingDistance, setRemainingDistance] = useState(routeInfo.distance);
  const [remainingDuration, setRemainingDuration] = useState(routeInfo.duration + alertImpact.penalty);
  const [eta, setEta] = useState(new Date(Date.now() + (routeInfo.duration + alertImpact.penalty) * 1000));
  const [followGps, setFollowGps] = useState(true);
  const [arrived, setArrived] = useState(false);
  const followGpsRef = useRef(true);
  const lastPos = useRef<{ lat: number; lng: number; time: number } | null>(null);
  const prevPos = useRef<{ lat: number; lng: number } | null>(null);
  const currentBearing = useRef(0);
  const trailPoints = useRef<[number, number][]>([]);
  const alertedIds = useRef<Set<string>>(new Set());
  const lastSpokenStep = useRef(-1);
  const targetPos = useRef<[number, number]>(origin);
  const displayedPos = useRef<[number, number]>(origin);

  const speak = useCallback((text: string) => {
    if (!voiceOn || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "pt-BR";
    u.rate = VOICE_RATES[initialSpeed];
    window.speechSynthesis.speak(u);
  }, [voiceOn, initialSpeed]);

  // Auto-dismiss nearby alert after 10s
  useEffect(() => {
    if (alertDismissTimer.current) clearTimeout(alertDismissTimer.current);
    if (nearbyAlert) {
      alertDismissTimer.current = setTimeout(() => setNearbyAlert(null), 10000);
    }
    return () => { if (alertDismissTimer.current) clearTimeout(alertDismissTimer.current); };
  }, [nearbyAlert]);

  // Interpolation animation loop
  useEffect(() => {
    let lastTime = performance.now();
    const animate = (now: number) => {
      const dt = (now - lastTime) / 1000;
      lastTime = now;
      if (userMarkerRef.current && mapInstance.current) {
        const fraction = Math.min(dt * 3, 1); // smooth over ~333ms
        displayedPos.current = interpolatePosition(displayedPos.current, targetPos.current, fraction);
        userMarkerRef.current.setLatLng(displayedPos.current);
      }
      animFrameRef.current = requestAnimationFrame(animate);
    };
    animFrameRef.current = requestAnimationFrame(animate);
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, []);

  // Update trail
  const updateTrail = useCallback((latlng: [number, number]) => {
    trailPoints.current.push(latlng);
    if (trailPoints.current.length > 15) trailPoints.current.shift();
    if (!trailLayer.current) return;
    trailLayer.current.clearLayers();
    const pts = trailPoints.current;
    if (pts.length < 2) return;
    const trailColor = isNight ? "#4AE8C4" : "#00B8E6";
    for (let i = 1; i < pts.length; i++) {
      const opacity = 0.1 + (i / pts.length) * 0.3;
      L.polyline([pts[i - 1], pts[i]], {
        color: trailColor,
        weight: 4,
        opacity,
        lineCap: "round",
      }).addTo(trailLayer.current);
    }
  }, []);

  // Init map
  useEffect(() => {
    if (!mapRef.current) return;
    const tileUrl = isNight
      ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
      : "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png";

    const map = L.map(mapRef.current, {
      zoomControl: false,
      attributionControl: false,
    }).setView(origin, 17);

    L.tileLayer(tileUrl, { maxZoom: 19 }).addTo(map);

    map.on("dragstart", () => {
      if (followGpsRef.current) {
        setFollowGps(false);
        followGpsRef.current = false;
      }
    });
    mapInstance.current = map;
    routeLayer.current = L.layerGroup().addTo(map);
    trailLayer.current = L.layerGroup().addTo(map);

    // Route shadow (dark underlay)
    L.polyline(routeCoords, {
      color: isNight ? "rgba(0,0,0,0.5)" : "rgba(0,0,0,0.2)",
      weight: 10,
      opacity: 1,
      lineCap: "round",
      lineJoin: "round",
    }).addTo(routeLayer.current);

    // Route main line
    const routeColor = isNight ? "#4AE8C4" : "#00B8E6";
    L.polyline(routeCoords, {
      color: routeColor,
      weight: 6,
      opacity: 0.95,
      lineCap: "round",
      lineJoin: "round",
    }).addTo(routeLayer.current);

    createRouteArrows(routeCoords, routeLayer.current, isNight);

    // Destination marker — pulsing pin
    const destIcon = L.divIcon({
      html: `<div style="position:relative;width:28px;height:28px">
        <div style="position:absolute;inset:0;border-radius:50%;background:rgba(239,68,68,0.3);animation:destPulse 2s infinite"></div>
        <div style="position:absolute;inset:4px;border-radius:50%;background:#ef4444;border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.4)"></div>
      </div>`,
      iconSize: [28, 28], iconAnchor: [14, 14], className: "",
    });
    L.marker(dest, { icon: destIcon }).addTo(routeLayer.current);

    // GPS tracking
    if (navigator.geolocation) {
      const carSvg = isNight ? CAR_SVG_NIGHT : CAR_SVG_DAY;
      const carIcon = L.divIcon({
        html: `<div class="nav-car-marker" style="width:40px;height:40px;transition:transform 0.6s ease-in-out">${carSvg}</div>`,
        iconSize: [40, 40], iconAnchor: [20, 20], className: "",
      });

      watchId.current = navigator.geolocation.watchPosition(
        (pos) => {
          const latlng: [number, number] = [pos.coords.latitude, pos.coords.longitude];
          targetPos.current = latlng;

          // Speed
          const now = Date.now();
          if (lastPos.current) {
            const dist = haversineDistance(lastPos.current.lat, lastPos.current.lng, latlng[0], latlng[1]);
            const dt = (now - lastPos.current.time) / 1000;
            if (dt > 0.5) {
              const spd = (dist / dt) * 3.6;
              setSpeed(Math.round(spd < 2 ? 0 : spd));
            }
          }

          // Bearing
          if (prevPos.current) {
            const b = calcBearing(prevPos.current.lat, prevPos.current.lng, latlng[0], latlng[1]);
            if (haversineDistance(prevPos.current.lat, prevPos.current.lng, latlng[0], latlng[1]) > 3) {
              currentBearing.current = b;
              prevPos.current = { lat: latlng[0], lng: latlng[1] };
            }
          } else {
            prevPos.current = { lat: latlng[0], lng: latlng[1] };
          }
          lastPos.current = { lat: latlng[0], lng: latlng[1], time: now };

          // Marker
          if (!userMarkerRef.current) {
            userMarkerRef.current = L.marker(latlng, { icon: carIcon, zIndexOffset: 2000 }).addTo(map);
            displayedPos.current = latlng;
          }

          // Rotate car marker
          const el = userMarkerRef.current?.getElement();
          if (el) {
            const inner = el.querySelector(".nav-car-marker") as HTMLElement;
            if (inner) inner.style.transform = `rotate(${currentBearing.current}deg)`;
          }

          // Trail
          updateTrail(latlng);

          // Adaptive zoom
          const toDest = haversineDistance(latlng[0], latlng[1], dest[0], dest[1]);
          const currentSpeed = speed;
          const targetZoom = getAdaptiveZoom(currentSpeed, toDest);

          if (followGpsRef.current) {
            map.setView(latlng, targetZoom, { animate: true });
          }

          // Closest step
          let minDist = Infinity;
          let closestIdx = 0;
          for (let i = 0; i < steps.length; i++) {
            const d = haversineDistance(latlng[0], latlng[1], steps[i].location[0], steps[i].location[1]);
            if (d < minDist) { minDist = d; closestIdx = i; }
          }
          setActiveStep(closestIdx);

          if (closestIdx !== lastSpokenStep.current && minDist < 200) {
            lastSpokenStep.current = closestIdx;
            speak(steps[closestIdx].instruction);
          }

          // Remaining
          setRemainingDistance(toDest);
          const fraction = Math.max(0, Math.min(1, toDest / routeInfo.distance));
          const rem = (routeInfo.duration + alertImpact.penalty) * fraction;
          setRemainingDuration(rem);
          setEta(new Date(Date.now() + rem * 1000));

          // Arrival check
          if (toDest < 30 && !arrived) {
            setArrived(true);
            speak("Você chegou ao seu destino!");
          }

          // Alerts
          let closest: { type: string; distance: number; icon?: string } | null = null;
          for (const a of alerts) {
            const d = haversineDistance(latlng[0], latlng[1], a.latitude, a.longitude);
            if (d < 50) {
              const alertType = ALERT_TYPES.find(t => t.key === a.alert_type);
              if (!closest || d < closest.distance) {
                closest = { type: alertType?.label || "Alerta", distance: Math.round(d) };
              }
            }
            if (soundOn && !alertedIds.current.has(a.id) && d < 30) {
              alertedIds.current.add(a.id);
              const alertType = ALERT_TYPES.find(t => t.key === a.alert_type);
              speak(`Atenção: ${alertType?.label || "alerta"} a ${Math.round(d)} metros`);
            }
          }
          const nearbyCam = findNearbyCamera(latlng[0], latlng[1], speedCameras, 50);
          if (nearbyCam && (!closest || nearbyCam.distance < closest.distance)) {
            const camEmoji = nearbyCam.camera.type === "lombada" ? "🔶" : nearbyCam.camera.type === "semaforo" ? "🚦" : "📷";
            const label = nearbyCam.camera.maxspeed
              ? `${nearbyCam.camera.label} (${nearbyCam.camera.maxspeed} km/h)`
              : nearbyCam.camera.label;
            closest = { type: label, distance: Math.round(nearbyCam.distance), icon: camEmoji };
          }
          if (nearbyCam && soundOn && !alertedIds.current.has(nearbyCam.camera.id) && nearbyCam.distance < 30) {
            alertedIds.current.add(nearbyCam.camera.id);
            const spd = nearbyCam.camera.maxspeed ? ` a ${nearbyCam.camera.maxspeed} quilômetros por hora` : "";
            speak(`Atenção: ${nearbyCam.camera.label}${spd} em ${Math.round(nearbyCam.distance)} metros`);
          }
          setNearbyAlert(closest);
        },
        () => {},
        { enableHighAccuracy: true, maximumAge: 3000, timeout: 30000 }
      );
    }

    return () => {
      if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current);
      map.remove();
      mapInstance.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const accent = isNight ? "#4AE8C4" : "#00B8E6";
  const currentStep = steps[activeStep] || steps[0];
  const ManeuverIcon = currentStep ? getManeuverIcon(currentStep.instruction) : ArrowUp;
  const streetName = currentStep ? extractStreetName(currentStep.instruction) : "";
  const maneuverLabel = currentStep ? extractManeuverLabel(currentStep.instruction) : "";
  const distToStep = currentStep ? formatDistance(currentStep.distance) : "";

  return (
    <div className="fixed inset-0 z-[9999] flex flex-col">
      {/* Full-bleed map */}
      <div ref={mapRef} className="absolute inset-0" style={isNight ? { filter: "brightness(1.35) contrast(1.1)" } : undefined} />

      {/* === FLOATING UI OVERLAY === */}
      <div className="absolute inset-0 pointer-events-none flex flex-col z-[1000]">

        {/* Top: Maneuver instruction card (glassmorphism) */}
        <div className="pointer-events-auto mx-4 mt-4 safe-area-top">
          <div className="nav-glass rounded-2xl px-4 py-3 flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: `${accent}20` }}>
              <ManeuverIcon className="w-7 h-7" style={{ color: accent }} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-2xl font-display font-bold text-white leading-tight">{distToStep}</p>
              <p className="text-base font-semibold truncate" style={{ color: accent }}>
                {streetName || maneuverLabel}
              </p>
            </div>
          </div>
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Nearby alert card */}
        {nearbyAlert && (
          <div className="pointer-events-auto mx-4 mb-3 animate-fade-in">
            <div className="nav-glass rounded-2xl px-4 py-3 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500/20 flex items-center justify-center shrink-0">
                {nearbyAlert.icon ? (
                  <span className="text-xl">{nearbyAlert.icon}</span>
                ) : (
                  <AlertTriangle className="w-5 h-5 text-amber-400" />
                )}
              </div>
              <p className="flex-1 font-bold text-white text-sm">
                {nearbyAlert.type} em {nearbyAlert.distance} m
              </p>
              <button
                onClick={() => setNearbyAlert(null)}
                className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center shrink-0"
                title="Fechar alerta"
              >
                <X className="w-4 h-4 text-white/70" />
              </button>
            </div>
          </div>
        )}

        {/* Floating action buttons — right side, thumb zone */}
        <div className="pointer-events-auto absolute right-4 bottom-44 flex flex-col gap-3">
          <button
            onClick={() => setVoiceOn(!voiceOn)}
            className="nav-glass-btn"
            title={voiceOn ? "Desativar voz" : "Ativar voz"}
          >
            {voiceOn ? <Mic className="w-5 h-5" style={{ color: accent }} /> : <MicOff className="w-5 h-5 text-white/50" />}
          </button>
          <button
            onClick={() => setSoundOn(!soundOn)}
            className="nav-glass-btn"
            title={soundOn ? "Desativar som" : "Ativar som"}
          >
            {soundOn ? <Volume2 className="w-5 h-5 text-white" /> : <VolumeX className="w-5 h-5 text-white/50" />}
          </button>
          <button
            onClick={onReportAlert}
            className="nav-glass-btn !bg-amber-500/30 !border-amber-400/30"
            title="Reportar alerta"
          >
            <AlertTriangle className="w-5 h-5 text-amber-400" />
          </button>
        </div>

        {/* Recenter button */}
        {!followGps && (
          <div className="pointer-events-auto flex justify-center mb-3 animate-fade-in">
            <button
              onClick={() => {
                setFollowGps(true);
                followGpsRef.current = true;
                if (lastPos.current && mapInstance.current) {
                  const toDest = haversineDistance(lastPos.current.lat, lastPos.current.lng, dest[0], dest[1]);
                  const z = getAdaptiveZoom(speed, toDest);
                  mapInstance.current.setView([lastPos.current.lat, lastPos.current.lng], z, { animate: true });
                }
              }}
              className="nav-glass rounded-full px-5 py-3 flex items-center gap-2"
              title="Recentralizar no GPS"
            >
              <Locate className="w-5 h-5" style={{ color: accent }} />
              <span className="text-white font-bold text-sm">Recentralizar</span>
            </button>
          </div>
        )}

        {/* Bottom dashboard (glassmorphism) */}
        <div className="pointer-events-auto mx-4 mb-4 safe-area-bottom">
          <div className="nav-glass rounded-2xl px-5 py-4 flex items-center justify-between">
            {/* Speedometer */}
            <div className="flex flex-col items-center">
              <div className="w-14 h-14 rounded-full flex flex-col items-center justify-center" style={{ borderWidth: 2, borderStyle: "solid", borderColor: `${accent}80` }}>
                <span className="text-white text-xl font-display font-bold leading-none">{speed}</span>
                <span className="text-white/50 text-[8px] font-semibold">km/h</span>
              </div>
            </div>

            <div className="w-px h-10 bg-white/15" />

            {/* Duration */}
            <div className="text-center">
              <p className="text-white text-lg font-display font-bold">{formatDuration(remainingDuration)}</p>
              <p className="text-white/50 text-[10px] font-semibold uppercase tracking-wider">Tempo</p>
            </div>

            <div className="w-px h-10 bg-white/15" />

            {/* ETA */}
            <div className="text-center">
              <p className="text-lg font-display font-bold" style={{ color: accent }}>
                {eta.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
              </p>
              <p className="text-white/50 text-[10px] font-semibold uppercase tracking-wider">Chegada</p>
            </div>

            <div className="w-px h-10 bg-white/15" />

            {/* Distance */}
            <div className="text-center">
              <p className="text-white text-lg font-display font-bold">{formatDistance(remainingDistance)}</p>
              <p className="text-white/50 text-[10px] font-semibold uppercase tracking-wider">Dist.</p>
            </div>

            <div className="w-px h-10 bg-white/15" />

            {/* Close button */}
            <button
              onClick={onClose}
              className="w-10 h-10 rounded-full bg-destructive/80 flex items-center justify-center"
              title="Encerrar navegação"
            >
              <X className="w-5 h-5 text-white" />
            </button>
          </div>
        </div>
      </div>

      {/* Arrival overlay */}
      {arrived && (
        <div
          className="absolute inset-0 z-[1100] flex items-center justify-center bg-black/60 animate-fade-in"
          onClick={() => setArrived(false)}
        >
          <div className="text-center">
            <div className="w-24 h-24 mx-auto mb-4 rounded-full bg-primary/20 flex items-center justify-center" style={{ animation: "destPulse 1.5s infinite" }}>
              <MapPin className="w-12 h-12 text-primary" />
            </div>
            <h2 className="text-white text-3xl font-display font-bold mb-2">Você chegou!</h2>
            <p className="text-white/60 text-sm">Toque para fechar</p>
          </div>
        </div>
      )}

      <style>{`
        :root { --nav-accent: ${isNight ? "#4AE8C4" : "#00B8E6"}; }
        .safe-area-top { padding-top: max(12px, env(safe-area-inset-top)); }
        .safe-area-bottom { padding-bottom: max(8px, env(safe-area-inset-bottom)); }
        .nav-glass {
          background: ${isNight ? "rgba(10, 14, 20, 0.82)" : "rgba(15, 15, 30, 0.75)"};
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          border: 1px solid ${isNight ? "rgba(74, 232, 196, 0.12)" : "rgba(255, 255, 255, 0.12)"};
        }
        .nav-glass-btn {
          width: 48px;
          height: 48px;
          border-radius: 50%;
          background: ${isNight ? "rgba(10, 14, 20, 0.82)" : "rgba(15, 15, 30, 0.75)"};
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          border: 1px solid ${isNight ? "rgba(74, 232, 196, 0.12)" : "rgba(255, 255, 255, 0.12)"};
          display: flex;
          align-items: center;
          justify-content: center;
        }
        @keyframes destPulse {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.15); opacity: 0.7; }
        }
      `}</style>
    </div>
  );
};

export default NavigationFullscreen;

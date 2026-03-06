import { useState, useEffect, useRef, useCallback } from "react";
import L from "leaflet";
import { Search, X, MapPin, Loader2, Navigation, ChevronDown, LocateFixed, Bus, Clock, Route, DollarSign, ExternalLink } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { POI_CATEGORIES, type PoiResult } from "./types";
import { haversineDistance } from "./utils";
import { supabase } from "@/integrations/supabase/client";

interface PoiSearchProps {
  cityName: string;
  coordenadas: [number, number];
  mapInstance: React.MutableRefObject<L.Map | null>;
  onNavigateTo: (lat: number, lng: number, label: string) => void;
}

interface BusSchedule {
  tipo: string;
  linha: string;
  rota: string;
  horarios: string;
  local_saida: string;
  local_chegada: string;
  valor: string;
  observacao: string;
}

const PoiSearch = ({ cityName, coordenadas, mapInstance, onNavigateTo }: PoiSearchProps) => {
  const [expanded, setExpanded] = useState(false);
  const [openCategory, setOpenCategory] = useState<string | null>(null);
  const [customQuery, setCustomQuery] = useState("");
  const [customResults, setCustomResults] = useState<PoiResult[]>([]);
  const [categoryResults, setCategoryResults] = useState<Record<string, PoiResult[]>>({});
  const [loadingCat, setLoadingCat] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [fromCache, setFromCache] = useState(false);
  const [userPos, setUserPos] = useState<[number, number] | null>(null);
  const poiMarkersRef = useRef<L.LayerGroup | null>(null);
  const poiCacheRef = useRef<Record<string, { data: PoiResult[]; ts: number }>>({});
  const [loadingAll, setLoadingAll] = useState(false);
  const [busSchedules, setBusSchedules] = useState<BusSchedule[]>([]);
  const [busCitations, setBusCitations] = useState<string[]>([]);
  const [loadingBus, setLoadingBus] = useState(false);
  const [showBusSchedules, setShowBusSchedules] = useState(false);

  useEffect(() => {
    navigator.geolocation?.getCurrentPosition(
      (pos) => setUserPos([pos.coords.latitude, pos.coords.longitude]),
      () => {}
    );
  }, []);

  const showOnMap = useCallback((data: PoiResult[]) => {
    if (!mapInstance.current) return;
    if (!poiMarkersRef.current) {
      poiMarkersRef.current = L.layerGroup().addTo(mapInstance.current);
    }
    poiMarkersRef.current.clearLayers();
    data.forEach((r) => {
      const icon = L.divIcon({
        html: `<div style="background:hsl(var(--primary));color:white;border-radius:50%;width:28px;height:28px;display:flex;align-items:center;justify-content:center;font-size:14px;box-shadow:0 2px 6px rgba(0,0,0,0.3)">📍</div>`,
        iconSize: [28, 28],
        iconAnchor: [14, 14],
        className: "",
      });
      L.marker([parseFloat(r.lat), parseFloat(r.lon)], { icon })
        .bindPopup(`<b>${r.display_name.split(",")[0]}</b><br/><small>${r.display_name.split(",").slice(1, 3).join(",")}</small>`)
        .addTo(poiMarkersRef.current!);
    });
    if (data.length > 0) {
      const bounds = L.latLngBounds(data.map((r) => [parseFloat(r.lat), parseFloat(r.lon)] as [number, number]));
      mapInstance.current.fitBounds(bounds, { padding: [40, 40] });
    }
  }, [mapInstance]);

  const CACHE_TTL = 10 * 60 * 1000;

  const searchPoi = useCallback(async (query: string, catKey?: string) => {
    const cacheKey = `${query}|${cityName}`;
    const cached = poiCacheRef.current[cacheKey];
    if (cached && Date.now() - cached.ts < CACHE_TTL) {
      const sorted = userPos
        ? [...cached.data].sort((a, b) => haversineDistance(userPos[0], userPos[1], parseFloat(a.lat), parseFloat(a.lon)) - haversineDistance(userPos[0], userPos[1], parseFloat(b.lat), parseFloat(b.lon)))
        : cached.data;
      setFromCache(true);
      if (catKey) { setCategoryResults(prev => ({ ...prev, [catKey]: sorted })); showOnMap(sorted); }
      else { setCustomResults(sorted); showOnMap(sorted); }
      return;
    }

    if (catKey) setLoadingCat(catKey); else setSearching(true);
    setFromCache(false);
    try {
      const vb = `${coordenadas[1]-0.5},${coordenadas[0]+0.5},${coordenadas[1]+0.5},${coordenadas[0]-0.5}`;
      const subQueries = query.includes("|") ? query.split("|").map(s => s.trim()) : [query];
      
      const allResults: PoiResult[][] = [];
      for (let i = 0; i < subQueries.length; i++) {
        if (i > 0) await new Promise(r => setTimeout(r, 1100));
        const fullQuery = `${subQueries[i]}, ${cityName}, Ceará, Brasil`;
        const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(fullQuery)}&countrycodes=br&limit=20&viewbox=${vb}&bounded=0`;
        try {
          const res = await fetch(url, { headers: { "Accept": "application/json" } });
          if (res.ok) allResults.push((await res.json()) as PoiResult[]);
          else allResults.push([]);
        } catch { allResults.push([]); }
      }

      const seen = new Set<number>();
      const data: PoiResult[] = [];
      for (const results of allResults) {
        for (const r of results) {
          if (!seen.has(r.place_id)) { seen.add(r.place_id); data.push(r); }
        }
      }

      poiCacheRef.current[cacheKey] = { data, ts: Date.now() };
      const sorted = userPos
        ? [...data].sort((a, b) => haversineDistance(userPos[0], userPos[1], parseFloat(a.lat), parseFloat(a.lon)) - haversineDistance(userPos[0], userPos[1], parseFloat(b.lat), parseFloat(b.lon)))
        : data;
      if (catKey) { setCategoryResults(prev => ({ ...prev, [catKey]: sorted })); showOnMap(sorted); }
      else { setCustomResults(sorted); showOnMap(sorted); }
    } catch { /* ignore */ }
    if (catKey) setLoadingCat(null); else setSearching(false);
  }, [cityName, coordenadas, userPos, showOnMap]);

  const handleCategoryClick = (cat: typeof POI_CATEGORIES[0]) => {
    if (openCategory === cat.key) {
      setOpenCategory(null);
      poiMarkersRef.current?.clearLayers();
    } else {
      setOpenCategory(cat.key);
      setCustomResults([]);
      setShowBusSchedules(false);
      if (!categoryResults[cat.key]) {
        searchPoi(cat.query, cat.key);
      } else {
        showOnMap(categoryResults[cat.key]);
      }
    }
  };

  const handleSearchAll = async () => {
    setLoadingAll(true);
    setOpenCategory("todos");
    setCustomResults([]);
    setShowBusSchedules(false);
    
    const allData: PoiResult[] = [];
    const seen = new Set<number>();
    
    for (let i = 0; i < POI_CATEGORIES.length; i++) {
      const cat = POI_CATEGORIES[i];
      if (categoryResults[cat.key]) {
        for (const r of categoryResults[cat.key]) {
          if (!seen.has(r.place_id)) { seen.add(r.place_id); allData.push(r); }
        }
        continue;
      }
      if (i > 0) await new Promise(r => setTimeout(r, 1100));
      const vb = `${coordenadas[1]-0.5},${coordenadas[0]+0.5},${coordenadas[1]+0.5},${coordenadas[0]-0.5}`;
      const subQueries = cat.query.includes("|") ? cat.query.split("|").map(s => s.trim()) : [cat.query];
      
      for (let j = 0; j < subQueries.length; j++) {
        if (j > 0) await new Promise(r => setTimeout(r, 1100));
        const fullQuery = `${subQueries[j]}, ${cityName}, Ceará, Brasil`;
        const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(fullQuery)}&countrycodes=br&limit=10&viewbox=${vb}&bounded=0`;
        try {
          const res = await fetch(url, { headers: { "Accept": "application/json" } });
          if (res.ok) {
            const results = (await res.json()) as PoiResult[];
            for (const r of results) {
              if (!seen.has(r.place_id)) { seen.add(r.place_id); allData.push(r); }
            }
          }
        } catch { /* ignore */ }
      }
    }

    const sorted = userPos
      ? [...allData].sort((a, b) => haversineDistance(userPos[0], userPos[1], parseFloat(a.lat), parseFloat(a.lon)) - haversineDistance(userPos[0], userPos[1], parseFloat(b.lat), parseFloat(b.lon)))
      : allData;
    
    setCategoryResults(prev => ({ ...prev, todos: sorted }));
    showOnMap(sorted);
    setLoadingAll(false);
  };

  const handleFetchBusSchedules = async () => {
    setLoadingBus(true);
    setShowBusSchedules(true);
    try {
      const { data, error } = await supabase.functions.invoke('fetch-bus-schedules', {
        body: { city: cityName },
      });
      if (error) throw error;
      if (data?.success) {
        setBusSchedules(data.schedules || []);
        setBusCitations(data.citations || []);
      } else {
        toast({ title: "Erro", description: data?.error || "Não foi possível buscar horários.", variant: "destructive" });
      }
    } catch (err) {
      console.error('Bus schedule error:', err);
      toast({ title: "Erro", description: "Falha ao buscar horários de transporte.", variant: "destructive" });
    }
    setLoadingBus(false);
  };

  const handleCustomSearch = () => {
    if (customQuery.trim().length < 2) return;
    setOpenCategory(null);
    setShowBusSchedules(false);
    searchPoi(customQuery.trim());
  };

  const formatDist = (lat: string, lon: string) => {
    if (!userPos) return null;
    const d = haversineDistance(userPos[0], userPos[1], parseFloat(lat), parseFloat(lon));
    return d >= 1000 ? `${(d / 1000).toFixed(1)} km` : `${Math.round(d)} m`;
  };

  const renderResults = (items: PoiResult[]) => (
    <div className="max-h-52 overflow-y-auto space-y-0.5 pr-1 bg-card border border-border rounded-lg shadow-lg z-50">
      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-3">Nenhum resultado encontrado</p>
      ) : items.map((r) => {
        const name = r.display_name.split(",")[0];
        const detail = r.display_name.split(",").slice(1, 3).join(",");
        const dist = formatDist(r.lat, r.lon);
        return (
          <button
            key={r.place_id}
            onClick={() => {
              const lat = parseFloat(r.lat);
              const lng = parseFloat(r.lon);
              onNavigateTo(lat, lng, name);
              mapInstance.current?.setView([lat, lng], 16);
            }}
            className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-primary/10 text-left transition-colors first:rounded-t-lg last:rounded-b-lg"
            title={`Navegar para: ${name}`}
          >
            <MapPin className="w-3.5 h-3.5 text-primary shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-foreground truncate">{name}</p>
              <p className="text-[10px] text-muted-foreground truncate">{detail}</p>
            </div>
            {dist && (
              <span className="text-[10px] font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded-full shrink-0">{dist}</span>
            )}
            <Navigation className="w-3 h-3 text-primary shrink-0" />
          </button>
        );
      })}
    </div>
  );

  return (
    <div className="glass-card rounded-xl p-4 space-y-3">
      <button onClick={() => setExpanded(!expanded)} className="flex items-center gap-2 w-full" title={expanded ? "Recolher busca avançada" : "Expandir busca avançada"}>
        <Search className="w-5 h-5 text-primary" />
        <h3 className="font-display font-bold text-sm flex-1 text-left">Busca Avançada</h3>
        <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${expanded ? "rotate-180" : ""}`} />
      </button>

      {expanded && (
        <div className="space-y-3 animate-fade-in">
          <div className="grid grid-cols-4 gap-1.5">
            {/* Todos button */}
            <button
              onClick={handleSearchAll}
              disabled={loadingAll}
              className={`flex flex-col items-center gap-1 py-2 px-1 rounded-lg text-[10px] font-medium transition-colors relative ${
                openCategory === "todos"
                  ? "bg-primary text-primary-foreground"
                  : "bg-accent text-accent-foreground hover:bg-primary/10 hover:text-primary"
              }`}
              title="Buscar todos os tipos de locais"
            >
              {loadingAll ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              Todos
            </button>
            {POI_CATEGORIES.map((cat) => {
              const Icon = cat.icon;
              const isOpen = openCategory === cat.key;
              const isLoading = loadingCat === cat.key;
              return (
                <button
                  key={cat.key}
                  onClick={() => handleCategoryClick(cat)}
                  className={`flex flex-col items-center gap-1 py-2 px-1 rounded-lg text-[10px] font-medium transition-colors relative ${
                    isOpen
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:bg-primary/10 hover:text-primary"
                  }`}
                  title={`Buscar: ${cat.label}`}
                >
                  {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Icon className="w-4 h-4" />}
                  {cat.label}
                </button>
              );
            })}
          </div>

          {/* Bus schedules button */}
          <button
            onClick={handleFetchBusSchedules}
            disabled={loadingBus}
            className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-xs font-semibold transition-colors ${
              showBusSchedules
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-primary/10 hover:text-primary"
            }`}
            title="Buscar horários de ônibus e topiques na internet"
          >
            {loadingBus ? <Loader2 className="w-4 h-4 animate-spin" /> : <Bus className="w-4 h-4" />}
            🔍 Buscar Horários de Ônibus/Topiques na Internet
            <Clock className="w-3.5 h-3.5 ml-auto" />
          </button>

          {/* Bus schedules results */}
          {showBusSchedules && (
            <div className="animate-fade-in space-y-2">
              {loadingBus ? (
                <div className="flex items-center justify-center gap-2 py-6 text-muted-foreground text-xs">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>Pesquisando na internet horários e rotas...</span>
                </div>
              ) : busSchedules.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-4">Nenhum horário encontrado para {cityName}.</p>
              ) : (
                <>
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-foreground">{busSchedules.length} transporte{busSchedules.length !== 1 ? "s" : ""} encontrado{busSchedules.length !== 1 ? "s" : ""}</p>
                    <button onClick={() => setShowBusSchedules(false)} className="text-xs text-destructive hover:underline" title="Fechar resultados de transporte">Fechar</button>
                  </div>
                  <div className="max-h-80 overflow-y-auto space-y-2 pr-1">
                    {busSchedules.map((bus, idx) => (
                      <div key={idx} className="bg-card border border-border rounded-lg p-3 space-y-1.5">
                        <div className="flex items-center gap-2">
                          <Bus className="w-4 h-4 text-primary shrink-0" />
                          <span className="text-xs font-bold text-foreground">{bus.tipo}</span>
                          <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full font-semibold">{bus.linha}</span>
                        </div>
                        <div className="flex items-start gap-1.5">
                          <Route className="w-3 h-3 text-muted-foreground shrink-0 mt-0.5" />
                          <p className="text-[11px] text-foreground">{bus.rota}</p>
                        </div>
                        <div className="flex items-start gap-1.5">
                          <Clock className="w-3 h-3 text-muted-foreground shrink-0 mt-0.5" />
                          <p className="text-[11px] text-foreground">{bus.horarios}</p>
                        </div>
                        <div className="flex gap-3 text-[10px] text-muted-foreground">
                          <span>📍 Saída: {bus.local_saida}</span>
                          <span>🏁 Chegada: {bus.local_chegada}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-bold text-primary flex items-center gap-1">
                            <DollarSign className="w-3 h-3" /> {bus.valor}
                          </span>
                          {bus.observacao && (
                            <span className="text-[10px] text-muted-foreground italic">{bus.observacao}</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                  {busCitations.length > 0 && (
                    <div className="pt-1">
                      <p className="text-[10px] text-muted-foreground font-semibold mb-1">Fontes:</p>
                      <div className="flex flex-wrap gap-1">
                        {busCitations.slice(0, 5).map((url, i) => (
                          <a
                            key={i}
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[9px] text-primary hover:underline flex items-center gap-0.5 bg-primary/5 px-1.5 py-0.5 rounded"
                          >
                            <ExternalLink className="w-2.5 h-2.5" />
                            [{i + 1}]
                          </a>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {openCategory && openCategory !== "todos" && (
            <div className="animate-fade-in">
              {loadingCat === openCategory ? (
                <div className="flex items-center justify-center gap-2 py-3 text-muted-foreground text-xs">
                  <Loader2 className="w-4 h-4 animate-spin" /> Buscando...
                </div>
              ) : categoryResults[openCategory] ? (
                <>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-1.5">
                      <p className="text-xs text-muted-foreground font-medium">
                        {categoryResults[openCategory].length} resultado{categoryResults[openCategory].length !== 1 ? "s" : ""}
                      </p>
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${fromCache ? "bg-amber-500/15 text-amber-600" : "bg-emerald-500/15 text-emerald-600"}`}>
                        {fromCache ? "⚡ cache" : "🌐 API"}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          navigator.geolocation?.getCurrentPosition(
                            (pos) => {
                              const newPos: [number, number] = [pos.coords.latitude, pos.coords.longitude];
                              setUserPos(newPos);
                              const sorted = [...categoryResults[openCategory!]!].sort((a, b) => {
                                const da = haversineDistance(newPos[0], newPos[1], parseFloat(a.lat), parseFloat(a.lon));
                                const db = haversineDistance(newPos[0], newPos[1], parseFloat(b.lat), parseFloat(b.lon));
                                return da - db;
                              });
                              setCategoryResults(prev => ({ ...prev, [openCategory!]: sorted }));
                              toast({ title: "Localização atualizada", description: "Distâncias recalculadas." });
                            },
                            () => toast({ title: "Erro", description: "Não foi possível obter sua localização.", variant: "destructive" })
                          );
                        }}
                        className="flex items-center gap-1 text-[10px] text-primary hover:underline"
                        title="Atualizar localização e distâncias"
                      >
                        <LocateFixed className="w-3 h-3" /> Atualizar
                      </button>
                      <button onClick={() => { setOpenCategory(null); poiMarkersRef.current?.clearLayers(); }} className="text-xs text-destructive hover:underline" title="Fechar resultados da categoria">Fechar</button>
                    </div>
                  </div>
                  {renderResults(categoryResults[openCategory])}
                </>
              ) : null}
            </div>
          )}

          {/* Todos results */}
          {openCategory === "todos" && (
            <div className="animate-fade-in">
              {loadingAll ? (
                <div className="flex items-center justify-center gap-2 py-3 text-muted-foreground text-xs">
                  <Loader2 className="w-4 h-4 animate-spin" /> Buscando todos os locais...
                </div>
              ) : categoryResults["todos"] ? (
                <>
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-xs text-muted-foreground font-medium">
                      {categoryResults["todos"].length} resultado{categoryResults["todos"].length !== 1 ? "s" : ""} no total
                    </p>
                    <button onClick={() => { setOpenCategory(null); poiMarkersRef.current?.clearLayers(); }} className="text-xs text-destructive hover:underline" title="Fechar resultados">Fechar</button>
                  </div>
                  {renderResults(categoryResults["todos"])}
                </>
              ) : null}
            </div>
          )}

          <div className="flex gap-2">
            <div className="flex-1 flex items-center gap-2 bg-muted rounded-lg px-3 py-2">
              <Search className="w-4 h-4 text-muted-foreground shrink-0" />
              <input
                className="flex-1 bg-transparent text-sm outline-none"
                placeholder="Buscar outro local..."
                value={customQuery}
                onChange={(e) => setCustomQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleCustomSearch()}
              />
              {customQuery && <button onClick={() => setCustomQuery("")} title="Limpar busca personalizada"><X className="w-3.5 h-3.5 text-muted-foreground" /></button>}
            </div>
            <button
              onClick={handleCustomSearch}
              disabled={customQuery.trim().length < 2 || searching}
              className="px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-40"
              title="Buscar local personalizado"
            >
              {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            </button>
          </div>

          {searching && (
            <div className="flex items-center justify-center gap-2 py-3 text-muted-foreground text-xs">
              <Loader2 className="w-4 h-4 animate-spin" /> Buscando...
            </div>
          )}
          {customResults.length > 0 && (
            <div className="animate-fade-in">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-1.5">
                  <p className="text-xs text-muted-foreground font-medium">{customResults.length} resultado{customResults.length !== 1 ? "s" : ""}</p>
                  <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${fromCache ? "bg-amber-500/15 text-amber-600" : "bg-emerald-500/15 text-emerald-600"}`}>
                    {fromCache ? "⚡ cache" : "🌐 API"}
                  </span>
                </div>
                <button onClick={() => { setCustomResults([]); poiMarkersRef.current?.clearLayers(); }} className="text-xs text-destructive hover:underline" title="Limpar resultados da busca">Limpar</button>
              </div>
              {renderResults(customResults)}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default PoiSearch;

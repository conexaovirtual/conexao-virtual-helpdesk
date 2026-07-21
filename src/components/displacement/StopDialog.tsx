import { useEffect, useState } from "react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useGeolocation } from "@/hooks/useGeolocation";
import { GeolocationCapture } from "@/components/ui/GeolocationCapture";
import { STOP_TYPES } from "@/hooks/useDisplacementReport";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export interface StopRecord {
  id: string;
  tecnico_id: string;
  data: string;
  hora: string | null;
  tipo: string;
  nome: string | null;
  endereco: string | null;
  latitude: number | null;
  longitude: number | null;
  observacao: string | null;
}

interface StopDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tecnicoId: string;
  /** Data (yyyy-mm-dd) usada ao criar uma parada nova. */
  date: string;
  /** Quando informado, edita a parada existente em vez de criar. */
  stop?: StopRecord | null;
  /** Permite escolher a data da parada (usado no relatório de Deslocamento). */
  allowDateEdit?: boolean;
  onSuccess?: () => void;
}

const TIPO_ORDER = ["deixar_manutencao", "buscar_manutencao", "compra_equipamento", "outro"];

interface SavedPlace {
  id: string;
  nome: string;
  latitude: number;
  longitude: number;
  tipo_padrao: string | null;
}

export function StopDialog({
  open,
  onOpenChange,
  tecnicoId,
  date,
  stop,
  allowDateEdit,
  onSuccess,
}: StopDialogProps) {
  const { toast } = useToast();
  const { position, loading: geoLoading, error: geoError, captureLocation } = useGeolocation();

  const [tipo, setTipo] = useState("deixar_manutencao");
  const [nome, setNome] = useState("");
  const [dataState, setDataState] = useState(date);
  const [hora, setHora] = useState("");
  const [observacao, setObservacao] = useState("");
  const [coords, setCoords] = useState<{ lat: number; lon: number } | null>(null);
  const [saving, setSaving] = useState(false);
  const [places, setPlaces] = useState<SavedPlace[]>([]);
  const [placeId, setPlaceId] = useState<string>("");
  const [saveAsPlace, setSaveAsPlace] = useState(false);
  const [managePlaces, setManagePlaces] = useState(false);

  const loadPlaces = async () => {
    const { data } = await (supabase as any)
      .from("saved_places")
      .select("id, nome, latitude, longitude, tipo_padrao")
      .order("nome");
    setPlaces(data || []);
  };

  // escolher um local frequente preenche nome + coordenadas (sem depender do GPS de agora)
  const handlePickPlace = (id: string) => {
    setPlaceId(id);
    const p = places.find((x) => x.id === id);
    if (!p) return;
    setNome(p.nome);
    setCoords({ lat: p.latitude, lon: p.longitude });
    if (p.tipo_padrao && STOP_TYPES[p.tipo_padrao]) setTipo(p.tipo_padrao);
  };

  const handleDeletePlace = async (id: string) => {
    await (supabase as any).from("saved_places").delete().eq("id", id);
    if (placeId === id) setPlaceId("");
    loadPlaces();
  };

  // Carrega os campos ao abrir (novo: GPS automático; edição: dados existentes)
  useEffect(() => {
    if (!open) return;
    loadPlaces();
    setPlaceId("");
    setSaveAsPlace(false);
    setManagePlaces(false);
    if (stop) {
      setTipo(stop.tipo || "outro");
      setNome(stop.nome || "");
      setDataState(stop.data || date);
      setHora(stop.hora ? stop.hora.substring(0, 5) : "");
      setObservacao(stop.observacao || "");
      setCoords(
        stop.latitude != null && stop.longitude != null ? { lat: stop.latitude, lon: stop.longitude } : null
      );
    } else {
      setTipo("deixar_manutencao");
      setNome("");
      setDataState(date);
      setHora(format(new Date(), "HH:mm"));
      setObservacao("");
      setCoords(null);
      // captura o GPS automaticamente — o técnico costuma estar no local
      captureLocation().then((p) => {
        if (p) setCoords({ lat: p.latitude, lon: p.longitude });
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, stop]);

  const handleCapture = async () => {
    const p = await captureLocation();
    if (p) setCoords({ lat: p.latitude, lon: p.longitude });
  };

  const handleSave = async () => {
    if (!coords) {
      toast({
        title: "Capture a localização da parada",
        description: "Sem GPS a parada não entra no cálculo de quilometragem.",
        variant: "destructive",
      });
      return;
    }
    setSaving(true);
    try {
      const payload = {
        tecnico_id: tecnicoId,
        data: dataState,
        hora: hora || null,
        tipo,
        nome: nome.trim() || null,
        latitude: coords.lat,
        longitude: coords.lon,
        observacao: observacao.trim() || null,
      };
      const { error } = stop
        ? await supabase.from("displacement_stops").update(payload).eq("id", stop.id)
        : await supabase.from("displacement_stops").insert([payload]);
      if (error) throw error;

      // grava o local como frequente p/ lançamentos futuros por nome
      if (saveAsPlace && nome.trim()) {
        const jaExiste = places.some((p) => p.nome.toLowerCase() === nome.trim().toLowerCase());
        if (!jaExiste) {
          await (supabase as any).from("saved_places").insert([
            { nome: nome.trim(), latitude: coords.lat, longitude: coords.lon, tipo_padrao: tipo },
          ]);
        }
      }

      toast({ title: stop ? "Parada atualizada" : "Parada registrada" });
      onOpenChange(false);
      onSuccess?.();
    } catch (e: any) {
      toast({ title: "Erro ao salvar parada", description: e?.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const positionForCapture = coords
    ? { latitude: coords.lat, longitude: coords.lon, timestamp: Date.now() }
    : position;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{stop ? "Editar parada" : "Registrar parada"}</DialogTitle>
          <DialogDescription>
            Local que não é cliente mas gerou deslocamento (deixar/buscar equipamento, compra de peça…). Entra na
            quilometragem do dia.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {places.length > 0 && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label>📍 Local frequente</Label>
                <button
                  type="button"
                  className="text-xs text-muted-foreground underline"
                  onClick={() => setManagePlaces(!managePlaces)}
                >
                  {managePlaces ? "fechar" : "gerenciar"}
                </button>
              </div>
              <Select value={placeId} onValueChange={handlePickPlace}>
                <SelectTrigger>
                  <SelectValue placeholder="Escolher um local salvo (preenche nome e localização)" />
                </SelectTrigger>
                <SelectContent>
                  {places.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {managePlaces && (
                <div className="rounded-md border p-2 space-y-1">
                  {places.map((p) => (
                    <div key={p.id} className="flex items-center justify-between text-sm">
                      <span>{p.nome}</span>
                      <button
                        type="button"
                        className="text-xs text-destructive underline"
                        onClick={() => handleDeletePlace(p.id)}
                      >
                        excluir
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Tipo</Label>
            <Select value={tipo} onValueChange={setTipo}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TIPO_ORDER.map((t) => (
                  <SelectItem key={t} value={t}>
                    {STOP_TYPES[t].emoji} {STOP_TYPES[t].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Local</Label>
            <Input
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Ex.: Assistência Sublime, Kalunga…"
            />
          </div>

          <div className="flex gap-3">
            {allowDateEdit && (
              <div className="space-y-1.5">
                <Label>Data</Label>
                <Input type="date" value={dataState} onChange={(e) => setDataState(e.target.value)} className="w-44" />
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Horário</Label>
              <Input type="time" value={hora} onChange={(e) => setHora(e.target.value)} className="w-36" />
            </div>
          </div>

          <GeolocationCapture
            label="Localização da parada"
            position={positionForCapture}
            loading={geoLoading}
            error={geoError}
            onCapture={handleCapture}
            captureLabel="Capturar GPS"
            recaptureLabel="Recapturar"
          />

          {!stop && !placeId && (
            <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
              <input
                type="checkbox"
                checked={saveAsPlace}
                onChange={(e) => setSaveAsPlace(e.target.checked)}
                className="h-4 w-4"
              />
              ⭐ Salvar como local frequente (para lançar por nome da próxima vez)
            </label>
          )}

          <div className="space-y-1.5">
            <Label>Observação (opcional)</Label>
            <Textarea
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              placeholder="Detalhe o que foi feito"
              rows={2}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving || geoLoading}>
            {saving ? "Salvando…" : stop ? "Salvar" : "Registrar parada"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

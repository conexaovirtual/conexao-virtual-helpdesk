/**
 * useDattoRealtime
 * Escuta inserções na tabela ai_alerts em tempo real.
 * Quando um alerta crítico do Datto chega, exibe toast e toca notificação.
 */
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";

export function useDattoRealtime() {
  const { profile } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!profile?.roles?.includes("admin_provedor") && !profile?.roles?.includes("tecnico")) return;

    const channel = supabase
      .channel("datto-alerts-realtime")
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "ai_alerts",
      }, (payload) => {
        const alert = payload.new as any;
        if (!alert) return;

        const isUrgent = alert.severidade === "alta";
        const isDatto = alert.tipo?.includes("datto") || alert.tipo?.includes("dispositivo") || alert.tipo?.includes("offline");

        if (isUrgent || isDatto) {
          // Toast com ação
          toast(
            isUrgent ? "🚨 Alerta Crítico Detectado!" : "⚠️ Novo Alerta do Sistema",
            {
              description: alert.titulo || "Verifique o painel de alertas",
              duration: isUrgent ? 10000 : 6000,
              action: {
                label: "Ver detalhes",
                onClick: () => navigate("/dashboard"),
              },
            }
          );

          // Tenta push notification se disponível
          if ("Notification" in window && Notification.permission === "granted") {
            new Notification(isUrgent ? "🚨 Alerta Crítico" : "⚠️ Alerta do Sistema", {
              body: alert.titulo + (alert.descricao ? "\n" + alert.descricao.substring(0, 80) : ""),
              icon: "/logo-conexaovirtual.png",
              badge: "/logo-conexaovirtual.png",
              tag: `datto-alert-${alert.id}`,
            });
          }
        }
      })
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "datto_alerts_log",
      }, (payload) => {
        const alert = payload.new as any;
        if (!alert) return;

        const isCritical = ["critical", "high"].includes(alert.alert_priority?.toLowerCase());

        if (isCritical) {
          toast("📡 Alerta NexoRMM", {
            description: `${alert.alert_type || "Alerta"}: ${(alert.alert_message || "").substring(0, 80)}`,
            duration: 8000,
            action: {
              label: "Monitor de Rede",
              onClick: () => navigate("/network-monitor"),
            },
          });
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [profile, navigate]);
}

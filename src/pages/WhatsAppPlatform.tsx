import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft, MessageSquare, Bot, Wifi, WifiOff, BarChart3,
  Headphones, Users, Clock, CheckCircle2, RefreshCw
} from "lucide-react";
import { toast } from "sonner";
import { ConversationList, type Conversation } from "@/components/whatsapp-platform/ConversationList";
import { ChatArea } from "@/components/whatsapp-platform/ChatArea";
import { ContactInfoPanel } from "@/components/whatsapp-platform/ContactInfoPanel";
import { MetricsDashboard } from "@/components/whatsapp-platform/MetricsDashboard";

const WhatsAppPlatform = () => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [showInfo, setShowInfo] = useState(false);
  const [isConnected, setIsConnected] = useState(true);
  const [activeTab, setActiveTab] = useState<"inbox" | "metrics">("inbox");
  const [syncing, setSyncing] = useState(false);
  const [unreadIds, setUnreadIds] = useState<Set<string>>(new Set());

  // Ref para ler a conversa aberta dentro da assinatura realtime (evita closure obsoleta)
  const selectedIdRef = useRef<string | null>(null);
  useEffect(() => { selectedIdRef.current = selectedConversation?.id || null; }, [selectedConversation]);

  // Toca um bip curto (Web Audio, sem precisar de arquivo)
  const playBeep = () => {
    try {
      const Ctx = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!Ctx) return;
      const ctx = new Ctx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.type = "sine"; osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
      osc.start(); osc.stop(ctx.currentTime + 0.36);
      osc.onended = () => ctx.close();
    } catch { /* silencioso */ }
  };

  // PostgREST caps selects at 1000 rows; page through everything. Conversations
  // that never had a message (null last_message_at) go to the bottom.
  const fetchAllConversations = async (): Promise<Conversation[]> => {
    const all: Conversation[] = [];
    for (let from = 0; ; from += 1000) {
      const { data } = await supabase
        .from("waba_conversations")
        .select("*")
        .order("last_message_at", { ascending: false, nullsFirst: false })
        .range(from, from + 999);
      if (data) all.push(...(data as Conversation[]));
      if (!data || data.length < 1000) break;
    }
    return all;
  };

  const syncContacts = async () => {
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke("sync-whatsapp-contacts");
      if (error) throw error;
      const imported = data?.contactsImported || 0;
      const created = data?.conversationsCreated ?? data?.synced ?? 0;
      const photosCount = data?.photosUpdated || 0;
      toast.success(
        `${imported} contatos importados da Mabbix, ${created} conversas novas, ${photosCount} fotos atualizadas`
      );
      if (data?.warnings?.length) {
        toast.warning(data.warnings.join(" "));
      }
      // Refresh conversations
      setConversations(await fetchAllConversations());
    } catch (err: any) {
      toast.error("Erro ao sincronizar: " + (err.message || ""));
    }
    setSyncing(false);
  };

  useEffect(() => {
    if (!loading && !user) navigate("/auth");
  }, [user, loading, navigate]);

  // Fetch conversations + realtime
  useEffect(() => {
    if (!user) return;

    const fetchConversations = async () => {
      setConversations(await fetchAllConversations());
    };

    fetchConversations();

    const channel = supabase
      .channel("platform-conversations")
      .on("postgres_changes", { event: "*", schema: "public", table: "waba_conversations" },
        (payload) => {
          if (payload.eventType === "UPDATE") {
            const updated = payload.new as Conversation;
            setConversations((prev) =>
              prev.map((c) => (c.id === updated.id ? updated : c))
                .sort((a, b) => new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime())
            );
            setSelectedConversation((prev) =>
              prev?.id === updated.id ? updated : prev
            );
          } else {
            fetchConversations();
          }
        }
      )
      .subscribe((status) => {
        setIsConnected(status === "SUBSCRIBED");
      });

    return () => { supabase.removeChannel(channel); };
  }, [user]);

  // Notificação de mensagens novas (som + não lidas + aviso do navegador)
  useEffect(() => {
    if (!user) return;
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission().catch(() => {});
    }

    const channel = supabase
      .channel("platform-new-messages")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "waba_messages" },
        (payload) => {
          const msg = payload.new as any;
          if (msg.direction !== "inbound") return;               // só mensagens recebidas
          if (msg.conversation_id === selectedIdRef.current) return; // conversa já aberta
          playBeep();
          setUnreadIds((prev) => new Set(prev).add(msg.conversation_id));
          const preview = (msg.content || "Nova mensagem").toString().slice(0, 60);
          toast.message("💬 Nova mensagem no WhatsApp", { description: preview });
          if ("Notification" in window && Notification.permission === "granted") {
            try { new Notification("Nova mensagem no WhatsApp", { body: preview }); } catch { /* ignore */ }
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user]);

  // Quick stats
  const activeCount = conversations.filter(c => c.status === "active").length;
  const waitingCount = conversations.filter(c => c.queue_status === "waiting").length;
  const aiCount = conversations.filter(c => c.ai_enabled).length;
  const resolvedCount = conversations.filter(c => c.queue_status === "resolved").length;

  const handleSelectConversation = (conv: Conversation) => {
    setSelectedConversation(conv);
    setActiveTab("inbox");
    setShowInfo(false);
    setUnreadIds((prev) => {
      if (!prev.has(conv.id)) return prev;
      const next = new Set(prev);
      next.delete(conv.id);
      return next;
    });
  };

  const handleBack = () => {
    setSelectedConversation(null);
    setShowInfo(false);
  };

  if (loading) return null;

  return (
    <div className="h-[100dvh] flex flex-col bg-background">
      {/* Top Bar - Dark professional header like Infradesk */}
      <div className="bg-[hsl(220,25%,16%)] text-white shrink-0">
        <div className="h-12 px-3 sm:px-4 flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0 text-white/70 hover:text-white hover:bg-white/10"
            onClick={() => navigate("/dashboard")}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center shrink-0">
              <Headphones className="h-4 w-4 text-white" />
            </div>
            <div className="min-w-0">
              <h1 className="text-sm font-semibold leading-tight truncate tracking-wide">
                PLATAFORMA DE ATENDIMENTO
              </h1>
              <p className="text-[10px] text-white/50 leading-tight hidden sm:block">
                WhatsApp Business • Atendimento inteligente com IA
              </p>
            </div>
          </div>

          <div className="ml-auto flex items-center gap-3 shrink-0">
            {/* Connection status */}
            <div className="flex items-center gap-1.5">
              {isConnected ? (
                <div className="flex items-center gap-1.5">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
                  </span>
                  <span className="text-xs text-white/60 hidden md:inline">Online</span>
                </div>
              ) : (
                <div className="flex items-center gap-1.5">
                  <WifiOff className="h-3.5 w-3.5 text-red-400" />
                  <span className="text-xs text-red-400 hidden md:inline">Offline</span>
                </div>
              )}
            </div>

            {/* Tab switches */}
            <div className="flex items-center bg-white/10 rounded-lg p-0.5">
              <button
                onClick={() => setActiveTab("inbox")}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-all ${
                  activeTab === "inbox"
                    ? "bg-primary text-white shadow-sm"
                    : "text-white/60 hover:text-white"
                }`}
              >
                <MessageSquare className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Inbox</span>
              </button>
              <button
                onClick={() => setActiveTab("metrics")}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-all ${
                  activeTab === "metrics"
                    ? "bg-primary text-white shadow-sm"
                    : "text-white/60 hover:text-white"
                }`}
              >
                <BarChart3 className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Métricas</span>
              </button>
            </div>

            {/* Sync button */}
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-white/60 hover:text-white hover:bg-white/10"
              onClick={syncContacts}
              disabled={syncing}
              title="Sincronizar contatos"
            >
              <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
            </Button>

            {/* User avatar */}
            <div className="h-8 w-8 rounded-full bg-primary/30 border border-primary/50 flex items-center justify-center text-xs font-semibold text-white">
              {user?.email?.slice(0, 1).toUpperCase() || "U"}
            </div>
          </div>
        </div>

        {/* Quick Stats Bar - colored metric cards like InfraChat */}
        <div className="px-3 sm:px-4 pb-2 flex gap-2 overflow-x-auto scrollbar-hide">
          <div className="flex items-center gap-2 bg-emerald-600/90 rounded-lg px-3 py-1.5 shrink-0">
            <Users className="h-3.5 w-3.5 text-white/80" />
            <div>
              <p className="text-[10px] text-white/70 leading-tight uppercase tracking-wider">Ativos</p>
              <p className="text-sm font-bold text-white leading-tight">{activeCount}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 bg-blue-600/90 rounded-lg px-3 py-1.5 shrink-0">
            <Bot className="h-3.5 w-3.5 text-white/80" />
            <div>
              <p className="text-[10px] text-white/70 leading-tight uppercase tracking-wider">IA Ativa</p>
              <p className="text-sm font-bold text-white leading-tight">{aiCount}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 bg-amber-600/90 rounded-lg px-3 py-1.5 shrink-0">
            <Clock className="h-3.5 w-3.5 text-white/80" />
            <div>
              <p className="text-[10px] text-white/70 leading-tight uppercase tracking-wider">Na Fila</p>
              <p className="text-sm font-bold text-white leading-tight">{waitingCount}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 bg-teal-600/90 rounded-lg px-3 py-1.5 shrink-0">
            <CheckCircle2 className="h-3.5 w-3.5 text-white/80" />
            <div>
              <p className="text-[10px] text-white/70 leading-tight uppercase tracking-wider">Resolvidos</p>
              <p className="text-sm font-bold text-white leading-tight">{resolvedCount}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 bg-indigo-600/90 rounded-lg px-3 py-1.5 shrink-0">
            <MessageSquare className="h-3.5 w-3.5 text-white/80" />
            <div>
              <p className="text-[10px] text-white/70 leading-tight uppercase tracking-wider">Total</p>
              <p className="text-sm font-bold text-white leading-tight">{conversations.length}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex flex-1 overflow-hidden relative">
        {activeTab === "metrics" ? (
          <div className="flex-1 overflow-auto">
            <MetricsDashboard />
          </div>
        ) : (
          <>
            {/* Conversation List - hidden on mobile when chat is open */}
            <div className={`w-full md:w-80 lg:w-96 shrink-0 ${selectedConversation ? "hidden md:block" : "block"}`}>
              <ConversationList
                conversations={conversations}
                selectedId={selectedConversation?.id || null}
                onSelect={handleSelectConversation}
                unreadIds={unreadIds}
              />
            </div>

            {/* Chat Area */}
            <div className={`flex-1 flex min-w-0 ${!selectedConversation ? "hidden md:flex" : "flex"}`}>
              <ChatArea
                conversation={selectedConversation}
                onToggleInfo={() => setShowInfo(!showInfo)}
                showInfo={showInfo}
                onBack={handleBack}
              />
            </div>

            {/* Contact Info Panel - overlay on mobile, sidebar on desktop */}
            {showInfo && selectedConversation && (
              <>
                <div
                  className="fixed inset-0 bg-background/80 backdrop-blur-sm z-40 md:hidden"
                  onClick={() => setShowInfo(false)}
                />
                <div className="fixed inset-y-0 right-0 w-full max-w-sm z-50 md:relative md:inset-auto md:w-80 md:z-auto animate-in slide-in-from-right duration-200">
                  <ContactInfoPanel
                    conversation={selectedConversation}
                    onClose={() => setShowInfo(false)}
                  />
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default WhatsAppPlatform;

import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Search, Bot, Clock, MessageSquare, Users, UserCheck, Phone, Sparkles } from "lucide-react";
import { format, isToday, isYesterday } from "date-fns";
import { ptBR } from "date-fns/locale";

export interface Conversation {
  id: string;
  phone_number: string;
  contact_name: string | null;
  status: string;
  last_message_at: string;
  created_at: string;
  ai_enabled: boolean;
  ai_context: any;
  assigned_to: string | null;
  queue_status: string;
  first_response_at: string | null;
  resolved_at: string | null;
  profile_photo_url: string | null;
}

interface ConversationListProps {
  conversations: Conversation[];
  selectedId: string | null;
  onSelect: (conv: Conversation) => void;
  unreadIds?: Set<string>;
}

function formatTime(dateStr: string | null) {
  if (!dateStr) return "";
  const date = new Date(dateStr);
  if (isToday(date)) return format(date, "HH:mm");
  if (isYesterday(date)) return "Ontem";
  return format(date, "dd/MM", { locale: ptBR });
}

function getQueueColor(status: string) {
  switch (status) {
    case "waiting": return "bg-amber-500";
    case "assigned": return "bg-blue-500";
    case "resolved": return "bg-emerald-500";
    default: return "bg-muted-foreground";
  }
}

function getQueueLabel(status: string) {
  switch (status) {
    case "waiting": return "NA FILA";
    case "assigned": return "ATRIBUÍDO";
    case "resolved": return "RESOLVIDO";
    default: return status?.toUpperCase();
  }
}

// Case- and accent-insensitive text for name matching
const fold = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

// Cap rendered rows: with thousands of conversations the DOM chokes and the
// search input lags; past this point the user should refine the search.
const MAX_RENDERED = 200;

export function ConversationList({ conversations, selectedId, onSelect, unreadIds }: ConversationListProps) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");

  const filtered = useMemo(() => {
    const q = fold(search.trim());
    const qDigits = search.replace(/\D/g, "");

    return conversations.filter((c) => {
      const matchesSearch =
        !q ||
        (c.contact_name && fold(c.contact_name).includes(q)) ||
        (qDigits.length > 0 && c.phone_number.replace(/\D/g, "").includes(qDigits));

      const matchesFilter =
        filter === "all" ||
        (filter === "ai" && c.ai_enabled) ||
        (filter === "waiting" && c.queue_status === "waiting") ||
        (filter === "assigned" && c.queue_status === "assigned");

      return matchesSearch && matchesFilter;
    });
  }, [conversations, search, filter]);

  const visible = filtered.slice(0, MAX_RENDERED);

  const counts = useMemo(() => ({
    all: conversations.length,
    ai: conversations.filter(c => c.ai_enabled).length,
    waiting: conversations.filter(c => c.queue_status === "waiting").length,
    assigned: conversations.filter(c => c.queue_status === "assigned").length,
  }), [conversations]);

  const tabs = [
    { key: "all", label: "Todos", icon: Users, count: counts.all },
    { key: "ai", label: "IA", icon: Bot, count: counts.ai },
    { key: "waiting", label: "Fila", icon: Clock, count: counts.waiting },
    { key: "assigned", label: "Atribuídos", icon: UserCheck, count: counts.assigned },
  ];

  return (
    <div className="flex flex-col h-full bg-white dark:bg-[#111b21] border-r border-[#e9edef] dark:border-[#222d34]">
      {/* Search */}
      <div className="p-2 bg-white dark:bg-[#111b21] space-y-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#8696a0]" />
          <Input
            placeholder="Buscar contato ou número..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9 text-sm bg-[#f0f2f5] dark:bg-[#202c33] border-0 rounded-lg focus-visible:ring-0 focus-visible:ring-offset-0"
          />
        </div>

        {/* Filter Tabs */}
        <div className="flex gap-1 overflow-x-auto scrollbar-hide">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setFilter(tab.key)}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-[11px] font-medium whitespace-nowrap transition-all ${
                filter === tab.key
                  ? "bg-[#008069] dark:bg-[#00a884] text-white shadow-sm"
                  : "bg-[#f0f2f5] dark:bg-[#202c33] text-[#54656f] dark:text-[#aebac1] hover:bg-[#e9edef] dark:hover:bg-[#2a3942]"
              }`}
            >
              <tab.icon className="h-3 w-3" />
              {tab.label}
              <span className={`text-[10px] rounded-full px-1.5 py-0 min-w-[18px] text-center ${
                filter === tab.key
                  ? "bg-white/20 text-white"
                  : "bg-[#e9edef] dark:bg-[#2a3942] text-[#54656f] dark:text-[#aebac1]"
              }`}>
                {tab.count}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      <ScrollArea className="flex-1 bg-white dark:bg-[#111b21]">
        {filtered.length === 0 ? (
          <div className="p-8 text-center text-[#8696a0]">
            <MessageSquare className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm font-medium">Nenhuma conversa</p>
            <p className="text-xs mt-1">As conversas aparecerão quando clientes enviarem mensagens</p>
          </div>
        ) : (
          <div>
            {visible.map((conv) => {
              const isUnread = unreadIds?.has(conv.id) && selectedId !== conv.id;
              return (
              <button
                key={conv.id}
                onClick={() => onSelect(conv)}
                className={`w-full flex items-center gap-3 px-3 py-3 text-left transition-colors border-b border-[#f0f2f5] dark:border-[#222d34] ${
                  selectedId === conv.id
                    ? "bg-[#f0f2f5] dark:bg-[#2a3942]"
                    : "hover:bg-[#f5f6f6] dark:hover:bg-[#182229]"
                }`}
              >
                {/* Avatar with online/AI indicator */}
                <div className="relative shrink-0">
                  <Avatar className="h-11 w-11">
                    {conv.profile_photo_url && (
                      <AvatarImage src={conv.profile_photo_url} alt={conv.contact_name || conv.phone_number} />
                    )}
                    <AvatarFallback className="bg-[#dfe5e7] dark:bg-[#2a3942] text-[#54656f] dark:text-[#aebac1] font-semibold text-sm">
                      {(conv.contact_name || conv.phone_number).slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  {/* AI indicator dot */}
                  {conv.ai_enabled && (
                    <div className="absolute -bottom-0.5 -right-0.5 h-5 w-5 rounded-full bg-[#008069] dark:bg-[#00a884] border-2 border-white dark:border-[#111b21] flex items-center justify-center">
                      <Sparkles className="h-2.5 w-2.5 text-white" />
                    </div>
                  )}
                  {/* Online status dot */}
                  {!conv.ai_enabled && conv.status === "active" && (
                    <div className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full bg-[#25d366] border-2 border-white dark:border-[#111b21]" />
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  {/* Name + time */}
                  <div className="flex justify-between items-baseline gap-2">
                    <p className={`text-[14px] truncate text-[#111b21] dark:text-[#e9edef] ${isUnread ? "font-bold" : "font-medium"}`}>
                      {conv.contact_name || conv.phone_number}
                    </p>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className={`text-[11px] whitespace-nowrap ${isUnread ? "text-[#00a884] font-bold" : "text-[#667781] dark:text-[#8696a0]"}`}>
                        {formatTime(conv.last_message_at)}
                      </span>
                    </div>
                  </div>

                  {/* Phone number + unread dot */}
                  <div className="flex items-center justify-between gap-2 mt-0.5">
                    <p className="text-[12.5px] text-[#667781] dark:text-[#8696a0] flex items-center gap-1 min-w-0">
                      <Phone className="h-2.5 w-2.5 shrink-0" />
                      <span className="truncate">{conv.phone_number}</span>
                    </p>
                    {isUnread && (
                      <span className="h-[18px] min-w-[18px] px-1 rounded-full bg-[#25d366] shrink-0" title="Nova mensagem" />
                    )}
                  </div>

                  {/* Tags row */}
                  <div className="flex items-center gap-1.5 mt-1.5">
                    {/* Queue status tag */}
                    <span className={`inline-flex items-center text-[9px] font-bold tracking-wider text-white rounded px-1.5 py-0.5 leading-none ${getQueueColor(conv.queue_status)}`}>
                      {getQueueLabel(conv.queue_status)}
                    </span>
                    {/* AI tag */}
                    {conv.ai_enabled && (
                      <span className="inline-flex items-center gap-0.5 text-[9px] font-bold tracking-wider text-[#008069] dark:text-[#00a884] bg-[#d9fdd3] dark:bg-[#005c4b]/40 rounded px-1.5 py-0.5 leading-none">
                        <Bot className="h-2.5 w-2.5" /> IA
                      </span>
                    )}
                    {/* Channel tag */}
                    <span className="inline-flex items-center text-[9px] font-medium text-[#008069] bg-[#d9fdd3] dark:text-[#00a884] dark:bg-[#005c4b]/40 rounded px-1.5 py-0.5 leading-none">
                      WhatsApp
                    </span>
                  </div>
                </div>
              </button>
              );
            })}
            {filtered.length > MAX_RENDERED && (
              <div className="p-3 text-center text-[11px] text-[#8696a0]">
                Mostrando {MAX_RENDERED} de {filtered.length} conversas — refine a busca para ver as demais
              </div>
            )}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}

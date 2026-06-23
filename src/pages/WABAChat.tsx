import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  MessageSquare,
  Send,
  ArrowLeft,
  Phone,
  Search,
  Clock,
  CheckCheck,
  Check,
  Bot,
  UserRound,
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";

interface Conversation {
  id: string;
  phone_number: string;
  contact_name: string | null;
  status: string;
  last_message_at: string;
  created_at: string;
  ai_enabled: boolean;
}

interface Message {
  id: string;
  conversation_id: string;
  wamid: string | null;
  direction: string;
  message_type: string;
  content: string | null;
  media_url: string | null;
  status: string | null;
  created_at: string;
  sender_type: string;
}

const WABAChat = () => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!loading && !user) navigate("/auth");
  }, [user, loading, navigate]);

  // Fetch conversations
  useEffect(() => {
    if (!user) return;

    // PostgREST caps selects at 1000 rows; page through everything. Conversations
    // that never had a message (null last_message_at) go to the bottom.
    const fetchConversations = async () => {
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
      setConversations(all);
    };

    fetchConversations();

    const channel = supabase
      .channel("waba-conversations-changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "waba_conversations" },
        () => fetchConversations()
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user]);

  // Fetch messages for selected conversation
  useEffect(() => {
    if (!selectedConversation) return;

    const fetchMessages = async () => {
      const { data } = await supabase
        .from("waba_messages")
        .select("*")
        .eq("conversation_id", selectedConversation.id)
        .order("created_at", { ascending: true });
      if (data) setMessages(data as Message[]);
    };

    fetchMessages();

    const channel = supabase
      .channel(`waba-messages-${selectedConversation.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "waba_messages",
          filter: `conversation_id=eq.${selectedConversation.id}`,
        },
        (payload) => {
          setMessages((prev) => [...prev, payload.new as Message]);
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "waba_messages",
          filter: `conversation_id=eq.${selectedConversation.id}`,
        },
        (payload) => {
          setMessages((prev) =>
            prev.map((m) => (m.id === (payload.new as Message).id ? (payload.new as Message) : m))
          );
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [selectedConversation]);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async () => {
    if (!newMessage.trim() || !selectedConversation || sending) return;

    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke("waba-send", {
        body: {
          action: "send_text",
          phone: selectedConversation.phone_number,
          text: newMessage,
          conversation_id: selectedConversation.id,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error.message || data.error);

      setNewMessage("");
    } catch (err: any) {
      toast.error("Erro ao enviar mensagem: " + err.message);
    } finally {
      setSending(false);
    }
  };

  const toggleAI = async (conversationId: string, enabled: boolean) => {
    const { error } = await supabase
      .from("waba_conversations")
      .update({ ai_enabled: enabled })
      .eq("id", conversationId);

    if (error) {
      toast.error("Erro ao alterar modo IA");
      return;
    }

    setConversations((prev) =>
      prev.map((c) => (c.id === conversationId ? { ...c, ai_enabled: enabled } : c))
    );
    if (selectedConversation?.id === conversationId) {
      setSelectedConversation((prev) => prev ? { ...prev, ai_enabled: enabled } : prev);
    }
    toast.success(enabled ? "IA ativada para esta conversa" : "IA desativada - modo manual");
  };

  const filteredConversations = conversations.filter((c) => {
    const term = searchTerm.toLowerCase();
    return (
      c.contact_name?.toLowerCase().includes(term) ||
      c.phone_number.includes(term)
    );
  });

  const getStatusIcon = (status: string | null) => {
    switch (status) {
      case "read":
        return <CheckCheck className="h-3 w-3 text-primary" />;
      case "delivered":
        return <CheckCheck className="h-3 w-3 text-muted-foreground" />;
      case "sent":
        return <Check className="h-3 w-3 text-muted-foreground" />;
      default:
        return null;
    }
  };

  const getSenderIcon = (senderType: string) => {
    switch (senderType) {
      case "ai":
        return <Bot className="h-3 w-3" />;
      case "agent":
        return <UserRound className="h-3 w-3" />;
      default:
        return null;
    }
  };

  if (loading) return null;

  return (
    <div className="h-screen flex flex-col bg-background">
      {/* Header */}
      <div className="border-b px-4 py-3 flex items-center gap-3 bg-card">
        <Button variant="ghost" size="icon" onClick={() => navigate("/dashboard")}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <MessageSquare className="h-5 w-5 text-primary" />
        <h1 className="text-lg font-semibold">WhatsApp Business</h1>
        <Badge variant="secondary" className="ml-auto">
          {conversations.length} conversas
        </Badge>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar - Conversation List */}
        <div className={`w-full md:w-80 lg:w-96 border-r flex flex-col ${selectedConversation ? "hidden md:flex" : "flex"}`}>
          <div className="p-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar conversa..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>
          <ScrollArea className="flex-1">
            {filteredConversations.length === 0 ? (
              <div className="p-6 text-center text-muted-foreground">
                <MessageSquare className="h-10 w-10 mx-auto mb-2 opacity-50" />
                <p className="text-sm">Nenhuma conversa ainda</p>
                <p className="text-xs mt-1">As conversas aparecerão aqui quando receberem mensagens via WhatsApp</p>
              </div>
            ) : (
              filteredConversations.map((conv) => (
                <div
                  key={conv.id}
                  onClick={() => setSelectedConversation(conv)}
                  className={`flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-accent/50 transition-colors ${
                    selectedConversation?.id === conv.id ? "bg-accent" : ""
                  }`}
                >
                  <Avatar className="h-10 w-10">
                    <AvatarFallback className="bg-primary/10 text-primary">
                      {(conv.contact_name || conv.phone_number).charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-baseline">
                      <p className="font-medium text-sm truncate">
                        {conv.contact_name || conv.phone_number}
                      </p>
                      <span className="text-xs text-muted-foreground whitespace-nowrap ml-2">
                        {format(new Date(conv.last_message_at), "HH:mm", { locale: ptBR })}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <p className="text-xs text-muted-foreground truncate flex-1">
                        {conv.phone_number}
                      </p>
                      {conv.ai_enabled && (
                        <Badge variant="outline" className="text-[10px] px-1 py-0 h-4 gap-0.5 border-primary/30 text-primary">
                          <Bot className="h-2.5 w-2.5" /> IA
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </ScrollArea>
        </div>

        {/* Chat Area */}
        <div className={`flex-1 flex flex-col ${!selectedConversation ? "hidden md:flex" : "flex"}`}>
          {selectedConversation ? (
            <>
              {/* Chat Header */}
              <div className="border-b px-4 py-3 flex items-center gap-3 bg-card">
                <Button
                  variant="ghost"
                  size="icon"
                  className="md:hidden"
                  onClick={() => setSelectedConversation(null)}
                >
                  <ArrowLeft className="h-5 w-5" />
                </Button>
                <Avatar className="h-9 w-9">
                  <AvatarFallback className="bg-primary/10 text-primary">
                    {(selectedConversation.contact_name || selectedConversation.phone_number)
                      .charAt(0)
                      .toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1">
                  <p className="font-medium text-sm">
                    {selectedConversation.contact_name || selectedConversation.phone_number}
                  </p>
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <Phone className="h-3 w-3" />
                    {selectedConversation.phone_number}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">
                    {selectedConversation.ai_enabled ? "IA Ativa" : "Manual"}
                  </span>
                  <Switch
                    checked={selectedConversation.ai_enabled}
                    onCheckedChange={(checked) => toggleAI(selectedConversation.id, checked)}
                  />
                  <Bot className={`h-4 w-4 ${selectedConversation.ai_enabled ? "text-primary" : "text-muted-foreground"}`} />
                </div>
              </div>

              {/* Messages */}
              <ScrollArea className="flex-1 p-4">
                <div className="space-y-3 max-w-3xl mx-auto">
                  {messages.map((msg) => (
                    <div
                      key={msg.id}
                      className={`flex ${msg.direction === "outbound" ? "justify-end" : "justify-start"}`}
                    >
                      <div
                        className={`max-w-[75%] rounded-2xl px-4 py-2 ${
                          msg.direction === "outbound"
                            ? msg.sender_type === "ai"
                              ? "bg-primary/80 text-primary-foreground rounded-br-md"
                              : "bg-primary text-primary-foreground rounded-br-md"
                            : "bg-muted rounded-bl-md"
                        }`}
                      >
                        {msg.direction === "outbound" && msg.sender_type !== "user" && (
                          <div className={`flex items-center gap-1 mb-1 ${
                            msg.sender_type === "ai" ? "text-primary-foreground/70" : "text-primary-foreground/70"
                          }`}>
                            {getSenderIcon(msg.sender_type)}
                            <span className="text-[10px] font-medium">
                              {msg.sender_type === "ai" ? "Assistente IA" : "Técnico"}
                            </span>
                          </div>
                        )}
                        <p className="text-sm whitespace-pre-wrap break-words">{msg.content}</p>
                        <div
                          className={`flex items-center gap-1 mt-1 ${
                            msg.direction === "outbound" ? "justify-end" : "justify-start"
                          }`}
                        >
                          <span className="text-[10px] opacity-70">
                            {format(new Date(msg.created_at), "HH:mm")}
                          </span>
                          {msg.direction === "outbound" && getStatusIcon(msg.status)}
                        </div>
                      </div>
                    </div>
                  ))}
                  <div ref={messagesEndRef} />
                </div>
              </ScrollArea>

              {/* Message Input */}
              <div className="border-t p-3 bg-card">
                {selectedConversation.ai_enabled && (
                  <div className="flex items-center gap-2 mb-2 px-2 max-w-3xl mx-auto">
                    <Bot className="h-3.5 w-3.5 text-primary" />
                    <span className="text-xs text-muted-foreground">
                      IA respondendo automaticamente • Envie uma mensagem para intervir manualmente
                    </span>
                  </div>
                )}
                <div className="flex gap-2 max-w-3xl mx-auto">
                  <Input
                    placeholder={selectedConversation.ai_enabled ? "Intervir manualmente..." : "Digite uma mensagem..."}
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
                    disabled={sending}
                    className="flex-1"
                  />
                  <Button onClick={handleSend} disabled={!newMessage.trim() || sending} size="icon">
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-muted-foreground">
              <div className="text-center">
                <div className="relative mx-auto w-16 h-16 mb-4">
                  <MessageSquare className="h-16 w-16 opacity-30" />
                  <Bot className="h-6 w-6 absolute -bottom-1 -right-1 text-primary" />
                </div>
                <p className="text-lg font-medium">WhatsApp Business + IA</p>
                <p className="text-sm mt-1">Selecione uma conversa para começar</p>
                <p className="text-xs mt-2 text-muted-foreground/60">
                  A IA responde automaticamente usando a base de conhecimento, cria chamados e consulta status
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default WABAChat;

import { useState, useRef, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Send, Bot, UserRound, Phone, CheckCheck, Check, Clock,
  MessageSquare, Info, Ticket, ArrowLeft, AlertTriangle, CheckCircle2,
  Sparkles, Headphones, Shield, Paperclip, Loader2, Smartphone
} from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import type { Conversation } from "./ConversationList";

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

interface ChatAreaProps {
  conversation: Conversation | null;
  onToggleInfo: () => void;
  showInfo: boolean;
  onBack?: () => void;
}

export function ChatArea({ conversation, onToggleInfo, showInfo, onBack }: ChatAreaProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!conversation) { setMessages([]); return; }

    const fetchMessages = async () => {
      const { data } = await supabase
        .from("waba_messages")
        .select("*")
        .eq("conversation_id", conversation.id)
        .order("created_at", { ascending: true });
      if (data) setMessages(data as Message[]);
    };

    fetchMessages();

    const channel = supabase
      .channel(`platform-msgs-${conversation.id}`)
      .on("postgres_changes", {
        event: "INSERT", schema: "public", table: "waba_messages",
        filter: `conversation_id=eq.${conversation.id}`,
      }, (payload) => setMessages((prev) => [...prev, payload.new as Message]))
      .on("postgres_changes", {
        event: "UPDATE", schema: "public", table: "waba_messages",
        filter: `conversation_id=eq.${conversation.id}`,
      }, (payload) => setMessages((prev) =>
        prev.map((m) => (m.id === (payload.new as Message).id ? (payload.new as Message) : m))
      ))
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [conversation?.id]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async () => {
    if (!newMessage.trim() || !conversation || sending) return;
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke("waba-send", {
        body: {
          action: "send_text",
          phone: conversation.phone_number,
          text: newMessage,
          conversation_id: conversation.id,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error.message || data.error);
      setNewMessage("");
      if (conversation.ai_enabled) {
        await supabase
          .from("waba_conversations")
          .update({ ai_enabled: false })
          .eq("id", conversation.id);
        toast.success("IA desativada — você assumiu o atendimento");
      }
    } catch (err: any) {
      toast.error("Erro ao enviar: " + err.message);
    } finally {
      setSending(false);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !conversation) return;
    if (file.size > 16 * 1024 * 1024) {
      toast.error("Arquivo muito grande (máx. 16MB)");
      e.target.value = "";
      return;
    }
    setUploading(true);
    try {
      const ext = file.name.split(".").pop() || "bin";
      const path = `${conversation.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("waba-attachments")
        .upload(path, file, { contentType: file.type, upsert: false });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from("waba-attachments").getPublicUrl(path);

      const mediaType = file.type.startsWith("image/")
        ? "image"
        : file.type.startsWith("video/")
        ? "video"
        : file.type.startsWith("audio/")
        ? "audio"
        : "document";

      const { error } = await supabase.functions.invoke("waba-send", {
        body: {
          action: "send_media",
          phone: conversation.phone_number,
          media_url: pub.publicUrl,
          filename: file.name,
          caption: newMessage || "",
          media_type: mediaType,
          conversation_id: conversation.id,
        },
      });
      if (error) throw error;
      setNewMessage("");
      if (conversation.ai_enabled) {
        await supabase
          .from("waba_conversations")
          .update({ ai_enabled: false })
          .eq("id", conversation.id);
        toast.success("Anexo enviado — IA desativada");
      } else {
        toast.success("Anexo enviado");
      }
    } catch (err: any) {
      toast.error("Erro ao enviar anexo: " + (err.message || ""));
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const toggleAI = async (enabled: boolean) => {
    if (!conversation) return;
    const { error } = await supabase
      .from("waba_conversations")
      .update({ ai_enabled: enabled })
      .eq("id", conversation.id);
    if (error) { toast.error("Erro ao alterar IA"); return; }
    toast.success(enabled ? "IA ativada" : "Modo manual ativado");
  };

  const resolveConversation = async () => {
    if (!conversation) return;
    const { error } = await supabase
      .from("waba_conversations")
      .update({ queue_status: "resolved", resolved_at: new Date().toISOString() })
      .eq("id", conversation.id);
    if (error) { toast.error("Erro ao resolver"); return; }
    toast.success("Conversa marcada como resolvida");
  };

  const getStatusIcon = (status: string | null) => {
    switch (status) {
      case "read": return <CheckCheck className="h-3 w-3 text-blue-400" />;
      case "delivered": return <CheckCheck className="h-3 w-3 text-white/50" />;
      case "sent": return <Check className="h-3 w-3 text-white/50" />;
      case "pending": return <Clock className="h-3 w-3 text-white/50" />;
      default: return null;
    }
  };

  // Empty state
  if (!conversation) {
    return (
      <div className="flex-1 flex items-center justify-center bg-muted/20 p-6">
        <div className="text-center space-y-4">
          <div className="relative mx-auto w-20 h-20">
            <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-primary/10 to-primary/5 flex items-center justify-center">
              <Headphones className="h-10 w-10 text-primary/40" />
            </div>
            <div className="absolute -bottom-1 -right-1 h-8 w-8 rounded-lg bg-primary flex items-center justify-center shadow-lg">
              <Sparkles className="h-4 w-4 text-primary-foreground" />
            </div>
          </div>
          <div>
            <p className="text-lg font-semibold text-foreground">Plataforma de Atendimento</p>
            <p className="text-sm text-muted-foreground mt-1">
              Selecione uma conversa para iniciar o atendimento
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground bg-muted/50 px-3 py-1.5 rounded-full">
              <Bot className="h-3.5 w-3.5 text-primary" /> IA Autônoma
            </div>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground bg-muted/50 px-3 py-1.5 rounded-full">
              <Ticket className="h-3.5 w-3.5 text-primary" /> Auto Tickets
            </div>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground bg-muted/50 px-3 py-1.5 rounded-full">
              <Shield className="h-3.5 w-3.5 text-primary" /> Híbrido
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Group messages by date
  const groupedMessages: { date: string; msgs: Message[] }[] = [];
  messages.forEach((msg) => {
    const dateKey = format(new Date(msg.created_at), "yyyy-MM-dd");
    const last = groupedMessages[groupedMessages.length - 1];
    if (last?.date === dateKey) {
      last.msgs.push(msg);
    } else {
      groupedMessages.push({ date: dateKey, msgs: [msg] });
    }
  });

  return (
    <div className="flex-1 flex flex-col min-w-0" translate="no">
      {/* Chat Header - Professional Infradesk style */}
      <div className="h-14 border-b px-3 sm:px-4 flex items-center gap-3 bg-card shrink-0">
        {onBack && (
          <Button variant="ghost" size="icon" className="h-8 w-8 md:hidden shrink-0" onClick={onBack}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
        )}
        <Avatar className="h-9 w-9 shrink-0">
          {conversation.profile_photo_url && (
            <AvatarImage src={conversation.profile_photo_url} alt={conversation.contact_name || conversation.phone_number} />
          )}
          <AvatarFallback className="bg-gradient-to-br from-primary/20 to-primary/5 text-primary text-sm font-semibold">
            {(conversation.contact_name || conversation.phone_number).slice(0, 2).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="font-semibold text-sm truncate">
              {conversation.contact_name || conversation.phone_number}
            </p>
            {conversation.queue_status === "resolved" && (
              <Badge className="text-[9px] px-1.5 py-0 h-4 bg-emerald-500/10 text-emerald-600 border-emerald-500/30">
                RESOLVIDO
              </Badge>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground flex items-center gap-1 truncate">
            <Phone className="h-2.5 w-2.5 shrink-0" />
            <span className="truncate">{conversation.phone_number}</span>
            <span className="mx-1 text-border">•</span>
            <span className="text-emerald-600 font-medium">WhatsApp</span>
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {conversation.queue_status !== "resolved" && (
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs gap-1.5 px-3 border-emerald-200 text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800"
              onClick={resolveConversation}
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Resolver</span>
            </Button>
          )}
          {/* AI Toggle */}
          <div className="flex items-center gap-2 bg-muted/50 rounded-lg px-2.5 py-1.5">
            <Switch
              checked={conversation.ai_enabled}
              onCheckedChange={toggleAI}
              className="scale-90"
            />
            <div className="flex items-center gap-1">
              <Bot className={`h-3.5 w-3.5 ${conversation.ai_enabled ? "text-primary" : "text-muted-foreground"}`} />
              <span className={`text-[11px] font-medium hidden sm:inline ${conversation.ai_enabled ? "text-primary" : "text-muted-foreground"}`}>
                {conversation.ai_enabled ? "IA ON" : "Manual"}
              </span>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onToggleInfo}
            className={`h-8 w-8 ${showInfo ? "bg-accent text-accent-foreground" : ""}`}
          >
            <Info className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1 bg-[hsl(var(--muted)/0.3)]">
        <div className="p-3 sm:p-4 space-y-1 max-w-3xl mx-auto">
          {groupedMessages.map((group) => (
            <div key={group.date}>
              <div className="flex justify-center my-3">
                <span className="text-[10px] font-medium text-muted-foreground bg-card border rounded-full px-3 py-1 shadow-sm">
                  {format(new Date(group.date), "dd 'de' MMMM", { locale: undefined })}
                </span>
              </div>
              <div className="space-y-1.5">
                {group.msgs.map((msg) => {
                  // System events
                  if (msg.message_type === "system" || msg.sender_type === "system") {
                    const isEscalation = msg.content?.includes("Escalado");
                    const isResolved = msg.content?.includes("resolvida");
                    return (
                      <div key={msg.id} className="flex justify-center my-2">
                        <div className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs max-w-[90%] shadow-sm ${
                          isEscalation
                            ? "bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-800"
                            : isResolved
                            ? "bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-800"
                            : "bg-card text-muted-foreground border"
                        }`}>
                          {isEscalation ? <AlertTriangle className="h-3 w-3 shrink-0" /> : isResolved ? <CheckCircle2 className="h-3 w-3 shrink-0" /> : <Info className="h-3 w-3 shrink-0" />}
                          <span className="truncate">{msg.content}</span>
                        </div>
                      </div>
                    );
                  }

                  const isOutbound = msg.direction === "outbound";
                  const isAI = msg.sender_type === "ai";
                  const isPhone = msg.sender_type === "phone";

                  return (
                    <div key={msg.id} className={`flex ${isOutbound ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-[85%] sm:max-w-[75%] rounded-2xl px-3.5 py-2.5 shadow-sm ${
                        isOutbound
                          ? isAI
                            ? "bg-gradient-to-br from-primary/90 to-primary/80 text-primary-foreground rounded-br-sm"
                            : "bg-primary text-primary-foreground rounded-br-sm"
                          : "bg-card rounded-bl-sm border"
                      }`}>
                        {isOutbound && msg.sender_type !== "user" && (
                          <div className="flex items-center gap-1 mb-1 text-white/70">
                            {isAI ? <Sparkles className="h-3 w-3" /> : isPhone ? <Smartphone className="h-3 w-3" /> : <UserRound className="h-3 w-3" />}
                            <span className="text-[10px] font-semibold tracking-wide">
                              {isAI ? "ASSISTENTE IA" : isPhone ? "VIA CELULAR" : "TÉCNICO"}
                            </span>
                          </div>
                        )}
                        {/* Media rendering */}
                        {msg.media_url && msg.message_type === "image" && (
                          <a href={msg.media_url} target="_blank" rel="noopener noreferrer" className="block mb-1.5">
                            <img
                              src={msg.media_url}
                              alt="Imagem"
                              className="rounded-lg max-w-full max-h-64 object-cover cursor-pointer hover:opacity-90 transition-opacity"
                              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                            />
                          </a>
                        )}
                        {msg.media_url && msg.message_type === "video" && (
                          <video
                            src={msg.media_url}
                            controls
                            className="rounded-lg max-w-full max-h-64 mb-1.5"
                          />
                        )}
                        {msg.media_url && msg.message_type === "audio" && (
                          <audio src={msg.media_url} controls className="max-w-full mb-1.5" />
                        )}
                        {msg.media_url && msg.message_type === "document" && (
                          <a
                            href={msg.media_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={`flex items-center gap-2 mb-1.5 px-3 py-2 rounded-lg text-xs font-medium ${
                              isOutbound ? "bg-white/10 text-white hover:bg-white/20" : "bg-muted hover:bg-muted/80"
                            } transition-colors`}
                          >
                            📎 Documento anexo
                          </a>
                        )}
                        {msg.content && msg.content !== "[Mensagem sem texto]" && (
                          <p className="text-sm whitespace-pre-wrap break-words leading-relaxed">{msg.content}</p>
                        )}
                        <div className={`flex items-center gap-1 mt-1 ${isOutbound ? "justify-end" : "justify-start"}`}>
                          <span className={`text-[10px] ${isOutbound ? "text-white/50" : "text-muted-foreground"}`}>
                            {format(new Date(msg.created_at), "HH:mm")}
                          </span>
                          {isOutbound && getStatusIcon(msg.status)}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>
      </ScrollArea>

      {/* Input - Professional bottom bar */}
      <div className="border-t bg-card shrink-0 pb-[env(safe-area-inset-bottom,4px)]">
        {conversation.ai_enabled && (
          <div className="flex items-center gap-2 px-4 py-1.5 bg-primary/5 border-b border-primary/10">
            <Sparkles className="h-3.5 w-3.5 text-primary shrink-0" />
            <span className="text-[11px] text-primary font-medium truncate">
              IA respondendo automaticamente • Envie uma mensagem para intervir
            </span>
          </div>
        )}
        <div className="flex gap-2 p-3 max-w-3xl mx-auto">
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            onChange={handleFileSelect}
            accept="image/*,video/*,audio/*,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip,.rar"
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-10 w-10 shrink-0 rounded-lg"
            onClick={() => fileInputRef.current?.click()}
            disabled={sending || uploading}
            title="Anexar arquivo"
          >
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}
          </Button>
          <Input
            placeholder={conversation.ai_enabled ? "Intervir manualmente..." : "Digite uma mensagem ou legenda..."}
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
            disabled={sending || uploading}
            className="flex-1 h-10 bg-muted/50 border-0 focus-visible:ring-1"
          />
          <Button
            onClick={handleSend}
            disabled={!newMessage.trim() || sending || uploading}
            size="icon"
            className="h-10 w-10 shrink-0 rounded-lg"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

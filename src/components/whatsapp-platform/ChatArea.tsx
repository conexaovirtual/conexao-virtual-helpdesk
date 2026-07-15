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
      {/* Chat Header - WhatsApp style */}
      <div className="h-14 px-3 sm:px-4 flex items-center gap-3 bg-[#008069] dark:bg-[#202c33] shrink-0">
        {onBack && (
          <Button variant="ghost" size="icon" className="h-8 w-8 md:hidden shrink-0 text-white hover:bg-white/10 hover:text-white" onClick={onBack}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
        )}
        <Avatar className="h-9 w-9 shrink-0">
          {conversation.profile_photo_url && (
            <AvatarImage src={conversation.profile_photo_url} alt={conversation.contact_name || conversation.phone_number} />
          )}
          <AvatarFallback className="bg-white/20 text-white text-sm font-semibold">
            {(conversation.contact_name || conversation.phone_number).slice(0, 2).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="font-semibold text-sm truncate text-white">
              {conversation.contact_name || conversation.phone_number}
            </p>
            {conversation.queue_status === "resolved" && (
              <Badge className="text-[9px] px-1.5 py-0 h-4 bg-white/15 text-white border-white/20">
                RESOLVIDO
              </Badge>
            )}
          </div>
          <p className="text-[11px] text-white/70 flex items-center gap-1 truncate">
            <Phone className="h-2.5 w-2.5 shrink-0" />
            <span className="truncate">{conversation.phone_number}</span>
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {conversation.queue_status !== "resolved" && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-xs gap-1.5 px-3 text-white hover:bg-white/10 hover:text-white"
              onClick={resolveConversation}
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Resolver</span>
            </Button>
          )}
          {/* AI Toggle */}
          <div className="flex items-center gap-2 bg-white/10 rounded-lg px-2.5 py-1.5">
            <Switch
              checked={conversation.ai_enabled}
              onCheckedChange={toggleAI}
              className="scale-90"
            />
            <div className="flex items-center gap-1">
              <Bot className="h-3.5 w-3.5 text-white" />
              <span className="text-[11px] font-medium hidden sm:inline text-white">
                {conversation.ai_enabled ? "IA ON" : "Manual"}
              </span>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onToggleInfo}
            className={`h-8 w-8 text-white hover:bg-white/10 hover:text-white ${showInfo ? "bg-white/15" : ""}`}
          >
            <Info className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Messages - WhatsApp wallpaper */}
      <ScrollArea
        className="flex-1 bg-[#e5ddd5] dark:bg-[#0b141a]"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100' viewBox='0 0 100 100'%3E%3Cg fill='%23000000' fill-opacity='0.045'%3E%3Cpath d='M20 10c3 4 3 8 0 12-3-4-3-8 0-12zm40 5c2 3 2 6 0 9-2-3-2-6 0-9zM10 45c3 3 3 7 0 10-3-3-3-7 0-10zm60-5c3 4 3 8 0 12-3-4-3-8 0-12zM35 60c2 3 2 6 0 9-2-3-2-6 0-9zm45 15c3 3 3 7 0 10-3-3-3-7 0-10zM15 80c2 3 2 6 0 9-2-3-2-6 0-9zm70-55c2 3 2 6 0 9-2-3-2-6 0-9z'/%3E%3C/g%3E%3C/svg%3E\")",
        }}
      >
        <div className="p-3 sm:p-4 space-y-1 max-w-3xl mx-auto">
          {groupedMessages.map((group) => (
            <div key={group.date}>
              <div className="flex justify-center my-3">
                <span className="text-[11px] font-medium text-[#54656f] dark:text-[#8696a0] bg-white dark:bg-[#182229] rounded-lg px-3 py-1 shadow-sm">
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
                        <div className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs max-w-[90%] shadow-sm ${
                          isEscalation
                            ? "bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-800"
                            : isResolved
                            ? "bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-800"
                            : "bg-white dark:bg-[#182229] text-[#54656f] dark:text-[#8696a0]"
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
                      <div
                        className={`relative max-w-[85%] sm:max-w-[65%] rounded-lg px-2.5 pt-1.5 pb-1.5 shadow-sm ${
                          isOutbound
                            ? "bg-[#d9fdd3] dark:bg-[#005c4b] rounded-tr-none"
                            : "bg-white dark:bg-[#202c33] rounded-tl-none"
                        }`}
                      >
                        {/* Bubble tail */}
                        <span
                          className={`absolute top-0 w-0 h-0 border-[8px] border-transparent ${
                            isOutbound
                              ? "right-[-7px] border-l-[#d9fdd3] dark:border-l-[#005c4b] border-t-[#d9fdd3] dark:border-t-[#005c4b]"
                              : "left-[-7px] border-r-white dark:border-r-[#202c33] border-t-white dark:border-t-[#202c33]"
                          }`}
                        />
                        {isOutbound && msg.sender_type !== "user" && (
                          <div className="flex items-center gap-1 mb-1 text-[#008069] dark:text-[#00a884]">
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
                              className="rounded-md max-w-full max-h-64 object-cover cursor-pointer hover:opacity-90 transition-opacity"
                              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                            />
                          </a>
                        )}
                        {msg.media_url && msg.message_type === "video" && (
                          <video
                            src={msg.media_url}
                            controls
                            className="rounded-md max-w-full max-h-64 mb-1.5"
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
                            className="flex items-center gap-2 mb-1.5 px-3 py-2 rounded-md text-xs font-medium bg-black/5 hover:bg-black/10 dark:bg-white/10 dark:hover:bg-white/20 text-[#111b21] dark:text-white transition-colors"
                          >
                            📎 Documento anexo
                          </a>
                        )}
                        {msg.content && msg.content !== "[Mensagem sem texto]" && (
                          <p className="text-sm whitespace-pre-wrap break-words leading-relaxed text-[#111b21] dark:text-[#e9edef] pr-10">{msg.content}</p>
                        )}
                        <div className="flex items-center gap-1 mt-0.5 justify-end float-right ml-2 -mb-1">
                          <span className="text-[10px] text-[#667781] dark:text-[#8696a0]">
                            {format(new Date(msg.created_at), "HH:mm")}
                          </span>
                          {isOutbound && getStatusIcon(msg.status)}
                        </div>
                        <div className="clear-both" />
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

      {/* Input - WhatsApp style bottom bar */}
      <div className="bg-[#f0f2f5] dark:bg-[#202c33] shrink-0 pb-[env(safe-area-inset-bottom,4px)]">
        {conversation.ai_enabled && (
          <div className="flex items-center gap-2 px-4 py-1.5 bg-[#d9fdd3]/60 dark:bg-[#005c4b]/30 border-b border-[#008069]/10">
            <Sparkles className="h-3.5 w-3.5 text-[#008069] dark:text-[#00a884] shrink-0" />
            <span className="text-[11px] text-[#008069] dark:text-[#00a884] font-medium truncate">
              IA respondendo automaticamente • Envie uma mensagem para intervir
            </span>
          </div>
        )}
        <div className="flex items-end gap-2 p-2 sm:p-3 max-w-3xl mx-auto">
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
            className="h-10 w-10 shrink-0 rounded-full text-[#54656f] dark:text-[#aebac1] hover:bg-black/5 dark:hover:bg-white/10"
            onClick={() => fileInputRef.current?.click()}
            disabled={sending || uploading}
            title="Anexar arquivo"
          >
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}
          </Button>
          <Input
            placeholder={conversation.ai_enabled ? "Intervir manualmente..." : "Digite uma mensagem"}
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
            disabled={sending || uploading}
            className="flex-1 h-10 bg-white dark:bg-[#2a3942] border-0 rounded-full focus-visible:ring-0 focus-visible:ring-offset-0 shadow-sm"
          />
          <Button
            onClick={handleSend}
            disabled={!newMessage.trim() || sending || uploading}
            size="icon"
            className="h-10 w-10 shrink-0 rounded-full bg-[#008069] hover:bg-[#008069]/90 dark:bg-[#00a884] dark:hover:bg-[#00a884]/90 text-white"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

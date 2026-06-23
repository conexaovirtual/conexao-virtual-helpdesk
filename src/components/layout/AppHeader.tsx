import { useAuth } from "@/hooks/useAuth";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { Bell, User, LogOut } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function AppHeader() {
  const { profile, signOut } = useAuth();
  const navigate = useNavigate();

  const { data: newTicketsCount = 0 } = useQuery({
    queryKey: ["all-new-tickets-count"],
    queryFn: async () => {
      const { count } = await supabase.from("tickets").select("*", { count: "exact", head: true }).eq("status", "novo");
      return count || 0;
    },
    enabled: !!profile && (profile.roles?.includes("admin_provedor") || profile.roles?.includes("tecnico")),
    refetchInterval: 30000,
  });

  if (!profile) return null;

  return (
    <header className="sticky top-0 z-50 min-h-12 flex items-center border-b bg-card/80 backdrop-blur supports-[backdrop-filter]:bg-card/60 gap-3 pt-[env(safe-area-inset-top)] pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))]">
      <SidebarTrigger />

      <div className="flex-1" />

      {(profile.roles?.includes("admin_provedor") || profile.roles?.includes("tecnico")) && (
        <Button variant="ghost" size="icon" className="relative h-8 w-8" onClick={() => navigate("/tickets")}>
          <Bell className="h-4 w-4" />
          {newTicketsCount > 0 && (
            <Badge
              variant="destructive"
              className="absolute -top-0.5 -right-0.5 h-4 min-w-4 px-0.5 text-[10px] flex items-center justify-center"
            >
              {newTicketsCount > 9 ? "9+" : newTicketsCount}
            </Badge>
          )}
        </Button>
      )}

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="gap-2 h-8 px-2">
            <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center">
              <User className="h-3.5 w-3.5 text-primary" />
            </div>
            <span className="hidden sm:inline text-sm max-w-[120px] truncate">{profile.nome}</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuLabel>
            <p className="font-medium text-sm">{profile.nome}</p>
            <p className="text-xs text-muted-foreground capitalize">
              {profile.roles?.[0]?.replace(/_/g, " ") || "Usuário"}
            </p>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => navigate("/profile/settings")}>
            <User className="h-4 w-4 mr-2" />
            Configurações
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={signOut} className="text-destructive focus:text-destructive">
            <LogOut className="h-4 w-4 mr-2" />
            Sair
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}

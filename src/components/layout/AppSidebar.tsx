import { useAuth } from "@/hooks/useAuth";
import { useLocation } from "react-router-dom";
import { NavLink } from "@/components/NavLink";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  LayoutDashboard,
  Activity,
  Ticket,
  ClipboardList,
  Building2,
  FileBarChart,
  FileText,
  Package,
  PackageSearch,
  BookOpen,
  MessageSquare,
  MessageCircle,
  BarChart3,
  Wrench,
  CalendarDays,
  LogOut,
  User,
  FolderKanban,
  Wallet,
  FileSignature,
  Network,
  Wifi,
  Route,
  Map,
  Gauge,
  CalendarCheck,
  Smile,
  Tags,
  Hammer,
  Receipt,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function AppSidebar() {
  const { profile, signOut } = useAuth();
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();

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

  const isAdmin = profile.roles?.includes("admin_provedor");
  const isTech = profile.roles?.includes("tecnico");
  const isAdminOrTech = isAdmin || isTech;
  const isGestor = profile.roles?.includes("gestor_cliente");

  const mainItems = [
    { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard, show: true },
    { title: "Painel Operacional", url: "/operational", icon: Activity, show: isAdminOrTech },
    { title: "Agenda", url: "/agenda", icon: CalendarDays, show: true },
    { title: "Meu Dia", url: "/meu-dia", icon: CalendarCheck, show: isAdminOrTech },
    { title: "Chamados", url: "/tickets", icon: Ticket, show: isAdminOrTech, badge: newTicketsCount },
    { title: "Atendimentos", url: "/daily-services", icon: ClipboardList, show: isAdminOrTech },
    { title: "Empresas", url: "/companies", icon: Building2, show: isAdminOrTech },
    { title: "Rotas", url: "/route-planner", icon: Route, show: isAdminOrTech },
    { title: "Mapa", url: "/company-map", icon: Map, show: isAdminOrTech },
    { title: "Deslocamento", url: "/deslocamento", icon: Gauge, show: isAdminOrTech },
    { title: "Ordens de Serviço", url: "/reports?tab=service-orders", icon: FileText, show: true },
  ];

  const resourceItems = [
    { title: "Ativos", url: "/assets", icon: Package, show: true },
    { title: "Inventário", url: "/inventory", icon: PackageSearch, show: true },
    { title: "Produtos", url: "/produtos", icon: Tags, show: isAdminOrTech },
    { title: "Serviços", url: "/servicos", icon: Hammer, show: isAdminOrTech },
    { title: "Propostas", url: "/propostas", icon: Receipt, show: isAdminOrTech || isGestor },
    { title: "Base de Conhecimento", url: "/knowledge-base", icon: BookOpen, show: true },
    { title: "Chat Interno", url: "/chat", icon: MessageCircle, show: true },
    { title: "Projetos", url: "/projects", icon: FolderKanban, show: true },
    { title: "Centro de Custo", url: "/cost-center", icon: Wallet, show: isAdmin || isGestor },
    { title: "Contratos", url: "/contracts", icon: FileSignature, show: isAdmin || isGestor },
    { title: "CMDB", url: "/cmdb", icon: Network, show: isAdminOrTech },
    { title: "Monitor de Rede", url: "/network-monitor", icon: Wifi, show: isAdminOrTech },
  ];

  const adminItems = [
    { title: "Relatórios", url: "/reports", icon: FileBarChart, show: isAdminOrTech || isGestor },
    { title: "Analytics", url: "/analytics", icon: BarChart3, show: isAdmin },
    { title: "Satisfação", url: "/csat", icon: Smile, show: isAdminOrTech },
    { title: "Técnicos", url: "/technicians", icon: Wrench, show: isAdmin },
    { title: "WhatsApp", url: "/whatsapp-platform", icon: MessageSquare, show: isAdminOrTech },
  ];

  const renderItems = (items: typeof mainItems) =>
    items
      .filter((i) => i.show)
      .map((item) => (
        <SidebarMenuItem key={item.title}>
          <SidebarMenuButton asChild>
            <NavLink
              to={item.url}
              end={item.url === "/dashboard"}
              className="flex items-center gap-3 rounded-md px-3 py-2 text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              activeClassName="bg-sidebar-accent text-sidebar-primary font-medium"
            >
              <item.icon className="h-5 w-5 shrink-0" />
              {!collapsed && <span className="flex-1 truncate">{item.title}</span>}
              {!collapsed && "badge" in item && (item as any).badge > 0 && (
                <Badge variant="destructive" className="ml-auto h-5 min-w-5 px-1 text-xs">
                  {(item as any).badge}
                </Badge>
              )}
            </NavLink>
          </SidebarMenuButton>
        </SidebarMenuItem>
      ));

  return (
    <Sidebar collapsible="icon" className="border-r-0">
      <SidebarHeader className="p-4">
        <div className="flex items-center gap-3">
          <img
            src="/logo-conexaovirtual.png"
            alt="Conexão Virtual"
            className="h-8 w-8 shrink-0 rounded object-contain"
          />
          {!collapsed && (
            <div className="flex flex-col">
              <span className="font-semibold text-sm text-sidebar-foreground leading-tight">Conexão Virtual</span>
              <span className="text-xs text-sidebar-foreground/60">Help Desk TI</span>
            </div>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent className="px-2">
        <SidebarGroup>
          {!collapsed && (
            <SidebarGroupLabel className="text-sidebar-foreground/50 text-xs uppercase tracking-wider">
              Principal
            </SidebarGroupLabel>
          )}
          <SidebarGroupContent>
            <SidebarMenu>{renderItems(mainItems)}</SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          {!collapsed && (
            <SidebarGroupLabel className="text-sidebar-foreground/50 text-xs uppercase tracking-wider">
              Recursos
            </SidebarGroupLabel>
          )}
          <SidebarGroupContent>
            <SidebarMenu>{renderItems(resourceItems)}</SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {adminItems.some((i) => i.show) && (
          <SidebarGroup>
            {!collapsed && (
              <SidebarGroupLabel className="text-sidebar-foreground/50 text-xs uppercase tracking-wider">
                Administração
              </SidebarGroupLabel>
            )}
            <SidebarGroupContent>
              <SidebarMenu>{renderItems(adminItems)}</SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      <SidebarFooter className="p-3 border-t border-sidebar-border">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              className="w-full justify-start gap-3 text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground h-auto py-2"
            >
              <User className="h-5 w-5 shrink-0" />
              {!collapsed && (
                <div className="flex flex-col items-start text-left min-w-0">
                  <span className="text-sm font-medium truncate w-full">{profile.nome}</span>
                  <span className="text-xs text-sidebar-foreground/50 capitalize truncate w-full">
                    {profile.roles?.[0]?.replace(/_/g, " ") || "Usuário"}
                  </span>
                </div>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="start" className="w-56">
            <DropdownMenuLabel>
              <p className="font-medium">{profile.nome}</p>
              <p className="text-xs text-muted-foreground capitalize">
                {profile.roles?.[0]?.replace(/_/g, " ") || "Usuário"}
              </p>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={signOut}>
              <LogOut className="h-4 w-4 mr-2" />
              Sair
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarFooter>
    </Sidebar>
  );
}

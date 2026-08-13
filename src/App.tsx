import { Suspense } from 'react';
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Skeleton } from "@/components/ui/skeleton";
import { AuthProvider } from "@/hooks/useAuth";
import { lazyWithRetry } from "@/lib/lazyWithRetry";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import { AppLayout } from "./components/layout/AppLayout";
import { StandaloneWhatsApp } from "./components/layout/StandaloneWhatsApp";

// Lazy load páginas pesadas (com retry automático em caso de falha de chunk após deploy)
const Dashboard = lazyWithRetry(() => import("./pages/Dashboard"));
const Tickets = lazyWithRetry(() => import("./pages/Tickets"));
const TicketDetail = lazyWithRetry(() => import("./pages/TicketDetail"));
const Companies = lazyWithRetry(() => import("./pages/Companies"));
const CompanyDetail = lazyWithRetry(() => import("./pages/CompanyDetail"));
const Reports = lazyWithRetry(() => import("./pages/Reports"));
const Inventory = lazyWithRetry(() => import("./pages/Inventory"));
const Assets = lazyWithRetry(() => import("./pages/Assets"));
const Technicians = lazyWithRetry(() => import("./pages/Technicians"));
const DailyServices = lazyWithRetry(() => import("./pages/DailyServices"));
const ProfileSettings = lazyWithRetry(() => import("./pages/ProfileSettings"));
const ServiceOrderPage = lazyWithRetry(() => import("./pages/ServiceOrderPage"));
const NotFound = lazyWithRetry(() => import("./pages/NotFound"));
const PublicTicket = lazyWithRetry(() => import("./pages/PublicTicket"));
const Analytics = lazyWithRetry(() => import("./pages/Analytics"));
const KnowledgeBase = lazyWithRetry(() => import("./pages/KnowledgeBase"));
const WABAChat = lazyWithRetry(() => import("./pages/WABAChat"));
const AISupportChat = lazyWithRetry(() => import("./pages/AISupportChat"));
const WhatsAppPlatform = lazyWithRetry(() => import("./pages/WhatsAppPlatform"));
const Agenda = lazyWithRetry(() => import("./pages/Agenda"));
const Chat = lazyWithRetry(() => import("./pages/Chat"));
const Projects = lazyWithRetry(() => import("./pages/Projects"));
const CostCenter = lazyWithRetry(() => import("./pages/CostCenter"));
const Contracts = lazyWithRetry(() => import("./pages/Contracts"));
const CMDB = lazyWithRetry(() => import("./pages/CMDB"));
const NetworkMonitor = lazyWithRetry(() => import("./pages/NetworkMonitor"));
const OperationalDashboard = lazyWithRetry(() => import("./pages/OperationalDashboard"));
const RoutePlanner = lazyWithRetry(() => import("./pages/RoutePlanner"));
const Deslocamento = lazyWithRetry(() => import("./pages/Deslocamento"));
const MeuDia = lazyWithRetry(() => import("./pages/MeuDia"));
const CompanyMap = lazyWithRetry(() => import("./pages/CompanyMap"));
const OrcamentoPrint = lazyWithRetry(() => import("./pages/OrcamentoPrint"));
const CsatDashboard = lazyWithRetry(() => import("./pages/CsatDashboard"));
const Produtos = lazyWithRetry(() => import("./pages/Produtos"));
const Servicos = lazyWithRetry(() => import("./pages/Servicos"));
const Propostas = lazyWithRetry(() => import("./pages/Propostas"));
const AgentProposals = lazyWithRetry(() => import("./pages/AgentProposals"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,       // dados válidos por 5 min
      gcTime: 15 * 60 * 1000,          // mantém em memória 15 min
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
      retry: (failureCount, error: any) => {
        // não tenta novamente em erros 4xx (auth, not found)
        if (error?.status >= 400 && error?.status < 500) return false;
        return failureCount < 2;
      },
      networkMode: 'offlineFirst',
    },
    mutations: {
      retry: 0,
    },
  },
});

const LoadingFallback = () => (
  <div className="min-h-screen bg-background flex items-center justify-center">
    <Skeleton className="h-96 w-full max-w-4xl" />
  </div>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Suspense fallback={<LoadingFallback />}>
            <Routes>
            {/* Public routes */}
            <Route path="/" element={<Index />} />
            <Route path="/auth" element={<Auth />} />
            <Route path="/public/ticket" element={<PublicTicket />} />
            <Route path="/orcamento/:id/print" element={<OrcamentoPrint />} />

            {/* Standalone WhatsApp app window (no sidebar/header chrome) — for PWA/Dock install */}
            <Route path="/app-whatsapp" element={<StandaloneWhatsApp />} />

            {/* Authenticated routes with sidebar */}
            <Route element={<AppLayout />}>
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/tickets" element={<Tickets />} />
              <Route path="/tickets/:id" element={<TicketDetail />} />
              <Route path="/assets" element={<Assets />} />
              <Route path="/inventory" element={<Inventory />} />
              <Route path="/companies" element={<Companies />} />
              <Route path="/companies/:id" element={<CompanyDetail />} />
              <Route path="/technicians" element={<Technicians />} />
              <Route path="/reports" element={<Reports />} />
              <Route path="/daily-services" element={<DailyServices />} />
              <Route path="/service-orders/new" element={<ServiceOrderPage />} />
              <Route path="/profile/settings" element={<ProfileSettings />} />
              <Route path="/analytics" element={<Analytics />} />
              <Route path="/csat" element={<CsatDashboard />} />
              <Route path="/produtos" element={<Produtos />} />
              <Route path="/servicos" element={<Servicos />} />
              <Route path="/propostas" element={<Propostas />} />
              <Route path="/agent-proposals" element={<AgentProposals />} />
              <Route path="/knowledge-base" element={<KnowledgeBase />} />
              <Route path="/waba-chat" element={<WABAChat />} />
              <Route path="/ai-support" element={<AISupportChat />} />
              <Route path="/whatsapp-platform" element={<WhatsAppPlatform />} />
              <Route path="/agenda" element={<Agenda />} />
              <Route path="/chat" element={<Chat />} />
              <Route path="/projects" element={<Projects />} />
              <Route path="/cost-center" element={<CostCenter />} />
              <Route path="/contracts" element={<Contracts />} />
              <Route path="/cmdb" element={<CMDB />} />
              <Route path="/network-monitor" element={<NetworkMonitor />} />
              <Route path="/operational" element={<OperationalDashboard />} />
              <Route path="/route-planner" element={<RoutePlanner />} />
              <Route path="/deslocamento" element={<Deslocamento />} />
              <Route path="/meu-dia" element={<MeuDia />} />
              <Route path="/company-map" element={<CompanyMap />} />
            </Route>

            <Route path="*" element={<NotFound />} />
          </Routes>
          </Suspense>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;

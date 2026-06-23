import { useEffect } from "react";
import { useNavigate, Outlet } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "./AppSidebar";
import { AppHeader } from "./AppHeader";
import { Skeleton } from "@/components/ui/skeleton";
import { useTicketAutomation } from "@/hooks/useTicketAutomation";

export function AppLayout() {
  const { profile, loading } = useAuth();
  const navigate = useNavigate();
  useTicketAutomation();

  useEffect(() => {
    if (!loading && !profile) {
      navigate("/auth");
    }
  }, [loading, profile, navigate]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Skeleton className="h-96 w-full max-w-4xl" />
      </div>
    );
  }

  if (!profile) return null;

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <AppHeader />
          <main className="flex-1 pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] pb-[env(safe-area-inset-bottom)]">
            <Outlet />
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}

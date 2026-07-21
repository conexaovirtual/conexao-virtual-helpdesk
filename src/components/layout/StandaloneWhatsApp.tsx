import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Skeleton } from "@/components/ui/skeleton";
import { lazyWithRetry } from "@/lib/lazyWithRetry";

const WhatsAppPlatform = lazyWithRetry(() => import("@/pages/WhatsAppPlatform"));

// Renders the WhatsApp platform with no sidebar/header chrome around it,
// so it can be installed (Add to Dock / PWA) as its own standalone window.
export function StandaloneWhatsApp() {
  const { profile, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !profile) {
      navigate("/auth?redirect=/app-whatsapp");
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

  return <WhatsAppPlatform />;
}

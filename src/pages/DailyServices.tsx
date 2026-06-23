import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DailyServicesReport } from "@/components/reports/DailyServicesReport";
import { DailyServiceRecordDialog } from "@/components/daily-records/DailyServiceRecordDialog";
import { DailyServiceRecordList } from "@/components/daily-records/DailyServiceRecordList";
import { DailyServiceCalendar } from "@/components/daily-records/DailyServiceCalendar";
import { Plus, BarChart3, List, Calendar, ClipboardList } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";

export default function DailyServices() {
  const { profile, loading } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [recordDialogOpen, setRecordDialogOpen] = useState(false);
  const [editingRecordId, setEditingRecordId] = useState<string | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [activeTab, setActiveTab] = useState("atendimentos");
  const [mountedTabs, setMountedTabs] = useState(new Set(["atendimentos"]));

  useEffect(() => {
    const recordId = searchParams.get('recordId');
    if (recordId) {
      setEditingRecordId(recordId);
      window.history.replaceState({}, '', '/daily-services');
    }
  }, [searchParams]);

  useEffect(() => {
    if (!loading && !profile) navigate("/auth");
  }, [profile, loading, navigate]);

  if (loading || !profile) return null;

  return (
    <div className="bg-background min-h-screen">
      <PageHeader
        icon={ClipboardList}
        title="Relatório de Atendimentos"
        subtitle="Visualize métricas e estatísticas dos atendimentos realizados"
        actions={
          <Button
            onClick={() => setRecordDialogOpen(true)}
            size="sm"
            className="h-8 text-xs gap-1 bg-white/10 hover:bg-white/20 text-white border-0"
          >
            <Plus className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Novo Atendimento</span>
          </Button>
        }
      />

      <main className="container mx-auto px-4 py-4">
        <Tabs value={activeTab} onValueChange={(v) => {
          setActiveTab(v);
          setMountedTabs(prev => new Set([...prev, v]));
        }} className="w-full">
          <TabsList>
            <TabsTrigger value="atendimentos">
              <List className="h-4 w-4 mr-2" />
              Atendimentos
            </TabsTrigger>
            <TabsTrigger value="agenda">
              <Calendar className="h-4 w-4 mr-2" />
              Agenda
            </TabsTrigger>
            <TabsTrigger value="relatorios">
              <BarChart3 className="h-4 w-4 mr-2" />
              Relatórios
            </TabsTrigger>
          </TabsList>
          <div className={activeTab === "atendimentos" ? "mt-4" : "hidden"}>
            {mountedTabs.has("atendimentos") && (
              <DailyServiceRecordList onUpdate={() => setRefreshTrigger(prev => prev + 1)} />
            )}
          </div>
          <div className={activeTab === "agenda" ? "mt-4" : "hidden"}>
            {mountedTabs.has("agenda") && (
              <DailyServiceCalendar refreshTrigger={refreshTrigger} />
            )}
          </div>
          <div className={activeTab === "relatorios" ? "mt-4" : "hidden"}>
            {mountedTabs.has("relatorios") && (
              <DailyServicesReport />
            )}
          </div>
        </Tabs>

        <DailyServiceRecordDialog
          open={recordDialogOpen || !!editingRecordId}
          onOpenChange={(open) => { setRecordDialogOpen(open); if (!open) setEditingRecordId(null); }}
          recordId={editingRecordId || undefined}
          onSuccess={() => { setRefreshTrigger(prev => prev + 1); setRecordDialogOpen(false); setEditingRecordId(null); }}
        />
      </main>
    </div>
  );
}

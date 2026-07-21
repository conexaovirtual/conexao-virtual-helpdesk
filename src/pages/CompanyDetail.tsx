import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';

import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowLeft, Building2, Mail, Phone, MapPin, Clock, TrendingUp, AlertCircle, MessageSquare } from 'lucide-react';
import { CompanyTickets } from '@/components/companies/CompanyTickets';
import { CompanyAssets } from '@/components/companies/CompanyAssets';
import { CompanyTechnicians } from '@/components/companies/CompanyTechnicians';
import { CompanyWhatsAppContacts } from '@/components/companies/CompanyWhatsAppContacts';
import { CompanyContacts } from '@/components/companies/CompanyContacts';
import { useToast } from '@/hooks/use-toast';

export default function CompanyDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { profile, isAdmin, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [company, setCompany] = useState<any>(null);
  const [statistics, setStatistics] = useState<any>(null);

  // Verifica se é admin ou técnico
  const canAccess = profile?.roles?.includes('admin_provedor') || profile?.roles?.includes('tecnico');

  useEffect(() => {
    if (!authLoading) {
      if (!profile) {
        navigate('/auth');
      } else if (!canAccess) {
        navigate('/dashboard');
      }
    }
  }, [profile, navigate, canAccess, authLoading]);

  useEffect(() => {
    if (id && profile && canAccess) {
      loadCompanyData();
    }
  }, [id, profile, canAccess]);

  const loadCompanyData = async () => {
    try {
      setLoading(true);

      // Carregar dados da empresa
      const { data: companyData, error: companyError } = await supabase
        .from('companies')
        .select('*')
        .eq('id', id)
        .single();

      if (companyError) throw companyError;
      setCompany(companyData);

      // Carregar estatísticas
      const { data: statsData, error: statsError } = await supabase
        .from('company_statistics')
        .select('*')
        .eq('company_id', id)
        .maybeSingle();

      if (statsError) {
        console.error('Erro ao carregar estatísticas:', statsError);
      } else {
        setStatistics(statsData);
      }
    } catch (error: any) {
      toast({
        title: 'Erro ao carregar empresa',
        description: error.message,
        variant: 'destructive',
      });
      navigate('/companies');
    } finally {
      setLoading(false);
    }
  };

  if (authLoading || loading) {
    return (
      <div className="bg-background">
        <div className="container mx-auto px-4 py-6">
          <Skeleton className="h-8 w-64 mb-4" />
          <Skeleton className="h-96 w-full" />
        </div>
      </div>
    );
  }

  if (!company) {
    return null;
  }

  return (
    <div className="bg-background">
      
      {/* Header da Empresa */}
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-6">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate('/companies')}
            className="mb-4"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Voltar
          </Button>

          <div className="flex items-start justify-between">
            <div className="flex items-start gap-4">
              <div className="p-3 bg-primary/10 rounded-lg">
                <Building2 className="h-8 w-8 text-primary" />
              </div>
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <h1 className="text-3xl font-bold">{company.nome_fantasia}</h1>
                  <Badge variant={company.status ? 'default' : 'secondary'}>
                    {company.status ? 'Ativo' : 'Inativo'}
                  </Badge>
                </div>
                {company.razao_social && (
                  <p className="text-muted-foreground">{company.razao_social}</p>
                )}
                
                <div className="flex flex-wrap gap-4 mt-3 text-sm">
                  {company.cnpj && (
                    <div className="flex items-center gap-1.5">
                      <span className="font-medium">CNPJ:</span>
                      <span className="text-muted-foreground">{company.cnpj}</span>
                    </div>
                  )}
                  {company.email && (
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <Mail className="h-4 w-4" />
                      <span>{company.email}</span>
                    </div>
                  )}
                  {company.telefone && (
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <Phone className="h-4 w-4" />
                      <span>{company.telefone}</span>
                    </div>
                  )}
                  {company.endereco && (
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <MapPin className="h-4 w-4" />
                      <span>{company.endereco}</span>
                    </div>
                  )}
                </div>

                {company.latitude && company.longitude && (
                  <div className="flex flex-wrap gap-2 mt-3">
                    <a
                      href={`https://www.google.com/maps/dir/?api=1&destination=${company.latitude},${company.longitude}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-sm bg-primary/10 text-primary hover:bg-primary/20 px-3 py-1.5 rounded-md transition-colors"
                    >
                      <MapPin className="h-3.5 w-3.5" />
                      Google Maps
                    </a>
                    <a
                      href={`https://waze.com/ul?ll=${company.latitude},${company.longitude}&navigate=yes`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-sm bg-primary/10 text-primary hover:bg-primary/20 px-3 py-1.5 rounded-md transition-colors"
                    >
                      <MapPin className="h-3.5 w-3.5" />
                      Waze
                    </a>
                    <a
                      href={`maps://maps.apple.com/?daddr=${company.latitude},${company.longitude}`}
                      className="inline-flex items-center gap-1.5 text-sm bg-primary/10 text-primary hover:bg-primary/20 px-3 py-1.5 rounded-md transition-colors"
                    >
                      <MapPin className="h-3.5 w-3.5" />
                      Apple Maps
                    </a>
                  </div>
                )}

                {(company.sla_primeiro_atendimento_horas !== null && company.sla_solucao_horas !== null) && (
                  <div className="flex items-center gap-1.5 mt-2 text-sm">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <span className="text-muted-foreground">
                      SLA Atendimento: <strong>{company.sla_primeiro_atendimento_horas}h</strong> | 
                      SLA Solução: <strong>{company.sla_solucao_horas}h</strong>
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Conteúdo com Abas */}
      <main className="container mx-auto px-4 py-6">
        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList className="grid w-full grid-cols-6 lg:w-[900px]">
            <TabsTrigger value="overview">Visão Geral</TabsTrigger>
            <TabsTrigger value="tickets">Tickets</TabsTrigger>
            <TabsTrigger value="assets">Ativos</TabsTrigger>
            <TabsTrigger value="contacts">Contatos</TabsTrigger>
            <TabsTrigger value="whatsapp">
              <MessageSquare className="h-4 w-4 mr-1" />
              WhatsApp
            </TabsTrigger>
            <TabsTrigger value="technicians">Técnicos</TabsTrigger>
          </TabsList>

          {/* Aba Visão Geral - Estatísticas */}
          <TabsContent value="overview" className="space-y-6">
            {statistics ? (
              <>
                {/* Estatísticas de Tickets */}
                <div>
                  <h3 className="text-lg font-semibold mb-4">Estatísticas de Tickets</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    <Card>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-sm font-medium text-muted-foreground">Total de Tickets</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold">{statistics.total_tickets || 0}</div>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-sm font-medium text-muted-foreground">Novos</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold text-blue-600">{statistics.tickets_novos || 0}</div>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-sm font-medium text-muted-foreground">Em Atendimento</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold text-yellow-600">{statistics.tickets_em_atendimento || 0}</div>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-sm font-medium text-muted-foreground">Resolvidos</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold text-green-600">{statistics.tickets_resolvidos || 0}</div>
                      </CardContent>
                    </Card>
                  </div>
                </div>

                {/* Métricas de Performance */}
                <div>
                  <h3 className="text-lg font-semibold mb-4">Métricas de Performance</h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <Card>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                          <TrendingUp className="h-4 w-4" />
                          Tempo Médio de Resolução
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold">
                          {statistics.tempo_medio_resolucao_horas 
                            ? `${Number(statistics.tempo_medio_resolucao_horas).toFixed(1)}h`
                            : 'N/A'}
                        </div>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-sm font-medium text-muted-foreground">Avaliação Média</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold">
                          {statistics.media_avaliacao 
                            ? `${Number(statistics.media_avaliacao).toFixed(1)} ⭐`
                            : 'N/A'}
                        </div>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                          <AlertCircle className="h-4 w-4" />
                          SLA Violado
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold text-red-600">
                          {statistics.tickets_sla_violado || 0}
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                </div>

                {/* Estatísticas de Ativos */}
                <div>
                  <h3 className="text-lg font-semibold mb-4">Estatísticas de Ativos</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                    <Card>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-sm font-medium text-muted-foreground">Total de Ativos</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold">{statistics.total_ativos || 0}</div>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-sm font-medium text-muted-foreground">Em Uso</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold text-green-600">{statistics.ativos_em_uso || 0}</div>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-sm font-medium text-muted-foreground">Estoque</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold text-blue-600">{statistics.ativos_estoque || 0}</div>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-sm font-medium text-muted-foreground">Manutenção</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold text-yellow-600">{statistics.ativos_manutencao || 0}</div>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-sm font-medium text-muted-foreground">Baixados</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold text-gray-600">{statistics.ativos_baixados || 0}</div>
                      </CardContent>
                    </Card>
                  </div>
                </div>
              </>
            ) : (
              <Card>
                <CardContent className="py-8 text-center">
                  <p className="text-muted-foreground">Nenhuma estatística disponível para esta empresa.</p>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Aba Tickets */}
          <TabsContent value="tickets">
            <Card>
              <CardHeader>
                <CardTitle>Tickets da Empresa</CardTitle>
              </CardHeader>
              <CardContent>
                <CompanyTickets companyId={id!} />
              </CardContent>
            </Card>
          </TabsContent>

          {/* Aba Ativos */}
          <TabsContent value="assets">
            <Card>
              <CardHeader>
                <CardTitle>Ativos da Empresa</CardTitle>
              </CardHeader>
              <CardContent>
                <CompanyAssets companyId={id!} />
              </CardContent>
            </Card>
          </TabsContent>

          {/* Aba Contatos */}
          <TabsContent value="contacts">
            <Card>
              <CardContent className="pt-6">
                <CompanyContacts companyId={id!} />
              </CardContent>
            </Card>
          </TabsContent>

          {/* Aba WhatsApp */}
          <TabsContent value="whatsapp">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MessageSquare className="h-5 w-5" />
                  Contatos WhatsApp
                </CardTitle>
              </CardHeader>
              <CardContent>
                <CompanyWhatsAppContacts companyId={id!} />
              </CardContent>
            </Card>
          </TabsContent>

          {/* Aba Técnicos */}
          <TabsContent value="technicians">
            <Card>
              <CardHeader>
                <CardTitle>Técnicos Atendendo a Empresa</CardTitle>
              </CardHeader>
              <CardContent>
                <CompanyTechnicians companyId={id!} />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}

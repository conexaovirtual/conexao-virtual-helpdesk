import { useState, useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { authSchema, loginSchema } from "@/lib/validations";
import { zxcvbn } from "@zxcvbn-ts/core";
import { PasswordStrengthIndicator } from "@/components/auth/PasswordStrengthIndicator";

// Extrai uma mensagem legível de um erro do Zod. O código antigo checava
// `error.errors` (API do Zod v3) — a versão instalada é Zod v4, que renomeou
// pra `error.issues` e não tem mais `.errors`. Sem isso, o guard sempre
// falhava e caía no fallback `error.message`, que pra um ZodError é o JSON
// bruto de todos os issues serializado — literalmente o texto quebrado que
// aparecia na tela em vez de uma mensagem normal. Achado real: 05/08/2026.
function zodMessage(error: any, fallback: string): string {
  const issues = error?.issues || error?.errors;
  if (Array.isArray(issues) && issues.length > 0 && issues[0]?.message) {
    return issues[0].message;
  }
  return error?.message || fallback;
}

export default function Auth() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirectUrl = searchParams.get("redirect");
  const { profile, loading: authLoading } = useAuth();
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [nome, setNome] = useState("");
  const [passwordStrength, setPasswordStrength] = useState<number>(0);
  const redirectedRef = useRef(false);

  useEffect(() => {
    if (!authLoading && profile && !redirectedRef.current) {
      redirectedRef.current = true;
      navigate(redirectUrl || "/dashboard", { replace: true });
    }
  }, [authLoading, profile, navigate, redirectUrl]);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Login usa loginSchema (só checa formato/preenchido) — NUNCA
      // authSchema (que reavalia força de senha, coisa de cadastro).
      const validatedData = loginSchema.parse({ email, password });

      const { error } = await supabase.auth.signInWithPassword({
        email: validatedData.email,
        password: validatedData.password,
      });

      if (error) {
        if (error.status === 429) {
          toast.error("Muitas tentativas de login. Aguarde antes de tentar novamente.");
        } else {
          toast.error("E-mail ou senha inválidos");
        }
        return;
      }

      navigate(redirectUrl || "/dashboard");
    } catch (error: any) {
      toast.error(zodMessage(error, "Erro ao fazer login"));
    } finally {
      setLoading(false);
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const validatedData = authSchema.parse({ email, password, nome });

      const { error } = await supabase.auth.signUp({
        email: validatedData.email,
        password: validatedData.password,
        options: {
          emailRedirectTo: `${window.location.origin}/dashboard`,
          data: { nome: validatedData.nome },
        },
      });

      if (error) throw error;

      toast.success("Cadastro realizado! Você já pode fazer login.");
      setEmail("");
      setPassword("");
      setNome("");
    } catch (error: any) {
      toast.error(zodMessage(error, "Erro ao criar conta"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-accent to-background p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="flex flex-col items-center gap-3">
          <img src="/logo-conexaovirtual.png" alt="Conexão Virtual" className="h-20 w-auto object-contain" />
          <div className="text-center">
            <h1 className="text-2xl font-bold text-foreground">Conexão Virtual</h1>
            <p className="text-sm text-muted-foreground mt-1">Help Desk TI — Gestão de Chamados e Ativos</p>
          </div>
        </div>

        <Card className="shadow-lg border-border/50">
          <CardHeader className="pb-4">
            <CardTitle className="text-lg text-center">Acesse sua conta</CardTitle>
            <CardDescription className="text-center text-sm">
              Entre com suas credenciais para acessar o sistema
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="login" className="w-full">
              <TabsList className="grid w-full grid-cols-2 mb-4">
                <TabsTrigger value="login">Entrar</TabsTrigger>
                <TabsTrigger value="signup">Cadastrar</TabsTrigger>
              </TabsList>

              <TabsContent value="login">
                <form onSubmit={handleSignIn} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="login-email">E-mail</Label>
                    <Input
                      id="login-email"
                      type="email"
                      placeholder="seu@email.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      autoComplete="email"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="login-password">Senha</Label>
                    <Input
                      id="login-password"
                      type="password"
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      autoComplete="current-password"
                    />
                  </div>
                  <Button type="submit" className="w-full" disabled={loading}>
                    {loading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Entrando...
                      </>
                    ) : (
                      "Entrar"
                    )}
                  </Button>
                </form>
              </TabsContent>

              <TabsContent value="signup">
                <form onSubmit={handleSignUp} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="signup-nome">Nome Completo</Label>
                    <Input
                      id="signup-nome"
                      type="text"
                      placeholder="Seu nome"
                      value={nome}
                      onChange={(e) => setNome(e.target.value)}
                      required
                      autoComplete="name"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signup-email">E-mail</Label>
                    <Input
                      id="signup-email"
                      type="email"
                      placeholder="seu@email.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      autoComplete="email"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signup-password">Senha (mínimo 8 caracteres)</Label>
                    <Input
                      id="signup-password"
                      type="password"
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => {
                        setPassword(e.target.value);
                        setPasswordStrength(zxcvbn(e.target.value).score);
                      }}
                      required
                      minLength={8}
                      autoComplete="new-password"
                    />
                    <PasswordStrengthIndicator strength={passwordStrength} />
                  </div>
                  <Button type="submit" className="w-full" disabled={loading}>
                    {loading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Cadastrando...
                      </>
                    ) : (
                      "Criar Conta"
                    )}
                  </Button>
                </form>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground">
          © {new Date().getFullYear()} Conexão Virtual Soluções Tecnológicas
        </p>
      </div>
    </div>
  );
}

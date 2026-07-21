import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

const fmt = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const STATUS_LABELS: Record<string, string> = {
  pendente: "Pendente",
  aprovado: "Aprovado",
  recusado: "Recusado",
  cancelado: "Cancelado",
};

export default function OrcamentoPrint() {
  const { id } = useParams<{ id: string }>();
  const [orcamento, setOrcamento] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!id) return;
    (async () => {
      const { data, error } = await supabase
        .from("orcamentos")
        .select(`
          *,
          orcamento_itens(*),
          companies(nome_fantasia, cnpj, endereco, telefone, email)
        `)
        .eq("id", id)
        .single();

      if (error || !data) {
        setError("Orçamento não encontrado.");
      } else {
        const sorted = [...(data.orcamento_itens || [])].sort(
          (a, b) => a.ordem - b.ordem
        );
        setOrcamento({ ...data, orcamento_itens: sorted });
      }
      setLoading(false);
    })();
  }, [id]);

  useEffect(() => {
    if (!loading && orcamento) {
      setTimeout(() => window.print(), 400);
    }
  }, [loading, orcamento]);

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh" }}>
        <p>Carregando orçamento…</p>
      </div>
    );
  }

  if (error || !orcamento) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh" }}>
        <p>{error || "Orçamento não encontrado."}</p>
      </div>
    );
  }

  const company = orcamento.companies;
  const validade = orcamento.validade
    ? format(new Date(orcamento.validade + "T00:00:00"), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })
    : "—";
  const criado = format(new Date(orcamento.created_at), "dd/MM/yyyy", { locale: ptBR });

  return (
    <>
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'Helvetica Neue', Arial, sans-serif; color: #1a1a1a; background: #fff; }
        @media print {
          @page { margin: 20mm 15mm; size: A4; }
          .no-print { display: none !important; }
        }
        .page { max-width: 800px; margin: 0 auto; padding: 40px 32px; }
        .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #2563eb; padding-bottom: 20px; margin-bottom: 28px; }
        .brand img { max-height: 120px; max-width: 440px; object-fit: contain; }
        .brand p { font-size: 12px; color: #666; margin-top: 6px; }
        .orcamento-id { text-align: right; }
        .orcamento-id h2 { font-size: 20px; font-weight: 700; color: #1a1a1a; }
        .orcamento-id .date { font-size: 12px; color: #666; margin-top: 4px; }
        .status-badge { display: inline-block; padding: 2px 10px; border-radius: 9999px; font-size: 11px; font-weight: 600; margin-top: 8px; }
        .status-pendente { background: #fef9c3; color: #854d0e; }
        .status-aprovado { background: #dcfce7; color: #166534; }
        .status-recusado { background: #fee2e2; color: #991b1b; }
        .status-cancelado { background: #f3f4f6; color: #4b5563; }
        .section { margin-bottom: 24px; }
        .section-title { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: .05em; color: #6b7280; margin-bottom: 8px; }
        .client-box { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 14px 16px; }
        .client-name { font-size: 16px; font-weight: 600; }
        .client-detail { font-size: 12px; color: #555; margin-top: 3px; }
        table { width: 100%; border-collapse: collapse; font-size: 13px; }
        thead tr { background: #2563eb; color: #fff; }
        thead th { padding: 10px 12px; text-align: left; font-weight: 500; font-size: 12px; }
        thead th.right { text-align: right; }
        tbody tr { border-bottom: 1px solid #e5e7eb; }
        tbody tr:last-child { border-bottom: none; }
        tbody td { padding: 10px 12px; }
        tbody td.right { text-align: right; }
        .total-row { background: #eff6ff; font-weight: 700; }
        .total-row td { padding: 12px; border-top: 2px solid #2563eb; }
        .obs-box { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px 16px; font-size: 12.5px; white-space: pre-wrap; color: #374151; }
        .validity { font-size: 12px; color: #374151; margin-top: 12px; }
        .footer { margin-top: 40px; padding-top: 16px; border-top: 1px solid #e5e7eb; font-size: 11px; color: #9ca3af; text-align: center; }
        .print-btn { position: fixed; bottom: 24px; right: 24px; padding: 10px 20px; background: #2563eb; color: #fff; border: none; border-radius: 8px; font-size: 14px; cursor: pointer; box-shadow: 0 4px 12px rgba(37,99,235,.4); }
        .print-btn:hover { background: #1d4ed8; }
      `}</style>

      <div className="page">
        {/* Header */}
        <div className="header">
          <div className="brand">
            <img src="/logo-conexaovirtual.png" alt="Conexão Virtual" />
          </div>
          <div className="orcamento-id">
            <h2>#{orcamento.numero}</h2>
            <div className="date">Emitido em {criado}</div>
            <span className={`status-badge status-${orcamento.status}`}>
              {STATUS_LABELS[orcamento.status] ?? orcamento.status}
            </span>
          </div>
        </div>

        {/* Cliente */}
        {company && (
          <div className="section">
            <div className="section-title">Cliente</div>
            <div className="client-box">
              <div className="client-name">{company.nome_fantasia}</div>
              {company.cnpj && <div className="client-detail">CNPJ: {company.cnpj}</div>}
              {company.telefone && <div className="client-detail">Tel: {company.telefone}</div>}
              {company.email && <div className="client-detail">E-mail: {company.email}</div>}
              {company.endereco && <div className="client-detail">{company.endereco}</div>}
            </div>
          </div>
        )}

        {/* Itens */}
        <div className="section">
          <div className="section-title">Itens</div>
          <table>
            <thead>
              <tr>
                <th style={{ width: "46%" }}>Descrição</th>
                <th className="right" style={{ width: "10%" }}>Qtd</th>
                <th className="right" style={{ width: "16%" }}>Unit.</th>
                <th className="right" style={{ width: "14%" }}>Desc.</th>
                <th className="right" style={{ width: "14%" }}>Subtotal</th>
              </tr>
            </thead>
            <tbody>
              {orcamento.orcamento_itens.map((it: any) => (
                <tr key={it.id}>
                  <td>{it.descricao}</td>
                  <td className="right">{it.quantidade}</td>
                  <td className="right">{fmt(it.valor_unitario)}</td>
                  <td className="right">{fmt(it.valor_desconto)}</td>
                  <td className="right">{fmt(it.quantidade * it.valor_unitario - it.valor_desconto)}</td>
                </tr>
              ))}
              <tr className="total-row">
                <td colSpan={4} style={{ textAlign: "right", paddingRight: "12px", fontSize: "13px" }}>
                  TOTAL
                </td>
                <td className="right" style={{ fontSize: "15px" }}>{fmt(orcamento.valor_total)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Observação */}
        {orcamento.observacao && (
          <div className="section">
            <div className="section-title">Observações</div>
            <div className="obs-box">{orcamento.observacao}</div>
          </div>
        )}

        {/* Validade */}
        <div className="validity">
          Validade do orçamento: <strong>{validade}</strong>
        </div>

        <div className="footer">
          Este documento é um orçamento e não tem valor fiscal. Válido enquanto os serviços e produtos estiverem disponíveis.
        </div>
      </div>

      <button className="print-btn no-print" onClick={() => window.print()}>
        Imprimir / Salvar PDF
      </button>
    </>
  );
}

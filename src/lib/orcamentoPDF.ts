import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

const fmt = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const getLogoBase64 = async (): Promise<string | null> => {
  try {
    const res = await fetch("/logo-conexaovirtual.png");
    const blob = await res.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
};

export async function generateOrcamentoPDF(orcamento: any, company: any): Promise<Blob> {
  const doc = new jsPDF();
  const W = doc.internal.pageSize.getWidth();
  let y = 18;

  // Logo
  const logo = await getLogoBase64();
  if (logo) {
    try {
      doc.addImage(logo, "PNG", 14, y - 4, 44, 17);
    } catch {}
  }

  // Título e número
  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(37, 99, 235);
  doc.text("ORÇAMENTO", W - 14, y + 2, { align: "right" });
  doc.setFontSize(13);
  doc.setTextColor(30, 30, 30);
  doc.text(`#${orcamento.numero}`, W - 14, y + 10, { align: "right" });

  const emitido = format(new Date(orcamento.created_at), "dd/MM/yyyy", { locale: ptBR });
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100, 100, 100);
  doc.text(`Emitido em ${emitido}`, W - 14, y + 17, { align: "right" });

  // Linha separadora
  y += 28;
  doc.setDrawColor(37, 99, 235);
  doc.setLineWidth(0.5);
  doc.line(14, y, W - 14, y);
  y += 8;

  // Cliente
  if (company) {
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(107, 114, 128);
    doc.text("CLIENTE", 14, y);
    y += 5;
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(30, 30, 30);
    doc.text(company.nome_fantasia || "", 14, y);
    y += 5;
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(80, 80, 80);
    if (company.cnpj) { doc.text(`CNPJ: ${company.cnpj}`, 14, y); y += 4; }
    if (company.telefone) { doc.text(`Tel: ${company.telefone}`, 14, y); y += 4; }
    if (company.email) { doc.text(`E-mail: ${company.email}`, 14, y); y += 4; }
    if (company.endereco) { doc.text(company.endereco, 14, y); y += 4; }
    y += 4;
  }

  // Tabela de itens
  const itens = [...(orcamento.orcamento_itens || [])].sort((a: any, b: any) => a.ordem - b.ordem);

  autoTable(doc, {
    startY: y,
    head: [["Descrição", "Qtd", "Unit.", "Desc.", "Subtotal"]],
    body: itens.map((it: any) => [
      it.descricao,
      String(it.quantidade),
      fmt(it.valor_unitario),
      fmt(it.valor_desconto),
      fmt(it.quantidade * it.valor_unitario - it.valor_desconto),
    ]),
    foot: [["", "", "", "TOTAL", fmt(orcamento.valor_total)]],
    headStyles: { fillColor: [37, 99, 235], fontSize: 9, fontStyle: "bold" },
    bodyStyles: { fontSize: 9 },
    footStyles: { fillColor: [239, 246, 255], textColor: [37, 99, 235], fontStyle: "bold", fontSize: 10 },
    columnStyles: {
      0: { cellWidth: "auto" },
      1: { halign: "center", cellWidth: 18 },
      2: { halign: "right", cellWidth: 28 },
      3: { halign: "right", cellWidth: 24 },
      4: { halign: "right", cellWidth: 28 },
    },
    margin: { left: 14, right: 14 },
  });

  y = (doc as any).lastAutoTable.finalY + 8;

  // Observação
  if (orcamento.observacao) {
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(107, 114, 128);
    doc.text("OBSERVAÇÕES", 14, y);
    y += 5;
    doc.setFont("helvetica", "normal");
    doc.setTextColor(55, 65, 81);
    const linhas = doc.splitTextToSize(orcamento.observacao, W - 28);
    doc.text(linhas, 14, y);
    y += linhas.length * 5 + 4;
  }

  // Validade
  if (orcamento.validade) {
    const validade = format(new Date(orcamento.validade + "T00:00:00"), "dd 'de' MMMM 'de' yyyy", { locale: ptBR });
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(55, 65, 81);
    doc.text(`Validade do orçamento: ${validade}`, 14, y);
    y += 10;
  }

  // Rodapé
  const totalPages = (doc.internal as any).getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    const pageH = doc.internal.pageSize.getHeight();
    doc.setFontSize(7.5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(156, 163, 175);
    doc.text(
      "Este documento é um orçamento e não tem valor fiscal.",
      W / 2, pageH - 10, { align: "center" }
    );
  }

  return doc.output("blob");
}

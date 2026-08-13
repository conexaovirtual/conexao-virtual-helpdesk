import jsPDF from "jspdf";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

// ---------------------------------------------------------------------------
// Gerador do documento (PDF) da Proposta Comercial — Plano de Manutenção de TI.
// Mesmo padrão visual/estrutural de src/lib/contratoPDF.ts (jsPDF puro, A4),
// mas com tom comercial (não é o contrato assinável, é o convite pra virar um).
// Reaproveita os mesmos dados de `contract`+`company` — o valor mensal/taxa de
// implantação/vencimento propostos podem vir de um contrato em status
// 'pendente' (negociação em andamento) ou ficar em branco ("a definir") se
// ainda não foram acertados com o prospect.
// ---------------------------------------------------------------------------

const CONTRATADA = {
  razao_social: "CONEXÃO VIRTUAL SOLUÇÕES TECNOLÓGICAS LTDA",
  cnpj: "06.906.723/0001-30",
  endereco:
    "Rua C-156, nº 323, Quadra 366, Lote 04, Sala 201, Jardim América, Goiânia – GO, CEP 74.275-160",
  whatsapp: "(62) 99952-2470",
};

const fmtMoeda = (v?: number | null) =>
  v === null || v === undefined || Number(v) <= 0
    ? "a definir"
    : Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const fmtData = (d?: string | Date | null) => {
  if (!d) return "";
  const date = typeof d === "string" ? (d.length <= 10 ? new Date(d + "T00:00:00") : new Date(d)) : d;
  return format(date, "dd 'de' MMMM 'de' yyyy", { locale: ptBR });
};

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

const AZUL: [number, number, number] = [37, 99, 235];
const CINZA: [number, number, number] = [90, 90, 90];

export async function generatePropostaComercialPDF(contract: any, company: any): Promise<Blob> {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const ML = 18;
  const MR = 18;
  const contentW = W - ML - MR;
  const TOP = 22;
  const BOTTOM = 20;
  let y = TOP;

  const ensureSpace = (needed: number) => {
    if (y + needed > H - BOTTOM) {
      doc.addPage();
      y = TOP;
    }
  };

  const paragrafo = (texto: string, opts: { bold?: boolean; size?: number; gap?: number; color?: [number, number, number] } = {}) => {
    const size = opts.size ?? 10;
    doc.setFontSize(size);
    doc.setFont("helvetica", opts.bold ? "bold" : "normal");
    const c = opts.color ?? [30, 30, 30];
    doc.setTextColor(c[0], c[1], c[2]);
    const linhas = doc.splitTextToSize(texto, contentW) as string[];
    const lh = size * 0.52;
    linhas.forEach((linha) => {
      ensureSpace(lh);
      doc.text(linha, ML, y);
      y += lh;
    });
    y += opts.gap ?? 2.5;
  };

  const item = (label: string, texto: string) => {
    const size = 10;
    doc.setFontSize(size);
    const lh = size * 0.52;
    const full = `•  ${label} — ${texto}`;
    const linhas = doc.splitTextToSize(full, contentW - 4) as string[];
    linhas.forEach((linha, idx) => {
      ensureSpace(lh);
      if (idx === 0) {
        doc.setFont("helvetica", "bold");
        doc.setTextColor(AZUL[0], AZUL[1], AZUL[2]);
        doc.text("•", ML, y);
      }
      doc.setFont("helvetica", idx === 0 ? "bold" : "normal");
      doc.setTextColor(30, 30, 30);
      doc.text(idx === 0 ? linha.replace(/^•\s*/, "") : linha, ML + 4.5, y);
      y += lh;
    });
    y += 2;
  };

  const titulo = (texto: string) => {
    ensureSpace(10);
    y += 1.5;
    doc.setFontSize(11.5);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(AZUL[0], AZUL[1], AZUL[2]);
    doc.text(texto, ML, y);
    y += 2.5;
    doc.setDrawColor(AZUL[0], AZUL[1], AZUL[2]);
    doc.setLineWidth(0.3);
    doc.line(ML, y, W - MR, y);
    y += 5;
    doc.setTextColor(30, 30, 30);
  };

  // --- cabeçalho ----------------------------------------------------------
  const logo = await getLogoBase64();
  if (logo) {
    try {
      doc.addImage(logo, "PNG", ML, y - 4, 40, 15);
    } catch {
      /* ignore */
    }
  }
  doc.setFontSize(7.5);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(110, 110, 110);
  doc.text(CONTRATADA.razao_social, W - MR, y - 1, { align: "right" });
  doc.text(`CNPJ ${CONTRATADA.cnpj}`, W - MR, y + 3, { align: "right" });
  y += 14;
  doc.setDrawColor(AZUL[0], AZUL[1], AZUL[2]);
  doc.setLineWidth(0.4);
  doc.line(ML, y, W - MR, y);
  y += 8;

  // --- título ---------------------------------------------------------------
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(20, 20, 20);
  doc.text("PROPOSTA COMERCIAL", W / 2, y, { align: "center" });
  y += 6.5;
  doc.setFontSize(11);
  doc.setTextColor(AZUL[0], AZUL[1], AZUL[2]);
  doc.setFont("helvetica", "bold");
  doc.text("Plano de Manutenção de TI", W / 2, y, { align: "center" });
  y += 5.5;
  doc.setFontSize(9);
  doc.setFont("helvetica", "italic");
  doc.setTextColor(CINZA[0], CINZA[1], CINZA[2]);
  doc.text("Suporte técnico contínuo para computadores, servidores e rede de dados da sua empresa", W / 2, y, { align: "center" });
  y += 9;

  // --- preparado para ---------------------------------------------------------
  const clienteNome = company?.nome_fantasia || company?.razao_social || "____________________";
  paragrafo(`Preparado para: ${clienteNome}`, { bold: true, size: 10.5, gap: 1 });
  paragrafo(`${fmtData(new Date())}`, { size: 9, color: CINZA, gap: 6 });

  // --- quem somos ---------------------------------------------------------
  titulo("QUEM SOMOS");
  paragrafo(
    "A Conexão Virtual é uma empresa especializada em infraestrutura de TI para empresas: manutenção de " +
      "computadores, notebooks e servidores, rede de dados, Wi-Fi corporativo e suporte técnico completo. " +
      "Trabalhamos para que a tecnologia da sua empresa simplesmente funcione — sem imprevistos, sem surpresas, " +
      "sem depender de sorte quando algo dá errado."
  );
  paragrafo(
    "Esta proposta apresenta o nosso Plano de Manutenção Mensal: um contrato de suporte contínuo pensado para " +
      "empresas que preferem prevenir problemas a apagar incêndios.",
    { gap: 4 }
  );

  // --- o que está incluso ---------------------------------------------------
  titulo("O QUE ESTÁ INCLUSO NO PLANO");
  item("Monitoramento contínuo 24x7", "estações de trabalho, servidores e rede local monitorados por software, identificando problemas antes que virem uma parada.");
  item("Atendimento remoto prioritário", "a maioria dos problemas é resolvida à distância, sem precisar esperar uma visita.");
  item("Visita técnica quando necessário", "quando o problema exige presença física, agendamos um horário real, já verificado na agenda.");
  const prazoAtend = company?.sla_primeiro_atendimento_horas || 4;
  item("Prazo de atendimento definido", `abertura de chamado com prazo de primeiro atendimento de até ${prazoAtend} horas, documentado em ordem de serviço.`);
  item("Abertura de chamado facilitada", "via WhatsApp, ligação ou automaticamente pelo próprio sistema de monitoramento.");
  item("Histórico documentado", "toda visita e todo atendimento geram uma Ordem de Serviço, com registro do que foi feito.");
  item("Instalação, atualização e correção de softwares", "das estações e servidores cobertos pelo contrato.");
  y += 2;

  // --- como funciona ---------------------------------------------------------
  titulo("COMO FUNCIONA O ATENDIMENTO, NA PRÁTICA");
  paragrafo("1. Você reporta o problema pelo WhatsApp, ligação, ou ele é detectado automaticamente pelo monitoramento.");
  paragrafo("2. Nossa equipe avalia se o problema pode ser resolvido remotamente — a maior parte dos casos é.");
  paragrafo("3. Se precisar de presença física, verificamos a agenda real dos técnicos e confirmamos um horário com você.");
  paragrafo("4. Tudo fica documentado: o que foi identificado, o que foi feito, e o histórico fica disponível pra consultar depois.", { gap: 4 });

  // --- o que fica fora ---------------------------------------------------------
  titulo("O QUE FICA FORA DO PLANO (E COMO FUNCIONA)");
  paragrafo(
    "Para manter o plano mensal com um valor justo, alguns itens não estão incluídos — mas continuam sendo " +
      "atendidos, com transparência total antes de qualquer custo adicional:",
    { gap: 3 }
  );
  item("Peças de reposição", "correm por conta do cliente.");
  item("Serviços fora do escopo de manutenção", "orçados à parte, com aprovação prévia — nunca cobrados sem combinar antes.");
  item("Reparo de impressoras", "enviado a assistência especializada: orçamento do parceiro + 40% de serviço + deslocamento, sempre informado antes de qualquer autorização.");
  y += 2;

  // --- investimento (tabela simples) ---------------------------------------
  ensureSpace(38);
  titulo("INVESTIMENTO");
  paragrafo(
    "Cada empresa tem uma realidade diferente — quantidade de máquinas, servidores, complexidade da rede. O " +
      "valor abaixo é personalizado para a sua operação, com base na vistoria inicial:",
    { gap: 3 }
  );

  const linhaInvestimento = (label: string, valor: string, destaque = false) => {
    ensureSpace(9);
    const rowH = 8.5;
    doc.setFillColor(destaque ? 235 : 246, destaque ? 241 : 247, destaque ? 253 : 248);
    doc.rect(ML, y, contentW, rowH, "F");
    doc.setFontSize(9.5);
    doc.setFont("helvetica", destaque ? "bold" : "normal");
    doc.setTextColor(30, 30, 30);
    doc.text(label, ML + 3, y + 5.6);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(AZUL[0], AZUL[1], AZUL[2]);
    doc.text(valor, W - MR - 3, y + 5.6, { align: "right" });
    y += rowH + 1;
  };

  linhaInvestimento("Mensalidade do plano de manutenção", `${fmtMoeda(contract?.valor_mensal)} / mês`, true);
  linhaInvestimento("Taxa de implantação (vistoria + configuração do monitoramento)", fmtMoeda(contract?.valor_implantacao));
  linhaInvestimento("Prazo de primeiro atendimento", `até ${prazoAtend} horas`);
  linhaInvestimento("Vencimento", contract?.dia_vencimento ? `todo dia ${contract.dia_vencimento}` : "a definir");
  y += 3;
  paragrafo("Pagamento mensal via boleto bancário. Sem taxa de adesão além da implantação inicial listada acima.", {
    size: 8.5,
    color: CINZA,
    gap: 4,
  });

  // --- comparativo ---------------------------------------------------------
  titulo("POR QUE UM PLANO FIXO COMPENSA MAIS QUE CHAMAR AVULSO");
  paragrafo(
    "Hoje, quem não tem contrato paga R$ 160,00 por visita técnica (com até 2 horas de atendimento incluídas), " +
      "fora orçamento à parte para qualquer trabalho extra identificado no local. Com o plano mensal:",
    { gap: 3 }
  );
  item("Previsibilidade", "você sabe exatamente quanto vai gastar com TI todo mês, sem susto.");
  item("Prevenção", "o monitoramento contínuo evita boa parte dos problemas antes que virem uma emergência.");
  item("Prioridade no atendimento", "cliente de contrato tem prazo de atendimento garantido em contrato.");
  y += 2;

  // --- condições gerais ---------------------------------------------------------
  titulo("CONDIÇÕES GERAIS");
  paragrafo(
    "1. Vigência — o contrato tem validade de 1 (um) ano a partir da assinatura, renovado automaticamente por " +
      "igual período caso nenhuma das partes solicite o cancelamento."
  );
  paragrafo(
    "2. Cancelamento — pode ser feito a qualquer momento por qualquer uma das partes, mediante aviso por " +
      "escrito com 30 (trinta) dias de antecedência."
  );
  paragrafo(
    "3. Reajuste — o valor mensal pode ser reajustado anualmente, sempre comunicado com antecedência e sem " +
      "alterar as demais condições do contrato."
  );
  paragrafo(
    "4. Confidencialidade e LGPD — todas as informações e dados pessoais acessados durante o atendimento são " +
      "tratados com sigilo, em conformidade com a Lei Geral de Proteção de Dados (Lei nº 13.709/2018)."
  );
  paragrafo(
    "As condições completas — incluindo cláusulas jurídicas detalhadas — constam no contrato formal de " +
      "prestação de serviços, apresentado para assinatura após a aceitação desta proposta.",
    { size: 8.5, color: CINZA, gap: 4 }
  );

  // --- próximos passos / contato ---------------------------------------------
  titulo("PRÓXIMOS PASSOS");
  paragrafo(
    "Se essa proposta fizer sentido para sua empresa, o próximo passo é agendar uma vistoria inicial gratuita — " +
      "avaliamos sua estrutura, ajustamos os detalhes finais e formalizamos o contrato.",
    { gap: 4 }
  );

  ensureSpace(26);
  doc.setFillColor(30, 58, 138);
  doc.rect(ML, y, contentW, 22, "F");
  doc.setFontSize(10.5);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(255, 255, 255);
  doc.text("Vamos conversar?", ML + 4, y + 6.5);
  doc.setFontSize(8.5);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(220, 225, 245);
  doc.text(`${CONTRATADA.razao_social} — CNPJ ${CONTRATADA.cnpj}`, ML + 4, y + 11.5);
  doc.text(CONTRATADA.endereco, ML + 4, y + 15.5);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(255, 255, 255);
  doc.text(`WhatsApp: ${CONTRATADA.whatsapp}`, ML + 4, y + 19.8);
  y += 26;

  paragrafo("Proposta sem valor contratual — os termos definitivos constam no contrato formal, apresentado após a aceitação.", {
    size: 7.5,
    color: [140, 140, 140],
    gap: 0,
  });

  // --- rodapé com numeração de página ----------------------------------------
  const totalPages = (doc.internal as any).getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setFontSize(7.5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(150, 150, 150);
    doc.text(`Página ${p} de ${totalPages}`, W / 2, H - 10, { align: "center" });
  }

  return doc.output("blob");
}

// Helper para baixar diretamente
export async function downloadPropostaComercialPDF(contract: any, company: any) {
  const blob = await generatePropostaComercialPDF(contract, company);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const nome = (company?.nome_fantasia || company?.razao_social || "cliente")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "_");
  a.href = url;
  a.download = `Proposta_Comercial_${nome}.pdf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

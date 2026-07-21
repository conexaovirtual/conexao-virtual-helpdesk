import jsPDF from "jspdf";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

// ---------------------------------------------------------------------------
// Gerador do documento (PDF) do Contrato de Prestação de Serviços de TI.
// Preenche automaticamente com os dados da empresa (CONTRATANTE) + contrato.
// A CONTRATADA (Conexão Virtual) é fixa.
// ---------------------------------------------------------------------------

const CONTRATADA = {
  razao_social: "CONEXÃO VIRTUAL SOLUÇÕES TECNOLÓGICAS LTDA",
  cnpj: "06.906.723/0001-30",
  endereco:
    "Rua C-156, nº 323, Quadra 366, Lote 04, Sala 201, Jardim América, Goiânia – GO, CEP 74.275-160",
};

const fmtMoeda = (v?: number | null) =>
  (v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const fmtData = (d?: string | null) => {
  if (!d) return "";
  const date = d.length <= 10 ? new Date(d + "T00:00:00") : new Date(d);
  return format(date, "dd 'de' MMMM 'de' yyyy", { locale: ptBR });
};

// Tenta extrair "Cidade – UF" do endereço para o foro; fallback Goiânia – GO.
const extrairForo = (endereco?: string | null): string => {
  if (!endereco) return "Goiânia – GO";
  const m = endereco.match(/([A-Za-zÀ-ÿ\s.]+?)\s*[–-]\s*([A-Z]{2})\b/);
  if (m) return `${m[1].trim()} – ${m[2]}`;
  const ufMatch = endereco.match(/\b([A-Z]{2})\b(?:\s*,?\s*CEP|\s*$)/);
  if (ufMatch) return ufMatch[1];
  return "Goiânia – GO";
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

export async function generateContratoPDF(contract: any, company: any): Promise<Blob> {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const ML = 18; // margem esquerda
  const MR = 18; // margem direita
  const contentW = W - ML - MR;
  const TOP = 22;
  const BOTTOM = 20;
  let y = TOP;

  // --- controle de quebra de página ------------------------------------------
  const ensureSpace = (needed: number) => {
    if (y + needed > H - BOTTOM) {
      doc.addPage();
      y = TOP;
    }
  };

  const paragrafo = (texto: string, opts: { bold?: boolean; size?: number; gap?: number } = {}) => {
    const size = opts.size ?? 10;
    doc.setFontSize(size);
    doc.setFont("helvetica", opts.bold ? "bold" : "normal");
    doc.setTextColor(30, 30, 30);
    const linhas = doc.splitTextToSize(texto, contentW) as string[];
    const lh = size * 0.52; // altura de linha em mm
    linhas.forEach((linha) => {
      ensureSpace(lh);
      doc.text(linha, ML, y);
      y += lh;
    });
    y += opts.gap ?? 2.5;
  };

  const titulo = (texto: string) => {
    ensureSpace(10);
    y += 1.5;
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(AZUL[0], AZUL[1], AZUL[2]);
    doc.text(texto, ML, y);
    y += 5.5;
    doc.setTextColor(30, 30, 30);
  };

  // --- cabeçalho --------------------------------------------------------------
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

  // --- título -----------------------------------------------------------------
  doc.setFontSize(15);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(20, 20, 20);
  doc.text("CONTRATO DE PRESTAÇÃO DE SERVIÇOS", W / 2, y, { align: "center" });
  y += 6;
  doc.setFontSize(10);
  doc.setTextColor(90, 90, 90);
  doc.setFont("helvetica", "normal");
  doc.text("Manutenção de Computadores e Suporte de TI", W / 2, y, { align: "center" });
  y += 9;

  // --- qualificação das partes ------------------------------------------------
  paragrafo("Pelo presente instrumento particular, de um lado:");
  paragrafo(
    `CONTRATADA: ${CONTRATADA.razao_social}, inscrita no CNPJ sob o nº ${CONTRATADA.cnpj}, ` +
      `com sede à ${CONTRATADA.endereco}, neste ato representada na forma de seu contrato social; e, de outro lado:`
  );

  const cliCnpj = company?.cnpj || "____________________";
  const cliEndereco = company?.endereco || "____________________";
  const cliRep = company?.representante_legal || "____________________";
  const cliRepCpf = company?.representante_cpf || "____________________";
  paragrafo(
    `CONTRATANTE: ${company?.razao_social || company?.nome_fantasia || "____________________"}` +
      `${company?.nome_fantasia ? `, nome fantasia ${company.nome_fantasia}` : ""}, ` +
      `inscrita no CNPJ sob o nº ${cliCnpj}, com sede à ${cliEndereco}, ` +
      `neste ato representada por ${cliRep}, CPF ${cliRepCpf}.`
  );
  paragrafo(
    "As partes acima identificadas têm, entre si, justo e contratado o presente Contrato de Prestação de Serviços " +
      "de manutenção de computadores e suporte de TI, que se regerá pelas cláusulas e condições seguintes:"
  );

  // --- 1. OBJETO --------------------------------------------------------------
  titulo("1. DO OBJETO");
  paragrafo(
    "1.1. Constitui objeto do presente contrato a prestação de serviços de manutenção preventiva e corretiva " +
      "dos computadores e da rede de dados do CONTRATANTE."
  );
  paragrafo(
    "1.2. Os serviços têm como finalidade a preservação, suporte, manutenção ou reparo de estações de trabalho " +
      "computadorizadas e demais periféricos adjuntos, além das estruturas tecnológicas (físicas ou lógicas) que " +
      "oferecem suporte a estas estações, bem como a instalação, atualização e correção dos softwares ali instalados."
  );

  // --- 2. SERVIÇOS ------------------------------------------------------------
  const prazoAtend = company?.sla_primeiro_atendimento_horas || 4;
  titulo("2. DOS SERVIÇOS");
  paragrafo(
    "2.1. Os serviços serão executados nos computadores da sede da empresa CONTRATANTE — os equipamentos cobertos " +
      "pela manutenção serão relacionados em aditivo anexo a este contrato, de acordo com a vistoria inicial à " +
      "prestação dos serviços —, no modem de internet, bem como em toda a rede de dados do local."
  );
  paragrafo(
    "2.2. Os serviços de manutenção preventiva e corretiva serão executados por meio de softwares de gestão e " +
      "monitoramento, tanto das estações de trabalho e periféricos como dos servidores e da rede local de dados e " +
      "internet, no modelo 24x7. Poderá também ser solicitado o serviço de chamada técnica de manutenção corretiva " +
      "a qualquer tempo, hipótese em que o atendimento será realizado de acordo com a urgência de cada chamado, " +
      `sendo que o prazo de atendimento não poderá ultrapassar ${prazoAtend} horas. Em todos os atendimentos será ` +
      "emitida ordem de serviço."
  );
  paragrafo(
    "2.3. Os pedidos de manutenção deverão ser feitos por meio de chamadas via WhatsApp ou chamada telefônica, " +
      "bem como por alerta emitido pelo sistema de monitoramento instalado nas estações de trabalho, visando a " +
      "melhor presteza no atendimento."
  );
  paragrafo(
    "2.4. O presente contrato não abrange as despesas com peças de reposição ou substituição, que correrão por " +
      "conta do CONTRATANTE, bem como o investimento técnico na segurança física dos computadores."
  );
  paragrafo(
    "2.5. O serviço será executado de maneira que permita sua continuação por qualquer profissional da área de " +
      "manutenção de microcomputadores a qualquer momento."
  );

  // --- 3. PRAZO E SANÇÕES -----------------------------------------------------
  titulo("3. DO PRAZO E DAS SANÇÕES");
  const vigenciaTxt = contract?.vigencia_fim
    ? `O contrato terá vigência a partir de ${fmtData(contract.vigencia_inicio)}, com término em ${fmtData(contract.vigencia_fim)}`
    : `O contrato terá validade de 1 (um) ano, contado a partir de ${fmtData(contract?.vigencia_inicio) || "sua assinatura"}`;
  const renovTxt =
    contract?.renovacao_automatica === false
      ? ", não havendo renovação automática ao seu término."
      : ", sendo que, caso não seja feita nenhuma solicitação de cancelamento durante sua vigência, será renovado automaticamente por igual período.";
  paragrafo("3.1. " + vigenciaTxt + renovTxt);
  paragrafo(
    "3.2. O contrato poderá ser cancelado a qualquer tempo por qualquer das partes, desde que avisado por escrito " +
      "com antecedência mínima de 30 (trinta) dias."
  );

  // --- 4. IMPLANTAÇÃO ---------------------------------------------------------
  titulo("4. DA IMPLANTAÇÃO DOS SERVIÇOS");
  paragrafo(
    "4.1. Para a implantação dos serviços será necessária uma vistoria geral e a implantação do sistema de controle " +
      "e gestão dos computadores, a fim de verificar o bom funcionamento de todas as estações de trabalho e " +
      "servidores de dados, bem como de toda a rede de dados e internet instalada na empresa."
  );
  paragrafo(
    "4.2. Após esta vistoria geral, será anexada ao contrato a relação de todas as máquinas, com suas respectivas " +
      "configurações, que fazem parte do sítio tecnológico da empresa."
  );

  // --- 5. PAGAMENTO -----------------------------------------------------------
  titulo("5. DA FORMA DE PAGAMENTO");
  const diaVenc = contract?.dia_vencimento || "____";
  let cl5 = 0;
  paragrafo(
    `5.${++cl5}. O pagamento dos serviços, objeto deste contrato, será efetuado por boleto bancário com vencimento todo ` +
      `dia ${diaVenc} de cada mês, no valor mensal de ${fmtMoeda(contract?.valor_mensal)}.`
  );
  if (contract?.reajuste_valor && Number(contract.reajuste_valor) > 0 && contract?.reajuste_data) {
    paragrafo(
      `5.${++cl5}. Fica desde já ajustado entre as partes que, a partir de ${fmtData(contract.reajuste_data)}, ` +
        `o valor mensal dos serviços passará a ser de ${fmtMoeda(Number(contract.reajuste_valor))}, ` +
        "independentemente da celebração de termo aditivo, permanecendo inalteradas as demais condições deste contrato."
    );
  }
  if (contract?.valor_implantacao && contract.valor_implantacao > 0) {
    paragrafo(
      `5.${++cl5}. O pagamento da instalação e implantação dos serviços, no valor de ${fmtMoeda(contract.valor_implantacao)}, ` +
        "será realizado em parcela única, 10 (dez) dias após o início dos trabalhos."
    );
  }
  paragrafo(
    `5.${++cl5}. O atraso no pagamento de qualquer parcela acarretará multa de 2% (dois por cento) sobre o valor em atraso, ` +
      "acrescida de juros de mora de 1% (um por cento) ao mês, calculados pro rata die."
  );

  // --- 6. CONFIDENCIALIDADE ---------------------------------------------------
  titulo("6. DA CONFIDENCIALIDADE E DO SIGILO");
  paragrafo(
    "6.1. A CONTRATADA assume o compromisso de manter a confidencialidade e o sigilo sobre todas as informações " +
      "jurídicas e técnicas relacionadas às atividades exercidas no âmbito do CONTRATANTE ou fora dele, obrigando-se a: " +
      "(i) não utilizar as informações confidenciais para gerar benefício próprio ou de terceiros; (ii) não efetuar " +
      "gravação ou cópia da documentação confidencial, salvo as estritamente necessárias à execução dos serviços; " +
      "(iii) não se apropriar de material confidencial e/ou sigiloso; e (iv) não repassar o conhecimento das " +
      "informações confidenciais, responsabilizando-se por todos aqueles que a elas tiverem acesso por seu intermédio."
  );
  paragrafo(
    "6.2. Considera-se Informação Confidencial toda informação revelada por uma parte à outra, sob forma escrita, " +
      "verbal ou por quaisquer outros meios, relativa a operações, processos, planos, dados, sistemas, projetos, " +
      "métodos, especificações e demais questões relativas ao desempenho das atividades."
  );
  paragrafo(
    "6.3. A obrigação de confidencialidade terá validade enquanto a informação não for tornada de conhecimento " +
      "público por terceiros, ou mediante autorização escrita da parte interessada. O descumprimento desta cláusula " +
      "sujeita a parte infratora às sanções judiciais cabíveis."
  );

  // --- 7. LGPD ----------------------------------------------------------------
  titulo("7. DA PROTEÇÃO DE DADOS PESSOAIS (LGPD)");
  paragrafo(
    "7.1. As partes obrigam-se a observar a Lei nº 13.709/2018 (Lei Geral de Proteção de Dados Pessoais – LGPD) e " +
      "demais normas aplicáveis ao tratamento de dados pessoais a que venham a ter acesso em razão deste contrato."
  );
  paragrafo(
    "7.2. A CONTRATADA tratará os dados pessoais a que tiver acesso exclusivamente para a finalidade de execução dos " +
      "serviços ora contratados, adotando medidas técnicas e administrativas de segurança aptas a protegê-los, e " +
      "comprometendo-se a eliminá-los ou devolvê-los ao término do contrato, salvo obrigação legal de retenção."
  );

  // --- 8. FORO ----------------------------------------------------------------
  titulo("8. DO FORO");
  paragrafo(
    `8.1. Fica eleito o Foro da Comarca de ${extrairForo(company?.endereco)} para dirimir quaisquer dúvidas oriundas ` +
      "do presente contrato que não encontrem entendimento entre as partes, com renúncia a qualquer outro, por mais " +
      "privilegiado que seja."
  );
  paragrafo(
    "E, por estarem assim justas e contratadas, as partes assinam o presente contrato em 2 (duas) vias de igual teor " +
      "e forma, para que produza seus legais e jurídicos efeitos.",
    { gap: 6 }
  );

  // --- local e data -----------------------------------------------------------
  ensureSpace(8);
  const foroCidade = extrairForo(company?.endereco).split("–")[0].trim() || "Goiânia";
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(`${foroCidade}, ${fmtData(new Date().toISOString())}.`, W - MR, y, { align: "right" });
  y += 16;

  // --- assinaturas ------------------------------------------------------------
  const assinatura = (linha1: string, linha2: string) => {
    ensureSpace(20);
    doc.setDrawColor(60, 60, 60);
    doc.setLineWidth(0.3);
    doc.line(ML + 20, y, W - MR - 20, y);
    y += 5;
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(20, 20, 20);
    doc.text(linha1, W / 2, y, { align: "center" });
    y += 4.5;
    doc.setFontSize(8.5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(90, 90, 90);
    doc.text(linha2, W / 2, y, { align: "center" });
    y += 14;
  };
  assinatura(CONTRATADA.razao_social, `CNPJ ${CONTRATADA.cnpj} — CONTRATADA`);
  assinatura(
    company?.razao_social || company?.nome_fantasia || "CONTRATANTE",
    `CNPJ ${cliCnpj} — CONTRATANTE`
  );

  // testemunhas
  ensureSpace(26);
  doc.setFontSize(9.5);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(20, 20, 20);
  doc.text("Testemunhas:", ML, y);
  y += 8;
  doc.setFont("helvetica", "normal");
  doc.setTextColor(60, 60, 60);
  ["1.", "2."].forEach((n) => {
    doc.text(`${n} ______________________________________`, ML, y);
    y += 5;
    doc.text("Nome:                                         CPF:", ML + 6, y);
    y += 11;
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
export async function downloadContratoPDF(contract: any, company: any) {
  const blob = await generateContratoPDF(contract, company);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const nome = (company?.nome_fantasia || company?.razao_social || "cliente")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "_");
  a.href = url;
  a.download = `Contrato_${nome}.pdf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

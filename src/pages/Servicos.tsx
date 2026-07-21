import { Wrench } from "lucide-react";
import { CatalogManager } from "@/components/catalog/CatalogManager";

export default function Servicos() {
  return (
    <CatalogManager
      kind="servico"
      icon={Wrench}
      title="Serviços"
      subtitle="Catálogo de serviços para propostas e orçamentos"
    />
  );
}

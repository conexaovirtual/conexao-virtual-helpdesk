import { Tags } from "lucide-react";
import { CatalogManager } from "@/components/catalog/CatalogManager";

export default function Produtos() {
  return (
    <CatalogManager
      kind="produto"
      icon={Tags}
      title="Produtos"
      subtitle="Catálogo de produtos para propostas e orçamentos"
    />
  );
}

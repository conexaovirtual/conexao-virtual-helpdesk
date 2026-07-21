import * as React from "react";

import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";

const Table = React.forwardRef<HTMLTableElement, React.HTMLAttributes<HTMLTableElement>>(
  ({ className, ...props }, ref) => {
    const isMobile = useIsMobile();
    const innerRef = React.useRef<HTMLTableElement>(null);
    React.useImperativeHandle(ref, () => innerRef.current as HTMLTableElement);

    // No mobile, transforma cada linha em um "cartão" rotulando as células com o
    // texto do cabeçalho correspondente (via data-label). Funciona para qualquer
    // tabela da plataforma sem precisar editar cada página.
    React.useEffect(() => {
      if (!isMobile) return;
      const table = innerRef.current;
      if (!table) return;

      const sync = () => {
        const headers = Array.from(table.querySelectorAll(":scope > thead th")).map(
          (th) => (th as HTMLElement).innerText.trim(),
        );
        table.querySelectorAll(":scope > tbody > tr").forEach((tr) => {
          Array.from(tr.children).forEach((cell, i) => {
            const td = cell as HTMLElement;
            const label = headers[i];
            // Células com colspan (estados de "carregando"/"vazio") não recebem rótulo.
            if (label && td.colSpan <= 1) td.dataset.label = label;
            else td.removeAttribute("data-label");
          });
        });
      };

      sync();
      const observer = new MutationObserver(sync);
      observer.observe(table, { childList: true, subtree: true, characterData: true });
      return () => observer.disconnect();
    }, [isMobile]);

    return (
      <div className="relative w-full overflow-auto">
        <table
          ref={innerRef}
          data-responsive-card={isMobile ? "" : undefined}
          className={cn("w-full caption-bottom text-sm", className)}
          {...props}
        />
      </div>
    );
  },
);
Table.displayName = "Table";

const TableHeader = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, ...props }, ref) => <thead ref={ref} className={cn("[&_tr]:border-b", className)} {...props} />,
);
TableHeader.displayName = "TableHeader";

const TableBody = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, ...props }, ref) => (
    <tbody ref={ref} className={cn("[&_tr:last-child]:border-0", className)} {...props} />
  ),
);
TableBody.displayName = "TableBody";

const TableFooter = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, ...props }, ref) => (
    <tfoot ref={ref} className={cn("border-t bg-muted/50 font-medium [&>tr]:last:border-b-0", className)} {...props} />
  ),
);
TableFooter.displayName = "TableFooter";

const TableRow = React.forwardRef<HTMLTableRowElement, React.HTMLAttributes<HTMLTableRowElement>>(
  ({ className, ...props }, ref) => (
    <tr
      ref={ref}
      className={cn("border-b transition-colors data-[state=selected]:bg-muted hover:bg-muted/50", className)}
      {...props}
    />
  ),
);
TableRow.displayName = "TableRow";

const TableHead = React.forwardRef<HTMLTableCellElement, React.ThHTMLAttributes<HTMLTableCellElement>>(
  ({ className, ...props }, ref) => (
    <th
      ref={ref}
      className={cn(
        "h-12 px-4 text-left align-middle font-medium text-muted-foreground [&:has([role=checkbox])]:pr-0",
        className,
      )}
      {...props}
    />
  ),
);
TableHead.displayName = "TableHead";

const TableCell = React.forwardRef<HTMLTableCellElement, React.TdHTMLAttributes<HTMLTableCellElement>>(
  ({ className, ...props }, ref) => (
    <td ref={ref} className={cn("p-4 align-middle [&:has([role=checkbox])]:pr-0", className)} {...props} />
  ),
);
TableCell.displayName = "TableCell";

const TableCaption = React.forwardRef<HTMLTableCaptionElement, React.HTMLAttributes<HTMLTableCaptionElement>>(
  ({ className, ...props }, ref) => (
    <caption ref={ref} className={cn("mt-4 text-sm text-muted-foreground", className)} {...props} />
  ),
);
TableCaption.displayName = "TableCaption";

export { Table, TableHeader, TableBody, TableFooter, TableHead, TableRow, TableCell, TableCaption };

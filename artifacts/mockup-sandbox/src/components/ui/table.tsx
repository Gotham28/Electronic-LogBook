import * as React from "react"

import { cn } from "@/lib/utils"

// Copies each column's header text onto its body cells as data-label. On phones, index.css
// hides the header and shows every row as a card, each value next to its column name.
// The ref is a table, or a container whose table[data-mobile="cards"] elements are labelled;
// pass `rerunWhen` when the container itself renders later (e.g. after data loads).
function labelTable(table: HTMLTableElement) {
  const heads = Array.from(table.querySelectorAll(":scope > thead > tr:last-child > th")).map((th) => th.textContent?.trim() ?? "")
  for (const row of Array.from(table.querySelectorAll(":scope > tbody > tr"))) {
    let column = 0
    for (const cell of Array.from(row.children) as HTMLTableCellElement[]) {
      const text = cell.colSpan > 1 ? "" : heads[column] ?? ""
      if (text) {
        if (cell.getAttribute("data-label") !== text) cell.setAttribute("data-label", text)
      } else if (cell.hasAttribute("data-label")) {
        cell.removeAttribute("data-label")
      }
      column += cell.colSpan || 1
    }
  }
}

export function useMobileCellLabels(ref: React.RefObject<HTMLElement | null>, enabled = true, rerunWhen?: unknown) {
  React.useLayoutEffect(() => {
    const root = ref.current
    if (!root || !enabled) return
    const label = () => {
      if (root instanceof HTMLTableElement) labelTable(root)
      else root.querySelectorAll<HTMLTableElement>('table[data-mobile="cards"]').forEach(labelTable)
    }
    label()
    const observer = new MutationObserver(label)
    observer.observe(root, { childList: true, subtree: true, characterData: true })
    return () => observer.disconnect()
  }, [ref, enabled, rerunWhen])
}

const Table = React.forwardRef<
  HTMLTableElement,
  React.HTMLAttributes<HTMLTableElement> & { mobileLayout?: "cards" | "scroll" }
>(({ className, mobileLayout = "cards", ...props }, ref) => {
  const tableRef = React.useRef<HTMLTableElement | null>(null)
  React.useImperativeHandle(ref, () => tableRef.current as HTMLTableElement)
  useMobileCellLabels(tableRef, mobileLayout === "cards")
  return (
    <div className="relative w-full overflow-auto">
      <table
        ref={tableRef}
        data-mobile={mobileLayout}
        className={cn("w-full caption-bottom text-sm [border-spacing:0_0.75rem]", className)}
        {...props}
      />
    </div>
  )
})
Table.displayName = "Table"

const TableHeader = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <thead ref={ref} className={cn("sticky top-0 z-10 bg-white/85 backdrop-blur-md [&_tr]:border-b [&_tr]:border-teal-100/80", className)} {...props} />
))
TableHeader.displayName = "TableHeader"

const TableBody = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <tbody
    ref={ref}
    className={cn("[&_tr:last-child]:border-0", className)}
    {...props}
  />
))
TableBody.displayName = "TableBody"

const TableFooter = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <tfoot
    ref={ref}
    className={cn(
      "border-t bg-muted/50 font-medium [&>tr]:last:border-b-0",
      className
    )}
    {...props}
  />
))
TableFooter.displayName = "TableFooter"

const TableRow = React.forwardRef<
  HTMLTableRowElement,
  React.HTMLAttributes<HTMLTableRowElement>
>(({ className, ...props }, ref) => (
  <tr
    ref={ref}
    className={cn(
      "border-b border-teal-100/65 transition-colors hover:bg-[#F7FCFC] data-[state=selected]:bg-teal-50/70",
      className
    )}
    {...props}
  />
))
TableRow.displayName = "TableRow"

const TableHead = React.forwardRef<
  HTMLTableCellElement,
  React.ThHTMLAttributes<HTMLTableCellElement>
>(({ className, ...props }, ref) => (
  <th
    ref={ref}
    className={cn(
      "h-11 px-4 text-left align-middle text-[11px] font-bold uppercase tracking-[0.18em] text-teal-900/60 [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]",
      className
    )}
    {...props}
  />
))
TableHead.displayName = "TableHead"

const TableCell = React.forwardRef<
  HTMLTableCellElement,
  React.TdHTMLAttributes<HTMLTableCellElement>
>(({ className, ...props }, ref) => (
  <td
    ref={ref}
    className={cn(
      "px-4 py-4 align-middle [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]",
      className
    )}
    {...props}
  />
))
TableCell.displayName = "TableCell"

const TableCaption = React.forwardRef<
  HTMLTableCaptionElement,
  React.HTMLAttributes<HTMLTableCaptionElement>
>(({ className, ...props }, ref) => (
  <caption
    ref={ref}
    className={cn("mt-4 text-sm text-muted-foreground", className)}
    {...props}
  />
))
TableCaption.displayName = "TableCaption"

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
}

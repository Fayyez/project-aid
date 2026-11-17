import Link from "next/link";
import { ArrowUpRight, CircleAlert, CircleCheck, Info, TriangleAlert } from "lucide-react";
import { Badge, Card, CardHeader, EmptyState, toneText } from "@/components/ui";
import type { AttentionItem } from "@/lib/services/queries";

const toneMeta = {
  danger: { icon: CircleAlert, label: "Urgent" },
  warning: { icon: TriangleAlert, label: "Watch" },
  info: { icon: Info, label: "FYI" },
} as const;

export function AttentionList({ items }: { items: AttentionItem[] }) {
  return (
    <Card as="section" aria-labelledby="attention-title">
      <CardHeader
        title={<span id="attention-title">Needs your attention</span>}
        description={items.length > 0 ? "Most urgent first. Each item links to where you can act." : undefined}
        actions={items.length > 0 ? <Badge tone="neutral">{items.length}</Badge> : undefined}
      />
      {items.length === 0 ? (
        <EmptyState icon={<CircleCheck size={20} />} title="Nothing needs you right now" description="No open incidents, late projects, blocked tickets or unread answers. New items will show up here." />
      ) : (
        <ul className="divide-y divide-line">
          {items.map((item, i) => {
            const meta = toneMeta[item.tone];
            const Icon = meta.icon;
            return (
              <li key={`${item.href}-${i}`}>
                <Link href={item.href} className="group flex min-w-0 items-start gap-3 px-4 py-3 hover:bg-surface-2/70">
                  <Icon size={16} aria-hidden className={`mt-0.5 shrink-0 ${toneText[item.tone]}`} />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-x-2 text-xs text-muted">
                      <span className={`font-semibold ${toneText[item.tone]}`}>{meta.label}</span>
                      <span className="truncate font-medium text-fg">{item.projectName}</span>
                    </span>
                    <span className="mt-0.5 block text-[13px] text-fg">{item.text}</span>
                  </span>
                  <ArrowUpRight size={14} aria-hidden className="mt-1 shrink-0 text-subtle group-hover:text-fg" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

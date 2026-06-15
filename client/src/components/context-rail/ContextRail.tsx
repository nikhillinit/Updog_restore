import { cn } from '@/lib/utils';
import type { ContextRailSection } from './context-rail-types';

export function ContextRail({
  sections,
  className,
}: {
  sections: ContextRailSection[];
  className?: string;
}) {
  return (
    <aside aria-label="Context rail" className={cn('space-y-6', className)}>
      {sections.map((section) => (
        <section key={section.id} aria-label={section.title}>
          <h3 className="text-sm font-semibold text-charcoal-900">{section.title}</h3>
          {section.items.length === 0 ? (
            <p className="mt-2 text-xs text-charcoal-500">{section.emptyText}</p>
          ) : (
            <ul className="mt-2 space-y-2">
              {section.items.map((item) => (
                <li key={item.id} className="rounded-md border border-beige-200 bg-white p-3">
                  <p className="text-xs font-medium text-charcoal-700">{item.label}</p>
                  {item.detail ? (
                    <p className="mt-1 text-xs text-charcoal-500">{item.detail}</p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </aside>
  );
}

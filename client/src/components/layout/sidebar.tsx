import { useState } from 'react';
import { cn } from '@/lib/utils';
import { Link, useLocation } from 'wouter';
import { useFundContext } from '@/contexts/FundContext';
import { POVIcon } from '@/components/ui/POVLogo';
import {
  getNavigationItems,
  getFooterNavigationItems,
  isNavigationItemEnabled,
  resolveNavigationHref,
  type NavigationContext,
  type NavigationItem,
} from './navigation-config';
import { ChevronDown, ChevronRight, Plus } from 'lucide-react';

interface SidebarProps {
  activeModule: string;
}

const chartCategories = [
  { id: 'basic', label: 'Basic Charts' },
  { id: 'statistical', label: 'Statistical' },
  { id: 'hierarchical', label: 'Hierarchical' },
  { id: 'flow', label: 'Flow Charts' },
  { id: 'advanced', label: 'Advanced' },
];

function baseNavClassName(isHovered: boolean, isActive: boolean, isDisabled: boolean): string {
  return cn(
    'w-full flex items-center rounded-md transition-colors font-poppins relative group',
    isHovered ? 'space-x-3 px-3 py-2.5' : 'justify-center p-2.5',
    isDisabled
      ? 'text-charcoal/40 cursor-not-allowed bg-lightGray'
      : isActive
        ? 'bg-beige/30 text-charcoal font-medium'
        : 'text-charcoal/70 hover:bg-lightGray'
  );
}

function NavItemContent({
  item,
  isHovered,
  isActive,
}: {
  item: NavigationItem;
  isHovered: boolean;
  isActive: boolean;
}) {
  const Icon = item.icon;

  return (
    <>
      <Icon className="h-5 w-5 flex-shrink-0 pointer-events-none" />
      {isHovered && (
        <span className={cn('text-sm whitespace-nowrap', isActive && 'font-medium')}>
          {item.label}
        </span>
      )}

      {!isHovered && (
        <div className="absolute left-full ml-2 px-2 py-1 bg-charcoal text-white text-xs rounded-md opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap z-50">
          {item.label}
        </div>
      )}
    </>
  );
}

function FooterNavItemContent({
  item,
  isHovered,
  isActive,
}: {
  item: NavigationItem;
  isHovered: boolean;
  isActive: boolean;
}) {
  const Icon = item.icon;

  return (
    <>
      <Icon className="h-4 w-4 flex-shrink-0 pointer-events-none" />
      {isHovered && (
        <span className={cn('text-sm whitespace-nowrap', isActive && 'font-medium')}>
          {item.label}
        </span>
      )}

      {!isHovered && (
        <div className="absolute left-full ml-2 px-2 py-1 bg-charcoal text-white text-xs rounded-md opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap z-50">
          {item.label}
        </div>
      )}
    </>
  );
}

function NavigationButton({
  item,
  href,
  isActive,
  isDisabled,
  isHovered,
  compact = false,
}: {
  item: NavigationItem;
  href: string | null;
  isActive: boolean;
  isDisabled: boolean;
  isHovered: boolean;
  compact?: boolean;
}) {
  const title = !isHovered ? item.label : undefined;
  const ariaLabel = !isHovered ? item.label : undefined;
  const className = compact
    ? cn(
        'w-full flex items-center rounded-md transition-colors font-poppins relative group',
        isHovered ? 'space-x-3 px-3 py-2' : 'justify-center p-2',
        isActive
          ? 'bg-beige/30 text-charcoal font-medium'
          : isDisabled
            ? 'text-charcoal/40 cursor-not-allowed bg-lightGray'
            : 'text-charcoal/60 hover:bg-lightGray hover:text-charcoal'
      )
    : baseNavClassName(isHovered, isActive, isDisabled);

  if (href && !isDisabled) {
    return (
      <Link
        href={href}
        title={title}
        aria-label={ariaLabel}
        className={className}
        aria-current={isActive ? 'page' : undefined}
        data-active={isActive ? 'true' : 'false'}
      >
        {compact ? (
          <FooterNavItemContent item={item} isHovered={isHovered} isActive={isActive} />
        ) : (
          <NavItemContent item={item} isHovered={isHovered} isActive={isActive} />
        )}
      </Link>
    );
  }

  return (
    <button
      type="button"
      disabled
      title={title}
      aria-label={ariaLabel}
      aria-disabled="true"
      data-active={isActive ? 'true' : 'false'}
      className={className}
    >
      {compact ? (
        <FooterNavItemContent item={item} isHovered={isHovered} isActive={isActive} />
      ) : (
        <NavItemContent item={item} isHovered={isHovered} isActive={isActive} />
      )}
    </button>
  );
}

export default function Sidebar({ activeModule }: SidebarProps) {
  const [isChartsExpanded, setIsChartsExpanded] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [location] = useLocation();
  const { needsSetup, currentFund } = useFundContext();

  const navigationItems = getNavigationItems();
  const footerItems = getFooterNavigationItems();
  const navigationContext: NavigationContext = {
    location,
    currentFundId: currentFund?.id ?? null,
    needsSetup,
  };

  return (
    <aside
      className={`bg-white shadow-card border-r border-lightGray flex-shrink-0 flex flex-col transition-all duration-300 ease-in-out ${
        isHovered ? 'w-64' : 'w-16'
      }`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className="p-3 border-b border-lightGray bg-charcoal">
        <div className="flex items-center mb-4">
          <div className="flex items-center justify-center w-10 h-10">
            <POVIcon variant="white" size="md" />
          </div>
          <div
            className={`ml-3 transition-opacity duration-300 ${isHovered ? 'opacity-100' : 'opacity-0 pointer-events-none'} overflow-hidden`}
          >
            <h1 className="font-inter font-bold text-lg text-white whitespace-nowrap">Updawg</h1>
            <p className="font-poppins text-xs text-slate-300 whitespace-nowrap">Fund Management</p>
          </div>
        </div>
        {currentFund && isHovered && (
          <div className="bg-charcoal/30 rounded-lg p-3 border border-beige/30 transition-all duration-300">
            <p className="font-poppins font-medium text-sm text-white truncate">
              {currentFund.name}
            </p>
            <p className="font-mono text-xs text-white/70 mt-1">
              ${(currentFund.size / 1000000).toFixed(0)}M Fund
            </p>
          </div>
        )}
      </div>

      <nav className="flex-1 p-2 overflow-y-auto custom-scrollbar bg-white">
        {needsSetup && isHovered && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4 transition-all duration-300">
            <div className="flex items-center space-x-2 mb-2">
              <Plus className="h-4 w-4 text-amber-700" />
              <span className="font-poppins text-sm font-medium text-amber-800">
                Setup Required
              </span>
            </div>
            <p className="font-poppins text-xs text-amber-600 mb-3">
              Configure your fund to access all features
            </p>
            <Link
              href="/fund-setup"
              className="block w-full bg-amber-600 text-white px-3 py-2 rounded-md text-sm font-medium hover:bg-amber-700 transition-all duration-200 text-center"
            >
              Start Fund Setup
            </Link>
          </div>
        )}

        <ul className="space-y-1">
          {navigationItems.map((item) => {
            const href = resolveNavigationHref(item, navigationContext);
            const isActive = activeModule === item.id;
            const isDisabled = !isNavigationItemEnabled(item, navigationContext);

            return (
              <li key={item.id}>
                <NavigationButton
                  item={item}
                  href={href}
                  isActive={isActive}
                  isDisabled={isDisabled}
                  isHovered={isHovered}
                />
              </li>
            );
          })}
        </ul>

        {isHovered && (
          <div className="mt-6 pt-4 border-t border-lightGray">
            <button
              onClick={() => setIsChartsExpanded(!isChartsExpanded)}
              className="w-full flex items-center justify-between px-2 py-2 text-xs font-medium text-charcoal/70 uppercase tracking-wider hover:text-charcoal transition-colors"
            >
              <span>Chart Types</span>
              {isChartsExpanded ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
            </button>

            {isChartsExpanded && (
              <ul className="mt-3 space-y-1">
                {chartCategories.map((category) => (
                  <li key={category.id}>
                    <button className="w-full text-left px-2 py-1 text-sm text-charcoal/70 hover:text-charcoal hover:bg-lightGray rounded-md transition-colors">
                      {category.label}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </nav>

      {footerItems.length > 0 && (
        <div className="border-t border-lightGray p-2 bg-gray-50">
          <ul className="space-y-1">
            {footerItems.map((item) => {
              const href = resolveNavigationHref(item, navigationContext);
              const isActive = activeModule === item.id;
              const isDisabled = !isNavigationItemEnabled(item, navigationContext);

              return (
                <li key={item.id}>
                  <NavigationButton
                    item={item}
                    href={href}
                    isActive={isActive}
                    isDisabled={isDisabled}
                    isHovered={isHovered}
                    compact
                  />
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </aside>
  );
}

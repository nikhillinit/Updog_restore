/**
 * SectorProfileSwitcher - Left sidebar for switching between sector profiles
 *
 * Features:
 * - List of sector profiles (B2B SaaS, Deep Tech, Consumer, etc.)
 * - Visual active state with ring indicator
 * - Stage count badges
 * - Add new profile button
 * - Keyboard accessible
 */

import React from 'react';
import { Plus, LayoutGrid, MoreHorizontal, Sparkles, Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface SectorProfile {
  id: string;
  name: string;
  stagesCount: number;
  isDefault?: boolean;
  isTemplate?: boolean;
}

interface SectorProfileSwitcherProps {
  profiles: SectorProfile[];
  activeProfileId: string;
  onSelectProfile: (id: string) => void;
  onAddProfile: () => void;
  onProfileMenu?: (id: string) => void;
  className?: string;
}

export function SectorProfileSwitcher({
  profiles,
  activeProfileId,
  onSelectProfile,
  onAddProfile,
  onProfileMenu,
  className,
}: SectorProfileSwitcherProps) {
  const getProfileIcon = (profile: SectorProfile) => {
    if (profile.isDefault) return <LayoutGrid className="w-4 h-4" />;
    if (profile.isTemplate) return <Sparkles className="w-4 h-4" />;
    return <Copy className="w-4 h-4" />;
  };

  return (
    <div
      className={cn(
        'w-64 bg-pov-white border-r border-beige-200 flex flex-col h-full flex-shrink-0',
        className
      )}
    >
      <div className="p-4 border-b border-beige-200">
        <h2 className="text-[10px] font-bold text-charcoal-500 uppercase tracking-wider mb-4 font-poppins">
          Sector profiles
        </h2>
        <div className="space-y-1">
          {profiles.map((profile) => {
            const isActive = activeProfileId === profile.id;
            return (
              <button
                key={profile.id}
                onClick={() => onSelectProfile(profile.id)}
                className={cn(
                  'w-full flex items-center justify-between px-3 py-3 rounded-lg text-sm transition-all group',
                  'focus:outline-none focus:ring-2 focus:ring-pov-charcoal focus:ring-offset-2',
                  isActive
                    ? 'bg-pov-charcoal text-pov-white font-semibold shadow-md ring-2 ring-pov-charcoal ring-offset-2'
                    : 'text-charcoal-700 hover:bg-pov-gray hover:text-pov-charcoal font-medium'
                )}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={cn(
                      isActive
                        ? 'text-charcoal-300'
                        : 'text-charcoal-400 group-hover:text-charcoal-600'
                    )}
                  >
                    {getProfileIcon(profile)}
                  </div>
                  <div className="flex flex-col items-start">
                    <span className="text-sm font-poppins">{profile.name}</span>
                    <span
                      className={cn(
                        'text-[10px] font-medium',
                        isActive ? 'text-charcoal-400' : 'text-charcoal-400'
                      )}
                    >
                      {profile.stagesCount} stages
                    </span>
                  </div>
                </div>

                {/* Menu button for non-default profiles */}
                {!profile.isDefault && onProfileMenu && (
                  <div
                    className={cn(
                      'opacity-0 group-hover:opacity-100 transition-opacity',
                      isActive && 'opacity-100'
                    )}
                  >
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onProfileMenu(profile.id);
                      }}
                      className="p-1 hover:bg-pov-white/20 rounded"
                    >
                      <MoreHorizontal
                        className={cn(
                          'w-4 h-4',
                          isActive
                            ? 'text-charcoal-400'
                            : 'text-charcoal-400 hover:text-charcoal-600'
                        )}
                      />
                    </button>
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="p-4 mt-auto border-t border-beige-200">
        <Button
          variant="outline"
          className="w-full justify-start text-charcoal-600 hover:text-pov-charcoal hover:bg-pov-gray font-medium font-poppins"
          size="sm"
          onClick={onAddProfile}
        >
          <Plus className="w-4 h-4 mr-2" />
          Add sector profile
        </Button>
      </div>
    </div>
  );
}

export default SectorProfileSwitcher;

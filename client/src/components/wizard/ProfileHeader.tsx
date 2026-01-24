/**
 * ProfileHeader - Header for sector profile with actions
 *
 * Features:
 * - Profile name with default badge
 * - Stage count and last edited timestamp
 * - Action buttons (Rename, Duplicate, Delete, Add Stage)
 * - Responsive layout
 */

import React from 'react';
import { Copy, Trash2, Edit2, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface ProfileHeaderProps {
  profileName: string;
  isDefault?: boolean;
  stageCount: number;
  lastEdited?: string;
  onRename?: () => void;
  onDuplicate?: () => void;
  onDelete?: () => void;
  onAddStage?: () => void;
  className?: string;
}

export function ProfileHeader({
  profileName,
  isDefault,
  stageCount,
  lastEdited = 'just now',
  onRename,
  onDuplicate,
  onDelete,
  onAddStage,
  className,
}: ProfileHeaderProps) {
  return (
    <div className={cn('flex items-center justify-between mb-8', className)}>
      <div>
        <div className="flex items-center gap-3 mb-1">
          <h1 className="text-2xl font-bold text-[#292929] font-poppins">{profileName}</h1>
          {isDefault && (
            <Badge variant="secondary" className="text-xs">
              Default Profile
            </Badge>
          )}
        </div>
        <p className="text-sm text-gray-500 font-poppins">
          {stageCount} investment stage{stageCount !== 1 ? 's' : ''} defined - Last edited {lastEdited}
        </p>
      </div>

      <div className="flex items-center gap-2">
        {!isDefault && onRename && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onRename}
            className="text-gray-600 hover:text-gray-900"
          >
            <Edit2 className="w-4 h-4 mr-2" />
            Rename
          </Button>
        )}
        {onDuplicate && (
          <Button
            variant="outline"
            size="sm"
            onClick={onDuplicate}
            className="border-[#E0D8D1]"
          >
            <Copy className="w-4 h-4 mr-2" />
            Duplicate
          </Button>
        )}
        {!isDefault && onDelete && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onDelete}
            className="text-red-600 hover:text-red-700 hover:bg-red-50"
          >
            <Trash2 className="w-4 h-4 mr-2" />
            Delete
          </Button>
        )}
        {onAddStage && (
          <>
            <div className="w-px h-6 bg-gray-200 mx-2" />
            <Button
              size="sm"
              onClick={onAddStage}
              className="bg-[#292929] hover:bg-[#292929]/90 text-white"
            >
              <Plus className="w-4 h-4 mr-2" />
              Add Stage
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

export default ProfileHeader;

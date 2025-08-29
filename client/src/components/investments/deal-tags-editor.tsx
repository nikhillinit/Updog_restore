/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable no-console */
/* eslint-disable react/no-unescaped-entities */
/* eslint-disable react-hooks/exhaustive-deps */
import { useState, useRef, useEffect } from 'react';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { X, Plus, Search, Tag } from 'lucide-react';

interface DealTagsEditorProps {
  selectedTags: string[];
  onTagsChange: (_tags: string[]) => void;
  className?: string;
}

// Predefined tags from Tactyc - matching the images provided
const PREDEFINED_TAGS = [
  'Asia',
  'CSR',
  'Environmental',
  'Female Founder',
  'General',
  'Governance',
  'Loan',
  'Minority Founder',
  'Social',
  'Warehoused',
  'AI/ML',
  'B2B',
  'B2C',
  'Payments',
  'Digital Health',
  'Marketplace',
  'SaaS',
  'FinTech',
  'EdTech',
  'PropTech',
  'CleanTech',
  'DeepTech',
  'Hardware',
  'Mobile',
  'Enterprise',
  'Consumer'
];

export default function DealTagsEditor({ selectedTags, onTagsChange, className = '' }: DealTagsEditorProps) {
  const [inputValue, setInputValue] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Filter available tags (exclude already selected ones)
  const availableTags = PREDEFINED_TAGS.filter(tag => 
    !selectedTags.includes(tag) && 
    tag.toLowerCase().includes(inputValue.toLowerCase())
  );

  const handleTagSelect = (tag: string) => {
    if (!selectedTags.includes(tag)) {
      onTagsChange([...selectedTags, tag]);
    }
    setInputValue('');
    setIsOpen(false);
  };

  const handleTagRemove = (tagToRemove: string) => {
    onTagsChange(selectedTags.filter(tag => tag !== tagToRemove));
  };

  const handleCustomTag = () => {
    const trimmedValue = inputValue.trim();
    if (trimmedValue && !selectedTags.includes(trimmedValue)) {
      onTagsChange([...selectedTags, trimmedValue]);
      setInputValue('');
      setIsOpen(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (availableTags.length > 0) {
        handleTagSelect(availableTags[0]);
      } else if (inputValue.trim()) {
        handleCustomTag();
      }
    } else if (e.key === 'Escape') {
      setIsOpen(false);
      setInputValue('');
    }
  };

  return (
    <div className={`space-y-3 ${className}`}>
      <div className="flex items-center gap-2">
        <Tag className="h-4 w-4 text-gray-500" />
        <label className="text-sm font-medium text-gray-700">Deal Tags</label>
        <div className="text-xs text-gray-400">
          <span className="inline-flex items-center">
            <span className="w-3 h-3 bg-blue-100 border border-blue-200 rounded-full mr-1"></span>
            you can enter new tags
          </span>
        </div>
      </div>

      {/* Selected Tags Display */}
      {selectedTags.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {selectedTags.map((tag) => (
            <Badge 
              key={tag} 
              variant="secondary" 
              className="bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100 pr-1"
            >
              {tag}
              <Button
                variant="ghost"
                size="sm"
                className="h-auto p-0 ml-2 hover:bg-transparent"
                onClick={() => handleTagRemove(tag)}
              >
                <X className="h-3 w-3" />
              </Button>
            </Badge>
          ))}
        </div>
      )}

      {/* Tag Input and Dropdown */}
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <div className="relative">
            <Input
              ref={inputRef}
              placeholder="Investment Tags (you can enter new tags)"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onFocus={() => setIsOpen(true)}
              onKeyDown={handleKeyDown}
              className="pr-8"
            />
            <Search className="h-4 w-4 absolute right-3 top-3 text-gray-400" />
          </div>
        </PopoverTrigger>
        
        <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
          <Command>
            <CommandList className="max-h-[200px]">
              {availableTags.length > 0 ? (
                <CommandGroup>
                  {availableTags.map((tag) => (
                    <CommandItem
                      key={tag}
                      onSelect={() => handleTagSelect(tag)}
                      className="cursor-pointer"
                    >
                      <Tag className="h-4 w-4 mr-2 text-gray-400" />
                      {tag}
                    </CommandItem>
                  ))}
                </CommandGroup>
              ) : null}
              
              {inputValue.trim() && !selectedTags.includes(inputValue.trim()) && (
                <CommandGroup>
                  <CommandItem
                    onSelect={handleCustomTag}
                    className="cursor-pointer border-t"
                  >
                    <Plus className="h-4 w-4 mr-2 text-green-500" />
                    Create "{inputValue.trim()}"
                  </CommandItem>
                </CommandGroup>
              )}
              
              {availableTags.length === 0 && !inputValue.trim() && (
                <CommandEmpty>No tags found.</CommandEmpty>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {/* Tag Count */}
      {selectedTags.length > 0 && (
        <div className="text-xs text-gray-500">
          {selectedTags.length} tag{selectedTags.length !== 1 ? 's' : ''} selected
        </div>
      )}
    </div>
  );
}

/**
 * Sector Mapping UI Component
 *
 * Provides a UI for mapping raw sectors to canonical sectors.
 * Supports bulk mapping operations.
 */

import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import {
  AlertCircle,
  CheckCircle,
  Search,
  Save,
  RefreshCw,
  ArrowRight,
} from 'lucide-react';
import { useUnmappedSectors, useUpsertSectorMappings } from '@/hooks/useCohortAnalysis';

interface SectorTaxonomyItem {
  id: string;
  name: string;
  slug: string;
  isSystem: boolean;
}

interface SectorMappingUIProps {
  /** Sector taxonomy for the fund */
  taxonomy: SectorTaxonomyItem[];
  /** Taxonomy version */
  taxonomyVersion?: string;
  /** Fund ID */
  fundId: number;
  /** Callback when mappings are saved */
  onSave?: () => void;
}

interface PendingMapping {
  rawValue: string;
  rawValueNormalized: string;
  canonicalSectorId: string;
  companyCount: number;
}

export function SectorMappingUI({
  taxonomy,
  taxonomyVersion = 'v1',
  fundId,
  onSave,
}: SectorMappingUIProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [pendingMappings, setPendingMappings] = useState<Map<string, PendingMapping>>(
    new Map()
  );
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());

  // Fetch unmapped sectors
  const {
    data: unmappedData,
    isLoading,
    refetch,
  } = useUnmappedSectors(taxonomyVersion);

  // Mutation for saving mappings
  const { mutate: saveMappings, isPending: isSaving } = useUpsertSectorMappings();

  // Filter unmapped sectors by search query
  const filteredUnmapped = useMemo(() => {
    if (!unmappedData?.unmapped) return [];

    const query = searchQuery.toLowerCase();
    return unmappedData.unmapped.filter(
      (sector) =>
        sector.rawValue.toLowerCase().includes(query) ||
        sector.rawValueNormalized.toLowerCase().includes(query)
    );
  }, [unmappedData, searchQuery]);

  // Handle mapping selection for a single row
  const handleMappingSelect = (
    rawValueNormalized: string,
    rawValue: string,
    companyCount: number,
    canonicalSectorId: string
  ) => {
    setPendingMappings((prev) => {
      const next = new Map(prev);
      if (canonicalSectorId === 'none') {
        next.delete(rawValueNormalized);
      } else {
        next.set(rawValueNormalized, {
          rawValue,
          rawValueNormalized,
          canonicalSectorId,
          companyCount,
        });
      }
      return next;
    });
  };

  // Handle bulk mapping for selected rows
  const handleBulkMap = (canonicalSectorId: string) => {
    setPendingMappings((prev) => {
      const next = new Map(prev);
      for (const normalized of selectedRows) {
        const sector = unmappedData?.unmapped.find(
          (s) => s.rawValueNormalized === normalized
        );
        if (sector) {
          next.set(normalized, {
            rawValue: sector.rawValue,
            rawValueNormalized: normalized,
            canonicalSectorId,
            companyCount: sector.companyCount,
          });
        }
      }
      return next;
    });
    setSelectedRows(new Set());
  };

  // Handle save
  const handleSave = () => {
    if (pendingMappings.size === 0) return;

    const mappings = Array.from(pendingMappings.values()).map((m) => ({
      rawValue: m.rawValue,
      canonicalSectorId: m.canonicalSectorId,
    }));

    saveMappings(
      {
        fundId,
        taxonomyVersion,
        mappings,
      },
      {
        onSuccess: () => {
          setPendingMappings(new Map());
          refetch();
          onSave?.();
        },
      }
    );
  };

  // Toggle row selection
  const toggleRowSelection = (normalized: string) => {
    setSelectedRows((prev) => {
      const next = new Set(prev);
      if (next.has(normalized)) {
        next.delete(normalized);
      } else {
        next.add(normalized);
      }
      return next;
    });
  };

  // Toggle all visible rows
  const toggleAllVisible = () => {
    if (selectedRows.size === filteredUnmapped.length) {
      setSelectedRows(new Set());
    } else {
      setSelectedRows(new Set(filteredUnmapped.map((s) => s.rawValueNormalized)));
    }
  };

  const totalCompaniesAffected = useMemo(() => {
    return Array.from(pendingMappings.values()).reduce(
      (sum, m) => sum + m.companyCount,
      0
    );
  }, [pendingMappings]);

  return (
    <Card>
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-semibold flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-amber-500" />
            Unmapped Sectors
            {unmappedData && (
              <Badge variant="outline">{unmappedData.unmappedCount} remaining</Badge>
            )}
          </CardTitle>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              <RefreshCw className="h-4 w-4 mr-1" />
              Refresh
            </Button>
            <Button
              size="sm"
              onClick={handleSave}
              disabled={pendingMappings.size === 0 || isSaving}
            >
              <Save className="h-4 w-4 mr-1" />
              Save {pendingMappings.size > 0 && `(${pendingMappings.size})`}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Search and Bulk Actions */}
        <div className="flex items-center gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search sectors..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          {selectedRows.size > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-500">
                {selectedRows.size} selected
              </span>
              <Select onValueChange={handleBulkMap}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="Bulk map to..." />
                </SelectTrigger>
                <SelectContent>
                  {taxonomy
                    .filter((t) => !t.isSystem)
                    .map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        {/* Pending Changes Summary */}
        {pendingMappings.size > 0 && (
          <div className="p-3 bg-blue-50 rounded-lg text-sm">
            <div className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-blue-600" />
              <span className="font-medium text-blue-800">
                {pendingMappings.size} mapping{pendingMappings.size > 1 ? 's' : ''} pending
              </span>
              <span className="text-blue-600">
                ({totalCompaniesAffected} companies affected)
              </span>
            </div>
          </div>
        )}

        {/* Table */}
        {isLoading ? (
          <div className="h-48 flex items-center justify-center">
            <RefreshCw className="h-6 w-6 animate-spin text-gray-400" />
          </div>
        ) : filteredUnmapped.length === 0 ? (
          <div className="h-48 flex flex-col items-center justify-center text-gray-500">
            <CheckCircle className="h-12 w-12 text-green-500 mb-2" />
            <p className="font-medium">All sectors are mapped!</p>
            <p className="text-sm">No unmapped sectors found.</p>
          </div>
        ) : (
          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">
                    <Checkbox
                      checked={selectedRows.size === filteredUnmapped.length}
                      onCheckedChange={toggleAllVisible}
                    />
                  </TableHead>
                  <TableHead>Raw Sector Value</TableHead>
                  <TableHead className="w-24 text-center">Companies</TableHead>
                  <TableHead className="w-8"></TableHead>
                  <TableHead className="w-64">Map To</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredUnmapped.map((sector) => {
                  const pending = pendingMappings.get(sector.rawValueNormalized);
                  const mappedTaxonomy = pending
                    ? taxonomy.find((t) => t.id === pending.canonicalSectorId)
                    : null;

                  return (
                    <TableRow key={sector.rawValueNormalized}>
                      <TableCell>
                        <Checkbox
                          checked={selectedRows.has(sector.rawValueNormalized)}
                          onCheckedChange={() =>
                            toggleRowSelection(sector.rawValueNormalized)
                          }
                        />
                      </TableCell>
                      <TableCell>
                        <div>
                          <span className="font-medium">{sector.rawValue}</span>
                          {sector.rawValue !== sector.rawValueNormalized && (
                            <span className="text-xs text-gray-400 ml-2">
                              (normalized: {sector.rawValueNormalized})
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant="secondary">{sector.companyCount}</Badge>
                      </TableCell>
                      <TableCell>
                        <ArrowRight className="h-4 w-4 text-gray-400" />
                      </TableCell>
                      <TableCell>
                        {pending ? (
                          <div className="flex items-center gap-2">
                            <Badge variant="default" className="font-normal">
                              {mappedTaxonomy?.name || pending.canonicalSectorId}
                            </Badge>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 px-2 text-xs"
                              onClick={() =>
                                handleMappingSelect(
                                  sector.rawValueNormalized,
                                  sector.rawValue,
                                  sector.companyCount,
                                  'none'
                                )
                              }
                            >
                              Clear
                            </Button>
                          </div>
                        ) : (
                          <Select
                            onValueChange={(value) =>
                              handleMappingSelect(
                                sector.rawValueNormalized,
                                sector.rawValue,
                                sector.companyCount,
                                value
                              )
                            }
                          >
                            <SelectTrigger className="h-8">
                              <SelectValue placeholder="Select sector..." />
                            </SelectTrigger>
                            <SelectContent>
                              {taxonomy
                                .filter((t) => !t.isSystem)
                                .map((t) => (
                                  <SelectItem key={t.id} value={t.id}>
                                    {t.name}
                                  </SelectItem>
                                ))}
                            </SelectContent>
                          </Select>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default SectorMappingUI;

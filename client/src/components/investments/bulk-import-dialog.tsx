/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable no-console */
/* eslint-disable react/no-unescaped-entities */
/* eslint-disable react-hooks/exhaustive-deps */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Upload, Download, FileSpreadsheet, AlertCircle } from "lucide-react";

interface BulkImportDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function BulkImportDialog({ isOpen, onOpenChange }: BulkImportDialogProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setSelectedFile(file);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Bulk Imports & Updates</DialogTitle>
          <DialogDescription>
            Import multiple investments or update existing ones using Excel templates
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="import" className="space-y-4">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="import">Import New Rounds</TabsTrigger>
            <TabsTrigger value="update">Update Existing</TabsTrigger>
            <TabsTrigger value="future">Build Future Rounds</TabsTrigger>
          </TabsList>

          <TabsContent value="import" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <FileSpreadsheet className="h-5 w-5" />
                  <span>Import New Investment Rounds</span>
                </CardTitle>
                <CardDescription>
                  Upload an Excel file with investment round data to add multiple investments at once
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
                  <Upload className="mx-auto h-12 w-12 text-gray-400 mb-4" />
                  <div className="space-y-2">
                    <p className="text-sm font-medium">Drop your Excel file here, or click to browse</p>
                    <p className="text-xs text-muted-foreground">Supports .xlsx, .xls files up to 10MB</p>
                  </div>
                  <input
                    type="file"
                    accept=".xlsx,.xls"
                    onChange={handleFileSelect}
                    className="hidden"
                    id="file-upload"
                  />
                  <label htmlFor="file-upload">
                    <Button variant="outline" className="mt-3" asChild>
                      <span>Choose File</span>
                    </Button>
                  </label>
                </div>

                {selectedFile && (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                    <div className="flex items-center space-x-2">
                      <FileSpreadsheet className="h-4 w-4 text-blue-600" />
                      <span className="text-sm font-medium">{selectedFile.name}</span>
                      <span className="text-xs text-muted-foreground">
                        ({(selectedFile.size / 1024).toFixed(1)} KB)
                      </span>
                    </div>
                  </div>
                )}

                <div className="flex items-start space-x-2 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                  <AlertCircle className="h-4 w-4 text-yellow-600 mt-0.5" />
                  <div className="text-sm">
                    <p className="font-medium text-yellow-800">Before uploading:</p>
                    <p className="text-yellow-700">Download our Excel template and follow the format exactly to ensure successful import.</p>
                  </div>
                </div>

                <div className="flex justify-between pt-4">
                  <Button variant="outline" className="flex items-center space-x-2">
                    <Download className="h-4 w-4" />
                    <span>Download Template</span>
                  </Button>
                  <div className="space-x-2">
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                      Cancel
                    </Button>
                    <Button 
                      className="povc-bg-primary hover:bg-blue-700"
                      disabled={!selectedFile}
                    >
                      Import Investments
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="update" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Update Existing Investments</CardTitle>
                <CardDescription>
                  Bulk update valuations, ownership percentages, or other investment data
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-center py-8">
                  <p className="text-muted-foreground">Select investments to update in bulk</p>
                  <Button variant="outline" className="mt-4">
                    Select Investments
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="future" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Build Future Rounds in Bulk</CardTitle>
                <CardDescription>
                  Automatically generate future rounds for multiple investments using sector profiles
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-center py-8">
                  <p className="text-muted-foreground">Build future rounds quickly for each company</p>
                  <Button variant="outline" className="mt-4">
                    Configure Bulk Future Rounds
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable no-console */
/* eslint-disable react/no-unescaped-entities */
/* eslint-disable react-hooks/exhaustive-deps */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Upload, Info } from "lucide-react";

// This component simulates what portfolio companies see when they click the KPI request link
export default function KPISubmission() {
  const [kpiData, setKpiData] = useState({
    arr: {
      "Jan 2021": "$1,500,000",
      "Apr 2021": "$1,592,560", 
      "Jul 2021": "$1,692,560",
      "Oct 2021": "$1,800,000",
      "Jan 2022": "$2,000,000",
      "Apr 2022": "$2,100,000"
    },
    comments: ""
  });

  const [uploadedFiles, setUploadedFiles] = useState<string[]>([]);

  const handleKPIChange = (period: string, value: string) => {
    setKpiData(prev => ({
      ...prev,
      arr: {
        ...prev.arr,
        [period]: value
      }
    }));
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    setUploadedFiles(prev => [...prev, ...files.map(f => f.name)]);
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header - Tactyc Branding */}
        <div className="text-center py-8">
          <div className="flex items-center justify-center space-x-2 mb-4">
            <span className="text-2xl font-bold text-blue-600">TACTYC</span>
            <span className="text-lg text-gray-600">VENTURES</span>
          </div>
          <p className="text-gray-600">June 2023 Data Request</p>
        </div>

        {/* Company Info */}
        <Card>
          <CardHeader className="bg-blue-50 border-b">
            <CardTitle className="text-xl text-center">
              Quantum Ventures II L.P. is requesting information from AlphaTech
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            {/* Instructions */}
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
              <h3 className="font-medium text-gray-900 mb-2">Instructions</h3>
              <ul className="text-sm text-gray-700 space-y-1">
                <li>• Please provide updates to requested KPI metrics below.</li>
                <li>• Data can be entered directly into the grid below or copy/pasted from Excel or Google Sheets. Remember to click <strong>Submit</strong> at the end of this sheet to send your updates.</li>
                <li>• For quantitative data, please enter data directly as <strong>numbers</strong>. For e.g. to enter $1 million, enter the data as 1000000.</li>
              </ul>
            </div>

            {/* ARR Section */}
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-medium text-gray-900 mb-4">ARR</h3>
                <p className="text-sm text-gray-600 mb-4">Please provide us your latest ARR estimates.</p>
                
                {/* KPI Data Grid */}
                <div className="overflow-x-auto">
                  <table className="w-full border border-gray-300">
                    <thead>
                      <tr className="bg-blue-600 text-white">
                        <th className="border border-gray-300 p-3 text-left font-medium">As of</th>
                        <th className="border border-gray-300 p-3 text-left font-medium">Jan 2021</th>
                        <th className="border border-gray-300 p-3 text-left font-medium">Apr 2021</th>
                        <th className="border border-gray-300 p-3 text-left font-medium">Jul 2021</th>
                        <th className="border border-gray-300 p-3 text-left font-medium">Oct 2021</th>
                        <th className="border border-gray-300 p-3 text-left font-medium">Jan 2022</th>
                        <th className="border border-gray-300 p-3 text-left font-medium">Apr 2022</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td className="border border-gray-300 p-3 bg-blue-600 text-white font-medium">ARR</td>
                        {Object.entries(kpiData.arr).map(([period, value]) => (
                          <td key={period} className="border border-gray-300 p-1">
                            <Input
                              value={value}
                              onChange={(e: any) => handleKPIChange(period, e.target.value)}
                              className="border-0 bg-blue-50 text-right"
                              placeholder="$0"
                            />
                          </td>
                        ))}
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Company Comments */}
              <div className="space-y-3">
                <Label htmlFor="comments" className="text-base font-medium">
                  Company Comments
                </Label>
                <Textarea
                  id="comments"
                  value={kpiData.comments}
                  onChange={(e: any) => setKpiData(prev => ({ ...prev, comments: e.target.value }))}
                  placeholder="Enter any additional comments or context about the data..."
                  className="min-h-24"
                />
              </div>

              {/* File Upload */}
              <div className="space-y-3">
                <div className="flex items-center space-x-2">
                  <Upload className="w-4 h-4 text-gray-600" />
                  <Label className="text-base font-medium">Upload Document</Label>
                </div>
                <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
                  <input
                    type="file"
                    multiple
                    onChange={handleFileUpload}
                    className="hidden"
                    id="file-upload"
                  />
                  <label htmlFor="file-upload" className="cursor-pointer">
                    <Upload className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                    <p className="text-sm text-gray-600">Click to upload supporting documents</p>
                    <p className="text-xs text-gray-500 mt-1">PDF, Excel, or image files accepted</p>
                  </label>
                </div>
                
                {uploadedFiles.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-gray-700">Uploaded Files:</p>
                    {uploadedFiles.map((file: any, index: any) => (
                      <div key={index} className="flex items-center space-x-2">
                        <Badge variant="outline" className="text-green-600 border-green-200">
                          {file}
                        </Badge>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Submit Section */}
              <div className="pt-6 border-t border-gray-200">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2 text-sm text-gray-600">
                    <Info className="w-4 h-4" />
                    <span>Data will be securely transmitted to Quantum Ventures II L.P.</span>
                  </div>
                  <Button className="bg-blue-600 hover:bg-blue-700 px-8">
                    Submit
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Footer */}
        <div className="text-center text-sm text-gray-500 py-4">
          <p>Powered by Tactyc • Secure Data Collection Platform</p>
        </div>
      </div>
    </div>
  );
}

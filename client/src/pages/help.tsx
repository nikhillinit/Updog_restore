/**
 * Help Page - Documentation and support resources
 *
 * Part of Codex-validated UI/UX restructure.
 */

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { POVBrandHeader } from "@/components/ui/POVLogo";
import {
  BookOpen,
  MessageCircle,
  Video,
  FileText,
  ExternalLink,
  Mail,
  HelpCircle
} from "lucide-react";

export default function HelpPage() {
  return (
    <div className="min-h-screen bg-slate-100">
      <POVBrandHeader
        title="Help & Support"
        subtitle="Documentation, tutorials, and contact support"
        variant="light"
      />

      <div className="max-w-4xl mx-auto px-6 py-8 space-y-6">
        {/* Quick Links */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card className="hover:shadow-md transition-shadow cursor-pointer">
            <CardContent className="pt-6">
              <div className="flex items-start gap-4">
                <div className="p-2 rounded-lg bg-pov-charcoal/5">
                  <BookOpen className="h-6 w-6 text-pov-charcoal" />
                </div>
                <div>
                  <h3 className="font-inter font-semibold text-sm text-pov-charcoal mb-1">
                    Documentation
                  </h3>
                  <p className="font-poppins text-xs text-gray-500 mb-3">
                    Comprehensive guides for all features
                  </p>
                  <Button variant="link" className="p-0 h-auto text-pov-charcoal">
                    Read docs <ExternalLink className="h-3 w-3 ml-1" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="hover:shadow-md transition-shadow cursor-pointer">
            <CardContent className="pt-6">
              <div className="flex items-start gap-4">
                <div className="p-2 rounded-lg bg-pov-charcoal/5">
                  <Video className="h-6 w-6 text-pov-charcoal" />
                </div>
                <div>
                  <h3 className="font-inter font-semibold text-sm text-pov-charcoal mb-1">
                    Video Tutorials
                  </h3>
                  <p className="font-poppins text-xs text-gray-500 mb-3">
                    Step-by-step walkthrough videos
                  </p>
                  <Button variant="link" className="p-0 h-auto text-pov-charcoal">
                    Watch tutorials <ExternalLink className="h-3 w-3 ml-1" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Common Questions */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <HelpCircle className="h-5 w-5 text-pov-charcoal" />
              <div>
                <CardTitle className="font-inter text-lg">Frequently Asked Questions</CardTitle>
                <CardDescription className="font-poppins text-sm">
                  Quick answers to common questions
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="border-b border-gray-100 pb-4">
              <h4 className="font-inter font-medium text-sm text-pov-charcoal mb-2">
                How do I add a new portfolio company?
              </h4>
              <p className="font-poppins text-xs text-gray-500">
                Navigate to Portfolio, then click "Add Company" in the Companies tab.
                Fill in the company details and investment information.
              </p>
            </div>
            <div className="border-b border-gray-100 pb-4">
              <h4 className="font-inter font-medium text-sm text-pov-charcoal mb-2">
                What is Reserve Planning?
              </h4>
              <p className="font-poppins text-xs text-gray-500">
                Reserve Planning helps you allocate follow-on capital across your portfolio.
                Use the Reallocation Tools to optimize reserve distribution.
              </p>
            </div>
            <div>
              <h4 className="font-inter font-medium text-sm text-pov-charcoal mb-2">
                How do I create scenarios for a company?
              </h4>
              <p className="font-poppins text-xs text-gray-500">
                Open any company from Portfolio, then select the Scenarios tab.
                Create scenarios to model different exit outcomes and valuations.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Contact Support */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <MessageCircle className="h-5 w-5 text-pov-charcoal" />
              <div>
                <CardTitle className="font-inter text-lg">Contact Support</CardTitle>
                <CardDescription className="font-poppins text-sm">
                  Get help from our team
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between p-4 rounded-lg bg-gray-50">
              <div className="flex items-center gap-3">
                <Mail className="h-5 w-5 text-pov-charcoal/60" />
                <div>
                  <p className="font-inter text-sm font-medium text-pov-charcoal">
                    Email Support
                  </p>
                  <p className="font-poppins text-xs text-gray-500">
                    support@pressonfund.com
                  </p>
                </div>
              </div>
              <Button className="bg-pov-charcoal hover:bg-pov-charcoal/90 text-pov-white">
                <Mail className="h-4 w-4 mr-2" />
                Send Message
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Release Notes */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <FileText className="h-5 w-5 text-pov-charcoal" />
              <div>
                <CardTitle className="font-inter text-lg">Release Notes</CardTitle>
                <CardDescription className="font-poppins text-sm">
                  See what's new in the latest version
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-start gap-3">
                <span className="font-mono text-xs text-pov-charcoal/60 mt-0.5">v2.4.0</span>
                <p className="font-poppins text-sm text-gray-600">
                  Simplified navigation with 4 primary nav items, merged Reserve Planning tab
                </p>
              </div>
              <div className="flex items-start gap-3">
                <span className="font-mono text-xs text-pov-charcoal/60 mt-0.5">v2.3.0</span>
                <p className="font-poppins text-sm text-gray-600">
                  Added company-level Scenarios tab with scenario comparison charts
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

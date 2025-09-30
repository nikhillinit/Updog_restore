/**
 * Notion Integration Page
 * Main page for managing Notion workspace connections and data synchronization
 */

import React from 'react';
import NotionIntegrationHub from '@/components/integrations/NotionIntegrationHub';

export default function NotionIntegrationPage() {
  return (
    <div className="container mx-auto p-6 space-y-6">
      <NotionIntegrationHub />
    </div>
  );
}
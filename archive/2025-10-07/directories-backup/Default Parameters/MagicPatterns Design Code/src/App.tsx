import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Header } from './components/layout/Header';
import { Sidebar } from './components/layout/Sidebar';
import { Dashboard } from './pages/Dashboard';
import { FundConstruction } from './pages/FundConstruction';
import { LPManagement } from './pages/LPManagement';
import './fonts.css';
export function App() {
  return <Router>
      <div className="flex flex-col min-h-screen bg-white font-poppins text-charcoal">
        <Header />
        <div className="flex flex-1">
          <Sidebar />
          <main className="flex-1 p-6">
            <Routes>
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/fund-construction" element={<FundConstruction />} />
              <Route path="/lp-management" element={<LPManagement />} />
              <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Routes>
          </main>
        </div>
      </div>
    </Router>;
}
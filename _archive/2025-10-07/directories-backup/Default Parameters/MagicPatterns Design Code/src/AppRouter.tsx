import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { App } from './App';
import { FundSetup } from './pages/FundSetup';
export function AppRouter() {
  return <BrowserRouter>
      <Routes>
        <Route path="/" element={<App />} />
        <Route path="/fund-setup" element={<FundSetup />} />
      </Routes>
    </BrowserRouter>;
}
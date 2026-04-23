
import React from 'react';
export const ComingSoonPage: React.FC<{ title: string; eta?: string; copy?: string }> = ({ title, eta, copy }) => (
  <div className="card" style={{ padding: 24, margin: 12 }}>
    <h1 className="h1" style={{ marginBottom: 8 }}>{title}</h1>
    <p className="subtle" style={{ marginBottom: 8 }}>{copy ?? 'This module is currently in development.'}</p>
    {eta ? <p className="subtle">ETA: {eta}</p> : null}
  </div>
);

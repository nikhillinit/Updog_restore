import React from 'react';
export function Header() {
  return <header className="bg-white shadow-sm">
      <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
        <div className="flex items-center">
          <div className="text-blue-600 font-bold text-lg">FundManager</div>
        </div>
        <div className="flex items-center space-x-4">
          <button className="text-sm text-gray-600 hover:text-gray-900">
            Help
          </button>
          <div className="h-6 w-6 rounded-full bg-gray-200"></div>
        </div>
      </div>
    </header>;
}
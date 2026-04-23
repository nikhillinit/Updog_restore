import React from 'react';
import { Link } from 'react-router-dom';
export function App() {
  return <div className="flex flex-col w-full min-h-screen justify-center items-center bg-gray-50 p-4">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">
        Fund Manager Dashboard
      </h1>
      <div className="bg-white shadow rounded-lg p-6 w-full max-w-md">
        <p className="text-gray-600 mb-6">
          Welcome to the Fund Manager platform. Get started by setting up your
          fund.
        </p>
        <Link to="/fund-setup?step=1" className="block w-full text-center px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700">
          Set Up Fund
        </Link>
      </div>
    </div>;
}
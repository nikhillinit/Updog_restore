import React, { useState } from 'react';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { PlusIcon, SearchIcon, FilterIcon, DownloadIcon, UploadIcon } from 'lucide-react';
const lpData = [{
  id: 1,
  name: 'Sequoia Capital',
  type: 'Institutional',
  commitment: '$10M',
  called: '60%',
  status: 'Active'
}, {
  id: 2,
  name: 'Jane Smith Family Office',
  type: 'Family Office',
  commitment: '$5M',
  called: '60%',
  status: 'Active'
}, {
  id: 3,
  name: 'John Doe',
  type: 'Individual',
  commitment: '$1M',
  called: '60%',
  status: 'Active'
}, {
  id: 4,
  name: 'Tech Ventures LLC',
  type: 'Corporate',
  commitment: '$7.5M',
  called: '60%',
  status: 'Active'
}, {
  id: 5,
  name: 'University Endowment',
  type: 'Endowment',
  commitment: '$8M',
  called: '60%',
  status: 'Pending'
}];
export const LPManagement = () => {
  const [searchTerm, setSearchTerm] = useState('');
  return <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-inter font-bold text-charcoal">
            Limited Partners
          </h1>
          <p className="text-charcoal/70 mt-1">
            Manage your fund's investors and commitments
          </p>
        </div>
        <Button variant="primary" icon={<PlusIcon size={16} />}>
          Add New LP
        </Button>
      </div>
      <Card>
        <div className="flex flex-col md:flex-row justify-between mb-6 space-y-4 md:space-y-0">
          <div className="relative w-full md:w-96">
            <Input id="search-lps" placeholder="Search LPs..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} icon={<SearchIcon size={18} />} className="mb-0" />
          </div>
          <div className="flex space-x-3">
            <Button variant="outline" icon={<FilterIcon size={16} />}>
              Filter
            </Button>
            <Button variant="outline" icon={<UploadIcon size={16} />}>
              Import
            </Button>
            <Button variant="outline" icon={<DownloadIcon size={16} />}>
              Export
            </Button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-lightGray">
            <thead>
              <tr>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-charcoal/70 uppercase tracking-wider">
                  LP Name
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-charcoal/70 uppercase tracking-wider">
                  Type
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-charcoal/70 uppercase tracking-wider">
                  Commitment
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-charcoal/70 uppercase tracking-wider">
                  Called
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-charcoal/70 uppercase tracking-wider">
                  Status
                </th>
                <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-charcoal/70 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-lightGray">
              {lpData.map(lp => <tr key={lp.id} className="hover:bg-lightGray/30 transition-colors">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="font-medium text-charcoal">{lp.name}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-charcoal/70">{lp.type}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-mono">{lp.commitment}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <div className="w-16 bg-lightGray rounded-full h-2 mr-2">
                        <div className="bg-beige h-2 rounded-full" style={{
                      width: lp.called
                    }}></div>
                      </div>
                      <span className="text-sm font-mono">{lp.called}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 py-1 inline-flex text-xs leading-5 font-medium rounded-full ${lp.status === 'Active' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
                      {lp.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <Button variant="ghost" size="sm">
                      View
                    </Button>
                    <Button variant="ghost" size="sm">
                      Edit
                    </Button>
                  </td>
                </tr>)}
            </tbody>
          </table>
        </div>
        <div className="mt-4 flex items-center justify-between border-t border-lightGray pt-4">
          <div className="text-sm text-charcoal/70">
            Showing <span className="font-medium">5</span> of{' '}
            <span className="font-medium">5</span> LPs
          </div>
          <div className="flex space-x-2">
            <Button variant="outline" size="sm" disabled>
              Previous
            </Button>
            <Button variant="outline" size="sm" disabled>
              Next
            </Button>
          </div>
        </div>
      </Card>
    </div>;
};
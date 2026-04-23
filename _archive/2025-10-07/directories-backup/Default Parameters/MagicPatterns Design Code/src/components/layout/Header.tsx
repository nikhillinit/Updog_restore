import React from 'react';
import { Link } from 'react-router-dom';
import { UserCircle2Icon, ChevronDownIcon, BellIcon } from 'lucide-react';
export const Header = () => {
  return <header className="bg-charcoal text-white py-4 px-6 flex items-center justify-between">
      <div className="flex items-center">
        <Link to="/dashboard" className="flex items-center">
          <div className="font-inter font-bold text-2xl mr-2">
            <span className="text-beige">U</span>pdawg
          </div>
          <span className="text-sm text-white/70">by Press On Ventures</span>
        </Link>
      </div>
      <div className="flex items-center space-x-6">
        <div className="relative">
          <button className="flex items-center space-x-2 bg-charcoal/30 rounded-md px-3 py-2 hover:bg-charcoal/50 transition-colors">
            <span>Seed Fund II</span>
            <ChevronDownIcon size={16} />
          </button>
        </div>
        <div className="relative">
          <BellIcon size={20} className="text-white/70 hover:text-white cursor-pointer" />
        </div>
        <div className="flex items-center space-x-2">
          <UserCircle2Icon size={32} className="text-beige" />
          <div className="flex flex-col">
            <span className="text-sm font-medium">Alex Chen</span>
            <span className="text-xs text-white/70">Fund Manager</span>
          </div>
          <ChevronDownIcon size={16} />
        </div>
      </div>
    </header>;
};
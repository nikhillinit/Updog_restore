import React from 'react';
import { NavLink } from 'react-router-dom';
import { LayoutDashboardIcon, WandIcon, UsersIcon, PieChartIcon, LineChartIcon, SettingsIcon, HelpCircleIcon } from 'lucide-react';
export const Sidebar = () => {
  const navItems = [{
    name: 'Dashboard',
    path: '/dashboard',
    icon: <LayoutDashboardIcon size={20} />
  }, {
    name: 'Fund Construction',
    path: '/fund-construction',
    icon: <WandIcon size={20} />
  }, {
    name: 'LP Management',
    path: '/lp-management',
    icon: <UsersIcon size={20} />
  }, {
    name: 'Portfolio',
    path: '/portfolio',
    icon: <PieChartIcon size={20} />
  }, {
    name: 'Analytics',
    path: '/analytics',
    icon: <LineChartIcon size={20} />
  }];
  const bottomNavItems = [{
    name: 'Settings',
    path: '/settings',
    icon: <SettingsIcon size={20} />
  }, {
    name: 'Help',
    path: '/help',
    icon: <HelpCircleIcon size={20} />
  }];
  return <aside className="w-64 bg-white border-r border-lightGray flex flex-col h-[calc(100vh-4rem)]">
      <nav className="flex-1 py-6">
        <ul className="space-y-1 px-3">
          {navItems.map(item => <li key={item.path}>
              <NavLink to={item.path} className={({
            isActive
          }) => `flex items-center px-3 py-2.5 rounded-md transition-colors ${isActive ? 'bg-beige/30 text-charcoal font-medium' : 'text-charcoal/70 hover:bg-lightGray'}`}>
                <span className="mr-3">{item.icon}</span>
                <span>{item.name}</span>
              </NavLink>
            </li>)}
        </ul>
      </nav>
      <div className="border-t border-lightGray py-4">
        <ul className="space-y-1 px-3">
          {bottomNavItems.map(item => <li key={item.path}>
              <NavLink to={item.path} className={({
            isActive
          }) => `flex items-center px-3 py-2.5 rounded-md transition-colors ${isActive ? 'bg-beige/30 text-charcoal font-medium' : 'text-charcoal/70 hover:bg-lightGray'}`}>
                <span className="mr-3">{item.icon}</span>
                <span>{item.name}</span>
              </NavLink>
            </li>)}
        </ul>
      </div>
    </aside>;
};
import React from 'react';

interface NavItemProps {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  active: boolean;
  onClick: () => void;
}

export function NavItem({ icon: Icon, label, active, onClick }: NavItemProps) {
  return (
    <button 
      onClick={onClick}
      className={`flex flex-col items-center gap-1 px-2 sm:px-3 py-1 rounded-2xl transition-all shrink-0 ${active ? 'text-orange-500' : 'text-zinc-500'}`}
    >
      <div className={`p-1.5 sm:p-2 rounded-xl transition-all ${active ? 'bg-orange-500/10' : ''}`}>
        <Icon className="w-5 h-5 sm:w-6 h-6" />
      </div>
      <span className="text-[9px] sm:text-[10px] font-bold uppercase tracking-wider">{label}</span>
    </button>
  );
}

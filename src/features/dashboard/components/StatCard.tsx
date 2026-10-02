import React from 'react';
import { LucideIcon } from 'lucide-react';

interface StatCardProps {
  id?: string;
  label: string;
  value: number | string;
  icon: LucideIcon;
  color: string;
  bg: string;
  full?: boolean;
  isCount?: boolean;
  onClick?: () => void;
  title?: string;
}

export function StatCard({ 
  id, 
  label, 
  value, 
  icon: Icon, 
  color, 
  bg, 
  full, 
  isCount, 
  onClick, 
  title 
}: StatCardProps) {
  return (
    <div 
      id={id}
      onClick={onClick}
      title={title}
      className={`${bg} border border-zinc-800 rounded-3xl p-4 sm:p-5 ${full ? 'col-span-2' : ''} ${
        onClick ? 'cursor-pointer group hover:border-zinc-700/80 hover:bg-zinc-850/50 transition-all select-none active:scale-[0.99]' : ''
      }`}
    >
      <div className="flex items-start gap-2.5 sm:gap-3 mb-2.5 sm:mb-3">
        <div className={`p-2 rounded-xl bg-zinc-800 ${color} shrink-0`}>
          <Icon className="w-4 h-4 sm:w-5 sm:h-5" />
        </div>
        <span className="text-zinc-400 text-[11px] sm:text-xs font-semibold uppercase tracking-wider leading-snug break-words flex-1 min-w-0 pt-0.5">
          {label}
        </span>
      </div>
      <p className={`text-xl sm:text-2xl font-bold ${color} tracking-tight break-words`}>
        {!isCount && '₹'}{(typeof value === 'number' ? value.toLocaleString('en-IN') : value)}
      </p>
    </div>
  );
}

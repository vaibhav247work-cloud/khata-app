import React from 'react';

interface StatCardProps {
  label: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  bg: string;
  full?: boolean;
  isCount?: boolean;
}

export function StatCard({ label, value, icon: Icon, color, bg, full, isCount }: StatCardProps) {
  return (
    <div className={`${bg} border border-zinc-800 rounded-3xl p-5 ${full ? 'col-span-2' : ''}`}>
      <div className="flex items-center gap-3 mb-3">
        <div className={`p-2 rounded-xl bg-zinc-800 ${color}`}>
          <Icon className="w-5 h-5" />
        </div>
        <span className="text-zinc-500 text-xs font-medium uppercase tracking-wider">{label}</span>
      </div>
      <p className={`text-2xl font-bold ${color}`}>
        {!isCount && '₹'}{value.toLocaleString()}
      </p>
    </div>
  );
}

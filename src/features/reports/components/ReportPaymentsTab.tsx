import React from 'react';
import { CreditCard } from 'lucide-react';
import { EXPENSE_PALETTE } from '../../../constants/theme';
import { type CategoryMetric } from './ReportExpensesTab';

interface ReportPaymentsTabProps {
  paymentModeData: CategoryMetric[];
}

export function ReportPaymentsTab({ paymentModeData }: ReportPaymentsTabProps) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 space-y-5">
      <div>
        <h3 className="font-bold text-base sm:text-lg text-white">Payment Modes Breakdown</h3>
        <p className="text-zinc-500 text-xs">Volume and percentage share by payment instrument</p>
      </div>

      {paymentModeData.length === 0 ? (
        <div className="p-12 text-center text-zinc-500 text-xs">No transactions logged in this period.</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          {paymentModeData.map((mode, idx) => {
            const color = EXPENSE_PALETTE[idx % EXPENSE_PALETTE.length];
            return (
              <div key={mode.name} className="p-4 rounded-2xl bg-zinc-950/60 border border-zinc-800/80 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CreditCard className="w-4 h-4 text-orange-400" />
                    <span className="font-bold text-sm text-white">{mode.name}</span>
                  </div>
                  <span className="text-xs font-bold text-orange-400">{mode.percentage.toFixed(1)}%</span>
                </div>
                <div>
                  <p className="text-lg font-black text-white font-mono">₹{mode.value.toLocaleString('en-IN')}</p>
                  <p className="text-[11px] text-zinc-500 mt-0.5">{mode.count} transaction{mode.count === 1 ? '' : 's'}</p>
                </div>
                <div className="w-full bg-zinc-800 rounded-full h-1.5 overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${mode.percentage}%`, backgroundColor: color }} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

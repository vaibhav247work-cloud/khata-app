import React from 'react';
import { AlertTriangle, Clock, Share2, ChevronRight } from 'lucide-react';
import { type Order } from '../../../db';
import { shareToWhatsApp, generateOrderWhatsAppReminder } from '../../../utils/whatsappReminders';

interface OverdueOrderWithDays extends Order {
  daysOverdue: number;
}

interface OverdueAlertBannerProps {
  overdueOrders: OverdueOrderWithDays[];
  totalOverdueAmount: number;
  onNavigateToPendingOrders?: () => void;
  onNavigateToOverdueOrders?: () => void;
  showToast?: (message: string, type?: 'success' | 'error' | 'info') => void;
}

export function OverdueAlertBanner({
  overdueOrders,
  totalOverdueAmount,
  onNavigateToPendingOrders,
  onNavigateToOverdueOrders,
  showToast,
}: OverdueAlertBannerProps) {
  // STRICT RULE: Only display when there is overdue data (count > 0). Never render unnecessary empty cards.
  if (!overdueOrders || overdueOrders.length === 0) {
    return null;
  }

  return (
    <div 
      id="dashboard-overdue-alert-section"
      className="bg-gradient-to-br from-amber-950/40 via-zinc-900 to-zinc-900 border border-amber-500/40 rounded-3xl p-5 sm:p-6 shadow-md shadow-amber-950/20 space-y-4"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-zinc-800">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
            <AlertTriangle className="w-4 h-4 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-base sm:text-lg text-white">Overdue Payments Alert</h3>
              <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                {overdueOrders.length} {overdueOrders.length === 1 ? 'Order' : 'Orders'}
              </span>
            </div>
            <p className="text-zinc-400 text-xs mt-0.5">
              Orders with pending balances unpaid for more than 7 days
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0 self-start sm:self-auto">
          <div className="text-left sm:text-right">
            <span className="text-[10px] uppercase font-bold text-zinc-500 block">Total Overdue</span>
            <span className="text-base sm:text-lg font-black text-amber-400 font-mono">
              ₹{totalOverdueAmount.toLocaleString('en-IN')}
            </span>
          </div>
        </div>
      </div>

      {/* Overdue Orders Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {overdueOrders.slice(0, 4).map((order) => {
          const itemsPreview = (order.items || []).filter(i => i.material).map(i => i.material).join(', ') || 'Materials';
          return (
            <div 
              key={order.order_id} 
              className="bg-zinc-950/70 border border-zinc-800 hover:border-amber-500/40 rounded-2xl p-3.5 space-y-2.5 transition-all group"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-xs font-bold text-white truncate max-w-[160px]">
                      {order.supplier}
                    </span>
                    <span className="text-[10px] font-mono text-zinc-500 bg-zinc-900 px-1.5 py-0.5 rounded border border-zinc-800">
                      #{order.order_id.slice(0, 6)}
                    </span>
                  </div>
                  <p className="text-[11px] text-zinc-400 truncate mt-0.5 font-medium">
                    {itemsPreview}
                  </p>
                </div>

                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30 shrink-0 flex items-center gap-1">
                  <Clock className="w-3 h-3 text-amber-400" />
                  <span>{order.daysOverdue}d Overdue</span>
                </span>
              </div>

              <div className="flex items-center justify-between pt-1 border-t border-zinc-800/80 text-xs">
                <div>
                  <span className="text-zinc-500 text-[10px] block">Pending Due</span>
                  <span className="font-bold text-red-400 font-mono text-sm">
                    ₹{Number(order.remaining_amount).toLocaleString('en-IN')}
                  </span>
                </div>

                <div className="flex items-center gap-1.5">
                  {/* WhatsApp Reminder Button */}
                  <button
                    type="button"
                    onClick={async (e) => {
                      e.stopPropagation();
                      const msg = generateOrderWhatsAppReminder(order, order.daysOverdue);
                      await shareToWhatsApp(msg);
                      showToast?.('WhatsApp reminder formatted & opened!', 'success');
                    }}
                    className="px-2.5 py-1.5 rounded-xl bg-emerald-950/60 hover:bg-emerald-900/80 text-emerald-400 border border-emerald-700/50 text-[11px] font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-xs active:scale-95"
                    title="Send WhatsApp Payment Reminder to Supplier"
                  >
                    <Share2 className="w-3.5 h-3.5" />
                    <span>Remind</span>
                  </button>

                  {/* Pay / Settle Button */}
                  <button
                    type="button"
                    onClick={() => {
                      onNavigateToPendingOrders?.();
                    }}
                    className="px-2.5 py-1.5 rounded-xl bg-orange-600 hover:bg-orange-500 text-white text-[11px] font-bold flex items-center gap-1 transition-all cursor-pointer shadow-xs active:scale-95"
                    title="View in Orders to record payment"
                  >
                    <span>Settle</span>
                    <ChevronRight className="w-3 h-3" />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer Navigation Link */}
      {overdueOrders.length > 0 && onNavigateToOverdueOrders && (
        <div className="pt-1 flex items-center justify-between text-xs">
          <span className="text-zinc-400 text-[11px]">
            Showing {Math.min(4, overdueOrders.length)} of {overdueOrders.length} overdue orders
          </span>
          <button
            type="button"
            onClick={onNavigateToOverdueOrders}
            className="font-bold text-amber-400 hover:text-amber-300 flex items-center gap-1 underline underline-offset-2 transition-colors cursor-pointer"
          >
            <span>View all {overdueOrders.length} overdue orders in Orders</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}

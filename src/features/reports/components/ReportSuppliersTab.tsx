import React, { useState } from 'react';
import { 
  Package, 
  Building2, 
  Share2, 
  ChevronDown, 
  Sparkles 
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { type Order, type Transaction } from '../../../db';
import { 
  shareToWhatsApp, 
  generateSupplierWhatsAppStatement, 
  generateOrderWhatsAppReminder 
} from '../../../utils/whatsappReminders';

export interface SupplierMetric {
  supplier: string;
  totalBilled: number;
  totalPaid: number;
  remaining: number;
  orderCount: number;
}

interface ReportSuppliersTabProps {
  supplierData: SupplierMetric[];
  filteredOrders: Order[];
  filteredTxs: Transaction[];
  totalOrdersAmount: number;
  totalOrdersPaid: number;
  totalOrdersRemaining: number;
  reportSearchQuery: string;
  showToast?: (message: string, type: 'success' | 'error' | 'info') => void;
}

export function ReportSuppliersTab({
  supplierData,
  filteredOrders,
  filteredTxs,
  totalOrdersAmount,
  totalOrdersPaid,
  totalOrdersRemaining,
  reportSearchQuery,
  showToast,
}: ReportSuppliersTabProps) {
  const [supplierDuesFilter, setSupplierDuesFilter] = useState<'all' | 'pending' | 'settled'>('all');
  const [expandedSupplier, setExpandedSupplier] = useState<string | null>(null);
  const [supplierSubTab, setSupplierSubTab] = useState<'orders' | 'payments'>('orders');

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-5 sm:p-6 space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center text-orange-400">
              <Package className="w-4 h-4" />
            </div>
            <h3 className="font-bold text-base sm:text-lg text-white">Supplier Khata & Party Ledger</h3>
          </div>
          <p className="text-zinc-500 text-xs mt-0.5">
            Complete party accounts, pending dues, order history & 1-click WhatsApp statements
          </p>
        </div>

        {/* Quick Dues Filter Buttons */}
        <div className="flex items-center p-1 bg-zinc-950/80 rounded-xl border border-zinc-800 text-[11px] self-start sm:self-auto">
          <button
            type="button"
            onClick={() => setSupplierDuesFilter('all')}
            className={`px-3 py-1 rounded-lg font-semibold transition-all cursor-pointer ${
              supplierDuesFilter === 'all'
                ? 'bg-zinc-800 text-white shadow-xs'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            All ({supplierData.length})
          </button>
          <button
            type="button"
            onClick={() => setSupplierDuesFilter('pending')}
            className={`px-3 py-1 rounded-lg font-semibold transition-all cursor-pointer ${
              supplierDuesFilter === 'pending'
                ? 'bg-orange-500/20 text-orange-300 border border-orange-500/30'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            With Dues ({supplierData.filter(s => s.remaining > 0).length})
          </button>
          <button
            type="button"
            onClick={() => setSupplierDuesFilter('settled')}
            className={`px-3 py-1 rounded-lg font-semibold transition-all cursor-pointer ${
              supplierDuesFilter === 'settled'
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Settled ({supplierData.filter(s => s.remaining === 0).length})
          </button>
        </div>
      </div>

      {/* Supplier KPI Overview Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-3.5 rounded-2xl bg-zinc-950/60 border border-zinc-800/80 space-y-1">
          <span className="text-[10px] text-zinc-500 uppercase font-semibold block">Total Suppliers</span>
          <p className="text-xl font-bold text-white font-mono">{supplierData.length}</p>
          <p className="text-[10px] text-zinc-500">{filteredOrders.length} total orders</p>
        </div>
        <div className="p-3.5 rounded-2xl bg-zinc-950/60 border border-zinc-800/80 space-y-1">
          <span className="text-[10px] text-zinc-500 uppercase font-semibold block">Total Billed</span>
          <p className="text-xl font-bold text-zinc-200 font-mono">₹{totalOrdersAmount.toLocaleString('en-IN')}</p>
          <p className="text-[10px] text-zinc-500">Gross purchase value</p>
        </div>
        <div className="p-3.5 rounded-2xl bg-zinc-950/60 border border-zinc-800/80 space-y-1">
          <span className="text-[10px] text-zinc-500 uppercase font-semibold block">Total Paid</span>
          <p className="text-xl font-bold text-emerald-400 font-mono">₹{totalOrdersPaid.toLocaleString('en-IN')}</p>
          <p className="text-[10px] text-zinc-500">Cleared payments</p>
        </div>
        <div className="p-3.5 rounded-2xl bg-zinc-950/60 border border-zinc-800/80 space-y-1">
          <span className="text-[10px] text-zinc-500 uppercase font-semibold block">Outstanding Dues</span>
          <p className={`text-xl font-bold font-mono ${totalOrdersRemaining > 0 ? 'text-orange-400' : 'text-zinc-500'}`}>
            ₹{totalOrdersRemaining.toLocaleString('en-IN')}
          </p>
          <p className="text-[10px] text-zinc-500">
            {totalOrdersAmount > 0 ? `${((totalOrdersPaid / totalOrdersAmount) * 100).toFixed(0)}% settled` : 'No dues'}
          </p>
        </div>
      </div>

      {/* Supplier Khata Cards & Ledger List */}
      {supplierData.length === 0 ? (
        <div className="p-12 text-center text-zinc-500 text-xs">No orders or bills logged in this period.</div>
      ) : (
        <div className="space-y-3">
          {supplierData
            .filter((sup) => {
              if (supplierDuesFilter === 'pending' && sup.remaining <= 0) return false;
              if (supplierDuesFilter === 'settled' && sup.remaining > 0) return false;
              if (reportSearchQuery && !sup.supplier.toLowerCase().includes(reportSearchQuery.toLowerCase())) return false;
              return true;
            })
            .map((sup) => {
              const isExpanded = expandedSupplier === sup.supplier;
              const supOrders = (filteredOrders || []).filter((o: any) => String(o.supplier || '').trim() === sup.supplier);
              const supPayments = (filteredTxs || []).filter((t: any) => 
                t.type === 'Debit' && (String(t.category || '').trim() === sup.supplier || (t.description && t.description.toLowerCase().includes(sup.supplier.toLowerCase())))
              );
              const hasPendingDues = sup.remaining > 0;

              return (
                <div 
                  key={`sup-khata-${sup.supplier}`}
                  className={`border rounded-2xl transition-all overflow-hidden ${
                    isExpanded 
                      ? 'bg-zinc-950/90 border-orange-500/50 shadow-md ring-1 ring-orange-500/20' 
                      : 'bg-zinc-950/50 border-zinc-800/90 hover:border-zinc-700'
                  }`}
                >
                  {/* Supplier Summary Header */}
                  <div 
                    onClick={() => setExpandedSupplier(prev => prev === sup.supplier ? null : sup.supplier)}
                    className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer select-none group"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 border ${
                        hasPendingDues 
                          ? 'bg-amber-500/10 border-amber-500/25 text-amber-400' 
                          : 'bg-zinc-800/80 border-zinc-700/60 text-zinc-400'
                      }`}>
                        <Building2 className="w-5 h-5" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="font-bold text-sm sm:text-base text-white group-hover:text-orange-400 transition-colors truncate">
                            {sup.supplier}
                          </h4>
                          {hasPendingDues ? (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30">
                              ₹{sup.remaining.toLocaleString('en-IN')} Due
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                              All Paid
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-zinc-500 mt-0.5">
                          {sup.orderCount} order{sup.orderCount !== 1 ? 's' : ''} · Billed: ₹{sup.totalBilled.toLocaleString('en-IN')} · Paid: ₹{sup.totalPaid.toLocaleString('en-IN')}
                        </p>
                      </div>
                    </div>

                    {/* Right Quick Actions */}
                    <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
                      {/* WhatsApp Statement Button */}
                      <button
                        type="button"
                        onClick={async (e) => {
                          e.stopPropagation();
                          const statement = generateSupplierWhatsAppStatement(sup.supplier, sup, supOrders);
                          await shareToWhatsApp(statement);
                          showToast?.(`WhatsApp statement for ${sup.supplier} copied & opened!`, 'success');
                        }}
                        className="px-2.5 py-1.5 rounded-xl bg-emerald-950/60 hover:bg-emerald-900/80 text-emerald-400 border border-emerald-700/50 text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer active:scale-95 shadow-xs"
                        title="Share complete party ledger statement via WhatsApp"
                      >
                        <Share2 className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">WhatsApp</span>
                      </button>

                      {/* Expand / Collapse Icon */}
                      <div className={`p-1.5 rounded-xl bg-zinc-800 text-zinc-400 transition-transform ${isExpanded ? 'rotate-180 text-white' : ''}`}>
                        <ChevronDown className="w-4 h-4" />
                      </div>
                    </div>
                  </div>

                  {/* Expanded Party Ledger Drilldown */}
                  {isExpanded && (
                    <div className="p-4 border-t border-zinc-800/80 bg-zinc-900/60 space-y-4">
                      {/* Inner Tabs: Orders vs Payments */}
                      <div className="flex items-center justify-between gap-2 border-b border-zinc-800/80 pb-2">
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => setSupplierSubTab('orders')}
                            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                              supplierSubTab === 'orders'
                                ? 'bg-zinc-800 text-white shadow-xs'
                                : 'text-zinc-400 hover:text-zinc-200'
                            }`}
                          >
                            Orders ({supOrders.length})
                          </button>
                          <button
                            type="button"
                            onClick={() => setSupplierSubTab('payments')}
                            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                              supplierSubTab === 'payments'
                                ? 'bg-zinc-800 text-white shadow-xs'
                                : 'text-zinc-400 hover:text-zinc-200'
                            }`}
                          >
                            Payments Logged ({supPayments.length})
                          </button>
                        </div>

                        <span className="text-[11px] text-zinc-500 font-medium">
                          {sup.supplier} Party Khata
                        </span>
                      </div>

                      {/* View A: Supplier Orders */}
                      {supplierSubTab === 'orders' && (
                        <div className="space-y-2">
                          {supOrders.length === 0 ? (
                            <p className="text-zinc-500 text-xs py-4 text-center">No orders recorded for this supplier in this period.</p>
                          ) : (
                            supOrders.map((order: any) => {
                              const itemsText = (order.items || []).filter((i: any) => i.material).map((i: any) => i.material).join(', ') || 'Materials';
                              const isOrderPending = order.status !== 'Completed' && Number(order.remaining_amount) > 0;
                              return (
                                <div 
                                  key={`sup-order-${order.order_id}`} 
                                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 rounded-xl bg-zinc-950/70 border border-zinc-800/80 text-xs"
                                >
                                  <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <span className="font-mono text-zinc-400 bg-zinc-900 px-1.5 py-0.5 rounded border border-zinc-800">
                                        #{order.order_id.slice(0, 8)}
                                      </span>
                                      <span className="text-zinc-300 font-medium truncate">{itemsText}</span>
                                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                        order.status === 'Completed' ? 'bg-green-500/10 text-green-400' :
                                        order.status === 'Partial' ? 'bg-orange-500/10 text-orange-400' : 'bg-yellow-500/10 text-yellow-400'
                                      }`}>
                                        {order.status}
                                      </span>
                                    </div>
                                    <p className="text-[10px] text-zinc-500 mt-1">
                                      Date: {format(parseISO(order.date), 'dd MMM yyyy')}
                                    </p>
                                  </div>

                                  <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0">
                                    <div className="text-right">
                                      <span className="font-bold text-white font-mono">₹{Number(order.total_amount).toLocaleString('en-IN')}</span>
                                      {isOrderPending ? (
                                        <span className="text-orange-400 text-[10px] block font-semibold font-mono">
                                          Due: ₹{Number(order.remaining_amount).toLocaleString('en-IN')}
                                        </span>
                                      ) : (
                                        <span className="text-emerald-400 text-[10px] block font-semibold">
                                          Fully Paid
                                        </span>
                                      )}
                                    </div>

                                    {/* 1-click Remind Button */}
                                    {isOrderPending && (
                                      <button
                                        type="button"
                                        onClick={async () => {
                                          const reminder = generateOrderWhatsAppReminder(order);
                                          await shareToWhatsApp(reminder);
                                          showToast?.('WhatsApp reminder formatted & opened!', 'success');
                                        }}
                                        className="px-2 py-1 rounded-lg bg-emerald-950/60 hover:bg-emerald-900/80 text-emerald-400 border border-emerald-700/50 text-[10px] font-bold flex items-center gap-1 cursor-pointer"
                                        title="Send WhatsApp payment reminder for this invoice"
                                      >
                                        <Share2 className="w-3 h-3" />
                                        <span>Remind</span>
                                      </button>
                                    )}
                                  </div>
                                </div>
                              );
                            })
                          )}
                        </div>
                      )}

                      {/* View B: Supplier Payments Log */}
                      {supplierSubTab === 'payments' && (
                        <div className="space-y-2">
                          {supPayments.length === 0 ? (
                            <p className="text-zinc-500 text-xs py-4 text-center">No debit transaction entries tagged directly under this supplier name.</p>
                          ) : (
                            supPayments.map((pmt: any) => (
                              <div 
                                key={`sup-pmt-${pmt.id}`}
                                className="flex items-center justify-between p-3 rounded-xl bg-zinc-950/70 border border-zinc-800/80 text-xs"
                              >
                                <div>
                                  <p className="font-medium text-white">{pmt.description || 'Payment made to supplier'}</p>
                                  <p className="text-[10px] text-zinc-500 mt-0.5">
                                    {format(parseISO(pmt.date), 'dd MMM yyyy')} · Mode: {pmt.payment_type}
                                  </p>
                                </div>
                                <div className="text-right">
                                  <span className="font-bold text-emerald-400 font-mono text-sm">
                                    ₹{Number(pmt.amount).toLocaleString('en-IN')}
                                  </span>
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      )}

                      {/* Full Party WhatsApp Statement Generator Callout */}
                      <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-3 p-3 rounded-2xl bg-zinc-950 border border-zinc-800/90 text-xs">
                        <div className="flex items-center gap-2">
                          <Sparkles className="w-4 h-4 text-orange-400" />
                          <span className="text-zinc-300 font-medium">
                            Ready to share complete account statement with <strong>{sup.supplier}</strong>
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={async () => {
                            const statement = generateSupplierWhatsAppStatement(sup.supplier, sup, supOrders);
                            await shareToWhatsApp(statement);
                            showToast?.(`Full party statement for ${sup.supplier} copied & opened in WhatsApp!`, 'success');
                          }}
                          className="w-full sm:w-auto px-4 py-2 bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-2 transition-all cursor-pointer shadow-md shadow-emerald-600/20"
                        >
                          <Share2 className="w-3.5 h-3.5" />
                          <span>Share Statement via WhatsApp</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
        </div>
      )}
    </div>
  );
}

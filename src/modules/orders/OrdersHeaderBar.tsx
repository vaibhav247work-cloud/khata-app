import React from 'react';
import { Search, Plus, ListChecks, ArrowUpDown, X } from 'lucide-react';
import type { Order } from '../../types';

interface OrdersHeaderBarProps {
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  sortOrder: 'desc' | 'asc';
  onToggleSort: () => void;
  hasFilteredOrders: boolean;
  selectedCount: number;
  onToggleSelection: () => void;
  onCreateOrder: () => void;
  statusFilter: 'All' | 'Pending' | 'Partial' | 'Completed';
  setStatusFilter: (s: 'All' | 'Pending' | 'Partial' | 'Completed') => void;
  orders: Order[];
}

export function OrdersHeaderBar({
  searchQuery,
  setSearchQuery,
  sortOrder,
  onToggleSort,
  hasFilteredOrders,
  selectedCount,
  onToggleSelection,
  onCreateOrder,
  statusFilter,
  setStatusFilter,
  orders,
}: OrdersHeaderBarProps) {
  return (
    <>
      {/* Search and Action Bar */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500 w-5 h-5" />
          <input 
            type="text" 
            placeholder="Search supplier or material..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-zinc-900 border border-zinc-800 rounded-2xl pl-12 pr-10 py-3.5 text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-orange-500 text-sm"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 p-1 rounded-lg text-zinc-400 hover:text-white bg-zinc-800 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <button 
          onClick={onToggleSort}
          title={sortOrder === 'desc' ? 'Sorted Newest First' : 'Sorted Oldest First'}
          className="p-3.5 bg-zinc-900 border border-zinc-800 rounded-2xl text-zinc-400 hover:text-white transition-colors shrink-0"
        >
          <ArrowUpDown className="w-5 h-5" />
        </button>

        {hasFilteredOrders && (
          <button
            type="button"
            onClick={onToggleSelection}
            title={selectedCount > 0 ? 'Clear Selection' : 'Select Orders for Batch Settle/Print'}
            className={`p-3.5 rounded-2xl border transition-all flex items-center justify-center shrink-0 ${
              selectedCount > 0 
                ? 'bg-orange-500/20 border-orange-500 text-orange-400 shadow-lg shadow-orange-500/20' 
                : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-white'
            }`}
          >
            <ListChecks className="w-5 h-5" />
          </button>
        )}

        <button 
          onClick={onCreateOrder}
          className="bg-orange-500 hover:bg-orange-600 p-3.5 rounded-2xl text-white shadow-lg shadow-orange-500/20 transition-all flex items-center justify-center shrink-0"
          title="Create Order"
        >
          <Plus className="w-5 h-5" />
        </button>
      </div>

      {/* Status Filter Tabs */}
      <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
        {(['All', 'Pending', 'Partial', 'Completed'] as const).map(tab => (
          <button 
            key={tab} 
            onClick={() => setStatusFilter(tab)}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
              statusFilter === tab 
                ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/20' 
                : 'bg-zinc-900 text-zinc-500 border border-zinc-800'
            }`}
          >
            {tab} {tab === 'All' ? `(${orders.length})` : `(${orders.filter(o => o.status === tab).length})`}
          </button>
        ))}
      </div>
    </>
  );
}

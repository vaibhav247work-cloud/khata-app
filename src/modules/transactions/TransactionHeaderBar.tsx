import { Search, Plus, ListChecks, X } from 'lucide-react';

interface TransactionHeaderBarProps {
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  hasVisibleTransactions: boolean;
  selectedCount: number;
  onToggleMultiSelect: () => void;
  onAddNewTransaction: () => void;
}

export function TransactionHeaderBar({
  searchQuery,
  setSearchQuery,
  hasVisibleTransactions,
  selectedCount,
  onToggleMultiSelect,
  onAddNewTransaction,
}: TransactionHeaderBarProps) {
  return (
    <div className="flex items-center gap-3">
      <div className="relative flex-1">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500 w-5 h-5" />
        <input 
          id="tx-search-input"
          type="text" 
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search category, desc, ref..." 
          className="w-full bg-zinc-900 border border-zinc-800 rounded-2xl pl-12 pr-10 py-3.5 text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-orange-500 text-sm"
        />
        {searchQuery && (
          <button
            id="clear-tx-search-btn"
            type="button"
            onClick={() => setSearchQuery('')}
            className="absolute right-3.5 top-1/2 -translate-y-1/2 p-1 rounded-lg text-zinc-400 hover:text-white bg-zinc-800 hover:bg-zinc-700 transition-colors"
            title="Clear search"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      <div className="flex items-center gap-2">
        {hasVisibleTransactions && (
          <button
            id="toggle-multi-select-btn"
            type="button"
            onClick={onToggleMultiSelect}
            title={selectedCount > 0 ? 'Clear Selection' : 'Select All for Bulk Delete'}
            className={`p-3.5 rounded-2xl border transition-all flex items-center justify-center shrink-0 ${
              selectedCount > 0 
                ? 'bg-orange-500/20 border-orange-500 text-orange-400 shadow-lg shadow-orange-500/20' 
                : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-white hover:border-zinc-700'
            }`}
          >
            <ListChecks className="w-5 h-5" />
          </button>
        )}

        <button 
          id="add-new-tx-btn"
          onClick={onAddNewTransaction}
          className="bg-orange-500 hover:bg-orange-600 p-3.5 rounded-2xl text-white shadow-lg shadow-orange-500/20 active:scale-95 transition-all flex items-center justify-center shrink-0"
          title="Add Transaction"
        >
          <Plus className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}

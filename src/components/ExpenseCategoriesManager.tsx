import React, { useState, useMemo } from 'react';
import { Tag, Plus, Pencil, Trash2, Check, X, RotateCcw, AlertTriangle, Layers } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { db, type Transaction } from '../db';
import { DEFAULT_EXPENSE_CATEGORIES } from '../utils/categoriesAndModes';

interface ExpenseCategoriesManagerProps {
  categories: string[];
  onUpdateCategories: (newCategories: string[]) => void;
  transactions: Transaction[];
  showToast: (msg: string, type: 'success' | 'error' | 'info') => void;
  markSyncPending?: () => void;
  onRefreshData?: () => void;
}

export function ExpenseCategoriesManager({
  categories,
  onUpdateCategories,
  transactions,
  showToast,
  markSyncPending,
  onRefreshData
}: ExpenseCategoriesManagerProps) {
  const [newCategoryName, setNewCategoryName] = useState('');
  const [editingCategory, setEditingCategory] = useState<{ oldName: string; currentName: string } | null>(null);
  const [categoryToDelete, setCategoryToDelete] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Transaction count per category
  const categoryUsageCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const tx of transactions) {
      if (tx.category) {
        counts[tx.category] = (counts[tx.category] || 0) + 1;
      }
    }
    return counts;
  }, [transactions]);

  const filteredCategories = useMemo(() => {
    if (!searchQuery.trim()) return categories;
    const q = searchQuery.toLowerCase().trim();
    return categories.filter(c => c.toLowerCase().includes(q));
  }, [categories, searchQuery]);

  const handleAddCategory = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newCategoryName.trim();
    if (!trimmed) {
      showToast('Category name cannot be empty', 'error');
      return;
    }

    const exists = categories.some(c => c.toLowerCase() === trimmed.toLowerCase());
    if (exists) {
      showToast(`Category "${trimmed}" already exists`, 'error');
      return;
    }

    const updated = [...categories, trimmed];
    onUpdateCategories(updated);
    setNewCategoryName('');
    showToast(`Added category "${trimmed}"`, 'success');
  };

  const handleStartEdit = (category: string) => {
    setEditingCategory({ oldName: category, currentName: category });
  };

  const handleSaveEdit = async () => {
    if (!editingCategory) return;
    const trimmed = editingCategory.currentName.trim();
    const oldName = editingCategory.oldName;

    if (!trimmed) {
      showToast('Category name cannot be empty', 'error');
      return;
    }

    if (trimmed.toLowerCase() === oldName.toLowerCase()) {
      setEditingCategory(null);
      return;
    }

    const exists = categories.some(
      c => c.toLowerCase() === trimmed.toLowerCase() && c.toLowerCase() !== oldName.toLowerCase()
    );
    if (exists) {
      showToast(`Category "${trimmed}" already exists`, 'error');
      return;
    }

    setIsProcessing(true);
    try {
      // 1. Update categories list
      const updated = categories.map(c => (c === oldName ? trimmed : c));
      onUpdateCategories(updated);

      // 2. Update existing transactions in local database if any
      const usedCount = categoryUsageCounts[oldName] || 0;
      if (usedCount > 0) {
        await db.transactions
          .where('category')
          .equals(oldName)
          .modify({ category: trimmed, synced: false });

        markSyncPending?.();
        onRefreshData?.();
      }

      setEditingCategory(null);
      showToast(
        usedCount > 0
          ? `Updated "${oldName}" to "${trimmed}" (and updated ${usedCount} record${usedCount > 1 ? 's' : ''})`
          : `Updated category to "${trimmed}"`,
        'success'
      );
    } catch (err) {
      console.error('Error renaming category:', err);
      showToast('Failed to update category', 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleConfirmDelete = () => {
    if (!categoryToDelete) return;
    const catName = categoryToDelete;
    const updated = categories.filter(c => c !== catName);
    onUpdateCategories(updated);
    setCategoryToDelete(null);
    showToast(`Deleted category "${catName}"`, 'success');
  };

  const handleResetDefaults = () => {
    onUpdateCategories(DEFAULT_EXPENSE_CATEGORIES);
    showToast('Expense categories reset to defaults', 'success');
  };

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-[36px] p-6 sm:p-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 bg-orange-500/10 rounded-2xl flex items-center justify-center text-orange-400 shrink-0">
            <Tag className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-xl font-bold text-white">Expense Categories</h3>
              <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-orange-500/15 text-orange-400 border border-orange-500/30">
                {categories.length}
              </span>
            </div>
            <p className="text-xs text-zinc-400 mt-0.5">
              Categories available in the transaction entry form and filters
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleResetDefaults}
          className="text-xs font-semibold text-zinc-400 hover:text-orange-400 flex items-center gap-1.5 transition-colors self-start sm:self-center px-3 py-1.5 rounded-xl hover:bg-zinc-800/80 border border-transparent hover:border-zinc-700"
          title="Reset to default categories"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>Reset Defaults</span>
        </button>
      </div>

      {/* Add Category Form */}
      <form onSubmit={handleAddCategory} className="flex gap-2">
        <input
          type="text"
          value={newCategoryName}
          onChange={(e) => setNewCategoryName(e.target.value)}
          placeholder="New category name (e.g. Plumbing, Electrical)..."
          className="flex-1 bg-zinc-800/60 border border-zinc-700/60 rounded-2xl px-4 py-3 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-orange-500/60 transition-all"
        />
        <button
          type="submit"
          className="bg-orange-500 hover:bg-orange-600 active:scale-95 text-white font-bold text-sm px-5 py-3 rounded-2xl flex items-center gap-2 transition-all shadow-lg shadow-orange-500/20 shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span className="hidden sm:inline">Add Category</span>
          <span className="sm:hidden">Add</span>
        </button>
      </form>

      {/* Search Categories if more than 6 */}
      {categories.length > 6 && (
        <div className="relative">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search categories..."
            className="w-full bg-zinc-800/40 border border-zinc-750 rounded-xl px-3.5 py-2 text-xs text-zinc-300 placeholder:text-zinc-500 focus:outline-none focus:border-orange-500/40"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-2.5 text-zinc-400 hover:text-zinc-200 text-xs"
            >
              Clear
            </button>
          )}
        </div>
      )}

      {/* Categories Grid / List */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-[360px] overflow-y-auto pr-1">
        {filteredCategories.map((cat) => {
          const isEditing = editingCategory?.oldName === cat;
          const usageCount = categoryUsageCounts[cat] || 0;

          if (isEditing) {
            return (
              <div
                key={cat}
                className="col-span-1 sm:col-span-2 flex items-center gap-2 p-2 bg-zinc-800 border border-orange-500/50 rounded-2xl"
              >
                <input
                  type="text"
                  value={editingCategory.currentName}
                  onChange={(e) =>
                    setEditingCategory({ ...editingCategory, currentName: e.target.value })
                  }
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleSaveEdit();
                    } else if (e.key === 'Escape') {
                      setEditingCategory(null);
                    }
                  }}
                  autoFocus
                  className="flex-1 bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-orange-500"
                />
                <button
                  type="button"
                  onClick={handleSaveEdit}
                  disabled={isProcessing}
                  className="p-2 rounded-xl bg-green-500/20 text-green-400 hover:bg-green-500 hover:text-white transition-all disabled:opacity-50"
                  title="Save category name"
                >
                  <Check className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setEditingCategory(null)}
                  className="p-2 rounded-xl bg-zinc-700 text-zinc-300 hover:bg-zinc-600 transition-all"
                  title="Cancel edit"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            );
          }

          return (
            <div
              key={cat}
              className="flex items-center justify-between p-3.5 rounded-2xl bg-zinc-800/40 hover:bg-zinc-800/70 border border-zinc-750/50 transition-all group"
            >
              <div className="flex items-center gap-2.5 min-w-0 flex-1 mr-2">
                <span className="w-2 h-2 rounded-full bg-orange-400 shrink-0" />
                <span className="text-sm font-semibold text-zinc-200 truncate">{cat}</span>
                {usageCount > 0 && (
                  <span
                    className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400 border border-zinc-700/60 shrink-0"
                    title={`${usageCount} transaction${usageCount > 1 ? 's' : ''} recorded under this category`}
                  >
                    {usageCount} {usageCount === 1 ? 'entry' : 'entries'}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-1 shrink-0 opacity-80 group-hover:opacity-100 transition-opacity">
                <button
                  type="button"
                  onClick={() => handleStartEdit(cat)}
                  className="p-1.5 rounded-lg text-zinc-400 hover:text-orange-400 hover:bg-orange-500/10 transition-colors"
                  title={`Edit "${cat}"`}
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setCategoryToDelete(cat)}
                  className="p-1.5 rounded-lg text-zinc-400 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                  title={`Delete "${cat}"`}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          );
        })}

        {filteredCategories.length === 0 && (
          <div className="col-span-1 sm:col-span-2 py-8 text-center text-zinc-500 text-xs">
            {searchQuery ? `No categories found matching "${searchQuery}"` : 'No categories configured.'}
          </div>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {categoryToDelete && (
          <div
            className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm"
            onClick={() => setCategoryToDelete(null)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-zinc-900 border border-zinc-800 p-6 sm:p-7 rounded-[32px] max-w-sm w-full shadow-2xl space-y-4"
            >
              <div className="w-12 h-12 bg-red-500/10 text-red-500 rounded-2xl flex items-center justify-center mx-auto">
                <AlertTriangle className="w-6 h-6" />
              </div>

              <div className="text-center space-y-2">
                <h4 className="text-lg font-bold text-white">Delete Category?</h4>
                <p className="text-xs text-zinc-400 leading-relaxed">
                  Are you sure you want to remove <strong className="text-white">"{categoryToDelete}"</strong>?
                  {(categoryUsageCounts[categoryToDelete] || 0) > 0 && (
                    <span className="block text-amber-400 mt-2 font-medium">
                      Note: {categoryUsageCounts[categoryToDelete]} existing transaction(s) use this category.
                      They will preserve their record, but this category won't appear for new entries.
                    </span>
                  )}
                </p>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setCategoryToDelete(null)}
                  className="flex-1 bg-zinc-800 hover:bg-zinc-700 py-3 rounded-xl font-bold text-xs text-zinc-300 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmDelete}
                  className="flex-1 bg-red-500 hover:bg-red-600 py-3 rounded-xl font-bold text-xs text-white transition-colors shadow-lg shadow-red-500/20"
                >
                  Delete
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

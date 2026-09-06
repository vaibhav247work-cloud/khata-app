import { 
  LayoutDashboard, 
  ArrowUpRight, 
  History, 
  FileText, 
  Settings, 
  Package 
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useKhataState } from './hooks/useKhataState';

// Common Components
import { Header } from './components/common/Header';
import { NavItem } from './components/common/NavItem';
import { LoginScreen } from './components/common/LoginScreen';

// Feature Modules
import { Dashboard } from './modules/dashboard/Dashboard';
import { TransactionsModule } from './modules/transactions/TransactionsModule';
import { OrdersModule } from './modules/orders/OrdersModule';
import { PassbookModule } from './modules/passbook/PassbookModule';
import { ReportsModule } from './modules/reports/ReportsModule';
import { AdminModule } from './modules/admin/AdminModule';

export default function App() {
  const {
    isLoggedIn,
    setIsLoggedIn,
    activeTab,
    setActiveTab,
    transactions,
    orders,
    isSyncing,
    apiLink,
    setApiLink,
    searchQuery,
    setSearchQuery,
    filterDate,
    setFilterDate,
    customDateRange,
    setCustomDateRange,
    exitConfirm,
    isAdmin,
    toggleAdmin,
    toast,
    showToast,
    markSyncPending,
    resetSyncState,
    loadData,
    handleGoogleSheetReset,
    syncWithGoogleSheets,
    handleLogin,
    filteredTransactions,
    stats,
    syncStatusLabel,
    syncStatusDotClass,
    syncStatusTitle,
  } = useKhataState();

  if (!isLoggedIn) {
    return <LoginScreen onLogin={handleLogin} />;
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-sans pb-24">
      {/* Header */}
      <Header
        syncStatusTitle={syncStatusTitle}
        syncStatusDotClass={syncStatusDotClass}
        syncStatusLabel={syncStatusLabel}
        isSyncing={isSyncing}
        apiLink={apiLink}
        onSync={() => void syncWithGoogleSheets('manual')}
        onLogout={() => setIsLoggedIn(false)}
      />

      {/* Main Content */}
      <main className="max-w-4xl mx-auto p-4 sm:p-6">
        <AnimatePresence mode="wait">
          {activeTab === 'Dashboard' && (
            <Dashboard 
              stats={stats} 
              transactions={transactions} 
              onNavigateToTransactions={() => setActiveTab('Transactions')}
            />
          )}
          {activeTab === 'Transactions' && (
            <TransactionsModule 
              transactions={filteredTransactions} 
              onAdd={() => loadData()} 
              searchQuery={searchQuery}
              setSearchQuery={setSearchQuery}
              markSyncPending={markSyncPending}
              showToast={showToast}
              isAdmin={isAdmin}
            />
          )}
          {activeTab === 'Orders' && (
            <OrdersModule 
              orders={orders} 
              onUpdate={() => loadData()} 
              showToast={showToast} 
              isAdmin={isAdmin} 
              markSyncPending={markSyncPending} 
            />
          )}
          {activeTab === 'Passbook' && (
            <PassbookModule 
              transactions={transactions} 
              filterDate={filterDate}
              setFilterDate={setFilterDate}
              customDateRange={customDateRange}
              setCustomDateRange={setCustomDateRange}
              showToast={showToast}
            />
          )}
          {activeTab === 'Reports' && (
            <ReportsModule 
              transactions={transactions} 
              orders={orders} 
              showToast={showToast} 
            />
          )}
          {activeTab === 'Admin' && (
            <AdminModule 
              apiLink={apiLink} 
              setApiLink={setApiLink} 
              transactions={transactions} 
              orders={orders} 
              showToast={showToast} 
              isAdmin={isAdmin} 
              setIsAdmin={toggleAdmin} 
              resetSyncState={resetSyncState} 
              onGoogleSheetReset={handleGoogleSheetReset} 
              isSyncing={isSyncing} 
              onSync={() => syncWithGoogleSheets('manual')} 
            />
          )}
        </AnimatePresence>
      </main>

      {/* Global Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div 
            initial={{ opacity: 0, y: 50, x: '-50%' }}
            animate={{ opacity: 1, y: 0, x: '-50%' }}
            exit={{ opacity: 0, y: 50, x: '-50%' }}
            className={`fixed bottom-24 left-1/2 bg-zinc-800 text-white px-6 py-3 rounded-full shadow-2xl z-[200] border border-zinc-700 text-sm font-medium flex items-center gap-2 ${
              toast.type === 'success' ? 'border-green-500/50' : 
              toast.type === 'error' ? 'border-red-500/50' : ''
            }`}
          >
            {toast.type === 'success' && <div className="w-2 h-2 rounded-full bg-green-500" />}
            {toast.type === 'error' && <div className="w-2 h-2 rounded-full bg-red-500" />}
            {toast.message}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Exit Confirmation Toast */}
      <AnimatePresence>
        {exitConfirm && (
          <motion.div 
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className="fixed bottom-24 left-1/2 -translate-x-1/2 bg-zinc-800 text-white px-6 py-3 rounded-full shadow-2xl z-[100] border border-zinc-700 text-sm font-medium"
          >
            Press back again to exit
          </motion.div>
        )}
      </AnimatePresence>

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 bg-zinc-900/95 backdrop-blur-xl border-t border-zinc-800 px-2 pb-6 pt-3 z-50 pb-safe overflow-x-auto no-scrollbar">
        <div className="min-w-max sm:min-w-0 max-w-4xl mx-auto flex justify-around items-center gap-1 px-2">
          <NavItem icon={LayoutDashboard} label="Home" active={activeTab === 'Dashboard'} onClick={() => setActiveTab('Dashboard')} />
          <NavItem icon={ArrowUpRight} label="Txs" active={activeTab === 'Transactions'} onClick={() => setActiveTab('Transactions')} />
          <NavItem icon={Package} label="Orders" active={activeTab === 'Orders'} onClick={() => setActiveTab('Orders')} />
          <NavItem icon={History} label="Passbook" active={activeTab === 'Passbook'} onClick={() => setActiveTab('Passbook')} />
          <NavItem icon={FileText} label="Reports" active={activeTab === 'Reports'} onClick={() => setActiveTab('Reports')} />
          <NavItem icon={Settings} label="Admin" active={activeTab === 'Admin'} onClick={() => setActiveTab('Admin')} />
        </div>
      </nav>
    </div>
  );
}

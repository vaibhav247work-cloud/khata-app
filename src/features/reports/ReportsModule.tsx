import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { motion } from 'motion/react';
import { 
  FileText, 
  RefreshCw, 
  Download, 
  Copy, 
  Calendar, 
  Search, 
  X, 
  ArrowUpRight, 
  ArrowDownLeft, 
  Wallet, 
  Package, 
  BarChart3, 
  PieChart as PieChartIcon, 
  CreditCard 
} from 'lucide-react';
import { 
  format, 
  parseISO, 
  isWithinInterval, 
  startOfDay, 
  endOfDay, 
  startOfWeek, 
  endOfWeek, 
  startOfMonth, 
  endOfMonth, 
  subMonths, 
  subDays, 
  startOfYear, 
  endOfYear, 
  differenceInCalendarDays 
} from 'date-fns';
import { Sector } from 'recharts';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

import { type Transaction, type Order } from '../../db';
import { setupDocFont, saveOrShareReport, downloadBlobFallback } from '../../utils/pdfExport';
import { ReportOverviewTab } from './components/ReportOverviewTab';
import { ReportExpensesTab } from './components/ReportExpensesTab';
import { ReportIncomeTab } from './components/ReportIncomeTab';
import { ReportPaymentsTab } from './components/ReportPaymentsTab';
import { ReportSuppliersTab } from './components/ReportSuppliersTab';

export interface ReportsModuleProps {
  transactions: Transaction[];
  orders?: Order[];
  showToast?: (message: string, type: 'success' | 'error' | 'info') => void;
  onPreviewPdf?: (data: { blob: Blob; filename: string; base64Data: string; rawArrayBuffer: ArrayBuffer; title: string }) => void;
  initialTab?: 'overview' | 'expenses' | 'income' | 'payments' | 'suppliers';
}

export function ReportsModule({ 
  transactions, 
  orders = [], 
  showToast, 
  onPreviewPdf, 
  initialTab = 'overview' 
}: ReportsModuleProps) {
  const [selectedPeriod, setSelectedPeriod] = useState<'this_week' | 'this_month' | 'last_month' | 'last_30_days' | 'this_quarter' | 'this_year' | 'all' | 'custom'>('this_month');
  const [customStart, setCustomStart] = useState<string>(() => format(startOfMonth(new Date()), 'yyyy-MM-dd'));
  const [customEnd, setCustomEnd] = useState<string>(() => format(endOfMonth(new Date()), 'yyyy-MM-dd'));
  const [activeReportTab, setActiveReportTab] = useState<'overview' | 'expenses' | 'income' | 'payments' | 'suppliers'>(() => initialTab);
  const [reportSearchQuery, setReportSearchQuery] = useState('');
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [isExportingExcel, setIsExportingExcel] = useState(false);
  const [isCopyingSummary, setIsCopyingSummary] = useState(false);

  useEffect(() => {
    if (initialTab) {
      setActiveReportTab(initialTab);
    }
  }, [initialTab]);

  // Compute active date range interval & human-readable label
  const { periodLabel, startDate, endDate } = useMemo(() => {
    const now = new Date();
    if (selectedPeriod === 'this_week') {
      const s = startOfWeek(now, { weekStartsOn: 1 });
      const e = endOfWeek(now, { weekStartsOn: 1 });
      return { periodLabel: `This Week (${format(s, 'dd MMM')} - ${format(e, 'dd MMM')})`, startDate: s, endDate: e };
    }
    if (selectedPeriod === 'this_month') {
      const s = startOfMonth(now);
      const e = endOfMonth(now);
      return { periodLabel: format(s, 'MMMM yyyy'), startDate: s, endDate: e };
    }
    if (selectedPeriod === 'last_month') {
      const prev = subMonths(now, 1);
      const s = startOfMonth(prev);
      const e = endOfMonth(prev);
      return { periodLabel: format(s, 'MMMM yyyy'), startDate: s, endDate: e };
    }
    if (selectedPeriod === 'last_30_days') {
      const s = subDays(now, 30);
      return { periodLabel: 'Last 30 Days', startDate: s, endDate: now };
    }
    if (selectedPeriod === 'this_quarter') {
      const s = subMonths(now, 3);
      return { periodLabel: 'This Quarter (Last 3 Months)', startDate: s, endDate: now };
    }
    if (selectedPeriod === 'this_year') {
      const s = startOfYear(now);
      const e = endOfYear(now);
      return { periodLabel: `Year ${format(now, 'yyyy')} (YTD)`, startDate: s, endDate: e };
    }
    if (selectedPeriod === 'custom') {
      try {
        const s = startOfDay(parseISO(customStart));
        const e = endOfDay(parseISO(customEnd));
        return {
          periodLabel: `${format(s, 'dd MMM yyyy')} - ${format(e, 'dd MMM yyyy')}`,
          startDate: s,
          endDate: e,
        };
      } catch {
        return { periodLabel: 'Custom Period', startDate: null, endDate: null };
      }
    }
    return { periodLabel: 'All Recorded Time', startDate: null, endDate: null };
  }, [selectedPeriod, customStart, customEnd]);

  // Filter transactions by selected date range
  const filteredTxs = useMemo(() => {
    if (selectedPeriod === 'all' || !startDate || !endDate) {
      return transactions || [];
    }
    return (transactions || []).filter((t: any) => {
      try {
        const d = parseISO(t.date);
        return isWithinInterval(d, { start: startDate, end: endDate });
      } catch {
        return true;
      }
    });
  }, [transactions, selectedPeriod, startDate, endDate]);

  // Filter orders by selected date range
  const filteredOrders = useMemo(() => {
    if (selectedPeriod === 'all' || !startDate || !endDate) {
      return orders || [];
    }
    return (orders || []).filter((o: any) => {
      try {
        const d = parseISO(o.date);
        return isWithinInterval(d, { start: startDate, end: endDate });
      } catch {
        return true;
      }
    });
  }, [orders, selectedPeriod, startDate, endDate]);

  // High-level financial calculations
  const creditTxs = useMemo(() => filteredTxs.filter((t: any) => t.type === 'Credit'), [filteredTxs]);
  const debitTxs = useMemo(() => filteredTxs.filter((t: any) => t.type === 'Debit'), [filteredTxs]);

  const totalCredit = useMemo(() => creditTxs.reduce((sum: number, t: any) => sum + (Number(t.amount) || 0), 0), [creditTxs]);
  const totalDebit = useMemo(() => debitTxs.reduce((sum: number, t: any) => sum + (Number(t.amount) || 0), 0), [debitTxs]);
  const netBalance = totalCredit - totalDebit;
  const netMargin = totalCredit > 0 ? (netBalance / totalCredit) * 100 : 0;

  const totalOrdersAmount = useMemo(() => filteredOrders.reduce((sum: number, o: any) => sum + (Number(o.total_amount) || 0), 0), [filteredOrders]);
  const totalOrdersPaid = useMemo(() => filteredOrders.reduce((sum: number, o: any) => sum + (Number(o.paid_amount) || 0), 0), [filteredOrders]);
  const totalOrdersRemaining = useMemo(() => filteredOrders.reduce((sum: number, o: any) => sum + (Number(o.remaining_amount) || 0), 0), [filteredOrders]);

  // Category breakdown for Expenses / Debits
  const debitCategoryData = useMemo(() => {
    const map = new Map<string, { total: number; count: number }>();
    debitTxs.forEach((t: any) => {
      const amt = Number(t.amount) || 0;
      if (amt <= 0) return;
      const cat = t.category || 'General';
      const cur = map.get(cat) || { total: 0, count: 0 };
      map.set(cat, { total: cur.total + amt, count: cur.count + 1 });
    });
    return Array.from(map.entries())
      .map(([name, data]) => ({
        name,
        value: data.total,
        count: data.count,
        percentage: totalDebit > 0 ? (data.total / totalDebit) * 100 : 0,
      }))
      .sort((a, b) => b.value - a.value);
  }, [debitTxs, totalDebit]);

  // Category breakdown for Income / Credits
  const creditCategoryData = useMemo(() => {
    const map = new Map<string, { total: number; count: number }>();
    creditTxs.forEach((t: any) => {
      const amt = Number(t.amount) || 0;
      if (amt <= 0) return;
      const cat = t.category || 'General';
      const cur = map.get(cat) || { total: 0, count: 0 };
      map.set(cat, { total: cur.total + amt, count: cur.count + 1 });
    });
    return Array.from(map.entries())
      .map(([name, data]) => ({
        name,
        value: data.total,
        count: data.count,
        percentage: totalCredit > 0 ? (data.total / totalCredit) * 100 : 0,
      }))
      .sort((a, b) => b.value - a.value);
  }, [creditTxs, totalCredit]);

  // Payment Mode breakdown
  const paymentModeData = useMemo(() => {
    const map = new Map<string, { total: number; count: number }>();
    let grandTotal = 0;
    filteredTxs.forEach((t: any) => {
      const amt = Number(t.amount) || 0;
      if (amt <= 0) return;
      grandTotal += amt;
      const mode = t.payment_type || 'Cash';
      const cur = map.get(mode) || { total: 0, count: 0 };
      map.set(mode, { total: cur.total + amt, count: cur.count + 1 });
    });
    return Array.from(map.entries())
      .map(([name, data]) => ({
        name,
        value: data.total,
        count: data.count,
        percentage: grandTotal > 0 ? (data.total / grandTotal) * 100 : 0,
      }))
      .sort((a, b) => b.value - a.value);
  }, [filteredTxs]);

  // Supplier breakdown from orders
  const supplierData = useMemo(() => {
    const map = new Map<string, { totalBilled: number; totalPaid: number; remaining: number; orderCount: number }>();
    filteredOrders.forEach((o: any) => {
      const sup = String(o.supplier || 'Unassigned').trim();
      const billed = Number(o.total_amount) || 0;
      const paid = Number(o.paid_amount) || 0;
      const rem = Number(o.remaining_amount) || Math.max(0, billed - paid);
      const cur = map.get(sup) || { totalBilled: 0, totalPaid: 0, remaining: 0, orderCount: 0 };
      map.set(sup, {
        totalBilled: cur.totalBilled + billed,
        totalPaid: cur.totalPaid + paid,
        remaining: cur.remaining + rem,
        orderCount: cur.orderCount + 1,
      });
    });
    return Array.from(map.entries())
      .map(([supplier, d]) => ({
        supplier,
        ...d,
      }))
      .sort((a, b) => b.totalBilled - a.totalBilled);
  }, [filteredOrders]);

  // Daily Cash Flow Trend Data for Charts
  const dailyCashFlowData = useMemo(() => {
    const dayMap = new Map<string, { date: string; credit: number; debit: number }>();
    const sorted = [...filteredTxs].sort((a: any, b: any) => a.date.localeCompare(b.date));

    sorted.forEach((t: any) => {
      try {
        const dayKey = format(parseISO(t.date), 'dd MMM');
        const cur = dayMap.get(dayKey) || { date: dayKey, credit: 0, debit: 0 };
        const amt = Number(t.amount) || 0;
        if (t.type === 'Credit') cur.credit += amt;
        if (t.type === 'Debit') cur.debit += amt;
        dayMap.set(dayKey, cur);
      } catch {}
    });

    const items = Array.from(dayMap.values());
    return items.slice(-15); // Show up to the last 15 active days for clean chart spacing
  }, [filteredTxs]);

  // Executive Spending Habits & Financial Health Analytics
  const financialInsights = useMemo(() => {
    const expenseRatio = totalCredit > 0 ? (totalDebit / totalCredit) * 100 : totalDebit > 0 ? 100 : 0;
    
    // Days in period
    let days = 30;
    if (startDate && endDate) {
      try {
        days = Math.max(1, differenceInCalendarDays(endDate, startDate) + 1);
      } catch {
        days = 30;
      }
    } else if (filteredTxs.length > 0) {
      days = Math.max(1, filteredTxs.length);
    }
    const dailyAvgExpense = Math.round(totalDebit / days);
    const dailyAvgIncome = Math.round(totalCredit / days);

    // Payment mode split (Digital vs Cash)
    let digitalTotal = 0;
    let cashTotal = 0;
    filteredTxs.forEach((t: any) => {
      const amt = Number(t.amount) || 0;
      const mode = String(t.payment_type || '').toLowerCase();
      if (mode.includes('cash')) {
        cashTotal += amt;
      } else {
        digitalTotal += amt;
      }
    });
    const totalVolume = digitalTotal + cashTotal;
    const digitalShare = totalVolume > 0 ? (digitalTotal / totalVolume) * 100 : 0;

    return {
      expenseRatio,
      dailyAvgExpense,
      dailyAvgIncome,
      digitalShare,
      cashShare: Math.max(0, 100 - digitalShare),
      topExpense: debitCategoryData[0] || null,
      topIncome: creditCategoryData[0] || null,
    };
  }, [totalCredit, totalDebit, startDate, endDate, filteredTxs, debitCategoryData, creditCategoryData]);

  // Clean active shape for Donut chart in Reports
  const renderReportActiveShape = useCallback((props: any) => {
    const { cx, cy, innerRadius, outerRadius, startAngle, endAngle, fill } = props;
    return (
      <g>
        <Sector
          cx={cx}
          cy={cy}
          innerRadius={innerRadius - 2}
          outerRadius={outerRadius + 5}
          startAngle={startAngle}
          endAngle={endAngle}
          fill={fill}
        />
        <Sector
          cx={cx}
          cy={cy}
          startAngle={startAngle}
          endAngle={endAngle}
          innerRadius={outerRadius + 7}
          outerRadius={outerRadius + 9}
          fill={fill}
          opacity={0.35}
        />
      </g>
    );
  }, []);

  // Filtered transactions for inline category drilldown
  const getCategoryTransactions = useCallback((categoryName: string, type: 'Debit' | 'Credit') => {
    return (filteredTxs || []).filter((t: any) => 
      t.type === type && (t.category || 'General') === categoryName
    ).sort((a: any, b: any) => b.date.localeCompare(a.date));
  }, [filteredTxs]);

  // --- Multi-Format Export Handlers ---

  const exportPDF = async () => {
    if (isExportingPdf) return;
    setIsExportingPdf(true);

    try {
      const doc = new jsPDF();
      (doc as any).autoTable = (options: any) => autoTable(doc, options);

      const { fontName: activeFont, cur } = await setupDocFont(doc);

      const formatReportDate = (value: string) => {
        try {
          return format(parseISO(value), 'dd MMM yyyy, hh:mm a');
        } catch {
          return value || '-';
        }
      };

      // Header Banner
      doc.setFillColor(24, 24, 27);
      doc.roundedRect(10, 10, 190, 26, 4, 4, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFont(activeFont);
      doc.setFontSize(16);
      doc.text('KhataBook Pro', 16, 20);
      doc.setFontSize(9);
      doc.setTextColor(212, 212, 216);
      doc.text(`Financial Performance Report  |  Period: ${periodLabel}`, 16, 28);
      doc.text(`Generated: ${format(new Date(), 'dd MMM yyyy, hh:mm a')}`, 125, 28);

      // Executive Summary Metric Boxes
      doc.setFillColor(240, 253, 244);
      doc.roundedRect(10, 40, 58, 18, 3, 3, 'F');
      doc.setFillColor(254, 242, 242);
      doc.roundedRect(73, 40, 58, 18, 3, 3, 'F');
      doc.setFillColor(netBalance >= 0 ? 239 : 254, netBalance >= 0 ? 246 : 242, netBalance >= 0 ? 255 : 242);
      doc.roundedRect(136, 40, 64, 18, 3, 3, 'F');

      doc.setFont(activeFont);
      doc.setFontSize(8);
      doc.setTextColor(22, 101, 52);
      doc.text('TOTAL INFLOW (CREDIT)', 15, 47);
      doc.setFontSize(11);
      doc.text(`${cur}${totalCredit.toLocaleString('en-IN')}`, 15, 54);

      doc.setFontSize(8);
      doc.setTextColor(185, 28, 28);
      doc.text('TOTAL OUTFLOW (DEBIT)', 78, 47);
      doc.setFontSize(11);
      doc.text(`${cur}${totalDebit.toLocaleString('en-IN')}`, 78, 54);

      doc.setFontSize(8);
      doc.setTextColor(netBalance >= 0 ? 29 : 185, netBalance >= 0 ? 78 : 28, netBalance >= 0 ? 216 : 28);
      doc.text(`NET SURPLUS (${netMargin.toFixed(1)}% MARGIN)`, 141, 47);
      doc.setFontSize(11);
      doc.text(`${cur}${netBalance.toLocaleString('en-IN')}`, 141, 54);

      // Detailed Transactions Table
      const tableData = (filteredTxs || []).map((t: any, idx: number) => [
        idx + 1,
        formatReportDate(t.date),
        t.type || '-',
        t.category || '-',
        `${cur}${(Number(t.amount) || 0).toLocaleString('en-IN')}`,
        t.payment_type || 'Cash',
        t.description || '-'
      ]);

      autoTable(doc, {
        head: [['#', 'Date & Time', 'Type', 'Category', 'Amount', 'Payment Mode', 'Description']],
        body: tableData.length > 0 ? tableData : [['-', 'No transactions recorded in this period', '-', '-', '-', '-', '-']],
        startY: 63,
        theme: 'grid',
        styles: {
          font: activeFont,
          fontSize: 8,
          textColor: [39, 39, 42],
          lineColor: [220, 220, 224],
          lineWidth: 0.15,
          cellPadding: 1.8,
        },
        headStyles: {
          font: activeFont,
          fillColor: [234, 88, 12],
          textColor: [255, 255, 255],
          lineColor: [194, 65, 12],
          lineWidth: 0.15,
          fontSize: 8.5,
          fontStyle: 'bold',
        },
        alternateRowStyles: { fillColor: [250, 250, 250] },
        columnStyles: {
          0: { cellWidth: 10, halign: 'center' },
          1: { cellWidth: 32 },
          2: { cellWidth: 16 },
          3: { cellWidth: 26 },
          4: { cellWidth: 24, halign: 'right' },
          5: { cellWidth: 24 },
          6: { cellWidth: 'auto' },
        },
        didDrawPage: (data) => {
          doc.setFont(activeFont);
          doc.setFontSize(8);
          doc.setTextColor(113, 113, 122);
          doc.text(`Page ${data.pageNumber}  |  KhataBook Pro Report`, 190, 288, { align: 'right' });
        },
      });

      // Append Top Expense Categories summary if available
      if (debitCategoryData.length > 0) {
        const lastY = (doc as any).lastAutoTable ? (doc as any).lastAutoTable.finalY + 8 : 65;
        if (lastY < 235) {
          doc.setFont(activeFont);
          doc.setFontSize(10);
          doc.setTextColor(234, 88, 12);
          doc.text('Expense Distribution by Category (Top Categories)', 10, lastY);
          autoTable(doc, {
            head: [['#', 'Category Name', 'Total Amount', '% Share', 'Txn Count']],
            body: debitCategoryData.slice(0, 8).map((c, i) => [
              i + 1,
              c.name,
              `${cur}${c.value.toLocaleString('en-IN')}`,
              `${c.percentage.toFixed(1)}%`,
              c.count
            ]),
            startY: lastY + 3,
            theme: 'grid',
            styles: { font: activeFont, fontSize: 8, cellPadding: 1.5 },
            headStyles: { fillColor: [39, 39, 42], textColor: [255, 255, 255], fontStyle: 'bold' },
            columnStyles: { 0: { cellWidth: 10, halign: 'center' }, 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'center' } }
          });
        }
      }

      const filename = `KhataBook_Report_${selectedPeriod}_${format(new Date(), 'yyyyMMdd_HHmm')}.pdf`;
      const pdfArrayBuffer = doc.output('arraybuffer');
      const pdfBlob = doc.output('blob');
      const dataUri = doc.output('datauristring');
      const pdfBase64 = dataUri.includes(',') ? dataUri.split(',')[1] : dataUri;

      if (onPreviewPdf) {
        onPreviewPdf({
          blob: pdfBlob,
          filename,
          base64Data: pdfBase64,
          rawArrayBuffer: pdfArrayBuffer,
          title: `KhataBook Report (${periodLabel})`,
        });
        return;
      }

      const isHandledNatively = await saveOrShareReport(
        pdfBase64,
        filename,
        'application/pdf',
        pdfArrayBuffer
      );

      if (!isHandledNatively) {
        downloadBlobFallback(pdfBlob, filename);
      }

      showToast?.('PDF report generated successfully!', 'success');
    } catch (error: any) {
      console.error('PDF export failed:', error);
      showToast?.('Unable to export PDF. Please check data and try again.', 'error');
    } finally {
      setIsExportingPdf(false);
    }
  };

  const exportExcel = async () => {
    if (isExportingExcel) return;
    setIsExportingExcel(true);

    try {
      const wb = XLSX.utils.book_new();

      // Sheet 1: Executive Financial Summary & KPIs
      const summaryRows = [
        { 'Metric': 'Report Period', 'Value': periodLabel },
        { 'Metric': 'Generated At', 'Value': format(new Date(), 'yyyy-MM-dd HH:mm:ss') },
        { 'Metric': 'Total Inflow (Credit INR)', 'Value': totalCredit },
        { 'Metric': 'Total Outflow (Debit INR)', 'Value': totalDebit },
        { 'Metric': 'Net Surplus (INR)', 'Value': netBalance },
        { 'Metric': 'Net Profit Margin (%)', 'Value': Number(netMargin.toFixed(2)) },
        { 'Metric': 'Total Transactions Analyzed', 'Value': filteredTxs.length },
        { 'Metric': 'Supplier Orders Total (INR)', 'Value': totalOrdersAmount },
        { 'Metric': 'Supplier Orders Paid (INR)', 'Value': totalOrdersPaid },
        { 'Metric': 'Outstanding Supplier Payables (INR)', 'Value': totalOrdersRemaining },
      ];
      const wsSummary = XLSX.utils.json_to_sheet(summaryRows);
      wsSummary['!cols'] = [{ wch: 32 }, { wch: 28 }];
      XLSX.utils.book_append_sheet(wb, wsSummary, 'Summary');

      // Sheet 2: Transactions Detail
      const txRows = (filteredTxs || []).map((t: any, index: number) => {
        let displayDate = t.date;
        try {
          displayDate = format(parseISO(t.date), 'yyyy-MM-dd HH:mm');
        } catch {
          displayDate = t.date || '';
        }
        return {
          'S.No': index + 1,
          'Date & Time': displayDate,
          'Type': t.type || '',
          'Category': t.category || '',
          'Amount (INR)': Number(t.amount) || 0,
          'Payment Mode': t.payment_type || '',
          'Description': t.description || '',
          'Reference': t.reference || '',
          'Order ID': t.order_id || '',
        };
      });
      const wsTx = XLSX.utils.json_to_sheet(
        txRows.length > 0 ? txRows : [{ 'Message': 'No transactions in this period' }]
      );
      wsTx['!cols'] = [
        { wch: 6 },
        { wch: 18 },
        { wch: 10 },
        { wch: 20 },
        { wch: 14 },
        { wch: 16 },
        { wch: 30 },
        { wch: 16 },
        { wch: 16 },
      ];
      XLSX.utils.book_append_sheet(wb, wsTx, 'Transactions');

      // Sheet 3: Supplier Orders & Bills Detail
      const orderRows = (filteredOrders || []).map((o: any, index: number) => {
        let displayDate = o.date;
        try {
          displayDate = format(parseISO(o.date), 'yyyy-MM-dd');
        } catch {
          displayDate = o.date || '';
        }
        return {
          'S.No': index + 1,
          'Order ID': o.order_id || '',
          'Supplier': o.supplier || '',
          'Date': displayDate,
          'Total Amount (INR)': Number(o.total_amount) || 0,
          'Paid Amount (INR)': Number(o.paid_amount) || 0,
          'Remaining (INR)': Number(o.remaining_amount) || 0,
          'Status': o.status || '',
          'Items Count': Array.isArray(o.items) ? o.items.length : 1,
        };
      });
      const wsOrders = XLSX.utils.json_to_sheet(
        orderRows.length > 0 ? orderRows : [{ 'Message': 'No orders in this period' }]
      );
      wsOrders['!cols'] = [
        { wch: 6 },
        { wch: 16 },
        { wch: 24 },
        { wch: 14 },
        { wch: 18 },
        { wch: 18 },
        { wch: 18 },
        { wch: 14 },
        { wch: 12 },
      ];
      XLSX.utils.book_append_sheet(wb, wsOrders, 'Supplier Orders');

      // Sheet 4: Category Breakdown (Ranked Expenses & Incomes)
      const catSummaryRows = [
        ...debitCategoryData.map((c, i) => ({
          'S.No': i + 1,
          'Type': 'Expense (Debit)',
          'Category': c.name,
          'Total Amount (INR)': c.value,
          'Share of Outflow (%)': Number(c.percentage.toFixed(2)),
          'Txn Count': c.count,
          'Avg Per Txn (INR)': c.count > 0 ? Math.round(c.value / c.count) : 0,
        })),
        ...creditCategoryData.map((c, i) => ({
          'S.No': i + 1,
          'Type': 'Income (Credit)',
          'Category': c.name,
          'Total Amount (INR)': c.value,
          'Share of Inflow (%)': Number(c.percentage.toFixed(2)),
          'Txn Count': c.count,
          'Avg Per Txn (INR)': c.count > 0 ? Math.round(c.value / c.count) : 0,
        })),
      ];
      const wsCats = XLSX.utils.json_to_sheet(
        catSummaryRows.length > 0 ? catSummaryRows : [{ 'Message': 'No category records in this period' }]
      );
      wsCats['!cols'] = [
        { wch: 6 },
        { wch: 18 },
        { wch: 22 },
        { wch: 18 },
        { wch: 22 },
        { wch: 14 },
        { wch: 18 },
      ];
      XLSX.utils.book_append_sheet(wb, wsCats, 'Category Breakdown');

      const filename = `KhataBook_Report_${selectedPeriod}_${format(new Date(), 'yyyyMMdd_HHmm')}.xlsx`;
      const excelBase64 = XLSX.write(wb, { bookType: 'xlsx', type: 'base64' });
      const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });

      const isHandledNatively = await saveOrShareReport(
        excelBase64,
        filename,
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        excelBuffer
      );

      if (!isHandledNatively) {
        const excelBlob = new Blob([excelBuffer], { 
          type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' 
        });
        downloadBlobFallback(excelBlob, filename);
      }

      showToast?.('Comprehensive 4-sheet Excel workbook exported successfully!', 'success');
    } catch (error: any) {
      console.error('Excel export failed:', error);
      showToast?.('Unable to export Excel file. Please try again.', 'error');
    } finally {
      setIsExportingExcel(false);
    }
  };

  const copyWhatsAppSummary = async () => {
    setIsCopyingSummary(true);
    try {
      const topCategoriesFormatted = debitCategoryData.slice(0, 3).map((c, i) => 
        `  ${i + 1}. ${c.name}: ₹${c.value.toLocaleString('en-IN')} (${c.percentage.toFixed(0)}%)`
      ).join('\n');

      const summaryText = [
        `📊 *KhataBook Business & Financial Summary*`,
        `🗓️ *Period:* ${periodLabel}`,
        `━━━━━━━━━━━━━━━━━━━`,
        `💰 *Total Inflow (Credit):* ₹${totalCredit.toLocaleString('en-IN')} (${creditTxs.length} receipts)`,
        `💸 *Total Outflow (Debit):* ₹${totalDebit.toLocaleString('en-IN')} (${debitTxs.length} payouts)`,
        `📈 *Net Surplus:* ${netBalance >= 0 ? '+' : '-'}₹${Math.abs(netBalance).toLocaleString('en-IN')} (${netMargin.toFixed(1)}% margin)`,
        `📦 *Supplier Bills:* ₹${totalOrdersAmount.toLocaleString('en-IN')} (Paid: ₹${totalOrdersPaid.toLocaleString('en-IN')} | Pending: ₹${totalOrdersRemaining.toLocaleString('en-IN')})`,
        `━━━━━━━━━━━━━━━━━━━`,
        `🏷️ *Top Expense Categories:*`,
        topCategoriesFormatted || '  None recorded',
        `━━━━━━━━━━━━━━━━━━━`,
        `💡 *Habit Analytics:*`,
        `  • Daily Avg Expense: ₹${financialInsights.dailyAvgExpense.toLocaleString('en-IN')}/day`,
        `  • Digital Adoption: ${financialInsights.digitalShare.toFixed(1)}% UPI/Bank`,
        `  • Cash Outflow: ${financialInsights.cashShare.toFixed(1)}% Cash`,
        `━━━━━━━━━━━━━━━━━━━`,
        `_Generated from KhataBook Pro on ${format(new Date(), 'dd MMM yyyy, hh:mm a')}_`,
      ].join('\n');

      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(summaryText);
        showToast?.('Financial summary copied to clipboard! Ready to paste into WhatsApp.', 'success');
      } else {
        showToast?.('Clipboard copy not supported on this browser', 'info');
      }
    } catch {
      showToast?.('Could not copy report text', 'error');
    } finally {
      setIsCopyingSummary(false);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      className="space-y-6"
    >
      {/* Top Header Card: Title, Date Filter Presets, and Export Actions */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-5 sm:p-6 space-y-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <div className="w-9 h-9 rounded-2xl bg-orange-500/10 border border-orange-500/25 flex items-center justify-center text-orange-400">
                <FileText className="w-5 h-5" />
              </div>
              <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-white">Financial & Business Reports</h2>
            </div>
            <p className="text-xs text-zinc-400">
              Interactive financial intelligence, category distributions, and multi-format exports.
            </p>
          </div>

          {/* Quick Action Export Buttons */}
          <div className="flex items-center gap-2 flex-wrap">
            <button 
              type="button"
              onClick={exportPDF} 
              disabled={isExportingPdf}
              className="px-3.5 py-2.5 bg-zinc-850 hover:bg-zinc-800 active:scale-95 border border-zinc-700/80 rounded-2xl flex items-center gap-2 font-bold text-xs text-white transition-all shadow-sm disabled:opacity-50 cursor-pointer"
              title="Generate printable PDF statement with preview"
            >
              {isExportingPdf ? (
                <RefreshCw className="w-4 h-4 text-orange-400 animate-spin" />
              ) : (
                <Download className="w-4 h-4 text-orange-400" />
              )}
              <span>{isExportingPdf ? 'Exporting...' : 'PDF Report'}</span>
            </button>

            <button 
              type="button"
              onClick={exportExcel} 
              disabled={isExportingExcel}
              className="px-3.5 py-2.5 bg-zinc-850 hover:bg-zinc-800 active:scale-95 border border-zinc-700/80 rounded-2xl flex items-center gap-2 font-bold text-xs text-white transition-all shadow-sm disabled:opacity-50 cursor-pointer"
              title="Export complete 3-sheet Excel spreadsheet"
            >
              {isExportingExcel ? (
                <RefreshCw className="w-4 h-4 text-green-400 animate-spin" />
              ) : (
                <Download className="w-4 h-4 text-green-400" />
              )}
              <span>{isExportingExcel ? 'Exporting...' : 'Excel Workbook'}</span>
            </button>

            <button
              type="button"
              onClick={copyWhatsAppSummary}
              disabled={isCopyingSummary}
              className="px-3.5 py-2.5 bg-zinc-850 hover:bg-zinc-800 active:scale-95 border border-zinc-700/80 rounded-2xl flex items-center gap-2 font-bold text-xs text-zinc-300 hover:text-white transition-all shadow-sm cursor-pointer"
              title="Copy formatted summary to share on WhatsApp or SMS"
            >
              <Copy className="w-4 h-4 text-blue-400" />
              <span className="hidden sm:inline">WhatsApp Summary</span>
              <span className="sm:hidden">Share</span>
            </button>
          </div>
        </div>

        {/* Date Filter Segmented Presets */}
        <div className="pt-2 border-t border-zinc-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-1.5 p-1 bg-zinc-950/80 rounded-2xl border border-zinc-800/80 overflow-x-auto text-[11px] no-scrollbar">
            {(['this_week', 'this_month', 'last_month', 'last_30_days', 'this_quarter', 'this_year', 'all', 'custom'] as const).map((periodKey) => {
              const labelMap: Record<string, string> = {
                this_week: 'Week',
                this_month: 'This Month',
                last_month: 'Last Month',
                last_30_days: '30 Days',
                this_quarter: 'Quarter',
                this_year: 'Year (YTD)',
                all: 'All Time',
                custom: 'Custom',
              };
              return (
                <button
                  key={periodKey}
                  type="button"
                  onClick={() => setSelectedPeriod(periodKey)}
                  className={`px-3 py-1.5 rounded-xl font-semibold transition-all shrink-0 cursor-pointer ${
                    selectedPeriod === periodKey
                      ? 'bg-orange-500 text-white shadow-xs'
                      : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  {labelMap[periodKey]}
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-xs text-zinc-400">
              <Calendar className="w-3.5 h-3.5 text-orange-400 shrink-0" />
              <span className="font-medium text-white truncate max-w-[200px]">{periodLabel}</span>
              <span className="text-zinc-600 font-mono">({filteredTxs.length} txns)</span>
            </div>
            {/* Quick Report Search */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search report..."
                value={reportSearchQuery}
                onChange={(e) => setReportSearchQuery(e.target.value)}
                className="pl-8 pr-2.5 py-1 text-xs rounded-xl bg-zinc-950/80 border border-zinc-800 text-white focus:outline-none focus:border-orange-500 w-32 sm:w-40 transition-all placeholder:text-zinc-600"
              />
              {reportSearchQuery && (
                <button
                  type="button"
                  onClick={() => setReportSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white text-xs"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Custom Date Range Pickers */}
        {selectedPeriod === 'custom' && (
          <div className="p-3.5 rounded-2xl bg-zinc-950/60 border border-zinc-800/80 flex flex-col sm:flex-row items-center gap-3">
            <span className="text-xs text-zinc-400 font-medium">Select Range:</span>
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <input
                type="date"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
                className="bg-zinc-900 border border-zinc-700/80 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-orange-500 font-mono"
              />
              <span className="text-zinc-500 text-xs">to</span>
              <input
                type="date"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                className="bg-zinc-900 border border-zinc-700/80 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-orange-500 font-mono"
              />
            </div>
          </div>
        )}
      </div>

      {/* Executive Financial Summary Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* Total Inflow */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-4 sm:p-5 space-y-2">
          <div className="flex items-center justify-between text-zinc-400 text-xs font-semibold uppercase tracking-wider">
            <span>Total Inflow</span>
            <div className="p-1.5 rounded-xl bg-emerald-500/10 text-emerald-400">
              <ArrowUpRight className="w-4 h-4" />
            </div>
          </div>
          <p className="text-xl sm:text-2xl font-black text-emerald-400 font-mono tracking-tight">
            ₹{totalCredit.toLocaleString('en-IN')}
          </p>
          <p className="text-[11px] text-zinc-500">
            {creditTxs.length} receipts · Avg: ₹{creditTxs.length ? Math.round(totalCredit / creditTxs.length).toLocaleString('en-IN') : 0}
          </p>
        </div>

        {/* Total Outflow */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-4 sm:p-5 space-y-2">
          <div className="flex items-center justify-between text-zinc-400 text-xs font-semibold uppercase tracking-wider">
            <span>Total Outflow</span>
            <div className="p-1.5 rounded-xl bg-rose-500/10 text-rose-400">
              <ArrowDownLeft className="w-4 h-4" />
            </div>
          </div>
          <p className="text-xl sm:text-2xl font-black text-rose-400 font-mono tracking-tight">
            ₹{totalDebit.toLocaleString('en-IN')}
          </p>
          <p className="text-[11px] text-zinc-500">
            {debitTxs.length} payouts · Avg: ₹{debitTxs.length ? Math.round(totalDebit / debitTxs.length).toLocaleString('en-IN') : 0}
          </p>
        </div>

        {/* Net Surplus / Margin */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-4 sm:p-5 space-y-2">
          <div className="flex items-center justify-between text-zinc-400 text-xs font-semibold uppercase tracking-wider">
            <span>Net Surplus</span>
            <div className={`p-1.5 rounded-xl ${netBalance >= 0 ? 'bg-blue-500/10 text-blue-400' : 'bg-amber-500/10 text-amber-400'}`}>
              <Wallet className="w-4 h-4" />
            </div>
          </div>
          <p className={`text-xl sm:text-2xl font-black font-mono tracking-tight ${netBalance >= 0 ? 'text-white' : 'text-amber-400'}`}>
            {netBalance >= 0 ? '+' : '-'}₹{Math.abs(netBalance).toLocaleString('en-IN')}
          </p>
          <p className="text-[11px] text-zinc-500">
            {netMargin >= 0 ? 'Surplus margin' : 'Deficit'}: <span className={netMargin >= 0 ? 'text-emerald-400' : 'text-amber-400'}>{netMargin.toFixed(1)}%</span>
          </p>
        </div>

        {/* Supplier Dues */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-4 sm:p-5 space-y-2">
          <div className="flex items-center justify-between text-zinc-400 text-xs font-semibold uppercase tracking-wider">
            <span>Supplier Dues</span>
            <div className="p-1.5 rounded-xl bg-orange-500/10 text-orange-400">
              <Package className="w-4 h-4" />
            </div>
          </div>
          <p className="text-xl sm:text-2xl font-black text-orange-400 font-mono tracking-tight">
            ₹{totalOrdersRemaining.toLocaleString('en-IN')}
          </p>
          <p className="text-[11px] text-zinc-500">
            Billed: ₹{totalOrdersAmount.toLocaleString('en-IN')} · Paid: ₹{totalOrdersPaid.toLocaleString('en-IN')}
          </p>
        </div>
      </div>

      {/* Report Sub-Tabs Navigation */}
      <div className="flex items-center gap-1.5 p-1 bg-zinc-950/80 rounded-2xl border border-zinc-800 overflow-x-auto no-scrollbar">
        {[
          { id: 'overview', label: 'Cash Flow Trend', icon: BarChart3 },
          { id: 'expenses', label: 'Expense Distribution', icon: PieChartIcon },
          { id: 'income', label: 'Income Sources', icon: ArrowUpRight },
          { id: 'payments', label: 'Payment Modes', icon: CreditCard },
          { id: 'suppliers', label: 'Supplier Ledger', icon: Package },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeReportTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveReportTab(tab.id as any)}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all shrink-0 cursor-pointer ${
                isActive
                  ? 'bg-zinc-850 text-white shadow-xs border border-zinc-700/70'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/60'
              }`}
            >
              <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-orange-400' : 'text-zinc-500'}`} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* TAB 1: OVERVIEW */}
      {activeReportTab === 'overview' && (
        <ReportOverviewTab
          periodLabel={periodLabel}
          financialInsights={financialInsights}
          dailyCashFlowData={dailyCashFlowData}
        />
      )}

      {/* TAB 2: EXPENSES */}
      {activeReportTab === 'expenses' && (
        <ReportExpensesTab
          totalDebit={totalDebit}
          debitCategoryData={debitCategoryData}
          reportSearchQuery={reportSearchQuery}
          renderReportActiveShape={renderReportActiveShape}
          getCategoryTransactions={getCategoryTransactions}
        />
      )}

      {/* TAB 3: INCOME */}
      {activeReportTab === 'income' && (
        <ReportIncomeTab
          totalCredit={totalCredit}
          creditCategoryData={creditCategoryData}
          reportSearchQuery={reportSearchQuery}
          renderReportActiveShape={renderReportActiveShape}
          getCategoryTransactions={getCategoryTransactions}
        />
      )}

      {/* TAB 4: PAYMENTS */}
      {activeReportTab === 'payments' && (
        <ReportPaymentsTab
          paymentModeData={paymentModeData}
        />
      )}

      {/* TAB 5: SUPPLIERS KHATA & LEDGER */}
      {activeReportTab === 'suppliers' && (
        <ReportSuppliersTab
          supplierData={supplierData}
          filteredOrders={filteredOrders}
          filteredTxs={filteredTxs}
          totalOrdersAmount={totalOrdersAmount}
          totalOrdersPaid={totalOrdersPaid}
          totalOrdersRemaining={totalOrdersRemaining}
          reportSearchQuery={reportSearchQuery}
          showToast={showToast}
        />
      )}
    </motion.div>
  );
}

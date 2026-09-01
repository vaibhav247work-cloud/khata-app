import React, { useState, useEffect, useMemo, useRef, useEffectEvent } from 'react';
import { 
  LayoutDashboard, 
  ArrowUpRight, 
  ArrowDownLeft, 
  History, 
  FileText, 
  Settings, 
  Plus, 
  Search, 
  Filter, 
  Download, 
  RefreshCw, 
  LogOut, 
  ChevronRight,
  Package,
  CreditCard,
  Wallet,
  Building2,
  Calendar,
  Pencil,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Clock,
  Smartphone,
  Check,
  CheckSquare,
  Square,
  ListChecks,
  X,
  AlertTriangle,
  Printer,
  Share2,
  ArrowUpDown,
  CheckCheck
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { db, type Transaction, type Order, type OrderPayment, type OrderItem } from './db';
import { 
  hasUnsyncedLocalChanges, 
  markAllLocalDataSynced, 
  syncLocalAndGoogleSheets, 
  reconcileOrdersWithTransactions,
  deleteTransactionsWithRecalculation,
  deleteOrderWithAssociated,
  type SyncTrigger 
} from './sync';
import { 
  format, 
  startOfDay, 
  endOfDay, 
  startOfWeek, 
  endOfWeek, 
  startOfMonth, 
  endOfMonth, 
  subDays,
  subMonths,
  startOfYear,
  endOfYear,
  isWithinInterval, 
  parseISO 
} from 'date-fns';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  PieChart, 
  Pie, 
  Cell,
} from 'recharts';
import jsPDF from 'jspdf';
import { autoTable } from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

// --- Types & Constants ---

type Tab = 'Dashboard' | 'Transactions' | 'Orders' | 'Passbook' | 'Reports' | 'Admin';

const PAYMENT_TYPES = ['Cash', 'UPI', 'Bank Transfer', 'Card', 'Online'] as const;

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8'];
const SYNC_PENDING_KEY = 'BT_PENDING_SYNC';
const LAST_SYNC_AT_KEY = 'BT_LAST_SYNC_AT';

// --- Shared File, PDF & Native Share Utilities ---

let cachedFontBase64: string | null = null;
let fontLoadAttempted = false;

const arrayBufferToBase64 = (buffer: ArrayBuffer): string => {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = '';
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return window.btoa(binary);
};

const loadAppFont = async (doc: jsPDF): Promise<{ fontName: string, cur: string }> => {
  if (cachedFontBase64) {
    try {
      doc.addFileToVFS('Nirmala.ttf', cachedFontBase64);
      doc.addFont('Nirmala.ttf', 'Nirmala', 'normal');
      doc.setFont('Nirmala');
      return { fontName: 'Nirmala', cur: '₹' };
    } catch {
      return { fontName: 'helvetica', cur: 'Rs. ' };
    }
  }

  if (fontLoadAttempted) {
    return { fontName: 'helvetica', cur: 'Rs. ' };
  }

  fontLoadAttempted = true;
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 1200);
    const res = await fetch('/fonts/Nirmala.ttf', { signal: controller.signal });
    clearTimeout(timeoutId);
    if (res.ok) {
      const buf = await res.arrayBuffer();
      if (buf && buf.byteLength > 0) {
        cachedFontBase64 = arrayBufferToBase64(buf);
        doc.addFileToVFS('Nirmala.ttf', cachedFontBase64);
        doc.addFont('Nirmala.ttf', 'Nirmala', 'normal');
        doc.setFont('Nirmala');
        return { fontName: 'Nirmala', cur: '₹' };
      }
    }
  } catch (err) {
    console.warn('Font quick load bypassed:', err);
  }
  return { fontName: 'helvetica', cur: 'Rs. ' };
};

const downloadBlobFallback = (blob: Blob, filename: string) => {
  try {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      try {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } catch {}
    }, 1000);
  } catch (err) {
    console.warn('Download fallback error:', err);
  }
};

const saveOrShareReport = async (
  base64Data: string, 
  filename: string, 
  mimeType: string,
  rawArrayBuffer?: ArrayBuffer
): Promise<boolean> => {
  const cleanBase64 = base64Data.includes('base64,')
    ? base64Data.split('base64,')[1]
    : base64Data;

  // 1. Native Capacitor Android & iOS
  if (Capacitor.isNativePlatform()) {
    try {
      // Step 1: Write directly to App Cache Directory (always permitted without runtime permission prompts)
      let fileUri = '';
      try {
        const writeResult = await Filesystem.writeFile({
          path: filename,
          data: cleanBase64,
          directory: Directory.Cache,
          recursive: true,
        });
        
        try {
          const uriResult = await Filesystem.getUri({
            directory: Directory.Cache,
            path: filename,
          });
          fileUri = uriResult.uri || writeResult.uri || '';
        } catch {
          fileUri = writeResult.uri || '';
        }
      } catch (cacheErr) {
        console.warn('Cache write error, attempting Data directory:', cacheErr);
        try {
          const dataWrite = await Filesystem.writeFile({
            path: filename,
            data: cleanBase64,
            directory: Directory.Data,
            recursive: true,
          });
          fileUri = dataWrite.uri || '';
        } catch (dataErr) {
          console.warn('Data directory write failed:', dataErr);
        }
      }

      // Step 2: Open Native Android System Share & Print Dialog
      if (fileUri) {
        try {
          await Share.share({
            title: filename,
            text: `KhataBook: ${filename}`,
            files: [fileUri],
            dialogTitle: `Share or Print ${filename}`,
          });
          return true;
        } catch (shareErr: any) {
          const errStr = String(shareErr?.message || '').toLowerCase();
          if (errStr.includes('cancel') || errStr.includes('dismiss') || errStr.includes('abort') || errStr.includes('user cancelled')) {
            return true;
          }
          // Fallback share with URL parameter
          try {
            await Share.share({
              title: filename,
              url: fileUri,
              dialogTitle: `Share ${filename}`,
            });
            return true;
          } catch (shareFallbackErr: any) {
            console.warn('Share sheet fallback failed:', shareFallbackErr);
          }
        }
      }

      // Step 3: Optional permanent Documents save in background (never blocks or crashes UI)
      try {
        Filesystem.writeFile({
          path: filename,
          data: cleanBase64,
          directory: Directory.Documents,
          recursive: true,
        }).catch(() => {});
      } catch {}

      return true;
    } catch (err: any) {
      console.warn('Native file share/save error:', err);
      return false;
    }
  }

  // 2. Web / Mobile Browser
  try {
    let blob: Blob;
    if (rawArrayBuffer) {
      blob = new Blob([rawArrayBuffer], { type: mimeType });
    } else {
      const byteCharacters = atob(cleanBase64);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      blob = new Blob([byteArray], { type: mimeType });
    }

    // Trigger device browser download
    downloadBlobFallback(blob, filename);

    // Next, if Mobile Web Share is supported, also prompt the share sheet
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        const file = new File([blob], filename, { type: mimeType });
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          await navigator.share({
            title: filename,
            text: `KhataBook: ${filename}`,
            files: [file],
          });
        }
      } catch {}
    }

    return true;
  } catch (webErr) {
    console.error('Web save/share error:', webErr);
    return false;
  }
};

const generateAndShareOrderReceipts = async (ordersList: Order[], showToast?: any): Promise<void> => {
  if (!ordersList || ordersList.length === 0) {
    if (showToast) showToast('No orders selected to print', 'info');
    return;
  }

  try {
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
    });
    (doc as any).autoTable = (options: any) => autoTable(doc, options);

    const { fontName: activeFont, cur } = await loadAppFont(doc);

    const formatOrderDate = (value: string) => {
      try {
        return format(parseISO(value), 'dd MMM yyyy, hh:mm a');
      } catch {
        return value || '-';
      }
    };

    const isSingle = ordersList.length === 1;
    const nowStr = format(new Date(), 'dd MMM yyyy, hh:mm a');

    if (isSingle) {
      const order = ordersList[0];
      const items = order.items || [];
      const orderIdShort = order.order_id.slice(0, 8).toUpperCase();

      // Top Receipt Header Banner
      doc.setFillColor(24, 24, 27);
      doc.roundedRect(10, 10, 190, 26, 3, 3, 'F');
      
      doc.setTextColor(255, 255, 255);
      doc.setFont(activeFont);
      doc.setFontSize(16);
      doc.text('KhataBook Pro', 16, 20);

      doc.setFontSize(9);
      doc.setTextColor(249, 115, 22);
      doc.text('OFFICIAL ORDER RECEIPT', 16, 28);

      doc.setFontSize(8);
      doc.setTextColor(212, 212, 216);
      doc.text(`Receipt #: ORD-${orderIdShort}`, 135, 20);
      doc.text(`Date: ${formatOrderDate(order.date)}`, 135, 28);

      // Supplier Info & Status Box
      doc.setFillColor(244, 244, 245);
      doc.roundedRect(10, 40, 190, 20, 3, 3, 'F');

      doc.setFont(activeFont);
      doc.setFontSize(7.5);
      doc.setTextColor(113, 113, 122);
      doc.text('SUPPLIER / VENDOR', 15, 47);
      doc.text('ORDER STATUS', 140, 47);

      doc.setFontSize(11);
      doc.setTextColor(24, 24, 27);
      doc.text(order.supplier || 'General Supplier', 15, 55);

      const statusText = (order.status || 'Pending').toUpperCase();
      if (order.status === 'Completed') {
        doc.setTextColor(22, 101, 52);
      } else if (order.status === 'Partial') {
        doc.setTextColor(194, 65, 12);
      } else {
        doc.setTextColor(113, 113, 122);
      }
      doc.text(statusText, 140, 55);

      // Items Table
      const tableData = items.map((item, idx) => [
        String(idx + 1),
        item.material || 'Material Item',
        item.quantity || '-',
        `${cur}${(Number(item.amount) || 0).toLocaleString('en-IN')}`
      ]);

      autoTable(doc, {
        head: [['#', 'Material Description', 'Quantity', 'Amount']],
        body: tableData.length > 0 ? tableData : [['1', 'General Items', '-', `${cur}${order.total_amount.toLocaleString('en-IN')}`]],
        startY: 65,
        theme: 'grid',
        styles: {
          font: activeFont,
          fontSize: 8,
          textColor: [39, 39, 42],
          lineColor: [228, 228, 231],
          lineWidth: 0.15,
          cellPadding: 2.2,
        },
        headStyles: {
          font: activeFont,
          fillColor: [234, 88, 12],
          textColor: [255, 255, 255],
          lineColor: [194, 65, 12],
          lineWidth: 0.15,
          fontStyle: 'normal',
        },
        alternateRowStyles: { fillColor: [250, 250, 250] },
        columnStyles: {
          0: { cellWidth: 12, halign: 'center' },
          1: { cellWidth: 'auto' },
          2: { cellWidth: 35, halign: 'center' },
          3: { cellWidth: 40, halign: 'right' },
        },
      });

      const finalY = (doc as any).lastAutoTable.finalY + 8;

      // Financial Breakdown Summary Box
      doc.setFillColor(250, 250, 250);
      doc.setDrawColor(228, 228, 231);
      doc.roundedRect(105, finalY, 95, 34, 3, 3, 'FD');

      doc.setFont(activeFont);
      doc.setFontSize(8.5);
      doc.setTextColor(113, 113, 122);
      doc.text('Total Order Amount:', 110, finalY + 8);
      doc.text('Amount Paid to Date:', 110, finalY + 16);
      doc.text('Outstanding Balance:', 110, finalY + 25);

      doc.setTextColor(24, 24, 27);
      doc.text(`${cur}${Number(order.total_amount || 0).toLocaleString('en-IN')}`, 192, finalY + 8, { align: 'right' });

      doc.setTextColor(22, 101, 52);
      doc.text(`${cur}${Number(order.paid_amount || 0).toLocaleString('en-IN')}`, 192, finalY + 16, { align: 'right' });

      doc.setTextColor(185, 28, 28);
      doc.text(`${cur}${Number(order.remaining_amount || 0).toLocaleString('en-IN')}`, 192, finalY + 25, { align: 'right' });

      // Verification Footer note
      doc.setFontSize(7.5);
      doc.setTextColor(161, 161, 170);
      doc.text(`Printed / Shared on: ${nowStr}`, 15, finalY + 14);
      doc.text('Valid electronic receipt generated via KhataBook Mobile Pro.', 15, finalY + 20);
      doc.text('No physical signature required.', 15, finalY + 26);

    } else {
      // Multiple orders consolidated summary & receipts
      const totalOrderValue = ordersList.reduce((sum, o) => sum + (Number(o.total_amount) || 0), 0);
      const totalPaidValue = ordersList.reduce((sum, o) => sum + (Number(o.paid_amount) || 0), 0);
      const totalRemainingValue = ordersList.reduce((sum, o) => sum + (Number(o.remaining_amount) || 0), 0);

      // Header Banner
      doc.setFillColor(24, 24, 27);
      doc.roundedRect(10, 10, 190, 26, 3, 3, 'F');
      
      doc.setTextColor(255, 255, 255);
      doc.setFont(activeFont);
      doc.setFontSize(15);
      doc.text('KhataBook Pro', 16, 20);

      doc.setFontSize(9);
      doc.setTextColor(249, 115, 22);
      doc.text(`CONSOLIDATED ORDERS SUMMARY (${ordersList.length} ORDERS)`, 16, 28);

      doc.setFontSize(8);
      doc.setTextColor(212, 212, 216);
      doc.text(`Generated: ${nowStr}`, 130, 24);

      // 3 Stat Boxes at top
      doc.setFillColor(244, 244, 245);
      doc.roundedRect(10, 40, 60, 18, 3, 3, 'F');
      doc.setFillColor(240, 253, 244);
      doc.roundedRect(75, 40, 60, 18, 3, 3, 'F');
      doc.setFillColor(254, 242, 242);
      doc.roundedRect(140, 40, 60, 18, 3, 3, 'F');

      doc.setFont(activeFont);
      doc.setFontSize(7.5);
      doc.setTextColor(113, 113, 122);
      doc.text('TOTAL ORDERS VALUE', 15, 46);
      doc.setTextColor(22, 101, 52);
      doc.text('TOTAL PAID', 80, 46);
      doc.setTextColor(185, 28, 28);
      doc.text('OUTSTANDING BALANCE', 145, 46);

      doc.setFontSize(9.5);
      doc.setTextColor(24, 24, 27);
      doc.text(`${cur}${totalOrderValue.toLocaleString('en-IN')}`, 15, 54);
      doc.setTextColor(22, 101, 52);
      doc.text(`${cur}${totalPaidValue.toLocaleString('en-IN')}`, 80, 54);
      doc.setTextColor(185, 28, 28);
      doc.text(`${cur}${totalRemainingValue.toLocaleString('en-IN')}`, 145, 54);

      // Multi-Order Table Breakdown
      const tableData = ordersList.map((o, idx) => {
        const itemSummary = (o.items || []).map(i => `${i.material}${i.quantity ? ` (${i.quantity})` : ''}`).join(', ');
        return [
          String(idx + 1),
          formatOrderDate(o.date),
          o.supplier || '-',
          itemSummary || 'General Order',
          o.status || 'Pending',
          `${cur}${Number(o.total_amount || 0).toLocaleString('en-IN')}`,
          `${cur}${Number(o.paid_amount || 0).toLocaleString('en-IN')}`,
          `${cur}${Number(o.remaining_amount || 0).toLocaleString('en-IN')}`
        ];
      });

      // Add summary row
      tableData.push([
        '',
        'GRAND TOTAL',
        `${ordersList.length} Orders`,
        '-',
        '-',
        `${cur}${totalOrderValue.toLocaleString('en-IN')}`,
        `${cur}${totalPaidValue.toLocaleString('en-IN')}`,
        `${cur}${totalRemainingValue.toLocaleString('en-IN')}`
      ]);

      autoTable(doc, {
        head: [['#', 'Date', 'Supplier', 'Materials / Items', 'Status', 'Total', 'Paid', 'Balance']],
        body: tableData,
        startY: 64,
        theme: 'grid',
        styles: {
          font: activeFont,
          fontSize: 7,
          textColor: [39, 39, 42],
          lineColor: [228, 228, 231],
          lineWidth: 0.15,
          cellPadding: 1.5,
        },
        headStyles: {
          font: activeFont,
          fillColor: [234, 88, 12],
          textColor: [255, 255, 255],
          lineColor: [194, 65, 12],
          lineWidth: 0.15,
          fontStyle: 'normal',
        },
        alternateRowStyles: { fillColor: [250, 250, 250] },
        columnStyles: {
          0: { cellWidth: 8, halign: 'center' },
          1: { cellWidth: 26 },
          2: { cellWidth: 26 },
          3: { cellWidth: 'auto' },
          4: { cellWidth: 16 },
          5: { cellWidth: 20, halign: 'right' },
          6: { cellWidth: 20, halign: 'right' },
          7: { cellWidth: 20, halign: 'right' },
        },
        didDrawPage: (data) => {
          doc.setFont(activeFont);
          doc.setFontSize(7.5);
          doc.setTextColor(113, 113, 122);
          doc.text(`Page ${data.pageNumber} • KhataBook Mobile Pro`, 190, 288, { align: 'right' });
        },
      });
    }

    const filename = isSingle
      ? `Order_Receipt_${(ordersList[0].supplier || 'Supplier').replace(/[^a-zA-Z0-9]/g, '_')}_${format(new Date(), 'yyyyMMdd_HHmm')}.pdf`
      : `Orders_Summary_${ordersList.length}Orders_${format(new Date(), 'yyyyMMdd_HHmm')}.pdf`;

    const pdfArrayBuffer = doc.output('arraybuffer');
    const pdfBase64 = arrayBufferToBase64(pdfArrayBuffer);

    // Share or Save
    const isHandled = await saveOrShareReport(
      pdfBase64,
      filename,
      'application/pdf',
      pdfArrayBuffer
    );

    if (!isHandled) {
      const pdfBlob = new Blob([pdfArrayBuffer], { type: 'application/pdf' });
      downloadBlobFallback(pdfBlob, filename);
    }

    if (showToast) {
      showToast(isSingle ? 'Order receipt saved to device & opened for share/print!' : `${ordersList.length} order receipts saved to device & opened for share/print!`, 'success');
    }
  } catch (error: any) {
    console.error('Order receipt generation/share error:', error);
    if (showToast) {
      showToast('Failed to generate order receipt. Please try again.', 'error');
    }
  }
};

const generateAndSharePassbookPDF = async (
  passbookEntries: any[], 
  periodLabel: string, 
  typeFilter: string, 
  showToast?: any
): Promise<void> => {
  if (!passbookEntries || passbookEntries.length === 0) {
    if (showToast) showToast('No passbook records to print', 'info');
    return;
  }

  try {
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
    });
    (doc as any).autoTable = (options: any) => autoTable(doc, options);

    const { fontName: activeFont, cur } = await loadAppFont(doc);

    const formatPassbookDate = (value: string) => {
      try {
        return format(parseISO(value), 'dd MMM yyyy, hh:mm a');
      } catch {
        return value || '-';
      }
    };

    const nowStr = format(new Date(), 'dd MMM yyyy, hh:mm a');
    const totalCredit = passbookEntries
      .filter((t: any) => t.type === 'Credit')
      .reduce((sum: number, t: any) => sum + (Number(t.amount) || 0), 0);
    const totalDebit = passbookEntries
      .filter((t: any) => t.type === 'Debit')
      .reduce((sum: number, t: any) => sum + (Number(t.amount) || 0), 0);
    
    // Net balance of latest entry (passbookEntries is newest first)
    const latestBalance = passbookEntries.length > 0 ? passbookEntries[0].runningBalance : 0;

    // Header Banner
    doc.setFillColor(24, 24, 27);
    doc.roundedRect(10, 10, 190, 26, 3, 3, 'F');
    
    doc.setTextColor(255, 255, 255);
    doc.setFont(activeFont);
    doc.setFontSize(15);
    doc.text('KhataBook Pro', 16, 20);

    doc.setFontSize(9);
    doc.setTextColor(249, 115, 22);
    doc.text(`OFFICIAL PASSBOOK STATEMENT • ${periodLabel.toUpperCase()} (${passbookEntries.length} ENTRIES)`, 16, 28);

    doc.setFontSize(8);
    doc.setTextColor(212, 212, 216);
    doc.text(`Generated: ${nowStr}`, 130, 24);

    // 3 Stat Boxes at top
    doc.setFillColor(240, 253, 244);
    doc.roundedRect(10, 40, 60, 18, 3, 3, 'F');
    doc.setFillColor(254, 242, 242);
    doc.roundedRect(75, 40, 60, 18, 3, 3, 'F');
    doc.setFillColor(244, 244, 245);
    doc.roundedRect(140, 40, 60, 18, 3, 3, 'F');

    doc.setFont(activeFont);
    doc.setFontSize(7.5);
    doc.setTextColor(22, 101, 52);
    doc.text('TOTAL INFLOW (CREDIT)', 15, 46);
    doc.setTextColor(185, 28, 28);
    doc.text('TOTAL OUTFLOW (DEBIT)', 80, 46);
    doc.setTextColor(113, 113, 122);
    doc.text('CLOSING RUNNING BALANCE', 145, 46);

    doc.setFontSize(9.5);
    doc.setTextColor(22, 101, 52);
    doc.text(`+${cur}${totalCredit.toLocaleString('en-IN')}`, 15, 54);
    doc.setTextColor(185, 28, 28);
    doc.text(`-${cur}${totalDebit.toLocaleString('en-IN')}`, 80, 54);
    doc.setTextColor(24, 24, 27);
    doc.text(`${cur}${latestBalance.toLocaleString('en-IN')}`, 145, 54);

    // Table
    const tableData = passbookEntries.map((item: any, idx: number) => {
      const isCredit = item.type === 'Credit';
      return [
        String(idx + 1),
        formatPassbookDate(item.date),
        item.category || '-',
        `${item.description || '-'}${item.payment_type ? ` [${item.payment_type}]` : ''}`,
        !isCredit ? `${cur}${Number(item.amount || 0).toLocaleString('en-IN')}` : '-',
        isCredit ? `${cur}${Number(item.amount || 0).toLocaleString('en-IN')}` : '-',
        `${cur}${Number(item.runningBalance || 0).toLocaleString('en-IN')}`
      ];
    });

    // Summary row
    tableData.push([
      '',
      'TOTALS',
      `${passbookEntries.length} Records`,
      `Net Period: ${cur}${(totalCredit - totalDebit).toLocaleString('en-IN')}`,
      `${cur}${totalDebit.toLocaleString('en-IN')}`,
      `${cur}${totalCredit.toLocaleString('en-IN')}`,
      `${cur}${latestBalance.toLocaleString('en-IN')}`
    ]);

    autoTable(doc, {
      head: [['#', 'Date & Time', 'Particulars / Account', 'Description & Mode', 'Debit (-)', 'Credit (+)', 'Balance']],
      body: tableData,
      startY: 64,
      theme: 'grid',
      styles: {
        font: activeFont,
        fontSize: 7,
        textColor: [39, 39, 42],
        lineColor: [228, 228, 231],
        lineWidth: 0.15,
        cellPadding: 1.5,
      },
      headStyles: {
        font: activeFont,
        fillColor: [234, 88, 12],
        textColor: [255, 255, 255],
        lineColor: [194, 65, 12],
        lineWidth: 0.15,
        fontStyle: 'normal',
      },
      alternateRowStyles: { fillColor: [250, 250, 250] },
      columnStyles: {
        0: { cellWidth: 8, halign: 'center' },
        1: { cellWidth: 30 },
        2: { cellWidth: 28 },
        3: { cellWidth: 'auto' },
        4: { cellWidth: 22, halign: 'right' },
        5: { cellWidth: 22, halign: 'right' },
        6: { cellWidth: 24, halign: 'right' },
      },
      didDrawPage: (data) => {
        doc.setFont(activeFont);
        doc.setFontSize(7.5);
        doc.setTextColor(113, 113, 122);
        doc.text(`Page ${data.pageNumber} • KhataBook Mobile Pro Passbook`, 190, 288, { align: 'right' });
      },
    });

    const filename = `Passbook_Statement_${periodLabel.replace(/[^a-zA-Z0-9]/g, '_')}_${format(new Date(), 'yyyyMMdd_HHmm')}.pdf`;
    const pdfArrayBuffer = doc.output('arraybuffer');
    const pdfBase64 = arrayBufferToBase64(pdfArrayBuffer);

    const isHandled = await saveOrShareReport(
      pdfBase64,
      filename,
      'application/pdf',
      pdfArrayBuffer
    );

    if (!isHandled) {
      const pdfBlob = new Blob([pdfArrayBuffer], { type: 'application/pdf' });
      downloadBlobFallback(pdfBlob, filename);
    }

    if (showToast) {
      showToast('Passbook statement saved & opened for print/share!', 'success');
    }
  } catch (error: any) {
    console.error('Passbook PDF print error:', error);
    if (showToast) {
      showToast('Failed to generate Passbook statement. Please try again.', 'error');
    }
  }
};

// --- Components ---

export default function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>('Dashboard');
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);
  const [hasPendingSync, setHasPendingSync] = useState(() => localStorage.getItem(SYNC_PENDING_KEY) === 'true');
  const [lastSyncedAt, setLastSyncedAt] = useState(() => localStorage.getItem(LAST_SYNC_AT_KEY) || '');
  const [apiLink, setApiLink] = useState(localStorage.getItem('BT_API_LINK') || '');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterDate, setFilterDate] = useState<'All' | 'Today' | 'This Week' | 'This Month' | 'Custom'>('All');
  const [customDateRange, setCustomDateRange] = useState({ start: '', end: '' });
  const [exitConfirm, setExitConfirm] = useState(false);
  const exitConfirmRef = useRef(false);
  const syncInFlightRef = useRef(false);
  const [isAdmin, setIsAdmin] = useState(localStorage.getItem('BT_IS_ADMIN') === 'true');
  const [toast, setToast] = useState<{ message: string, type: 'success' | 'error' | 'info' } | null>(null);

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const toggleAdmin = (val: boolean) => {
    setIsAdmin(val);
    localStorage.setItem('BT_IS_ADMIN', val.toString());
  };

  const markSyncPending = () => {
    localStorage.setItem(SYNC_PENDING_KEY, 'true');
    setHasPendingSync(true);
  };

  const clearSyncPending = () => {
    localStorage.removeItem(SYNC_PENDING_KEY);
    setHasPendingSync(false);
  };

  const resetSyncState = () => {
    clearSyncPending();
    localStorage.removeItem(LAST_SYNC_AT_KEY);
    setLastSyncedAt('');
  };

  // --- Back Button Logic ---
  useEffect(() => {
    // Push initial state
    window.history.pushState({ tab: activeTab }, '');

    const handleBack = (event: PopStateEvent) => {
      if (activeTab !== 'Dashboard') {
        setActiveTab('Dashboard');
        window.history.pushState({ tab: 'Dashboard' }, '');
      } else {
        if (exitConfirmRef.current) {
          // Allow exit - don't push state
          // The browser will go back to whatever was before this app
          return;
        }

        setExitConfirm(true);
        exitConfirmRef.current = true;
        setTimeout(() => {
          setExitConfirm(false);
          exitConfirmRef.current = false;
        }, 3000);
        
        // Push state again to prevent exit on first back press
        window.history.pushState({ tab: 'Dashboard' }, '');
      }
    };

    window.addEventListener('popstate', handleBack);
    return () => window.removeEventListener('popstate', handleBack);
  }, [activeTab]);

  // --- Auth ---
  const handleLogin = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    if (formData.get('username') === 'admin' && formData.get('password') === 'admin123') {
      setIsLoggedIn(true);
    } else {
      showToast('Invalid credentials', 'error');
    }
  };

  // --- Data Loading ---
  const loadData = async () => {
    // Automatically keep orders in sync with their transactions
    await reconcileOrdersWithTransactions();

    const [txs, ords, localHasUnsyncedChanges] = await Promise.all([
      db.transactions.toArray(),
      db.orders.toArray(),
      hasUnsyncedLocalChanges(),
    ]);
    
    // Explicitly sort descending by date to ensure correct order in all modules
    const sortedTxs = [...txs].sort((a, b) => b.date.localeCompare(a.date));
    const sortedOrds = [...ords].sort((a, b) => b.date.localeCompare(a.date));
    
    setTransactions(sortedTxs);
    setOrders(sortedOrds);
    setHasPendingSync(localHasUnsyncedChanges || localStorage.getItem(SYNC_PENDING_KEY) === 'true');
  };

  const handleGoogleSheetReset = async () => {
    await markAllLocalDataSynced();
    resetSyncState();
    await loadData();
  };

  useEffect(() => {
    if (isLoggedIn) loadData();
  }, [isLoggedIn]);

  // --- Sync Logic ---
  const syncWithGoogleSheets = async (trigger: SyncTrigger = 'manual'): Promise<boolean> => {
    if (syncInFlightRef.current) {
      return false;
    }

    if (!apiLink) {
      if (trigger === 'manual') {
        showToast('Please set Google Sheet API link in Admin settings', 'error');
      }
      return false;
    }

    if (!isOnline) {
      if (trigger === 'manual') {
        showToast('You are offline. Changes will sync automatically once internet is back.', 'error');
      }
      return false;
    }

    if (trigger !== 'manual' && !hasPendingSync) {
      return false;
    }

    syncInFlightRef.current = true;
    setIsSyncing(true);

    try {
      await syncLocalAndGoogleSheets(apiLink);

      clearSyncPending();
      const syncedAt = new Date().toISOString();
      localStorage.setItem(LAST_SYNC_AT_KEY, syncedAt);
      setLastSyncedAt(syncedAt);

      await loadData();

      if (trigger === 'manual') {
        showToast('Data synced to Google Sheets.', 'success');
      } else if (trigger === 'reconnect') {
        showToast('Back online. Pending changes synced.', 'success');
      }
      return true;
    } catch (error) {
      console.error('Sync failed', error);
      if (trigger !== 'background') {
        showToast('Sync failed. Data is still saved on this phone.', 'error');
      }
      return false;
    } finally {
      syncInFlightRef.current = false;
      setIsSyncing(false);
    }
  };

  const handleOnline = useEffectEvent(() => {
    setIsOnline(true);

    if (localStorage.getItem(SYNC_PENDING_KEY) === 'true') {
      showToast('Internet is back. Syncing pending changes...', 'info');

      if (isLoggedIn && apiLink) {
        void syncWithGoogleSheets('reconnect');
      }
    }
  });

  const handleOffline = useEffectEvent(() => {
    setIsOnline(false);
    showToast('Offline mode active. New entries will sync when internet returns.', 'info');
  });

  useEffect(() => {
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    if (!isLoggedIn || !isOnline || !apiLink || !hasPendingSync || isSyncing) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      void syncWithGoogleSheets('background');
    }, 1200);

    return () => window.clearTimeout(timeoutId);
  }, [apiLink, hasPendingSync, isLoggedIn, isOnline, isSyncing]);

  // --- Filtered Data ---
  const filteredTransactions = useMemo(() => {
    return transactions.filter(tx => {
      const matchesSearch = tx.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
                           tx.category.toLowerCase().includes(searchQuery.toLowerCase()) ||
                           tx.reference?.toLowerCase().includes(searchQuery.toLowerCase());
      
      if (!matchesSearch) return false;

      if (filterDate === 'All') return true;
      const txDate = parseISO(tx.date);
      const now = new Date();
      
      if (filterDate === 'Today') {
        return isWithinInterval(txDate, { start: startOfDay(now), end: endOfDay(now) });
      }
      if (filterDate === 'This Week') {
        return isWithinInterval(txDate, { start: startOfWeek(now), end: endOfWeek(now) });
      }
      if (filterDate === 'This Month') {
        return isWithinInterval(txDate, { start: startOfMonth(now), end: endOfMonth(now) });
      }
      if (filterDate === 'Custom' && customDateRange.start && customDateRange.end) {
        return isWithinInterval(txDate, { 
          start: startOfDay(parseISO(customDateRange.start)), 
          end: endOfDay(parseISO(customDateRange.end)) 
        });
      }
      return true;
    });
  }, [transactions, searchQuery, filterDate, customDateRange]);

  // --- Dashboard Stats ---
  const stats = useMemo(() => {
    const totalCredit = transactions.filter(t => t.type === 'Credit').reduce((sum, t) => sum + t.amount, 0);
    const totalDebit = transactions.filter(t => t.type === 'Debit').reduce((sum, t) => sum + t.amount, 0);
    const pendingPayments = orders.reduce((sum, o) => sum + o.remaining_amount, 0);
    const pendingOrders = orders.filter(o => o.status !== 'Completed').length;

    return {
      totalCredit,
      totalDebit,
      netBalance: totalCredit - totalDebit,
      pendingPayments,
      pendingOrders
    };
  }, [transactions, orders]);

  const syncStatusLabel = !apiLink
    ? 'Add Sheet Link'
    : !isOnline
      ? 'Offline Mode'
      : isSyncing
        ? 'Syncing...'
        : hasPendingSync
          ? 'Sync Pending'
          : 'Cloud Connected';

  const syncStatusDotClass = !apiLink
    ? 'bg-zinc-500'
    : !isOnline
      ? 'bg-red-500'
      : isSyncing
        ? 'bg-orange-500 animate-pulse'
        : hasPendingSync
          ? 'bg-yellow-500'
          : 'bg-green-500';

  const syncStatusTitle = lastSyncedAt
    ? `Last synced on ${format(parseISO(lastSyncedAt), 'dd MMM yyyy, hh:mm a')}`
    : 'No cloud sync completed yet';

  // --- Renderers ---

  if (!isLoggedIn) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4 font-sans">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-3xl p-8 shadow-2xl"
        >
          <div className="flex flex-col items-center mb-8">
            <div className="w-16 h-16 bg-orange-500 rounded-2xl flex items-center justify-center mb-4 shadow-lg shadow-orange-500/20">
              <Building2 className="text-white w-8 h-8" />
            </div>
            <h1 className="text-2xl font-bold text-white">KhataBook Pro</h1>
            <div className="flex flex-col items-center">
              <p className="text-zinc-500 text-sm">Business Management Software</p>
              <p className="text-zinc-600 text-[10px]">made by VaibhavK</p>
            </div>
          </div>

          <form onSubmit={handleLogin} className="space-y-6">
            <div>
              <label className="block text-xs font-medium text-zinc-500 uppercase tracking-wider mb-2">Username</label>
              <input 
                name="username"
                type="text" 
                defaultValue="admin"
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-orange-500 transition-all"
                placeholder="Enter username"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-500 uppercase tracking-wider mb-2">Password</label>
              <input 
                name="password"
                type="password" 
                defaultValue="admin123"
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-orange-500 transition-all"
                placeholder="Enter password"
              />
            </div>
            <button 
              type="submit"
              className="w-full bg-orange-500 hover:bg-orange-600 text-white font-bold py-4 rounded-xl transition-all shadow-lg shadow-orange-500/20 active:scale-95"
            >
              Login to Dashboard
            </button>
          </form>
          <div className="mt-8 text-center text-zinc-600 text-xs space-y-1">
            <p>Default: admin / admin123</p>
            <p>Default user: user / user123</p>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-sans pb-24">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-zinc-950/80 backdrop-blur-md border-b border-zinc-800 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-orange-500 rounded-xl flex items-center justify-center">
            <Building2 className="text-white w-6 h-6" />
          </div>
          <div>
            <h2 className="font-bold text-lg leading-tight">KhataBook Pro</h2>
            <div className="text-zinc-500 text-xs flex items-center gap-1" title={syncStatusTitle}>
              <div className={`w-2 h-2 rounded-full ${syncStatusDotClass}`} />
              {syncStatusLabel}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button 
            onClick={() => void syncWithGoogleSheets('manual')}
            disabled={isSyncing || !apiLink}
            className="p-2 hover:bg-zinc-800 rounded-full transition-colors text-zinc-400 disabled:opacity-40 disabled:cursor-not-allowed"
            title={apiLink ? 'Sync Data' : 'Add Google Sheet API link first'}
          >
            <RefreshCw className={`w-5 h-5 ${isSyncing ? 'animate-spin' : ''}`} />
          </button>
          <button 
            onClick={() => setIsLoggedIn(false)}
            className="p-2 hover:bg-zinc-800 rounded-full transition-colors text-zinc-400"
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </header>

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
          {activeTab === 'Orders' && <OrdersModule orders={orders} onUpdate={() => loadData()} showToast={showToast} isAdmin={isAdmin} markSyncPending={markSyncPending} />}
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
          {activeTab === 'Reports' && <ReportsModule transactions={transactions} orders={orders} showToast={showToast} />}
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

// --- Sub-Components ---

function NavItem({ icon: Icon, label, active, onClick }: { icon: any, label: string, active: boolean, onClick: () => void }) {
  return (
    <button 
      onClick={onClick}
      className={`flex flex-col items-center gap-1 px-2 sm:px-3 py-1 rounded-2xl transition-all shrink-0 ${active ? 'text-orange-500' : 'text-zinc-500'}`}
    >
      <div className={`p-1.5 sm:p-2 rounded-xl transition-all ${active ? 'bg-orange-500/10' : ''}`}>
        <Icon className="w-5 h-5 sm:w-6 h-6" />
      </div>
      <span className="text-[9px] sm:text-[10px] font-bold uppercase tracking-wider">{label}</span>
    </button>
  );
}

function Dashboard({ 
  stats, 
  transactions, 
  onNavigateToTransactions 
}: { 
  stats: any; 
  transactions: Transaction[]; 
  onNavigateToTransactions?: () => void;
}) {
  const recentTxs = useMemo(() => {
    return [...transactions].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5);
  }, [transactions]);

  return (
    <motion.div 
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="space-y-6"
    >
      <div className="grid grid-cols-2 gap-4">
        <StatCard label="Net Balance" value={stats.netBalance} icon={Wallet} color="text-white" bg="bg-zinc-900" full />
        <StatCard label="Total Credit" value={stats.totalCredit} icon={ArrowUpRight} color="text-green-500" bg="bg-zinc-900" />
        <StatCard label="Total Debit" value={stats.totalDebit} icon={ArrowDownLeft} color="text-red-500" bg="bg-zinc-900" />
        <StatCard label="Pending Payments" value={stats.pendingPayments} icon={Clock} color="text-orange-500" bg="bg-zinc-900" />
        <StatCard label="Active Orders" value={stats.pendingOrders} icon={Package} color="text-blue-500" bg="bg-zinc-900" isCount />
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6">
        <div 
          id="dashboard-recent-txs-header"
          onClick={onNavigateToTransactions}
          className="flex items-center justify-between mb-6 cursor-pointer group select-none"
        >
          <div className="flex items-center gap-2">
            <h3 className="font-bold text-lg text-white group-hover:text-orange-400 transition-colors">Recent Transactions</h3>
          </div>
          <button
            id="recent-txs-arrow-btn"
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onNavigateToTransactions?.();
            }}
            title="View all transactions"
            className="p-1.5 rounded-xl bg-zinc-800/80 group-hover:bg-orange-500/20 text-zinc-400 group-hover:text-orange-400 transition-all flex items-center justify-center"
          >
            <ChevronRight className="w-5 h-5 transition-transform group-hover:translate-x-0.5" />
          </button>
        </div>
        <div className="space-y-4">
          {recentTxs.map(tx => (
            <div 
              key={tx.id} 
              onClick={onNavigateToTransactions}
              className="flex items-center justify-between p-3 bg-zinc-800/50 hover:bg-zinc-800/80 border border-transparent hover:border-zinc-700/60 rounded-2xl cursor-pointer transition-all"
            >
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-xl shrink-0 ${tx.type === 'Credit' ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'}`}>
                  {tx.type === 'Credit' ? <ArrowUpRight className="w-5 h-5" /> : <ArrowDownLeft className="w-5 h-5" />}
                </div>
                <div>
                  <p className="font-semibold text-sm">{tx.category}</p>
                  <p className="text-zinc-500 text-[10px] leading-tight">{tx.description.includes('Payment done for') ? 'Order Payment' : tx.description}</p>
                  <p className="text-zinc-600 text-[9px] mt-0.5">{format(parseISO(tx.date), 'dd MMM, yyyy')}</p>
                </div>
              </div>
              <p className={`font-bold ${tx.type === 'Credit' ? 'text-green-500' : 'text-red-500'}`}>
                {tx.type === 'Credit' ? '+' : '-'}₹{tx.amount.toLocaleString()}
              </p>
            </div>
          ))}
          {recentTxs.length === 0 && (
            <p className="text-center text-zinc-500 py-8">No transactions yet</p>
          )}
        </div>
      </div>
    </motion.div>
  );
}

function StatCard({ label, value, icon: Icon, color, bg, full, isCount }: any) {
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

function TransactionsModule({ transactions, onAdd, searchQuery, setSearchQuery, markSyncPending, showToast }: any) {
  const [showAdd, setShowAdd] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Filter states
  const [periodFilter, setPeriodFilter] = useState<'All' | 'Today' | 'This Week' | 'This Month' | 'Last Month' | 'Last 30 Days' | 'This Year' | 'Custom'>('All');
  const [typeFilter, setTypeFilter] = useState<'All' | 'Credit' | 'Debit'>('All');
  const [paymentModeFilter, setPaymentModeFilter] = useState<string>('All');
  const [customRange, setCustomRange] = useState({ start: '', end: '' });

  // Progressive Lazy Loading State (Virtual Pagination)
  const PAGE_SIZE = 30;
  const [displayLimit, setDisplayLimit] = useState(PAGE_SIZE);
  const loadMoreSentinelRef = useRef<HTMLDivElement>(null);

  // Reset pagination limit when any filter or query changes
  useEffect(() => {
    setDisplayLimit(PAGE_SIZE);
  }, [searchQuery, periodFilter, typeFilter, paymentModeFilter, customRange]);

  // Filter transactions
  const filteredTransactions = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    const now = new Date();

    return transactions.filter((tx: Transaction) => {
      // Search match
      if (q) {
        const matchDesc = (tx.description || '').toLowerCase().includes(q);
        const matchCat = (tx.category || '').toLowerCase().includes(q);
        const matchRef = (tx.reference || '').toLowerCase().includes(q);
        const matchAmt = tx.amount ? tx.amount.toString().includes(q) : false;
        if (!matchDesc && !matchCat && !matchRef && !matchAmt) return false;
      }

      // Type match
      if (typeFilter !== 'All' && tx.type !== typeFilter) return false;

      // Payment Mode match
      if (paymentModeFilter !== 'All' && tx.payment_type !== paymentModeFilter) return false;

      // Period match
      if (periodFilter === 'All') return true;

      try {
        const txDate = parseISO(tx.date);
        if (periodFilter === 'Today') {
          return isWithinInterval(txDate, { start: startOfDay(now), end: endOfDay(now) });
        }
        if (periodFilter === 'This Week') {
          return isWithinInterval(txDate, { start: startOfWeek(now), end: endOfWeek(now) });
        }
        if (periodFilter === 'This Month') {
          return isWithinInterval(txDate, { start: startOfMonth(now), end: endOfMonth(now) });
        }
        if (periodFilter === 'Last Month') {
          const lastMonth = subMonths(now, 1);
          return isWithinInterval(txDate, { start: startOfMonth(lastMonth), end: endOfMonth(lastMonth) });
        }
        if (periodFilter === 'Last 30 Days') {
          return isWithinInterval(txDate, { start: startOfDay(subDays(now, 30)), end: endOfDay(now) });
        }
        if (periodFilter === 'This Year') {
          return isWithinInterval(txDate, { start: startOfYear(now), end: endOfYear(now) });
        }
        if (periodFilter === 'Custom' && customRange.start && customRange.end) {
          return isWithinInterval(txDate, { 
            start: startOfDay(parseISO(customRange.start)), 
            end: endOfDay(parseISO(customRange.end)) 
          });
        }
      } catch (e) {
        return true;
      }

      return true;
    });
  }, [transactions, searchQuery, periodFilter, typeFilter, paymentModeFilter, customRange]);

  // Sort filtered transactions descending by date
  const sortedTransactions = useMemo(() => {
    return [...filteredTransactions].sort((a, b) => b.date.localeCompare(a.date));
  }, [filteredTransactions]);

  // Slice visible batch for blazing fast DOM rendering
  const visibleTransactions = useMemo(() => {
    return sortedTransactions.slice(0, displayLimit);
  }, [sortedTransactions, displayLimit]);

  // Automatic Infinite Scroll Sentinel
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && displayLimit < sortedTransactions.length) {
          setDisplayLimit((prev) => Math.min(prev + PAGE_SIZE, sortedTransactions.length));
        }
      },
      { threshold: 0.1, rootMargin: '300px' }
    );

    const target = loadMoreSentinelRef.current;
    if (target) observer.observe(target);
    return () => {
      if (target) observer.unobserve(target);
    };
  }, [displayLimit, sortedTransactions.length]);

  // Summary of filtered set
  const filteredStats = useMemo(() => {
    const totalCredit = filteredTransactions
      .filter((t: any) => t.type === 'Credit')
      .reduce((sum: number, t: any) => sum + (Number(t.amount) || 0), 0);
    const totalDebit = filteredTransactions
      .filter((t: any) => t.type === 'Debit')
      .reduce((sum: number, t: any) => sum + (Number(t.amount) || 0), 0);
    return { totalCredit, totalDebit };
  }, [filteredTransactions]);

  const selectedTransactions = useMemo(() => {
    return transactions.filter((t: any) => selectedIds.has(t.id));
  }, [transactions, selectedIds]);

  const selectedDebitTotal = useMemo(() => {
    return selectedTransactions
      .filter((t: any) => t.type === 'Debit')
      .reduce((sum: number, t: any) => sum + (Number(t.amount) || 0), 0);
  }, [selectedTransactions]);

  const selectedCreditTotal = useMemo(() => {
    return selectedTransactions
      .filter((t: any) => t.type === 'Credit')
      .reduce((sum: number, t: any) => sum + (Number(t.amount) || 0), 0);
  }, [selectedTransactions]);

  const allVisibleSelected = sortedTransactions.length > 0 && sortedTransactions.every((t: any) => selectedIds.has(t.id));

  const toggleSelect = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (allVisibleSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(sortedTransactions.map((t: any) => t.id)));
    }
  };

  const cancelSelection = () => {
    setSelectedIds(new Set());
  };

  const executeBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    setIsDeleting(true);

    try {
      const idsToDelete: string[] = Array.from(selectedIds);
      await deleteTransactionsWithRecalculation(idsToDelete);
      
      markSyncPending();
      setSelectedIds(new Set());
      setShowBulkDeleteConfirm(false);
      
      if (showToast) {
        showToast(`Deleted ${idsToDelete.length} transaction${idsToDelete.length > 1 ? 's' : ''} successfully`, 'success');
      }
      onAdd();
    } catch (err) {
      console.error('Bulk delete error:', err);
      if (showToast) {
        showToast('Failed to delete transactions. Please try again.', 'error');
      }
    } finally {
      setIsDeleting(false);
    }
  };

  const handleDeleteSingle = async (id: string) => {
    try {
      await deleteTransactionsWithRecalculation([id]);
      markSyncPending();
      closeTransactionForm();
      if (showToast) {
        showToast('Transaction deleted successfully', 'success');
      }
      onAdd();
    } catch (err) {
      console.error('Delete transaction error:', err);
      if (showToast) {
        showToast('Failed to delete transaction', 'error');
      }
    }
  };

  const closeTransactionForm = () => {
    setShowAdd(false);
    setEditingTransaction(null);
  };

  const handleTransactionSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const selectedDate = formData.get('date') as string;
    const now = new Date();
    const timeStr = editingTransaction?.date.split('T')[1] || format(now, 'HH:mm:ss');
    const fullDate = `${selectedDate}T${timeStr}`;

    const tx: Transaction = {
      id: editingTransaction?.id || crypto.randomUUID(),
      date: fullDate,
      type: formData.get('type') as any,
      category: formData.get('category') as string,
      amount: Number(formData.get('amount')),
      payment_type: formData.get('payment_type') as any,
      description: formData.get('description') as string,
      reference: formData.get('reference') as string,
      order_id: editingTransaction?.order_id,
      synced: false
    };

    if (editingTransaction) {
      await db.transactions.put(tx);
    } else {
      await db.transactions.add(tx);
    }

    await reconcileOrdersWithTransactions();
    markSyncPending();
    closeTransactionForm();
    onAdd();
  };

  return (
    <motion.div 
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      className="space-y-4 sm:space-y-5"
    >
      {/* Top Search & Action Controls */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500 w-5 h-5" />
          <input 
            id="transaction-search-input"
            type="text" 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search category, note, ref, amount..."
            className="w-full bg-zinc-900 border border-zinc-800 rounded-2xl pl-12 pr-4 py-3.5 text-white focus:outline-none focus:ring-2 focus:ring-orange-500 text-sm"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 p-1"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {sortedTransactions.length > 0 && (
          <button
            id="toggle-multi-select-btn"
            onClick={() => {
              if (selectedIds.size > 0) {
                cancelSelection();
              } else {
                toggleSelectAll();
              }
            }}
            title={selectedIds.size > 0 ? 'Clear Selection' : 'Select All Filtered Transactions'}
            className={`p-3.5 rounded-2xl border transition-all flex items-center justify-center shrink-0 ${
              selectedIds.size > 0 
                ? 'bg-orange-500/20 border-orange-500 text-orange-400 shadow-lg shadow-orange-500/20' 
                : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-white hover:border-zinc-700'
            }`}
          >
            <ListChecks className="w-5 h-5" />
          </button>
        )}

        <button 
          id="add-transaction-open-btn"
          onClick={() => {
            setEditingTransaction(null);
            setShowAdd(true);
          }}
          className="bg-orange-500 hover:bg-orange-600 p-3.5 rounded-2xl text-white shadow-lg shadow-orange-500/20 active:scale-95 transition-all shrink-0 flex items-center gap-1.5 font-bold text-sm"
          title="Add Transaction"
        >
          <Plus className="w-5 h-5" />
          <span className="hidden sm:inline">Add Entry</span>
        </button>
      </div>

      {/* Filter Chips Toolbar */}
      <div className="space-y-2.5 bg-zinc-900/60 border border-zinc-800/80 rounded-2xl p-3">
        {/* Period Filters */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar text-xs">
          {(['All', 'This Month', 'Last Month', 'Last 30 Days', 'This Year', 'Today', 'Custom'] as const).map((period) => (
            <button
              key={period}
              type="button"
              onClick={() => setPeriodFilter(period)}
              className={`px-3 py-1.5 rounded-xl font-bold whitespace-nowrap transition-all text-xs ${
                periodFilter === period
                  ? 'bg-orange-500 text-white shadow-sm'
                  : 'bg-zinc-800/80 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'
              }`}
            >
              {period}
            </button>
          ))}
        </div>

        {/* Custom Date Range Picker */}
        {periodFilter === 'Custom' && (
          <div className="grid grid-cols-2 gap-2 pt-1">
            <div>
              <label className="block text-[10px] text-zinc-500 uppercase font-bold mb-1">From Date</label>
              <input
                type="date"
                value={customRange.start}
                onChange={(e) => setCustomRange(prev => ({ ...prev, start: e.target.value }))}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-1.5 text-xs text-white"
              />
            </div>
            <div>
              <label className="block text-[10px] text-zinc-500 uppercase font-bold mb-1">To Date</label>
              <input
                type="date"
                value={customRange.end}
                onChange={(e) => setCustomRange(prev => ({ ...prev, end: e.target.value }))}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-1.5 text-xs text-white"
              />
            </div>
          </div>
        )}

        {/* Type & Payment Mode Sub-Filters */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-zinc-800/60 text-xs">
          {/* Type Filter */}
          <div className="flex items-center gap-1">
            {(['All', 'Credit', 'Debit'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTypeFilter(t)}
                className={`px-2.5 py-1 rounded-lg font-bold text-[11px] transition-colors ${
                  typeFilter === t
                    ? t === 'Credit'
                      ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                      : t === 'Debit'
                      ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                      : 'bg-zinc-700 text-white'
                    : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                {t === 'All' ? 'All Types' : t === 'Credit' ? '+ Income' : '- Expense'}
              </button>
            ))}
          </div>

          {/* Payment Mode Selector */}
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] uppercase font-bold text-zinc-500">Mode:</span>
            <select
              value={paymentModeFilter}
              onChange={(e) => setPaymentModeFilter(e.target.value)}
              className="bg-zinc-800 border border-zinc-700 text-zinc-300 text-[11px] rounded-lg px-2 py-1 focus:outline-none"
            >
              <option value="All">All Modes</option>
              {PAYMENT_TYPES.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Dataset Summary & Active Filter Indicator */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-xs text-zinc-400">
        <div className="flex items-center gap-2">
          <span>
            Showing <strong className="text-zinc-200">{visibleTransactions.length}</strong> of{' '}
            <strong className="text-zinc-200">{sortedTransactions.length}</strong> transactions
          </span>
          {sortedTransactions.length !== transactions.length && (
            <span className="text-[11px] text-orange-400 bg-orange-500/10 px-2 py-0.5 rounded-md">
              (Filtered from {transactions.length} total)
            </span>
          )}
        </div>

        <div className="flex items-center gap-3 text-[11px]">
          {filteredStats.totalCredit > 0 && (
            <span className="text-green-400 font-bold">
              +₹{filteredStats.totalCredit.toLocaleString('en-IN')}
            </span>
          )}
          {filteredStats.totalDebit > 0 && (
            <span className="text-red-400 font-bold">
              -₹{filteredStats.totalDebit.toLocaleString('en-IN')}
            </span>
          )}
        </div>
      </div>

      {/* Multi-Select Action Toolbar - Autohidden if none selected */}
      <AnimatePresence>
        {selectedIds.size > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.99 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.99 }}
            transition={{ duration: 0.15 }}
            className="bg-gradient-to-r from-zinc-900 via-zinc-900 to-zinc-850 border border-orange-500/40 rounded-2xl p-3.5 shadow-xl space-y-2.5"
          >
            <div className="flex flex-wrap items-center justify-between gap-2.5">
              <div className="flex items-center gap-2.5">
                <button
                  id="select-all-transactions-btn"
                  onClick={toggleSelectAll}
                  className="flex items-center gap-2 text-xs font-bold px-3 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 transition-colors"
                >
                  {allVisibleSelected ? (
                    <>
                      <CheckSquare className="w-3.5 h-3.5 text-orange-500" />
                      Deselect All
                    </>
                  ) : (
                    <>
                      <Square className="w-3.5 h-3.5 text-zinc-400" />
                      Select All Filtered ({sortedTransactions.length})
                    </>
                  )}
                </button>

                <span className="bg-orange-500/20 text-orange-400 border border-orange-500/30 text-xs font-bold px-2.5 py-1 rounded-xl">
                  {selectedIds.size} Selected
                </span>
              </div>

              <div className="flex items-center gap-2 ml-auto">
                <button
                  id="bulk-delete-trigger-btn"
                  onClick={() => setShowBulkDeleteConfirm(true)}
                  className="bg-red-500/15 hover:bg-red-500 border border-red-500/30 hover:border-red-500 text-red-400 hover:text-white text-xs font-bold px-3.5 py-1.5 rounded-xl flex items-center gap-1.5 transition-all shadow-lg shadow-red-500/10"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Delete ({selectedIds.size})
                </button>

                <button
                  id="cancel-selection-btn"
                  onClick={cancelSelection}
                  className="p-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white transition-colors"
                  title="Clear selection"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Selection Breakdown */}
            <div className="pt-2 border-t border-zinc-800/80 flex flex-wrap items-center gap-3 text-[11px] text-zinc-400">
              <span>Selected totals:</span>
              {selectedCreditTotal > 0 && (
                <span className="text-green-400 font-bold bg-green-500/10 px-2 py-0.5 rounded-md border border-green-500/20">
                  Credit: +₹{selectedCreditTotal.toLocaleString('en-IN')}
                </span>
              )}
              {selectedDebitTotal > 0 && (
                <span className="text-red-400 font-bold bg-red-500/10 px-2 py-0.5 rounded-md border border-red-500/20">
                  Debit: -₹{selectedDebitTotal.toLocaleString('en-IN')}
                </span>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Transactions List (Progressive Lazy Rendered) */}
      <div className="space-y-3">
        {visibleTransactions.map((tx: any) => {
          const isSelected = selectedIds.has(tx.id);

          return (
            <div 
              key={tx.id} 
              id={`transaction-card-${tx.id}`}
              className={`border rounded-2xl p-3.5 sm:p-4 flex items-center justify-between transition-all select-none ${
                isSelected 
                  ? 'bg-orange-500/10 border-orange-500/60 shadow-lg shadow-orange-500/5 ring-1 ring-orange-500/30' 
                  : 'bg-zinc-900 border-zinc-800 hover:border-zinc-700'
              }`}
            >
              <div className="flex items-center gap-2.5 sm:gap-3.5 flex-1 min-w-0 pr-2">
                {/* Small Compact Checkbox Button */}
                <button
                  id={`select-checkbox-${tx.id}`}
                  type="button"
                  onClick={(e) => toggleSelect(tx.id, e)}
                  className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 transition-all ${
                    isSelected 
                      ? 'bg-orange-500 border-orange-500 text-white shadow-sm shadow-orange-500/30' 
                      : 'border-zinc-700/80 bg-zinc-800/30 hover:border-zinc-500 text-transparent hover:bg-zinc-800'
                  }`}
                  title={isSelected ? 'Deselect transaction' : 'Select transaction'}
                >
                  <Check className={`w-3.5 h-3.5 stroke-[3] ${isSelected ? 'opacity-100' : 'opacity-0'}`} />
                </button>

                {/* Small Compact Type Indicator */}
                <div className={`p-1.5 rounded-lg shrink-0 ${tx.type === 'Credit' ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'}`}>
                  {tx.type === 'Credit' ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownLeft className="w-3.5 h-3.5" />}
                </div>

                {/* High-Visibility Expanded Text Block */}
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-sm sm:text-base text-zinc-100 truncate leading-snug">{tx.category}</p>
                  {tx.description && (
                    <p className="text-zinc-400 text-xs truncate mt-0.5 leading-normal">{tx.description}</p>
                  )}
                  <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 mt-1">
                    <span className="bg-zinc-800/90 text-zinc-300 text-[10px] px-2 py-0.5 rounded-md uppercase font-bold tracking-wider">{tx.payment_type}</span>
                    <span className="text-zinc-500 text-[10px]">{format(parseISO(tx.date), 'dd MMM yyyy')}</span>
                    {tx.order_id && (
                      <span className="bg-blue-500/10 text-blue-400 border border-blue-500/20 text-[9px] px-1.5 py-0.5 rounded font-bold">
                        Order
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="text-right shrink-0">
                <p className={`text-base sm:text-lg font-extrabold tracking-tight ${tx.type === 'Credit' ? 'text-green-500' : 'text-red-500'}`}>
                  {tx.type === 'Credit' ? '+' : '-'}₹{Number(tx.amount || 0).toLocaleString('en-IN')}
                </p>
                {tx.reference && <p className="text-zinc-500 text-[10px] truncate max-w-[110px] mt-0.5">Ref: {tx.reference}</p>}
                
                {!tx.order_id && (
                  <button
                    id={`edit-tx-btn-${tx.id}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditingTransaction(tx);
                      setShowAdd(false);
                    }}
                    className="mt-1.5 inline-flex items-center gap-1 text-[10px] font-bold text-zinc-400 hover:text-orange-400 transition-colors"
                    title="Edit Transaction"
                  >
                    <Pencil className="w-3 h-3" /> Edit
                  </button>
                )}
              </div>
            </div>
          );
        })}

        {/* Progressive Load More Sentinel & Buttons */}
        {displayLimit < sortedTransactions.length && (
          <div className="pt-3 pb-2 flex flex-col sm:flex-row items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => setDisplayLimit((prev) => Math.min(prev + PAGE_SIZE, sortedTransactions.length))}
              className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-200 text-xs font-bold transition-all shadow-sm flex items-center justify-center gap-2"
            >
              <span>Load More (+{Math.min(PAGE_SIZE, sortedTransactions.length - displayLimit)} remaining)</span>
            </button>
            <button
              type="button"
              onClick={() => setDisplayLimit(sortedTransactions.length)}
              className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 text-xs font-medium transition-colors"
            >
              Show All ({sortedTransactions.length})
            </button>
          </div>
        )}

        {/* Intersection Sentinel element */}
        <div ref={loadMoreSentinelRef} className="h-4" />

        {sortedTransactions.length === 0 && (
          <div className="text-center py-16 bg-zinc-900/50 border border-zinc-800 border-dashed rounded-[32px]">
            <div className="w-14 h-14 bg-zinc-800 rounded-2xl flex items-center justify-center mx-auto mb-3">
              <RefreshCw className="text-zinc-600 w-7 h-7" />
            </div>
            <p className="text-zinc-400 font-medium text-sm">No transactions match your criteria</p>
            <p className="text-zinc-600 text-xs mt-1">Try clearing your search or date filter</p>
          </div>
        )}
      </div>

      {/* Bulk Delete Confirmation Modal */}
      <AnimatePresence>
        {showBulkDeleteConfirm && (
          <div 
            className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
            onClick={() => !isDeleting && setShowBulkDeleteConfirm(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-zinc-900 border border-zinc-800 rounded-[32px] p-6 sm:p-8 max-w-md w-full shadow-2xl space-y-6"
            >
              <div className="w-14 h-14 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-500 flex items-center justify-center mx-auto">
                <AlertTriangle className="w-7 h-7" />
              </div>

              <div className="text-center space-y-2">
                <h3 className="text-xl font-bold text-white">
                  Delete {selectedIds.size} Transaction{selectedIds.size > 1 ? 's' : ''}?
                </h3>
                <p className="text-xs sm:text-sm text-zinc-400">
                  Are you sure you want to permanently delete the selected entries? This will clean up your local records and update your ledger balance.
                </p>
              </div>

              {/* Breakdown */}
              <div className="bg-zinc-800/50 border border-zinc-700/40 rounded-2xl p-4 space-y-2 text-xs">
                <div className="flex justify-between text-zinc-400">
                  <span>Selected Records:</span>
                  <span className="font-bold text-white">{selectedIds.size}</span>
                </div>
                {selectedDebitTotal > 0 && (
                  <div className="flex justify-between text-red-400">
                    <span>Total Expense (Debit):</span>
                    <span className="font-bold">-₹{selectedDebitTotal.toLocaleString('en-IN')}</span>
                  </div>
                )}
                {selectedCreditTotal > 0 && (
                  <div className="flex justify-between text-green-400">
                    <span>Total Income (Credit):</span>
                    <span className="font-bold">+₹{selectedCreditTotal.toLocaleString('en-IN')}</span>
                  </div>
                )}
              </div>

              <div className="flex gap-3">
                <button
                  id="cancel-bulk-delete-btn"
                  type="button"
                  disabled={isDeleting}
                  onClick={() => setShowBulkDeleteConfirm(false)}
                  className="flex-1 py-3.5 px-4 rounded-2xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-bold text-sm transition-colors"
                >
                  Cancel
                </button>
                <button
                  id="confirm-bulk-delete-btn"
                  type="button"
                  disabled={isDeleting}
                  onClick={executeBulkDelete}
                  className="flex-1 py-3.5 px-4 rounded-2xl bg-red-500 hover:bg-red-600 active:scale-98 text-white font-bold text-sm transition-all flex items-center justify-center gap-2 shadow-lg shadow-red-500/20 disabled:opacity-60"
                >
                  {isDeleting ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      Deleting...
                    </>
                  ) : (
                    <>
                      <Trash2 className="w-4 h-4" />
                      Delete
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Add / Edit Modal */}
      <AnimatePresence>
        {(showAdd || editingTransaction) && (
          <div 
            className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm"
            onClick={closeTransactionForm}
          >
            <motion.div 
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              onClick={(e) => e.stopPropagation()}
              className="bg-zinc-900 w-full max-w-lg rounded-t-[40px] sm:rounded-[40px] p-8 border-t sm:border border-zinc-800 shadow-2xl overflow-y-auto max-h-[85vh] pb-32 sm:pb-8"
            >
              <div className="w-12 h-1.5 bg-zinc-800 rounded-full mx-auto mb-8" />
              <h2 className="text-2xl font-bold mb-6">{editingTransaction ? 'Edit Transaction' : 'Add Transaction'}</h2>
              <form onSubmit={handleTransactionSubmit} className="space-y-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-zinc-500 uppercase mb-2">Type</label>
                    <select name="type" defaultValue={editingTransaction?.type || 'Debit'} className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-sm text-white">
                      <option value="Debit">Debit (Expense)</option>
                      <option value="Credit">Credit (Income)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-zinc-500 uppercase mb-2">Date</label>
                    <input name="date" type="date" defaultValue={editingTransaction ? format(parseISO(editingTransaction.date), 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd')} className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-sm text-white" required />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-zinc-500 uppercase mb-2">Name / Category</label>
                  <input 
                    name="category" 
                    type="text" 
                    defaultValue={editingTransaction?.category || ''}
                    placeholder="e.g. Cement, Site Payment" 
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-sm text-white" 
                    required 
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-zinc-500 uppercase mb-2">Amount</label>
                    <input 
                      name="amount" 
                      type="number" 
                      defaultValue={editingTransaction?.amount ?? ''}
                      inputMode="decimal"
                      placeholder="0.00" 
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-sm no-spinner text-white" 
                      required 
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-zinc-500 uppercase mb-2">Payment Mode</label>
                    <select name="payment_type" defaultValue={editingTransaction?.payment_type || PAYMENT_TYPES[0]} className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-sm text-white">
                      {PAYMENT_TYPES.map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-zinc-500 uppercase mb-2">Description</label>
                  <input name="description" type="text" defaultValue={editingTransaction?.description || ''} placeholder="What is this for?" className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-sm text-white" required />
                </div>

                <div>
                  <label className="block text-xs font-bold text-zinc-500 uppercase mb-2">Reference (Optional)</label>
                  <input name="reference" type="text" defaultValue={editingTransaction?.reference || ''} placeholder="Bill No / UPI ID" className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-sm text-white" />
                </div>

                <div className="flex flex-col sm:flex-row gap-3 pt-4">
                  {editingTransaction && (
                    <button 
                      type="button" 
                      onClick={() => handleDeleteSingle(editingTransaction.id)} 
                      className="bg-red-500/15 hover:bg-red-500 border border-red-500/30 text-red-400 hover:text-white py-4 px-6 rounded-2xl font-bold text-sm transition-all flex items-center justify-center gap-2"
                    >
                      <Trash2 className="w-4 h-4" /> Delete
                    </button>
                  )}
                  <button type="button" onClick={closeTransactionForm} className="flex-1 bg-zinc-800 hover:bg-zinc-700 py-4 rounded-2xl font-bold text-sm text-zinc-300 transition-colors">Cancel</button>
                  <button type="submit" className="flex-1 bg-orange-500 hover:bg-orange-600 py-4 rounded-2xl font-bold text-sm text-white shadow-lg shadow-orange-500/20 transition-colors">{editingTransaction ? 'Update Entry' : 'Save Entry'}</button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function OrdersModule({ orders, onUpdate, showToast, isAdmin, markSyncPending }: any) {
  const [showAdd, setShowAdd] = useState(false);
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [orderToDelete, setOrderToDelete] = useState<Order | null>(null);
  const [orderSearchQuery, setOrderSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'All' | 'Pending' | 'Partial' | 'Completed'>('All');
  const [sortAsc, setSortAsc] = useState(false); // false = newest date first, true = oldest date first
  const createEmptyOrderItem = (): OrderItem => ({ id: crypto.randomUUID(), material: '', quantity: '', amount: 0 });
  const [newItems, setNewItems] = useState<OrderItem[]>([createEmptyOrderItem()]);

  // Multi-select & Bulk Action state
  const [selectedOrderIds, setSelectedOrderIds] = useState<Set<string>>(new Set());
  const [isPrinting, setIsPrinting] = useState(false);
  const [printingOrderId, setPrintingOrderId] = useState<string | null>(null);
  const [isBulkCompleting, setIsBulkCompleting] = useState(false);
  const [showSettleModal, setShowSettleModal] = useState(false);
  const [settlePaymentType, setSettlePaymentType] = useState('Cash');
  const [settleDate, setSettleDate] = useState(() => format(new Date(), 'yyyy-MM-dd'));
  const [isSettling, setIsSettling] = useState(false);

  const statusCounts = useMemo(() => ({
    All: orders.length,
    Pending: orders.filter((o: Order) => o.status === 'Pending').length,
    Partial: orders.filter((o: Order) => o.status === 'Partial').length,
    Completed: orders.filter((o: Order) => o.status === 'Completed').length,
  }), [orders]);

  const filteredOrders = useMemo(() => {
    let result = [...orders];

    // Status filter
    if (statusFilter !== 'All') {
      result = result.filter((o: Order) => o.status === statusFilter);
    }

    // Search query
    if (orderSearchQuery.trim()) {
      const q = orderSearchQuery.toLowerCase().trim();
      result = result.filter((order: Order) => {
        const matchSupplier = (order.supplier || '').toLowerCase().includes(q);
        const matchItems = (order.items || []).some(item => 
          (item.material || '').toLowerCase().includes(q) ||
          (item.quantity || '').toLowerCase().includes(q)
        );
        return matchSupplier || matchItems;
      });
    }

    // Sorting: Newest first by default, or Oldest first when toggled
    result.sort((a: Order, b: Order) => {
      const cmp = b.date.localeCompare(a.date);
      return sortAsc ? -cmp : cmp;
    });

    return result;
  }, [orders, statusFilter, orderSearchQuery, sortAsc]);

  const filteredSummary = useMemo(() => {
    const totalCount = filteredOrders.length;
    const totalValue = filteredOrders.reduce((sum: number, o: Order) => sum + (Number(o.total_amount) || 0), 0);
    const totalPaid = filteredOrders.reduce((sum: number, o: Order) => sum + (Number(o.paid_amount) || 0), 0);
    const totalRemaining = filteredOrders.reduce((sum: number, o: Order) => sum + (Number(o.remaining_amount) || 0), 0);
    return { totalCount, totalValue, totalPaid, totalRemaining };
  }, [filteredOrders]);

  const selectedOrders = useMemo(() => {
    return orders.filter((o: Order) => selectedOrderIds.has(o.order_id));
  }, [orders, selectedOrderIds]);

  const selectedTotalAmount = useMemo(() => {
    return selectedOrders.reduce((sum: number, o: Order) => sum + (Number(o.total_amount) || 0), 0);
  }, [selectedOrders]);

  const selectedPaidAmount = useMemo(() => {
    return selectedOrders.reduce((sum: number, o: Order) => sum + (Number(o.paid_amount) || 0), 0);
  }, [selectedOrders]);

  const selectedRemainingAmount = useMemo(() => {
    return selectedOrders.reduce((sum: number, o: Order) => sum + (Number(o.remaining_amount) || 0), 0);
  }, [selectedOrders]);

  const ordersWithPendingBalance = useMemo(() => {
    return selectedOrders.filter((o: Order) => Number(o.remaining_amount) > 0);
  }, [selectedOrders]);

  const allVisibleOrdersSelected = filteredOrders.length > 0 && filteredOrders.every((o: Order) => selectedOrderIds.has(o.order_id));

  const toggleSelectOrder = (orderId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setSelectedOrderIds(prev => {
      const next = new Set(prev);
      if (next.has(orderId)) {
        next.delete(orderId);
      } else {
        next.add(orderId);
      }
      return next;
    });
  };

  const toggleSelectAllOrders = () => {
    if (allVisibleOrdersSelected) {
      setSelectedOrderIds(new Set());
    } else {
      setSelectedOrderIds(new Set(filteredOrders.map((o: Order) => o.order_id)));
    }
  };

  const cancelOrderSelection = () => {
    setSelectedOrderIds(new Set());
  };

  const handleBulkMarkCompleted = async () => {
    if (selectedOrders.length === 0) return;

    const incompleteOrders = selectedOrders.filter(
      (o: Order) => o.status !== 'Completed' || Number(o.remaining_amount) > 0
    );

    if (incompleteOrders.length === 0) {
      showToast('All selected orders are already marked as Completed.', 'info');
      return;
    }

    // If any selected order has pending balance, open the Settle & Complete popup
    if (ordersWithPendingBalance.length > 0) {
      setSettleDate(format(new Date(), 'yyyy-MM-dd'));
      setShowSettleModal(true);
      return;
    }

    // Otherwise, all selected orders already have balance 0 (fully paid), complete them directly
    setIsBulkCompleting(true);
    try {
      for (const order of incompleteOrders) {
        await db.orders.update(order.order_id, {
          status: 'Completed',
          remaining_amount: 0,
          synced: false
        });
      }
      markSyncPending();
      onUpdate();
      showToast(`Marked ${incompleteOrders.length} fully paid order${incompleteOrders.length > 1 ? 's' : ''} as Completed!`, 'success');
      setSelectedOrderIds(new Set());
    } catch (err) {
      console.error('Bulk mark completed error:', err);
      showToast('Failed to mark orders as Completed', 'error');
    } finally {
      setIsBulkCompleting(false);
    }
  };

  const handleConfirmSettlePayments = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedOrders.length === 0) return;

    setIsSettling(true);
    try {
      const now = new Date();
      const timeStr = format(now, 'HH:mm:ss');
      const fullDate = `${settleDate}T${timeStr}`;

      let settledCount = 0;
      let totalSettledAmount = 0;

      for (const order of selectedOrders) {
        const balance = Number(order.remaining_amount);
        if (balance > 0) {
          // 1. Add payment record for the remaining balance
          await db.orderPayments.add({
            payment_id: crypto.randomUUID(),
            order_id: order.order_id,
            amount: balance,
            payment_type: settlePaymentType,
            date: fullDate,
            synced: false,
          });

          // 2. Add Debit transaction for this balance payment
          const itemSummary = getItemSummary(order.items || []);
          await db.transactions.add({
            id: crypto.randomUUID(),
            date: fullDate,
            type: 'Debit',
            category: order.supplier,
            amount: balance,
            payment_type: settlePaymentType as any,
            description: `Payment done for ${itemSummary}`,
            order_id: order.order_id,
            synced: false,
          });

          // 3. Update order to Completed
          await db.orders.update(order.order_id, {
            paid_amount: order.total_amount,
            remaining_amount: 0,
            status: 'Completed',
            synced: false,
          });

          settledCount++;
          totalSettledAmount += balance;
        } else {
          // Balance was already 0, update status to Completed
          await db.orders.update(order.order_id, {
            status: 'Completed',
            remaining_amount: 0,
            synced: false,
          });
        }
      }

      markSyncPending();
      onUpdate();
      showToast(
        `Recorded balance payments (₹${totalSettledAmount.toLocaleString('en-IN')}) and marked ${selectedOrders.length} order(s) as Completed!`,
        'success'
      );
      setShowSettleModal(false);
      setSelectedOrderIds(new Set());
    } catch (error) {
      console.error('Error settling orders:', error);
      showToast('Failed to complete order payments', 'error');
    } finally {
      setIsSettling(false);
    }
  };

  const handlePrintOrders = async (ordersToPrint: Order[]) => {
    if (ordersToPrint.length === 0) {
      if (showToast) showToast('Please select at least one order to print', 'info');
      return;
    }
    setIsPrinting(true);
    if (ordersToPrint.length === 1) {
      setPrintingOrderId(ordersToPrint[0].order_id);
    }
    try {
      await generateAndShareOrderReceipts(ordersToPrint, showToast);
    } finally {
      setIsPrinting(false);
      setPrintingOrderId(null);
    }
  };

  const getItemSummary = (items: OrderItem[]) => {
    const validItems = (items || []).filter(i => i.material.trim() !== '');
    if (validItems.length === 0) return 'Untitled Order';
    if (validItems.length === 1) return validItems[0].material;
    return `${validItems[0].material} + ${validItems.length - 1} more`;
  };

  const getFullItemSummary = (items: OrderItem[]) => {
    if (!items) return '';
    return items.map(i => i.material).join(', ');
  };

  const closeOrderForm = () => {
    setShowAdd(false);
    setEditingOrder(null);
    setNewItems([createEmptyOrderItem()]);
  };

  const openAddOrderForm = () => {
    setEditingOrder(null);
    setNewItems([createEmptyOrderItem()]);
    setShowAdd(true);
  };

  const openEditOrderForm = (order: Order) => {
    setShowAdd(false);
    setEditingOrder(order);
    setNewItems(order.items?.length ? order.items.map(item => ({ ...item })) : [createEmptyOrderItem()]);
  };

  const handleAddItemRow = () => {
    setNewItems([...newItems, createEmptyOrderItem()]);
  };

  const handleRemoveItemRow = (id: string) => {
    if (newItems.length > 1) {
      setNewItems(newItems.filter(i => i.id !== id));
    }
  };

  const handleItemChange = (id: string, field: keyof OrderItem, value: any) => {
    setNewItems(newItems.map(i => i.id === id ? { ...i, [field]: value } : i));
  };

  const handleOrderSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const filteredItems = newItems.filter(item => item.material.trim() !== '');
    if (filteredItems.length === 0) {
      showToast('Please add at least one material name', 'error');
      return;
    }

    const selectedDate = formData.get('date') as string;
    const now = new Date();
    const timeStr = editingOrder?.date.split('T')[1] || format(now, 'HH:mm:ss');
    const fullDate = `${selectedDate}T${timeStr}`;

    const total = filteredItems.reduce((sum, item) => sum + Number(item.amount), 0);
    const supplier = formData.get('supplier') as string;

    if (editingOrder) {
      if (total < editingOrder.paid_amount) {
        showToast(`Total amount cannot be less than paid amount of ₹${editingOrder.paid_amount.toLocaleString()}`, 'error');
        return;
      }

      const remaining = total - editingOrder.paid_amount;
      const status = remaining <= 0 ? 'Completed' : editingOrder.paid_amount > 0 ? 'Partial' : 'Pending';

      await db.orders.put({
        ...editingOrder,
        items: filteredItems,
        supplier,
        total_amount: total,
        remaining_amount: remaining,
        status,
        date: fullDate,
        synced: false
      });

      const itemSummary = getItemSummary(filteredItems);
      await db.transactions.where('order_id').equals(editingOrder.order_id).modify((tx) => {
        tx.category = supplier;
        tx.description = `Payment done for ${itemSummary}`;
        tx.synced = false;
      });
    } else {
      const order: Order = {
        order_id: crypto.randomUUID(),
        items: filteredItems,
        supplier,
        total_amount: total,
        paid_amount: 0,
        remaining_amount: total,
        status: 'Pending',
        date: fullDate,
        synced: false
      };
      await db.orders.add(order);
    }

    markSyncPending();
    closeOrderForm();
    onUpdate();
  };

  const handlePayment = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selectedOrder) return;
    const formData = new FormData(e.currentTarget);
    const amount = Number(formData.get('amount'));
    const paymentType = formData.get('payment_type') as string;
    const selectedDate = formData.get('date') as string;
    const now = new Date();
    const timeStr = format(now, 'HH:mm:ss');
    const fullDate = `${selectedDate}T${timeStr}`;

    const newPaid = selectedOrder.paid_amount + amount;
    const newRemaining = selectedOrder.total_amount - newPaid;
    const newStatus = newRemaining <= 0 ? 'Completed' : 'Partial';

    const itemSummary = getItemSummary(selectedOrder.items || []);

    // 1. Update Order
    await db.orders.update(selectedOrder.order_id, {
      paid_amount: newPaid,
      remaining_amount: newRemaining,
      status: newStatus,
      synced: false
    });

    // 2. Add Payment Record
    await db.orderPayments.add({
      payment_id: crypto.randomUUID(),
      order_id: selectedOrder.order_id,
      amount,
      payment_type: paymentType,
      date: fullDate,
      synced: false
    });

    // 3. Add Transaction Entry
    await db.transactions.add({
      id: crypto.randomUUID(),
      date: fullDate,
      type: 'Debit',
      category: selectedOrder.supplier,
      amount,
      payment_type: paymentType as any,
      description: `Payment done for ${itemSummary}`,
      order_id: selectedOrder.order_id,
      synced: false
    });

    markSyncPending();
    setSelectedOrder(null);
    onUpdate();
  };

  const handleDeleteOrder = async (order: Order) => {
    try {
      // Check if payments exist
      const payments = await db.orderPayments.where('order_id').equals(order.order_id).toArray();
      
      // If payments exist and not admin, block deletion
      if (payments.length > 0 && !isAdmin) {
        showToast('Only Admin can delete orders with payments', 'error');
        setOrderToDelete(null);
        return;
      }

      await deleteOrderWithAssociated(order);
      
      setOrderToDelete(null);
      markSyncPending();
      showToast('Order and associated transactions deleted', 'success');
      onUpdate();
    } catch (error) {
      console.error('Delete error:', error);
      showToast('Failed to delete order', 'error');
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      className="space-y-5"
    >
      {/* Top Search & Actions Row */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500 w-5 h-5" />
          <input 
            id="order-search-input"
            type="text" 
            value={orderSearchQuery}
            onChange={(e) => setOrderSearchQuery(e.target.value)}
            placeholder="Search by supplier or material..." 
            className="w-full bg-zinc-900 border border-zinc-800 rounded-2xl pl-12 pr-10 py-3.5 text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-orange-500 text-sm"
          />
          {orderSearchQuery && (
            <button
              id="clear-order-search-btn"
              type="button"
              onClick={() => setOrderSearchQuery('')}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 p-1 rounded-lg text-zinc-400 hover:text-white bg-zinc-800 hover:bg-zinc-700 transition-colors"
              title="Clear search"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          {filteredOrders.length > 0 && (
            <button
              id="toggle-multi-select-orders-btn"
              type="button"
              onClick={() => {
                if (selectedOrderIds.size > 0) {
                  cancelOrderSelection();
                } else {
                  toggleSelectAllOrders();
                }
              }}
              title={selectedOrderIds.size > 0 ? 'Clear Selection' : 'Select All Orders for Bulk Actions'}
              className={`p-3.5 rounded-2xl border transition-all flex items-center justify-center shrink-0 ${
                selectedOrderIds.size > 0 
                  ? 'bg-orange-500/20 border-orange-500 text-orange-400 shadow-lg shadow-orange-500/20' 
                  : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-white hover:border-zinc-700'
              }`}
            >
              <ListChecks className="w-5 h-5" />
            </button>
          )}

          <button 
            id="add-new-order-btn"
            onClick={openAddOrderForm}
            className="bg-orange-500 hover:bg-orange-600 px-4 sm:px-5 py-3.5 rounded-2xl text-white font-bold shadow-lg shadow-orange-500/20 active:scale-95 transition-all flex items-center justify-center gap-2 shrink-0 flex-1 sm:flex-initial"
          >
            <Plus className="w-5 h-5 text-white" />
            <span className="text-sm">New Order</span>
          </button>
        </div>
      </div>

      {/* Status Filter & Sort Controls Row */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 pt-1">
        {/* Status Filter Tabs */}
        <div className="flex items-center gap-1 p-1 bg-zinc-900/90 border border-zinc-800/80 rounded-2xl overflow-x-auto max-w-full">
          {(['All', 'Pending', 'Partial', 'Completed'] as const).map((tab) => {
            const count = statusCounts[tab];
            const isActive = statusFilter === tab;
            return (
              <button
                key={tab}
                id={`order-status-filter-tab-${tab.toLowerCase()}`}
                type="button"
                onClick={() => setStatusFilter(tab)}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all flex items-center gap-1.5 ${
                  isActive
                    ? tab === 'Completed'
                      ? 'bg-green-500/20 text-green-400 border border-green-500/40 shadow-sm'
                      : tab === 'Partial'
                      ? 'bg-orange-500/20 text-orange-400 border border-orange-500/40 shadow-sm'
                      : tab === 'Pending'
                      ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/40 shadow-sm'
                      : 'bg-zinc-800 text-white border border-zinc-700 shadow-sm'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40 border border-transparent'
                }`}
              >
                <span>{tab}</span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full leading-none font-bold ${
                  isActive ? 'bg-white/15' : 'bg-zinc-800 text-zinc-500'
                }`}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Date Sort Toggle Button */}
        <button
          id="toggle-order-date-sort-btn"
          type="button"
          onClick={() => setSortAsc(!sortAsc)}
          className="flex items-center gap-2 px-3.5 py-2 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-750 rounded-xl text-xs font-semibold text-zinc-300 transition-colors shrink-0 active:scale-95"
          title={sortAsc ? 'Currently sorting: Oldest First. Click for Newest First.' : 'Currently sorting: Newest First. Click for Oldest First.'}
        >
          <ArrowUpDown className="w-3.5 h-3.5 text-orange-400" />
          <span>{sortAsc ? 'Date: Oldest First' : 'Date: Newest First'}</span>
        </button>
      </div>

      {/* Filtered Orders Financial Summary Row */}
      <div className="grid grid-cols-3 gap-3 bg-gradient-to-br from-zinc-900 via-zinc-900 to-zinc-950 border border-zinc-800/90 rounded-2xl p-4 shadow-sm">
        <div className="flex flex-col min-w-0">
          <span className="text-zinc-500 text-[11px] font-semibold tracking-wide uppercase truncate">
            {statusFilter === 'All' ? 'Total Orders' : `${statusFilter} Orders`}
          </span>
          <span className="text-lg sm:text-xl font-bold text-white mt-0.5">
            {filteredSummary.totalCount}
            <span className="text-[11px] text-zinc-500 font-normal ml-1.5 hidden sm:inline">
              {filteredSummary.totalCount === 1 ? 'order' : 'orders'}
            </span>
          </span>
        </div>

        <div className="flex flex-col min-w-0 border-l border-zinc-800 pl-3 sm:pl-4">
          <span className="text-zinc-500 text-[11px] font-semibold tracking-wide uppercase truncate">Total Value</span>
          <span className="text-lg sm:text-xl font-bold text-zinc-100 mt-0.5 truncate">
            ₹{filteredSummary.totalValue.toLocaleString('en-IN')}
          </span>
        </div>

        <div className="flex flex-col min-w-0 border-l border-zinc-800 pl-3 sm:pl-4">
          <span className="text-zinc-500 text-[11px] font-semibold tracking-wide uppercase truncate">Remaining Balance</span>
          <span className={`text-lg sm:text-xl font-bold mt-0.5 truncate ${filteredSummary.totalRemaining > 0 ? 'text-red-400' : 'text-green-400'}`}>
            ₹{filteredSummary.totalRemaining.toLocaleString('en-IN')}
          </span>
        </div>
      </div>

      {/* Multi-Select Action Toolbar for Orders */}
      <AnimatePresence>
        {selectedOrderIds.size > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.99 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.99 }}
            transition={{ duration: 0.15 }}
            className="bg-gradient-to-r from-zinc-900 via-zinc-900 to-zinc-850 border border-orange-500/40 rounded-2xl p-3.5 shadow-xl space-y-3"
          >
            <div className="flex flex-wrap items-center justify-between gap-2.5">
              <div className="flex items-center gap-2">
                <button
                  id="select-all-orders-btn"
                  type="button"
                  onClick={toggleSelectAllOrders}
                  className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 transition-colors"
                >
                  {allVisibleOrdersSelected ? (
                    <>
                      <CheckSquare className="w-3.5 h-3.5 text-orange-500" />
                      Deselect All
                    </>
                  ) : (
                    <>
                      <Square className="w-3.5 h-3.5 text-zinc-400" />
                      Select All ({filteredOrders.length})
                    </>
                  )}
                </button>

                <span className="bg-orange-500/20 text-orange-400 border border-orange-500/30 text-xs font-bold px-2.5 py-1 rounded-xl">
                  {selectedOrderIds.size} Selected
                </span>
              </div>

              <div className="flex items-center gap-2 ml-auto">
                {/* Mark as Completed Bulk Action */}
                <button
                  id="bulk-mark-completed-btn"
                  type="button"
                  onClick={handleBulkMarkCompleted}
                  disabled={isBulkCompleting || selectedOrders.length === 0}
                  className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-xl bg-green-600 hover:bg-green-500 active:scale-95 text-white transition-all shadow-md shadow-green-600/20 disabled:opacity-40 disabled:cursor-not-allowed"
                  title={
                    ordersWithPendingBalance.length > 0 
                      ? `Settle remaining balances and mark ${selectedOrders.length} order(s) as Completed` 
                      : `Mark ${selectedOrders.length} fully paid order(s) as Completed`
                  }
                >
                  {isBulkCompleting ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <CheckCheck className="w-3.5 h-3.5" />
                  )}
                  <span>
                    Mark Completed ({selectedOrderIds.size})
                  </span>
                </button>

                {/* Print & Share Selected Orders */}
                <button
                  id="print-selected-orders-btn"
                  type="button"
                  onClick={() => handlePrintOrders(selectedOrders)}
                  disabled={isPrinting}
                  className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-xl bg-orange-500 hover:bg-orange-600 active:scale-95 text-white transition-all shadow-md shadow-orange-500/20 disabled:opacity-50"
                  title="Print & Share Selected Orders"
                >
                  {isPrinting && !printingOrderId ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Printer className="w-3.5 h-3.5" />
                  )}
                  <span>Print / Share ({selectedOrderIds.size})</span>
                </button>

                <button
                  id="cancel-order-selection-btn"
                  type="button"
                  onClick={cancelOrderSelection}
                  className="p-1.5 rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
                  title="Clear selection"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Selected Orders Financial Summary */}
            <div className="grid grid-cols-3 gap-2 bg-zinc-950/60 rounded-xl p-2.5 border border-zinc-800/80 text-xs">
              <div>
                <span className="text-zinc-500 block text-[10px] uppercase font-bold">Selected Total</span>
                <span className="text-zinc-200 font-bold">₹{selectedTotalAmount.toLocaleString('en-IN')}</span>
              </div>
              <div>
                <span className="text-zinc-500 block text-[10px] uppercase font-bold">Selected Paid</span>
                <span className="text-green-500 font-bold">₹{selectedPaidAmount.toLocaleString('en-IN')}</span>
              </div>
              <div>
                <span className="text-zinc-500 block text-[10px] uppercase font-bold">Selected Balance</span>
                <span className="text-red-500 font-bold">₹{selectedRemainingAmount.toLocaleString('en-IN')}</span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Orders List with Motion Entrance Animations */}
      <div className="grid gap-4">
        <AnimatePresence mode="popLayout">
          {filteredOrders.map((order: Order) => (
            <motion.div 
              key={order.order_id} 
              layout
              initial={{ opacity: 0, y: 16, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.15 } }}
              transition={{ duration: 0.2 }}
              className={`bg-zinc-900 border rounded-3xl p-6 relative group transition-all ${
                selectedOrderIds.has(order.order_id)
                  ? 'border-orange-500/60 shadow-lg shadow-orange-500/5'
                  : 'border-zinc-800 hover:border-zinc-750'
              }`}
            >
              <div className="absolute top-6 right-6 flex items-center gap-1.5">
                <button
                  id={`print-single-order-btn-${order.order_id}`}
                  type="button"
                  onClick={() => handlePrintOrders([order])}
                  disabled={isPrinting}
                  className="p-2 rounded-xl transition-all text-zinc-400 hover:text-orange-400 hover:bg-orange-500/10 disabled:opacity-50"
                  title="Print / Share Receipt"
                >
                  {printingOrderId === order.order_id ? (
                    <RefreshCw className="w-4 h-4 animate-spin text-orange-500" />
                  ) : (
                    <Printer className="w-4 h-4" />
                  )}
                </button>
                <button
                  id={`edit-order-btn-${order.order_id}`}
                  type="button"
                  onClick={() => openEditOrderForm(order)}
                  className="p-2 rounded-xl transition-all text-zinc-400 hover:text-orange-400 hover:bg-orange-500/10"
                  title="Edit Order"
                >
                  <Pencil className="w-4 h-4" />
                </button>
                <button 
                  id={`delete-order-btn-${order.order_id}`}
                  type="button"
                  onClick={() => setOrderToDelete(order)}
                  className={`p-2 rounded-xl transition-all ${
                    (order.paid_amount || 0) === 0 
                      ? 'text-zinc-400 hover:text-red-500 hover:bg-red-500/10 opacity-100' 
                      : 'text-zinc-600 hover:text-red-500 hover:bg-red-500/10 opacity-0 group-hover:opacity-100'
                  }`}
                  title="Delete Order"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>

              <div className="flex items-start gap-3 mb-4 pr-28">
                <button
                  id={`select-order-checkbox-${order.order_id}`}
                  type="button"
                  onClick={(e) => toggleSelectOrder(order.order_id, e)}
                  className={`w-5 h-5 mt-0.5 rounded-md border flex items-center justify-center shrink-0 transition-all ${
                    selectedOrderIds.has(order.order_id)
                      ? 'bg-orange-500 border-orange-500 text-white shadow-sm shadow-orange-500/30'
                      : 'border-zinc-700 bg-zinc-800/60 hover:border-zinc-500 text-transparent hover:bg-zinc-800'
                  }`}
                  title={selectedOrderIds.has(order.order_id) ? 'Deselect order' : 'Select order for bulk actions / print'}
                >
                  <Check className={`w-3.5 h-3.5 stroke-[3] ${selectedOrderIds.has(order.order_id) ? 'opacity-100' : 'opacity-0'}`} />
                </button>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-lg font-bold truncate text-white">{order.supplier}</h3>
                    <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider shrink-0 ${
                      order.status === 'Completed' ? 'bg-green-500/10 text-green-500' : 
                      order.status === 'Partial' ? 'bg-orange-500/10 text-orange-500' : 'bg-zinc-800 text-zinc-500'
                    }`}>
                      {order.status}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5 text-xs text-zinc-500">
                    <span className="truncate">{getItemSummary(order.items || [])}</span>
                    <span>•</span>
                    <span className="shrink-0">{format(parseISO(order.date), 'dd MMM yyyy')}</span>
                  </div>
                </div>
              </div>

              {/* Items List */}
              <div className="mb-6 space-y-2">
                {(order.items || []).map((item) => (
                  <div key={item.id} className="flex justify-between text-xs border-b border-zinc-800 pb-2 last:border-0">
                    <div className="flex flex-col">
                      <span className="font-medium text-zinc-300">{item.material}</span>
                      <span className="text-zinc-500">{item.quantity}</span>
                    </div>
                    <span className="font-bold">₹{item.amount.toLocaleString('en-IN')}</span>
                  </div>
                ))}
              </div>
              
              <div className="grid grid-cols-3 gap-4 mb-6">
                <div>
                  <p className="text-zinc-500 text-[10px] uppercase font-bold mb-1">Total</p>
                  <p className="font-bold text-sm">₹{order.total_amount.toLocaleString('en-IN')}</p>
                </div>
                <div>
                  <p className="text-zinc-500 text-[10px] uppercase font-bold mb-1">Paid</p>
                  <p className="font-bold text-sm text-green-500">₹{order.paid_amount.toLocaleString('en-IN')}</p>
                </div>
                <div>
                  <p className="text-zinc-500 text-[10px] uppercase font-bold mb-1">Balance</p>
                  <p className="font-bold text-sm text-red-500">₹{order.remaining_amount.toLocaleString('en-IN')}</p>
                </div>
              </div>

              <div className="w-full bg-zinc-800 h-2 rounded-full mb-6 overflow-hidden">
                <div 
                  className="bg-green-500 h-full transition-all duration-500" 
                  style={{ width: `${Math.min(100, (order.paid_amount / order.total_amount) * 100)}%` }}
                />
              </div>

              {order.status !== 'Completed' && (
                <button 
                  id={`make-payment-order-btn-${order.order_id}`}
                  onClick={() => setSelectedOrder(order)}
                  className="w-full bg-zinc-800 hover:bg-zinc-700 py-3 rounded-xl font-bold text-sm transition-all"
                >
                  Make Payment
                </button>
              )}
            </motion.div>
          ))}
        </AnimatePresence>

        {filteredOrders.length === 0 && (
          <div className="text-center py-16 bg-zinc-900/50 border border-zinc-800 border-dashed rounded-[32px] p-6 space-y-2">
            <div className="w-12 h-12 bg-zinc-800 rounded-2xl flex items-center justify-center mx-auto text-zinc-500 mb-2">
              <Search className="w-6 h-6" />
            </div>
            <p className="text-zinc-400 font-bold">
              {orderSearchQuery || statusFilter !== 'All' ? 'No matching orders found' : 'No orders recorded yet'}
            </p>
            <p className="text-zinc-600 text-xs max-w-sm mx-auto">
              {orderSearchQuery 
                ? `No orders match "${orderSearchQuery}"${statusFilter !== 'All' ? ` in ${statusFilter}` : ''}. Try adjusting your search query or filter.`
                : statusFilter !== 'All'
                ? `There are no ${statusFilter.toLowerCase()} orders currently.`
                : 'Tap New Order to record your first supplier order.'
              }
            </p>
            {(orderSearchQuery || statusFilter !== 'All') && (
              <button
                id="clear-order-search-filter-btn"
                type="button"
                onClick={() => {
                  setOrderSearchQuery('');
                  setStatusFilter('All');
                }}
                className="mt-3 inline-block text-xs font-bold text-orange-400 hover:text-orange-300 underline"
              >
                Reset filters
              </button>
            )}
          </div>
        )}
      </div>

      {/* Add Order Modal */}
      <AnimatePresence>
        {(showAdd || editingOrder) && (
          <div 
            className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm"
            onClick={closeOrderForm}
          >
            <motion.div 
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              onClick={(e) => e.stopPropagation()}
              className="bg-zinc-900 w-full max-w-2xl rounded-t-[40px] sm:rounded-[40px] p-8 border-t sm:border border-zinc-800 shadow-2xl overflow-y-auto max-h-[90vh] pb-32 sm:pb-8"
            >
              <h2 className="text-2xl font-bold mb-6">{editingOrder ? 'Edit Order' : 'New Order'}</h2>
              <form onSubmit={handleOrderSubmit} className="space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-zinc-500 uppercase mb-2">Supplier</label>
                    <input name="supplier" type="text" defaultValue={editingOrder?.supplier || ''} placeholder="Supplier Name" className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-sm" required />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-zinc-500 uppercase mb-2">Order Date</label>
                    <input name="date" type="date" defaultValue={editingOrder ? format(parseISO(editingOrder.date), 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd')} className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-sm" required />
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-zinc-500 uppercase">Items / Materials</label>
                    <button 
                      type="button" 
                      onClick={handleAddItemRow}
                      className="text-orange-500 text-xs font-bold flex items-center gap-1 hover:underline"
                    >
                      <Plus className="w-3 h-3" /> Add Item
                    </button>
                  </div>
                  
                  <div className="space-y-3">
                    {newItems.map((item, index) => (
                      <div key={item.id} className="relative bg-zinc-800/30 p-4 rounded-2xl border border-zinc-800/50 group">
                        <div className="grid grid-cols-12 gap-3 items-end">
                          <div className="col-span-12 sm:col-span-5">
                            <label className="block text-[10px] font-bold text-zinc-600 uppercase mb-1">Material</label>
                            <input 
                              type="text" 
                              value={item.material}
                              onChange={(e) => handleItemChange(item.id, 'material', e.target.value)}
                              placeholder="e.g. Cement" 
                              className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2.5 text-xs focus:ring-1 focus:ring-orange-500 outline-none transition-all" 
                              required 
                            />
                          </div>
                          <div className="col-span-6 sm:col-span-3">
                            <label className="block text-[10px] font-bold text-zinc-600 uppercase mb-1">Qty</label>
                            <input 
                              type="text" 
                              value={item.quantity}
                              onChange={(e) => handleItemChange(item.id, 'quantity', e.target.value)}
                              placeholder="100 Bags" 
                              className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2.5 text-xs focus:ring-1 focus:ring-orange-500 outline-none transition-all" 
                              required 
                            />
                          </div>
                          <div className="col-span-6 sm:col-span-3">
                            <label className="block text-[10px] font-bold text-zinc-600 uppercase mb-1">Amount</label>
                            <input 
                              type="number" 
                              value={item.amount || ''}
                              onChange={(e) => handleItemChange(item.id, 'amount', Number(e.target.value))}
                              placeholder="0" 
                              className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2.5 text-xs no-spinner focus:ring-1 focus:ring-orange-500 outline-none transition-all" 
                              required 
                            />
                          </div>
                          <div className="col-span-12 sm:col-span-1 flex justify-end">
                            <button 
                              type="button" 
                              onClick={() => handleRemoveItemRow(item.id)}
                              className="p-2 text-zinc-600 hover:text-red-500 transition-colors bg-zinc-900 sm:bg-transparent rounded-lg"
                              disabled={newItems.length === 1}
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="bg-zinc-800/50 p-6 rounded-2xl border border-zinc-800">
                  <div className="flex justify-between items-center">
                    <div>
                      <p className="text-xs font-bold text-zinc-500 uppercase mb-1">Total Order Value</p>
                      <p className="text-2xl font-bold text-orange-500">
                        ₹{newItems.reduce((sum, item) => sum + Number(item.amount), 0).toLocaleString()}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] font-bold text-zinc-600 uppercase mb-1">Items Count</p>
                      <p className="text-lg font-bold text-zinc-400">{newItems.length}</p>
                    </div>
                  </div>
                </div>

                <div className="flex gap-4 pt-4">
                  <button type="button" onClick={closeOrderForm} className="flex-1 bg-zinc-800 py-4 rounded-2xl font-bold text-sm hover:bg-zinc-700 transition-colors">Cancel</button>
                  <button type="submit" className="flex-1 bg-orange-500 py-4 rounded-2xl font-bold text-sm hover:bg-orange-600 transition-colors shadow-lg shadow-orange-500/20">{editingOrder ? 'Update Order' : 'Create Order'}</button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Payment Modal */}
      <AnimatePresence>
        {selectedOrder && (
          <div 
            className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm"
            onClick={() => setSelectedOrder(null)}
          >
            <motion.div 
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              onClick={(e) => e.stopPropagation()}
              className="bg-zinc-900 w-full max-w-lg rounded-t-[40px] sm:rounded-[40px] p-8 border-t sm:border border-zinc-800 shadow-2xl overflow-y-auto max-h-[85vh] pb-32 sm:pb-8"
            >
              <h2 className="text-2xl font-bold mb-2">Make Payment</h2>
              <p className="text-zinc-500 text-sm mb-6">Paying for {getItemSummary(selectedOrder.items)} to {selectedOrder.supplier}</p>
              <form onSubmit={handlePayment} className="space-y-4">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-xs font-bold text-zinc-500 uppercase">Amount (Max: ₹{selectedOrder.remaining_amount.toLocaleString('en-IN')})</label>
                    <button
                      type="button"
                      onClick={(e) => {
                        const input = (e.currentTarget.closest('form')?.querySelector('input[name="amount"]') as HTMLInputElement);
                        if (input) input.value = String(selectedOrder.remaining_amount);
                      }}
                      className="text-[11px] font-bold text-orange-400 hover:text-orange-300 transition-colors"
                    >
                      Fill Full Balance (₹{selectedOrder.remaining_amount.toLocaleString('en-IN')})
                    </button>
                  </div>
                  <input 
                    name="amount" 
                    type="number" 
                    inputMode="decimal"
                    defaultValue={selectedOrder.remaining_amount}
                    max={selectedOrder.remaining_amount} 
                    placeholder="0.00" 
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-xl font-bold text-white no-spinner focus:outline-none focus:ring-2 focus:ring-orange-500" 
                    required 
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-zinc-500 uppercase mb-2">Payment Mode</label>
                    <select name="payment_type" className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-orange-500">
                      {PAYMENT_TYPES.map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-zinc-500 uppercase mb-2">Date</label>
                    <input name="date" type="date" defaultValue={format(new Date(), 'yyyy-MM-dd')} className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-orange-500" required />
                  </div>
                </div>
                <div className="flex gap-4 pt-4">
                  <button type="button" onClick={() => setSelectedOrder(null)} className="flex-1 bg-zinc-800 hover:bg-zinc-700 py-4 rounded-2xl font-bold text-sm text-zinc-300 transition-colors">Cancel</button>
                  <button type="submit" className="flex-1 bg-green-600 hover:bg-green-500 py-4 rounded-2xl font-bold text-sm text-white shadow-lg shadow-green-600/20 transition-all">Confirm Payment</button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Settle & Mark Completed Modal for Selected Orders */}
      <AnimatePresence>
        {showSettleModal && (
          <div 
            className="fixed inset-0 z-[105] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/75 backdrop-blur-md"
            onClick={() => setShowSettleModal(false)}
          >
            <motion.div 
              initial={{ y: '100%', opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: '100%', opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-zinc-900 w-full max-w-2xl rounded-t-[36px] sm:rounded-[36px] p-6 sm:p-8 border-t sm:border border-zinc-800 shadow-2xl overflow-hidden max-h-[90vh] flex flex-col pb-28 sm:pb-8"
            >
              {/* Modal Header */}
              <div className="flex items-start justify-between gap-4 mb-4 shrink-0">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-2xl bg-green-500/15 border border-green-500/30 flex items-center justify-center text-green-400">
                    <CheckCheck className="w-6 h-6" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-white">Settle & Mark Orders Completed</h2>
                    <p className="text-xs text-zinc-400 mt-0.5">
                      Review pending balances and confirm payments to mark all {selectedOrders.length} selected order(s) as Completed.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowSettleModal(false)}
                  className="p-2 rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors shrink-0"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Order Rows with Details */}
              <div className="overflow-y-auto flex-1 pr-1 space-y-2.5 my-2">
                <div className="text-[11px] font-bold uppercase tracking-wider text-zinc-500 px-1 flex items-center justify-between">
                  <span>Selected Orders ({selectedOrders.length})</span>
                  <span>Pending Balances</span>
                </div>

                {selectedOrders.map((order: Order, index: number) => {
                  const hasBalance = Number(order.remaining_amount) > 0;
                  return (
                    <div 
                      key={order.order_id} 
                      className="bg-zinc-800/40 border border-zinc-800 rounded-2xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:border-zinc-750 transition-colors"
                    >
                      <div className="flex items-start gap-3 min-w-0">
                        <span className="w-6 h-6 rounded-full bg-zinc-800 text-zinc-400 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                          {index + 1}
                        </span>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-white text-sm truncate">{order.supplier}</span>
                            <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider shrink-0 ${
                              order.status === 'Completed' ? 'bg-green-500/10 text-green-400' :
                              order.status === 'Partial' ? 'bg-orange-500/10 text-orange-400' : 'bg-zinc-800 text-zinc-400'
                            }`}>
                              {order.status}
                            </span>
                          </div>
                          <p className="text-xs text-zinc-400 truncate mt-0.5">
                            {getItemSummary(order.items || [])} • {format(parseISO(order.date), 'dd MMM yyyy')}
                          </p>
                          <div className="flex items-center gap-3 text-[11px] text-zinc-500 mt-1">
                            <span>Total: <strong className="text-zinc-300 font-semibold">₹{Number(order.total_amount).toLocaleString('en-IN')}</strong></span>
                            <span>•</span>
                            <span>Paid: <strong className="text-green-400 font-semibold">₹{Number(order.paid_amount).toLocaleString('en-IN')}</strong></span>
                          </div>
                        </div>
                      </div>

                      <div className="text-right sm:text-right shrink-0 border-t sm:border-t-0 pt-2 sm:pt-0 border-zinc-800/60 flex sm:flex-col justify-between sm:justify-center items-center sm:items-end">
                        <span className="text-[10px] text-zinc-500 uppercase font-bold sm:mb-0.5">Balance To Pay</span>
                        <span className={`text-base font-bold ${hasBalance ? 'text-red-400' : 'text-green-400'}`}>
                          ₹{Number(order.remaining_amount).toLocaleString('en-IN')}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Total Balance Summary Box */}
              <div className="bg-zinc-800/70 border border-zinc-700/60 rounded-2xl p-4 my-2 shrink-0">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-xs font-bold uppercase tracking-wider text-zinc-400 block">Total Balance To Settle</span>
                    <span className="text-xs text-zinc-500">
                      {ordersWithPendingBalance.length} order(s) require payment entries
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="text-2xl font-bold text-orange-400">
                      ₹{ordersWithPendingBalance.reduce((sum, o) => sum + Number(o.remaining_amount), 0).toLocaleString('en-IN')}
                    </span>
                  </div>
                </div>
              </div>

              {/* Payment Details Form */}
              <form onSubmit={handleConfirmSettlePayments} className="space-y-4 shrink-0 pt-2">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-zinc-400 uppercase mb-1.5">Payment Mode for Entries</label>
                    <select 
                      value={settlePaymentType}
                      onChange={(e) => setSettlePaymentType(e.target.value)}
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-orange-500"
                    >
                      {PAYMENT_TYPES.map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-zinc-400 uppercase mb-1.5">Payment Date</label>
                    <input 
                      type="date" 
                      value={settleDate}
                      onChange={(e) => setSettleDate(e.target.value)}
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-orange-500"
                      required 
                    />
                  </div>
                </div>

                <div className="flex gap-3 pt-2">
                  <button 
                    type="button" 
                    onClick={() => setShowSettleModal(false)}
                    disabled={isSettling}
                    className="flex-1 bg-zinc-800 hover:bg-zinc-700 py-3.5 rounded-2xl font-bold text-sm text-zinc-300 transition-colors disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit" 
                    disabled={isSettling}
                    className="flex-[1.5] bg-green-600 hover:bg-green-500 active:scale-95 py-3.5 rounded-2xl font-bold text-sm text-white shadow-lg shadow-green-600/20 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {isSettling ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>Recording Payments...</span>
                      </>
                    ) : (
                      <>
                        <CheckCheck className="w-4 h-4" />
                        <span>Confirm & Complete All ({selectedOrders.length})</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {orderToDelete && (
          <div 
            className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md"
            onClick={() => setOrderToDelete(null)}
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-zinc-900 border border-zinc-800 p-8 rounded-[40px] max-w-sm w-full text-center"
            >
              <div className="w-16 h-16 bg-red-500/10 text-red-500 rounded-full flex items-center justify-center mx-auto mb-6">
                <Trash2 className="w-8 h-8" />
              </div>
              <h3 className="text-xl font-bold mb-2">Delete Order?</h3>
              <p className="text-zinc-500 text-sm mb-8">
                {orderToDelete.paid_amount > 0 
                  ? "This will permanently remove the order and all its payment history. This action cannot be undone."
                  : "Are you sure you want to remove this order? This action cannot be undone."}
              </p>
              <div className="flex gap-3">
                <button onClick={() => setOrderToDelete(null)} className="flex-1 bg-zinc-800 py-4 rounded-2xl font-bold text-sm">Cancel</button>
                <button onClick={() => handleDeleteOrder(orderToDelete)} className="flex-1 bg-red-500 py-4 rounded-2xl font-bold text-sm">Delete</button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function PassbookModule({ transactions, filterDate, setFilterDate, customDateRange, setCustomDateRange, showToast }: any) {
  const [typeFilter, setTypeFilter] = useState<'All' | 'Credit' | 'Debit'>('All');
  const [passbookSearch, setPassbookSearch] = useState('');
  const [isPrinting, setIsPrinting] = useState(false);

  // 1. Calculate running balance from the beginning chronologically
  const allWithBalance = useMemo(() => {
    // Sort by date ascending to calculate accurate running balance from beginning
    const sorted = [...transactions].sort((a, b) => a.date.localeCompare(b.date));
    let balance = 0;
    return sorted.map(tx => {
      if (tx.type === 'Credit') balance += Number(tx.amount || 0);
      else balance -= Number(tx.amount || 0);
      return { ...tx, runningBalance: balance };
    });
  }, [transactions]);

  // 2. Filter passbook items based on selected Date Range
  const dateFilteredData = useMemo(() => {
    if (filterDate === 'All') return allWithBalance;

    const now = new Date();
    return allWithBalance.filter(tx => {
      try {
        const txDate = parseISO(tx.date);
        if (filterDate === 'Today') {
          return isWithinInterval(txDate, { start: startOfDay(now), end: endOfDay(now) });
        }
        if (filterDate === 'This Week') {
          return isWithinInterval(txDate, { start: startOfWeek(now), end: endOfWeek(now) });
        }
        if (filterDate === 'This Month') {
          return isWithinInterval(txDate, { start: startOfMonth(now), end: endOfMonth(now) });
        }
        if (filterDate === 'Custom' && customDateRange?.start && customDateRange?.end) {
          return isWithinInterval(txDate, {
            start: startOfDay(parseISO(customDateRange.start)),
            end: endOfDay(parseISO(customDateRange.end))
          });
        }
        return true;
      } catch {
        return true;
      }
    });
  }, [allWithBalance, filterDate, customDateRange]);

  // 3. Filter passbook items based on type filter and search query
  const passbookData = useMemo(() => {
    let filtered = dateFilteredData;

    if (typeFilter !== 'All') {
      filtered = filtered.filter(tx => tx.type === typeFilter);
    }

    if (passbookSearch.trim()) {
      const q = passbookSearch.toLowerCase().trim();
      filtered = filtered.filter(tx => 
        (tx.category || '').toLowerCase().includes(q) ||
        (tx.description || '').toLowerCase().includes(q) ||
        (tx.reference || '').toLowerCase().includes(q) ||
        (tx.payment_type || '').toLowerCase().includes(q) ||
        String(tx.amount || '').includes(q)
      );
    }

    return [...filtered].reverse(); // Show newest first
  }, [dateFilteredData, typeFilter, passbookSearch]);

  // Derive Period Label
  const periodLabel = useMemo(() => {
    if (filterDate === 'Custom') {
      if (customDateRange?.start && customDateRange?.end) {
        return `${format(parseISO(customDateRange.start), 'dd MMM yyyy')} to ${format(parseISO(customDateRange.end), 'dd MMM yyyy')}`;
      }
      return 'Custom Range';
    }
    if (filterDate === 'All') return 'All Time';
    return filterDate;
  }, [filterDate, customDateRange]);

  // Calculate summary metrics for current filtered passbook view
  const totalCredit = useMemo(() => {
    return passbookData.filter(t => t.type === 'Credit').reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
  }, [passbookData]);

  const totalDebit = useMemo(() => {
    return passbookData.filter(t => t.type === 'Debit').reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
  }, [passbookData]);

  const latestRunningBalance = useMemo(() => {
    return passbookData.length > 0 ? passbookData[0].runningBalance : 0;
  }, [passbookData]);

  const handlePrintPassbook = async () => {
    if (isPrinting || passbookData.length === 0) return;
    setIsPrinting(true);
    try {
      await generateAndSharePassbookPDF(passbookData, periodLabel, typeFilter, showToast);
    } catch (err) {
      console.error('Print passbook error:', err);
      if (showToast) showToast('Failed to print passbook statement', 'error');
    } finally {
      setIsPrinting(false);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      className="space-y-4 sm:space-y-5"
    >
      {/* Top Search & Inline Print Action Header */}
      <div className="flex items-center gap-2 sm:gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 sm:left-4 top-1/2 -translate-y-1/2 text-zinc-500 w-4 h-4 sm:w-5 sm:h-5 pointer-events-none" />
          <input 
            id="passbook-search-input"
            type="text" 
            value={passbookSearch}
            onChange={(e) => setPassbookSearch(e.target.value)}
            placeholder="Search passbook..." 
            className="w-full bg-zinc-900 border border-zinc-800 rounded-2xl pl-10 sm:pl-12 pr-9 sm:pr-10 py-3 sm:py-3.5 text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-orange-500 text-xs sm:text-sm"
          />
          {passbookSearch && (
            <button
              id="clear-passbook-search-btn"
              type="button"
              onClick={() => setPassbookSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-lg text-zinc-400 hover:text-white bg-zinc-800 hover:bg-zinc-700 transition-colors"
              title="Clear search"
            >
              <X className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </button>
          )}
        </div>

        {/* Compact Print Button on Mobile, Expanded on Desktop */}
        <button
          id="print-passbook-statement-btn"
          type="button"
          onClick={handlePrintPassbook}
          disabled={isPrinting || passbookData.length === 0}
          title={`Print Passbook (${periodLabel})`}
          className="h-11 sm:h-12 px-3.5 sm:px-5 bg-orange-500 hover:bg-orange-600 disabled:bg-zinc-900 border border-orange-500/30 disabled:border-zinc-800 text-white disabled:text-zinc-600 rounded-2xl transition-all shadow-md shadow-orange-500/20 disabled:shadow-none flex items-center justify-center gap-2 text-xs sm:text-sm font-bold shrink-0 disabled:cursor-not-allowed active:scale-95"
        >
          {isPrinting ? (
            <RefreshCw className="w-4 h-4 sm:w-5 sm:h-5 animate-spin text-white" />
          ) : (
            <Printer className="w-4 h-4 sm:w-5 sm:h-5" />
          )}
          <span className="hidden sm:inline">Print Passbook</span>
        </button>
      </div>

      {/* Date Period Filter Pills */}
      <div className="space-y-2.5">
        <div className="flex items-center gap-1.5 sm:gap-2 overflow-x-auto no-scrollbar pb-1 -mx-1 px-1">
          {['All', 'Today', 'This Week', 'This Month', 'Custom'].map((f) => (
            <button 
              key={f}
              id={`passbook-filter-date-${f.toLowerCase().replace(/\s+/g, '-')}`}
              onClick={() => setFilterDate(f as any)}
              className={`px-3 sm:px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
                filterDate === f ? 'bg-orange-500 text-white shadow-md shadow-orange-500/20' : 'bg-zinc-900 text-zinc-400 hover:text-zinc-200 border border-zinc-800'
              }`}
            >
              {f === 'All' ? 'All Time' : f}
            </button>
          ))}
        </div>

        {/* Credit / Debit Type Tabs */}
        <div className="flex gap-2">
          {['All', 'Credit', 'Debit'].map((t) => (
            <button 
              key={t}
              id={`passbook-filter-type-${t.toLowerCase()}`}
              onClick={() => setTypeFilter(t as any)}
              className={`flex-1 py-2 sm:py-2.5 rounded-xl text-[11px] sm:text-xs font-bold uppercase tracking-wider transition-all ${
                typeFilter === t 
                  ? t === 'Credit' 
                    ? 'bg-green-500 text-white shadow-md shadow-green-500/20' 
                    : t === 'Debit' 
                    ? 'bg-red-500 text-white shadow-md shadow-red-500/20' 
                    : 'bg-zinc-700 text-white'
                  : 'bg-zinc-900 text-zinc-400 hover:text-zinc-200 border border-zinc-800'
              }`}
            >
              {t === 'Credit' ? 'Income (Credit)' : t === 'Debit' ? 'Expense (Debit)' : 'All Types'}
            </button>
          ))}
        </div>
      </div>

      {filterDate === 'Custom' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-zinc-900 p-4 rounded-2xl border border-zinc-800">
          <div>
            <label className="block text-[10px] font-bold text-zinc-500 uppercase mb-1">From Date</label>
            <input 
              type="date" 
              value={customDateRange.start} 
              onChange={(e) => setCustomDateRange({ ...customDateRange, start: e.target.value })}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:ring-1 focus:ring-orange-500"
            />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-zinc-500 uppercase mb-1">To Date</label>
            <input 
              type="date" 
              value={customDateRange.end} 
              onChange={(e) => setCustomDateRange({ ...customDateRange, end: e.target.value })}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:ring-1 focus:ring-orange-500"
            />
          </div>
        </div>
      )}

      {/* Financial Summary 3-Column Indicator (Mobile-Optimized) */}
      <div className="grid grid-cols-3 gap-2 sm:gap-3 bg-zinc-900 border border-zinc-800 rounded-2xl p-3 sm:p-4 shadow-sm">
        <div className="flex flex-col min-w-0">
          <span className="text-zinc-500 text-[9px] sm:text-[11px] font-bold uppercase tracking-wider truncate">Income</span>
          <span className="text-xs sm:text-base md:text-lg font-bold text-green-400 mt-0.5 truncate">
            +₹{totalCredit.toLocaleString('en-IN')}
          </span>
        </div>

        <div className="flex flex-col min-w-0 border-l border-zinc-800 pl-2 sm:pl-3">
          <span className="text-zinc-500 text-[9px] sm:text-[11px] font-bold uppercase tracking-wider truncate">Expense</span>
          <span className="text-xs sm:text-base md:text-lg font-bold text-red-400 mt-0.5 truncate">
            -₹{totalDebit.toLocaleString('en-IN')}
          </span>
        </div>

        <div className="flex flex-col min-w-0 border-l border-zinc-800 pl-2 sm:pl-3">
          <span className="text-zinc-500 text-[9px] sm:text-[11px] font-bold uppercase tracking-wider truncate">Net Balance</span>
          <span className={`text-xs sm:text-base md:text-lg font-bold mt-0.5 truncate ${latestRunningBalance >= 0 ? 'text-zinc-100' : 'text-red-400'}`}>
            ₹{latestRunningBalance.toLocaleString('en-IN')}
          </span>
        </div>
      </div>

      {/* Passbook Table / Card List */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-[32px] overflow-hidden shadow-sm">
        <div className="grid grid-cols-12 bg-zinc-800/60 p-4 text-[10px] font-bold uppercase tracking-widest text-zinc-400 border-b border-zinc-800">
          <span className="col-span-3 sm:col-span-2">Date</span>
          <span className="col-span-5 sm:col-span-4">Particulars</span>
          <span className="hidden sm:block sm:col-span-2 text-center">Mode</span>
          <span className="col-span-4 sm:col-span-2 text-right">Amount</span>
          <span className="hidden sm:block sm:col-span-2 text-right">Balance</span>
        </div>

        <div className="divide-y divide-zinc-800/70">
          {passbookData.map((item) => {
            const isCredit = item.type === 'Credit';
            return (
              <div key={item.id} className="grid grid-cols-12 p-4 items-center hover:bg-zinc-850/40 transition-colors">
                {/* Date */}
                <div className="col-span-3 sm:col-span-2 flex flex-col">
                  <span className="text-xs font-bold text-zinc-300">{format(parseISO(item.date), 'dd MMM')}</span>
                  <span className="text-[10px] text-zinc-500">{format(parseISO(item.date), 'yyyy, hh:mm a')}</span>
                </div>

                {/* Particulars */}
                <div className="col-span-5 sm:col-span-4 flex flex-col min-w-0 pr-2">
                  <span className="text-xs font-bold text-white truncate">{item.category}</span>
                  <span className="text-[11px] text-zinc-400 truncate">{item.description}</span>
                  {item.reference && (
                    <span className="text-[10px] text-zinc-500 truncate">Ref: {item.reference}</span>
                  )}
                  {/* Mobile payment mode display */}
                  <span className="text-[10px] text-orange-400 sm:hidden mt-0.5">{item.payment_type}</span>
                </div>

                {/* Mode (Desktop) */}
                <div className="hidden sm:flex sm:col-span-2 items-center justify-center">
                  <span className="px-2.5 py-1 rounded-lg bg-zinc-800 text-zinc-300 text-[11px] font-semibold border border-zinc-700/60">
                    {item.payment_type || 'Cash'}
                  </span>
                </div>

                {/* Amount */}
                <div className="col-span-4 sm:col-span-2 text-right flex flex-col items-end">
                  <span className={`text-xs sm:text-sm font-bold ${isCredit ? 'text-green-400' : 'text-red-400'}`}>
                    {isCredit ? '+' : '-'}₹{(Number(item.amount) || 0).toLocaleString('en-IN')}
                  </span>
                  {/* Mobile Running Balance */}
                  <span className="text-[10px] text-zinc-500 sm:hidden">
                    Bal: ₹{(Number(item.runningBalance) || 0).toLocaleString('en-IN')}
                  </span>
                </div>

                {/* Running Balance (Desktop) */}
                <div className="hidden sm:block sm:col-span-2 text-right">
                  <span className="text-xs sm:text-sm font-bold text-zinc-200">
                    ₹{(Number(item.runningBalance) || 0).toLocaleString('en-IN')}
                  </span>
                </div>
              </div>
            );
          })}

          {passbookData.length === 0 && (
            <div className="p-12 text-center space-y-3">
              <div className="w-12 h-12 bg-zinc-800 rounded-2xl flex items-center justify-center mx-auto text-zinc-500">
                <Search className="w-6 h-6" />
              </div>
              <p className="text-zinc-400 font-bold text-sm">
                {passbookSearch || typeFilter !== 'All' ? 'No matching passbook entries' : 'No records found for this period'}
              </p>
              <p className="text-zinc-600 text-xs max-w-xs mx-auto">
                {passbookSearch ? `No records matched "${passbookSearch}".` : 'Try changing the date filter or entry type.'}
              </p>
              {(passbookSearch || typeFilter !== 'All' || filterDate !== 'All') && (
                <button
                  id="reset-passbook-filters-btn"
                  type="button"
                  onClick={() => {
                    setPassbookSearch('');
                    setTypeFilter('All');
                    setFilterDate('All');
                  }}
                  className="text-xs font-bold text-orange-400 hover:text-orange-300 underline"
                >
                  Reset all filters
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}

function ReportsModule({ transactions, orders, showToast }: any) {
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [isExportingExcel, setIsExportingExcel] = useState(false);

  const creditTxs = transactions.filter((t: any) => t.type === 'Credit');
  const debitTxs = transactions.filter((t: any) => t.type === 'Debit');

  const creditCategoryData = useMemo(() => {
    const counts: any = {};
    transactions.filter((t: any) => t.type === 'Credit').forEach((t: any) => {
      counts[t.category] = (counts[t.category] || 0) + t.amount;
    });
    return Object.entries(counts).map(([name, value]) => ({ name, value }));
  }, [transactions]);

  const debitCategoryData = useMemo(() => {
    const counts: any = {};
    transactions.filter((t: any) => t.type === 'Debit').forEach((t: any) => {
      counts[t.category] = (counts[t.category] || 0) + t.amount;
    });
    return Object.entries(counts).map(([name, value]) => ({ name, value }));
  }, [transactions]);

  const paymentData = useMemo(() => {
    const counts: any = {};
    transactions.forEach((t: any) => {
      counts[t.payment_type] = (counts[t.payment_type] || 0) + t.amount;
    });
    return Object.entries(counts).map(([name, value]) => ({ name, value }));
  }, [transactions]);

  const exportPDF = async () => {
    if (isExportingPdf) return;
    setIsExportingPdf(true);

    try {
      const doc = new jsPDF();
      (doc as any).autoTable = (options: any) => autoTable(doc, options);

      const { fontName: activeFont, cur } = await loadAppFont(doc);

      const formatReportDate = (value: string) => {
        try {
          return format(parseISO(value), 'dd MMM yyyy, hh:mm a');
        } catch {
          return value || '-';
        }
      };

      const creditTotal = creditTxs.reduce((sum: number, tx: any) => sum + (Number(tx.amount) || 0), 0);
      const debitTotal = debitTxs.reduce((sum: number, tx: any) => sum + (Number(tx.amount) || 0), 0);

      // Branded report header
      doc.setFillColor(24, 24, 27);
      doc.roundedRect(10, 10, 190, 24, 4, 4, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFont(activeFont);
      doc.setFontSize(16);
      doc.text('KhataBook Pro', 16, 20);
      doc.setFontSize(9);
      doc.setTextColor(212, 212, 216);
      doc.text('Financial Transaction & Ledger Report', 16, 28);
      doc.text(`Generated: ${format(new Date(), 'dd MMM yyyy, hh:mm a')}`, 125, 28);

      // Quick summary boxes
      doc.setFillColor(240, 253, 244);
      doc.roundedRect(10, 38, 88, 16, 3, 3, 'F');
      doc.setFillColor(254, 242, 242);
      doc.roundedRect(102, 38, 88, 16, 3, 3, 'F');
      
      doc.setFont(activeFont);
      doc.setFontSize(8);
      doc.setTextColor(22, 101, 52);
      doc.text(`Total Credit:  ${cur}${creditTotal.toLocaleString('en-IN')}`, 16, 48);
      doc.setTextColor(185, 28, 28);
      doc.text(`Total Debit:  ${cur}${debitTotal.toLocaleString('en-IN')}`, 108, 48);

      const tableData = (transactions || []).map((t: any) => [
        formatReportDate(t.date),
        t.type || '-',
        t.category || '-',
        `${cur}${(Number(t.amount) || 0).toLocaleString('en-IN')}`,
        t.payment_type || '-',
        t.description || '-'
      ]);

      autoTable(doc, {
        head: [['Date', 'Type', 'Category', 'Amount', 'Payment', 'Description']],
        body: tableData.length > 0 ? tableData : [['No records', '-', '-', '-', '-', '-']],
        startY: 58,
        theme: 'grid',
        styles: {
          font: activeFont,
          fontSize: 7,
          textColor: [39, 39, 42],
          lineColor: [212, 212, 216],
          lineWidth: 0.15,
          cellPadding: 1.2,
        },
        headStyles: {
          font: activeFont,
          fillColor: [234, 88, 12],
          textColor: [255, 255, 255],
          lineColor: [194, 65, 12],
          lineWidth: 0.15,
          fontStyle: 'normal',
        },
        alternateRowStyles: { fillColor: [250, 250, 250] },
        columnStyles: {
          0: { cellWidth: 31 },
          1: { cellWidth: 18 },
          2: { cellWidth: 30 },
          3: { cellWidth: 23, halign: 'right' },
          4: { cellWidth: 27 },
          5: { cellWidth: 'auto' },
        },
        didDrawPage: (data) => {
          doc.setFont(activeFont);
          doc.setFontSize(8);
          doc.setTextColor(113, 113, 122);
          doc.text(`Page ${data.pageNumber}`, 190, 288, { align: 'right' });
        },
      });

      const filename = `KhataBook_Report_${format(new Date(), 'yyyyMMdd_HHmm')}.pdf`;
      const pdfArrayBuffer = doc.output('arraybuffer');
      const pdfBase64 = arrayBufferToBase64(pdfArrayBuffer);

      const isHandledNatively = await saveOrShareReport(
        pdfBase64,
        filename,
        'application/pdf',
        pdfArrayBuffer
      );

      if (!isHandledNatively) {
        const pdfBlob = new Blob([pdfArrayBuffer], { type: 'application/pdf' });
        downloadBlobFallback(pdfBlob, filename);
      }

      if (showToast) {
        showToast('PDF report generated successfully!', 'success');
      }
    } catch (error: any) {
      console.error('PDF export failed:', error);
      if (showToast) {
        showToast('Unable to export PDF. Please check data and try again.', 'error');
      }
    } finally {
      setIsExportingPdf(false);
    }
  };

  const exportExcel = async () => {
    if (isExportingExcel) return;
    setIsExportingExcel(true);

    try {
      const formattedRows = (transactions || []).map((t: any, index: number) => {
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

      const ws = XLSX.utils.json_to_sheet(
        formattedRows.length > 0 
          ? formattedRows 
          : [{ 'Message': 'No transactions recorded' }]
      );

      // Auto-size worksheet columns for neat layout
      const colWidths = [
        { wch: 6 },  // S.No
        { wch: 18 }, // Date
        { wch: 10 }, // Type
        { wch: 20 }, // Category
        { wch: 14 }, // Amount
        { wch: 16 }, // Payment Mode
        { wch: 30 }, // Description
        { wch: 16 }, // Reference
        { wch: 16 }, // Order ID
      ];
      ws['!cols'] = colWidths;

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Transactions");

      const filename = `KhataBook_Report_${format(new Date(), 'yyyyMMdd_HHmm')}.xlsx`;
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

      if (showToast) {
        showToast('Excel report generated successfully!', 'success');
      }
    } catch (error: any) {
      console.error('Excel export failed:', error);
      if (showToast) {
        showToast('Unable to export Excel file. Please try again.', 'error');
      }
    } finally {
      setIsExportingExcel(false);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      className="space-y-8"
    >
      <div className="flex gap-4">
        <button 
          onClick={exportPDF} 
          disabled={isExportingPdf}
          className="flex-1 bg-zinc-900 hover:bg-zinc-800 active:scale-98 border border-zinc-800 p-4 rounded-2xl flex items-center justify-center gap-2 font-bold text-sm transition-all disabled:opacity-50"
        >
          {isExportingPdf ? (
            <RefreshCw className="w-4 h-4 text-red-500 animate-spin" />
          ) : (
            <Download className="w-4 h-4 text-red-500" />
          )}
          {isExportingPdf ? 'Exporting PDF...' : 'Export PDF'}
        </button>
        <button 
          onClick={exportExcel} 
          disabled={isExportingExcel}
          className="flex-1 bg-zinc-900 hover:bg-zinc-800 active:scale-98 border border-zinc-800 p-4 rounded-2xl flex items-center justify-center gap-2 font-bold text-sm transition-all disabled:opacity-50"
        >
          {isExportingExcel ? (
            <RefreshCw className="w-4 h-4 text-green-500 animate-spin" />
          ) : (
            <Download className="w-4 h-4 text-green-500" />
          )}
          {isExportingExcel ? 'Exporting Excel...' : 'Export Excel'}
        </button>
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-[32px] p-6">
        <h3 className="font-bold mb-6 flex items-center gap-2"><ArrowUpRight className="text-green-500" /> Credit Breakdown</h3>
        <div className="h-56 sm:h-64">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={creditCategoryData}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={80}
                paddingAngle={5}
                dataKey="value"
              >
                {creditCategoryData.map((_entry: any, index: number) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-3 max-h-32 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2">
          {creditCategoryData.map((entry: any, index: number) => (
            <div key={`credit-legend-${entry.name}-${index}`} className="flex items-center gap-2 min-w-0 text-xs text-zinc-400">
              <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
              <span className="truncate" title={entry.name}>{entry.name}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-[32px] p-6">
        <h3 className="font-bold mb-6 flex items-center gap-2"><ArrowDownLeft className="text-red-500" /> Debit Breakdown</h3>
        <div className="h-80 sm:h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={debitCategoryData} margin={{ top: 8, right: 8, left: 0, bottom: 55 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
              <XAxis
                dataKey="name"
                stroke="#71717a"
                fontSize={10}
                angle={-45}
                textAnchor="end"
                interval={0}
                height={70}
                tickFormatter={(value: string) => value.length > 14 ? `${value.slice(0, 14)}…` : value}
              />
              <YAxis stroke="#71717a" fontSize={10} />
              <Tooltip contentStyle={{ backgroundColor: '#18181b', border: 'none', borderRadius: '12px' }} />
              <Bar dataKey="value" fill="#f97316" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </motion.div>
  );
}

function AdminModule({ apiLink, setApiLink, transactions, orders, showToast, isAdmin, setIsAdmin, resetSyncState, onGoogleSheetReset, isSyncing, onSync }: any) {
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [showGoogleResetConfirm, setShowGoogleResetConfirm] = useState(false);
  const [isResettingGoogleSheet, setIsResettingGoogleSheet] = useState(false);
  const [syncButtonLabel, setSyncButtonLabel] = useState('Sync Data');

  const handleSaveApi = () => {
    localStorage.setItem('BT_API_LINK', apiLink);
    showToast('Settings Saved!', 'success');
  };

  const handleSync = async () => {
    if (isSyncing) return;
    setSyncButtonLabel('Syncing...');
    const succeeded = await onSync();
    setSyncButtonLabel(succeeded ? 'Sync Complete' : 'Sync Data');
    if (succeeded) {
      window.setTimeout(() => setSyncButtonLabel('Sync Data'), 2500);
    }
  };

  const clearData = async () => {
    await db.transactions.clear();
    await db.orders.clear();
    await db.orderPayments.clear();
    await db.deletedRecords.clear();
    resetSyncState();
    window.location.reload();
  };

  const resetGoogleSheetData = async () => {
    if (!apiLink) {
      showToast('Please set Google Sheet API link in Admin settings', 'error');
      setShowGoogleResetConfirm(false);
      return;
    }

    setIsResettingGoogleSheet(true);

    try {
      await fetch(apiLink, {
        method: 'POST',
        mode: 'no-cors',
        headers: {
          'Content-Type': 'text/plain;charset=utf-8',
        },
        body: JSON.stringify({
          action: 'resetAll',
        }),
      });

      await onGoogleSheetReset();
      setShowGoogleResetConfirm(false);
      showToast('Google Sheet data cleared. Headers are kept.', 'success');
    } catch (error) {
      console.error('Google Sheet reset failed', error);
      showToast('Failed to reset Google Sheet data.', 'error');
    } finally {
      setIsResettingGoogleSheet(false);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-2xl mx-auto space-y-8"
    >
      <div className="bg-zinc-900 border border-zinc-800 rounded-[40px] p-8 sm:p-10">
        <div className="flex items-center gap-3 mb-10">
          <div className="w-12 h-12 bg-orange-500/10 rounded-2xl flex items-center justify-center">
            <Settings className="text-orange-500 w-6 h-6" />
          </div>
          <h3 className="text-2xl font-bold tracking-tight">System Settings</h3>
        </div>
        
        <div className="space-y-10">
          {/* Admin Access Toggle */}
          <div className="group flex items-center justify-between p-4 sm:p-6 bg-zinc-800/30 rounded-[32px] border border-zinc-800/50 hover:border-orange-500/30 transition-all gap-4">
            <div className="flex-1">
              <p className="font-bold text-base sm:text-lg mb-1">Admin Access</p>
              <p className="text-[10px] sm:text-xs text-zinc-500 leading-relaxed max-w-[200px] sm:max-w-[240px]">
                Enable restricted features like deleting orders with payment history.
              </p>
            </div>
            <button 
              onClick={() => setIsAdmin(!isAdmin)}
              className={`w-12 h-6 sm:w-14 sm:h-7 rounded-full transition-all relative flex items-center px-1 shrink-0 ${isAdmin ? 'bg-orange-500' : 'bg-zinc-700'}`}
            >
              <motion.div 
                animate={{ x: isAdmin ? (window.innerWidth < 640 ? 24 : 28) : 0 }}
                transition={{ type: "spring", stiffness: 500, damping: 30 }}
                className="w-4 h-4 sm:w-5 sm:h-5 bg-white rounded-full shadow-lg"
              />
            </button>
          </div>

          {/* API Link Section */}
          <div className="space-y-4">
            <label className="block text-[10px] font-black text-zinc-500 uppercase tracking-[0.2em] ml-2">Google Sheet API Link</label>
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex-1 relative">
                <input 
                  type="text" 
                  value={apiLink}
                  onChange={(e) => setApiLink(e.target.value)}
                  placeholder="https://script.google.com/macros/s/..."
                  className="w-full bg-zinc-800/50 border border-zinc-700/50 rounded-2xl px-6 py-4 text-sm focus:outline-none focus:border-orange-500/50 transition-all placeholder:text-zinc-600"
                />
              </div>
              <button 
                onClick={handleSaveApi} 
                className="bg-orange-500 hover:bg-orange-600 px-8 py-4 rounded-2xl font-bold text-sm transition-all shadow-lg shadow-orange-500/20 active:scale-95 whitespace-nowrap"
              >
                Save Changes
              </button>
            </div>
            <button
              onClick={() => void handleSync()}
              disabled={isSyncing || !apiLink}
              className="w-full bg-emerald-500 hover:bg-emerald-600 px-8 py-4 rounded-2xl font-bold text-sm transition-all shadow-lg shadow-emerald-500/20 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSyncing ? 'Syncing...' : syncButtonLabel}
            </button>
            <div className="ml-2 text-[10px] text-zinc-600 flex items-center gap-1.5">
              <div className="w-1 h-1 bg-zinc-600 rounded-full" />
              This link connects your app to Google Sheets for cloud backup and reconnect auto-sync.
            </div>
          </div>

          {/* Data Management */}
          <div className="pt-10 border-t border-zinc-800/50">
            <h4 className="font-bold mb-6 text-sm flex items-center gap-2">
              <RefreshCw className="w-4 h-4 text-zinc-500" />
              Data Management
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="bg-zinc-800/20 p-6 rounded-[28px] border border-zinc-800/50">
                <p className="text-zinc-500 text-[10px] uppercase font-black tracking-wider mb-2">Total Records</p>
                <p className="text-2xl font-bold">{transactions.length + orders.length}</p>
              </div>
              <div className="bg-zinc-800/20 p-6 rounded-[28px] border border-zinc-800/50">
                <p className="text-zinc-500 text-[10px] uppercase font-black tracking-wider mb-2">Storage Used</p>
                <p className="text-2xl font-bold">~{(JSON.stringify(transactions).length / 1024).toFixed(1)} KB</p>
              </div>
            </div>
          </div>

          {/* Android App & APK Download */}
          <div className="pt-10 border-t border-zinc-800/50">
            <h4 className="font-bold mb-4 text-sm flex items-center gap-2">
              <Smartphone className="w-4 h-4 text-orange-500" />
              Android Mobile App (APK)
            </h4>
            <div className="bg-gradient-to-br from-orange-500/10 via-zinc-900 to-zinc-900 border border-orange-500/30 p-6 rounded-[28px] space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-base text-white">KhataBook Pro APK</span>
                    <span className="bg-orange-500/20 text-orange-400 border border-orange-500/30 text-[10px] font-bold px-2.5 py-0.5 rounded-full">v1.0 Ready</span>
                  </div>
                  <p className="text-xs text-zinc-400 mt-1">
                    Install on any Android smartphone for offline ledger accounting & auto Google Sheets sync.
                  </p>
                </div>
                <a
                  href="/Khatabook.apk"
                  download="Khatabook.apk"
                  className="bg-orange-500 hover:bg-orange-600 active:scale-95 text-white font-bold text-sm px-6 py-3.5 rounded-2xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-orange-500/25 shrink-0"
                >
                  <Download className="w-4 h-4" /> Download APK
                </a>
              </div>
              <div className="bg-zinc-800/40 border border-zinc-700/40 rounded-2xl p-4 text-[11px] text-zinc-400 space-y-1.5">
                <p className="font-bold text-zinc-300">How to install on Android:</p>
                <ol className="list-decimal list-inside space-y-1 text-zinc-400">
                  <li>Tap <span className="text-orange-400 font-semibold">Download APK</span> above on your phone or tablet.</li>
                  <li>Tap the downloaded file in your browser or Notification shade.</li>
                  <li>If prompted, enable <em>"Install unknown apps"</em> for your browser.</li>
                  <li>Tap <strong>Install</strong> to start using Khatabook Pro on Android.</li>
                </ol>
              </div>
            </div>
          </div>

          {/* Reset Action */}
          <div className="pt-6">
            <div className="space-y-4">
              <button 
                onClick={() => setShowClearConfirm(true)}
                className="w-full bg-red-500/5 hover:bg-red-500/10 text-red-500 py-5 rounded-[28px] font-bold text-sm flex items-center justify-center gap-3 transition-all border border-red-500/10"
              >
                <Trash2 className="w-4 h-4" /> Reset Local Database
              </button>
              <button 
                onClick={() => setShowGoogleResetConfirm(true)}
                disabled={isResettingGoogleSheet}
                className="w-full bg-blue-500/5 hover:bg-blue-500/10 text-blue-400 py-5 rounded-[28px] font-bold text-sm flex items-center justify-center gap-3 transition-all border border-blue-500/10 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Trash2 className="w-4 h-4" /> {isResettingGoogleSheet ? 'Resetting Google Sheet...' : 'Reset Google Sheet Data'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Clear Confirmation Modal */}
      <AnimatePresence>
        {showClearConfirm && (
          <div 
            className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md"
            onClick={() => setShowClearConfirm(false)}
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-zinc-900 border border-zinc-800 p-8 rounded-[40px] max-w-sm w-full text-center"
            >
              <div className="w-16 h-16 bg-red-500/10 text-red-500 rounded-full flex items-center justify-center mx-auto mb-6">
                <Trash2 className="w-8 h-8" />
              </div>
              <h3 className="text-xl font-bold mb-2">Delete All Data?</h3>
              <p className="text-zinc-500 text-sm mb-8">This action cannot be undone. All your local transactions and orders will be permanently deleted.</p>
              <div className="flex gap-3">
                <button onClick={() => setShowClearConfirm(false)} className="flex-1 bg-zinc-800 py-4 rounded-2xl font-bold text-sm">Cancel</button>
                <button onClick={clearData} className="flex-1 bg-red-500 py-4 rounded-2xl font-bold text-sm">Delete</button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showGoogleResetConfirm && (
          <div 
            className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md"
            onClick={() => !isResettingGoogleSheet && setShowGoogleResetConfirm(false)}
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-zinc-900 border border-zinc-800 p-8 rounded-[40px] max-w-sm w-full text-center"
            >
              <div className="w-16 h-16 bg-blue-500/10 text-blue-400 rounded-full flex items-center justify-center mx-auto mb-6">
                <Trash2 className="w-8 h-8" />
              </div>
              <h3 className="text-xl font-bold mb-2">Clear Google Sheet Data?</h3>
              <p className="text-zinc-500 text-sm mb-8">
                This will delete all rows from your Google Sheets cloud backup and keep only the headers.
                Local phone data will stay safe, and you can sync it again later if needed.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowGoogleResetConfirm(false)}
                  disabled={isResettingGoogleSheet}
                  className="flex-1 bg-zinc-800 py-4 rounded-2xl font-bold text-sm disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={resetGoogleSheetData}
                  disabled={isResettingGoogleSheet}
                  className="flex-1 bg-blue-500 py-4 rounded-2xl font-bold text-sm disabled:opacity-50"
                >
                  {isResettingGoogleSheet ? 'Resetting...' : 'Reset Sheet'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <div className="bg-orange-500/10 border border-orange-500/20 rounded-[32px] p-8">
        <h4 className="font-bold text-orange-500 mb-2 flex items-center gap-2"><AlertCircle className="w-5 h-5" /> Admin Notice</h4>
        <p className="text-zinc-400 text-sm leading-relaxed">
          Ensure your Google Sheet has the correct headers: <br/>
          <strong>Transactions:</strong> id, date, type, category, amount, payment_type, description, reference, order_id, synced <br/>
          <strong>Orders:</strong> order_id, items (JSON), supplier, total_amount, paid_amount, remaining_amount, status, date, synced <br/>
          <strong>OrderPayments:</strong> payment_id, order_id, amount, payment_type, date, synced <br/>
          Pending offline changes now sync automatically when the device reconnects. Reset Google Sheet Data clears cloud rows only and keeps the sheet headers.
        </p>
      </div>
    </motion.div>
  );
}

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format, parseISO } from 'date-fns';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { type Order } from '../db';
import { type PdfPreviewData } from '../types/common';

export const arrayBufferToBase64 = (buffer: ArrayBuffer): string => {
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  let binary = '';
  const chunkSize = 8192;
  for (let i = 0; i < len; i += chunkSize) {
    const chunk = bytes.subarray(i, Math.min(i + chunkSize, len));
    binary += String.fromCharCode.apply(null, chunk as any);
  }
  return window.btoa(binary);
};

export const downloadBlobFallback = (blob: Blob, filename: string) => {
  try {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.rel = 'noopener';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    }, 200);
  } catch (err) {
    console.error('downloadBlobFallback error:', err);
  }
};

let cachedNirmalaBase64: string | null | undefined = undefined;

export const getValidNirmalaFont = async (): Promise<string | null> => {
  if (cachedNirmalaBase64 !== undefined) return cachedNirmalaBase64;
  const urls = ['/fonts/Nirmala.ttf', './fonts/Nirmala.ttf', 'fonts/Nirmala.ttf'];
  for (const url of urls) {
    try {
      const response = await fetch(url);
      if (!response.ok) continue;
      const ct = (response.headers.get('content-type') || '').toLowerCase();
      if (ct.includes('html')) continue;
      const buf = await response.arrayBuffer();
      if (buf && buf.byteLength > 1000) {
        const view = new DataView(buf);
        const tag = view.getUint32(0);
        if (tag === 0x00010000 || tag === 0x74727565 || tag === 0x4F54544F) {
          cachedNirmalaBase64 = arrayBufferToBase64(buf);
          return cachedNirmalaBase64;
        }
      }
    } catch {}
  }
  cachedNirmalaBase64 = null;
  return null;
};

export const setupDocFont = async (doc: jsPDF): Promise<{ fontName: string; cur: string }> => {
  try {
    const fontBase64 = await getValidNirmalaFont();
    if (fontBase64) {
      doc.addFileToVFS('Nirmala.ttf', fontBase64);
      doc.addFont('Nirmala.ttf', 'Nirmala', 'normal');
      doc.addFont('Nirmala.ttf', 'Nirmala', 'bold');
      doc.setFont('Nirmala');
      return { fontName: 'Nirmala', cur: '₹' };
    }
  } catch (err) {
    console.warn('Nirmala font registration failed, using helvetica:', err);
  }
  doc.setFont('helvetica');
  return { fontName: 'helvetica', cur: 'Rs. ' };
};

export const saveOrShareReport = async (
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
      try {
        await Filesystem.writeFile({
          path: filename,
          data: cleanBase64,
          directory: Directory.Documents,
          recursive: true,
        });
      } catch (docWriteErr) {
        console.warn('Documents directory write bypassed:', docWriteErr);
      }

      const writeResult = await Filesystem.writeFile({
        path: filename,
        data: cleanBase64,
        directory: Directory.Cache,
        recursive: true,
      });

      const uriResult = await Filesystem.getUri({
        directory: Directory.Cache,
        path: filename,
      });

      const fileUri = uriResult.uri || writeResult.uri;

      try {
        await Share.share({
          title: filename,
          text: `KhataBook: ${filename}`,
          files: [fileUri],
          dialogTitle: `Share or Print ${filename}`,
        });
      } catch (shareErr: any) {
        const errStr = String(shareErr?.message || '').toLowerCase();
        if (!errStr.includes('cancel') && !errStr.includes('dismiss') && !errStr.includes('abort')) {
          try {
            await Share.share({
              title: filename,
              url: fileUri,
              dialogTitle: `Share ${filename}`,
            });
          } catch {}
        }
      }
      return true;
    } catch (err: any) {
      console.warn('Native file share/save error:', err);
      const errMsg = String(err?.message || '').toLowerCase();
      if (errMsg.includes('cancel') || errMsg.includes('dismiss') || errMsg.includes('abort')) {
        return true;
      }
      return false;
    }
  }

  // 2. Web / Mobile Browser
  let blob: Blob;
  if (rawArrayBuffer && rawArrayBuffer.byteLength > 0) {
    try {
      blob = new Blob([rawArrayBuffer.slice(0)], { type: mimeType });
    } catch {
      const byteCharacters = atob(cleanBase64);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      blob = new Blob([byteArray], { type: mimeType });
    }
  } else {
    const byteCharacters = atob(cleanBase64);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    blob = new Blob([byteArray], { type: mimeType });
  }

  downloadBlobFallback(blob, filename);

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
    } catch {
      // User cancelled share dialog
    }
  }

  return true;
};

export const generateAndShareOrderReceipts = async (
  ordersList: Order[], 
  showToast?: any,
  onPreview?: (data: PdfPreviewData) => void
): Promise<void> => {
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

    const { fontName: activeFont, cur } = await setupDocFont(doc);

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

      doc.setFontSize(7.5);
      doc.setTextColor(161, 161, 170);
      doc.text(`Printed / Shared on: ${nowStr}`, 15, finalY + 14);
      doc.text('Valid electronic receipt generated via KhataBook Mobile Pro.', 15, finalY + 20);
      doc.text('No physical signature required.', 15, finalY + 26);

    } else {
      const totalOrderValue = ordersList.reduce((sum, o) => sum + (Number(o.total_amount) || 0), 0);
      const totalPaidValue = ordersList.reduce((sum, o) => sum + (Number(o.paid_amount) || 0), 0);
      const totalRemainingValue = ordersList.reduce((sum, o) => sum + (Number(o.remaining_amount) || 0), 0);

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
    const pdfBlob = doc.output('blob');
    const dataUri = doc.output('datauristring');
    const pdfBase64 = dataUri.includes(',') ? dataUri.split(',')[1] : dataUri;

    if (onPreview) {
      onPreview({
        blob: pdfBlob,
        filename,
        base64Data: pdfBase64,
        rawArrayBuffer: pdfArrayBuffer,
        title: isSingle ? 'Order Receipt' : `Orders Summary (${ordersList.length} Orders)`,
      });
      return;
    }

    const isHandled = await saveOrShareReport(
      pdfBase64,
      filename,
      'application/pdf',
      pdfArrayBuffer
    );

    if (!isHandled) {
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

export const generateAndSharePassbookPDF = async (
  passbookEntries: any[], 
  periodLabel: string, 
  typeFilter: string, 
  showToast?: any,
  onPreview?: (data: PdfPreviewData) => void
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

    const { fontName: activeFont, cur } = await setupDocFont(doc);

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
    
    const latestBalance = passbookEntries.length > 0 ? passbookEntries[0].runningBalance : 0;

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
    const pdfBlob = doc.output('blob');
    const dataUri = doc.output('datauristring');
    const pdfBase64 = dataUri.includes(',') ? dataUri.split(',')[1] : dataUri;

    if (onPreview) {
      onPreview({
        blob: pdfBlob,
        filename,
        base64Data: pdfBase64,
        rawArrayBuffer: pdfArrayBuffer,
        title: `Passbook Statement (${periodLabel})`,
      });
      return;
    }

    const isHandled = await saveOrShareReport(
      pdfBase64,
      filename,
      'application/pdf',
      pdfArrayBuffer
    );

    if (!isHandled) {
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

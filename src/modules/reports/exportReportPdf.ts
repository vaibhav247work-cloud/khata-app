import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format, parseISO } from 'date-fns';
import { blobToBase64, loadAppFont, downloadBlobFallback } from '../../utils/pdf';
import { saveOrShareReport } from '../../utils/fileExport';
import type { Transaction } from '../../types';

export const exportReportPdf = async (
  transactions: Transaction[],
  showToast?: (msg: string, type: 'success' | 'error' | 'info') => void
): Promise<void> => {
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

    const creditTxs = transactions.filter((t) => t.type === 'Credit');
    const debitTxs = transactions.filter((t) => t.type === 'Debit');
    const creditTotal = creditTxs.reduce((sum, tx) => sum + (Number(tx.amount) || 0), 0);
    const debitTotal = debitTxs.reduce((sum, tx) => sum + (Number(tx.amount) || 0), 0);

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
        fontStyle: 'normal',
        fontSize: 7,
        textColor: [39, 39, 42],
        lineColor: [212, 212, 216],
        lineWidth: 0.15,
        cellPadding: 1.2,
      },
      headStyles: {
        font: activeFont,
        fontStyle: 'normal',
        fillColor: [234, 88, 12],
        textColor: [255, 255, 255],
        lineColor: [194, 65, 12],
        lineWidth: 0.15,
      },
      alternateRowStyles: { fillColor: [250, 250, 250], fontStyle: 'normal' },
      columnStyles: {
        0: { cellWidth: 31 },
        1: { cellWidth: 18 },
        2: { cellWidth: 30 },
        3: { cellWidth: 23, halign: 'right' },
        4: { cellWidth: 27 },
        5: { cellWidth: 'auto' },
      },
      didDrawPage: (data) => {
        doc.setFont(activeFont, 'normal');
        doc.setFontSize(8);
        doc.setTextColor(113, 113, 122);
        doc.text(`Page ${data.pageNumber}`, 190, 288, { align: 'right' });
      },
    });

    const filename = `KhataBook_Report_${format(new Date(), 'yyyyMMdd_HHmm')}.pdf`;
    const pdfBlob = doc.output('blob');
    const pdfBase64 = await blobToBase64(pdfBlob);
    const pdfArrayBuffer = await pdfBlob.arrayBuffer();

    const isHandledNatively = await saveOrShareReport(
      pdfBase64,
      filename,
      'application/pdf',
      pdfArrayBuffer,
      showToast as any
    );

    if (!isHandledNatively) {
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
  }
};

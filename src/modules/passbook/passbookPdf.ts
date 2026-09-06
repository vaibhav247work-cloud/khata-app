import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format, parseISO } from 'date-fns';
import { blobToBase64, loadAppFont, downloadBlobFallback } from '../../utils/pdf';
import { saveOrShareReport } from '../../utils/fileExport';

export const generateAndSharePassbookPDF = async (
  passbookEntries: any[], 
  periodLabel: string, 
  _typeFilter: string, 
  showToast?: (msg: string, type: 'success' | 'error' | 'info') => void
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
        fontStyle: 'normal',
        fontSize: 7,
        textColor: [39, 39, 42],
        lineColor: [228, 228, 231],
        lineWidth: 0.15,
        cellPadding: 1.5,
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
        0: { cellWidth: 8, halign: 'center' },
        1: { cellWidth: 30 },
        2: { cellWidth: 28 },
        3: { cellWidth: 'auto' },
        4: { cellWidth: 22, halign: 'right' },
        5: { cellWidth: 22, halign: 'right' },
        6: { cellWidth: 24, halign: 'right' },
      },
      didDrawPage: (data) => {
        doc.setFont(activeFont, 'normal');
        doc.setFontSize(7.5);
        doc.setTextColor(113, 113, 122);
        doc.text(`Page ${data.pageNumber} • KhataBook Mobile Pro Passbook`, 190, 288, { align: 'right' });
      },
    });

    const filename = `Passbook_Statement_${periodLabel.replace(/[^a-zA-Z0-9]/g, '_')}_${format(new Date(), 'yyyyMMdd_HHmm')}.pdf`;
    const pdfBlob = doc.output('blob');
    const pdfBase64 = await blobToBase64(pdfBlob);
    const pdfArrayBuffer = await pdfBlob.arrayBuffer();

    const isHandled = await saveOrShareReport(
      pdfBase64,
      filename,
      'application/pdf',
      pdfArrayBuffer,
      showToast as any
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

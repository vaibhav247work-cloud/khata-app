import type jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format, parseISO } from 'date-fns';
import type { Order } from '../../types';

export function renderBatchReceipts(
  doc: jsPDF,
  ordersList: Order[],
  activeFont: string,
  cur: string,
  nowStr: string
): void {
  const totalOrderValue = ordersList.reduce((sum, o) => sum + (Number(o.total_amount) || 0), 0);
  const totalPaidValue = ordersList.reduce((sum, o) => sum + (Number(o.paid_amount) || 0), 0);
  const totalRemainingValue = ordersList.reduce((sum, o) => sum + (Number(o.remaining_amount) || 0), 0);

  const formatOrderDate = (value: string) => {
    try {
      return format(parseISO(value), 'dd MMM yyyy, hh:mm a');
    } catch {
      return value || '-';
    }
  };

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

  // Consolidated Orders Table
  const consolidatedRows = ordersList.map((ord, idx) => {
    const itemNames = ord.items && ord.items.length > 0 
      ? ord.items.map(i => i.material).join(', ') 
      : '-';
    return [
      idx + 1,
      formatOrderDate(ord.date).slice(0, 11),
      ord.supplier,
      itemNames,
      `${cur}${Number(ord.total_amount || 0).toLocaleString('en-IN')}`,
      `${cur}${Number(ord.paid_amount || 0).toLocaleString('en-IN')}`,
      `${cur}${Number(ord.remaining_amount || 0).toLocaleString('en-IN')}`,
      ord.status.toUpperCase(),
    ];
  });

  autoTable(doc, {
    startY: 64,
    head: [['#', 'Date', 'Supplier', 'Items / Materials', 'Total', 'Paid', 'Due', 'Status']],
    body: consolidatedRows,
    theme: 'striped',
    styles: {
      font: activeFont,
      fontSize: 8,
      cellPadding: 2.5,
      textColor: [39, 39, 42],
    },
    headStyles: {
      fillColor: [24, 24, 27],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
    },
    columnStyles: {
      0: { cellWidth: 8, halign: 'center' },
      1: { cellWidth: 20 },
      2: { cellWidth: 35 },
      3: { cellWidth: 42 },
      4: { cellWidth: 22, halign: 'right' },
      5: { cellWidth: 22, halign: 'right' },
      6: { cellWidth: 22, halign: 'right' },
      7: { cellWidth: 19, halign: 'center' },
    },
  });

  // Individual detailed pages
  for (let i = 0; i < ordersList.length; i++) {
    const order = ordersList[i];
    const items = order.items || [];
    const orderIdShort = order.order_id.slice(0, 8).toUpperCase();

    doc.addPage();

    doc.setFillColor(24, 24, 27);
    doc.roundedRect(10, 10, 190, 26, 3, 3, 'F');
    
    doc.setTextColor(255, 255, 255);
    doc.setFont(activeFont);
    doc.setFontSize(15);
    doc.text('KhataBook Pro', 16, 20);

    doc.setFontSize(9);
    doc.setTextColor(249, 115, 22);
    doc.text(`INDIVIDUAL ORDER RECEIPT #${i + 1} OF ${ordersList.length}`, 16, 28);

    doc.setFontSize(8);
    doc.setTextColor(212, 212, 216);
    doc.text(`Receipt #: ORD-${orderIdShort}`, 135, 20);
    doc.text(`Date: ${formatOrderDate(order.date)}`, 135, 28);

    // Supplier & Status
    doc.setFillColor(244, 244, 245);
    doc.roundedRect(10, 40, 115, 26, 3, 3, 'F');
    doc.setFillColor(244, 244, 245);
    doc.roundedRect(130, 40, 70, 26, 3, 3, 'F');

    doc.setFont(activeFont);
    doc.setFontSize(8);
    doc.setTextColor(113, 113, 122);
    doc.text('SUPPLIER / PARTY DETAILS', 16, 47);
    doc.text('PAYMENT STATUS', 136, 47);

    doc.setFontSize(11);
    doc.setTextColor(24, 24, 27);
    doc.text(order.supplier, 16, 56);

    const statusColor = order.status === 'Completed' ? [22, 101, 52] : order.status === 'Partial' ? [180, 83, 9] : [185, 28, 28];
    doc.setTextColor(statusColor[0], statusColor[1], statusColor[2]);
    doc.setFontSize(12);
    doc.text(order.status.toUpperCase(), 136, 56);

    const itemsTableData = items.map((item, idx) => [
      idx + 1,
      item.material,
      item.quantity || '-',
      `${cur}${Number(item.amount || 0).toLocaleString('en-IN')}`,
    ]);

    autoTable(doc, {
      startY: 72,
      head: [['#', 'Material / Item Description', 'Quantity', 'Amount']],
      body: itemsTableData,
      theme: 'grid',
      styles: {
        font: activeFont,
        fontSize: 8.5,
        cellPadding: 3,
        textColor: [39, 39, 42],
      },
      headStyles: {
        fillColor: [24, 24, 27],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
      },
      columnStyles: {
        0: { cellWidth: 10, halign: 'center' },
        1: { cellWidth: 100 },
        2: { cellWidth: 40, halign: 'center' },
        3: { cellWidth: 40, halign: 'right' },
      },
    });

    const indFinalY = (doc as any).lastAutoTable.finalY + 8;

    doc.setFillColor(250, 250, 250);
    doc.setDrawColor(228, 228, 231);
    doc.roundedRect(105, indFinalY, 95, 34, 3, 3, 'FD');

    doc.setFont(activeFont);
    doc.setFontSize(8.5);
    doc.setTextColor(113, 113, 122);
    doc.text('Total Order Amount:', 110, indFinalY + 8);
    doc.text('Amount Paid to Date:', 110, indFinalY + 16);
    doc.text('Outstanding Balance:', 110, indFinalY + 25);

    doc.setTextColor(24, 24, 27);
    doc.text(`${cur}${Number(order.total_amount || 0).toLocaleString('en-IN')}`, 192, indFinalY + 8, { align: 'right' });

    doc.setTextColor(22, 101, 52);
    doc.text(`${cur}${Number(order.paid_amount || 0).toLocaleString('en-IN')}`, 192, indFinalY + 16, { align: 'right' });

    doc.setTextColor(185, 28, 28);
    doc.text(`${cur}${Number(order.remaining_amount || 0).toLocaleString('en-IN')}`, 192, indFinalY + 25, { align: 'right' });

    doc.setFontSize(7.5);
    doc.setTextColor(161, 161, 170);
    doc.text(`Printed / Shared on: ${nowStr}`, 15, indFinalY + 14);
    doc.text('Valid electronic receipt generated via KhataBook Mobile Pro.', 15, indFinalY + 20);
    doc.text('No physical signature required.', 15, indFinalY + 26);
  }
}

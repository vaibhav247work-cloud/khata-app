import type jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format, parseISO } from 'date-fns';
import type { Order } from '../../types';

export function renderSingleReceipt(
  doc: jsPDF,
  order: Order,
  activeFont: string,
  cur: string,
  nowStr: string
): void {
  const items = order.items || [];
  const orderIdShort = order.order_id.slice(0, 8).toUpperCase();

  const formatOrderDate = (value: string) => {
    try {
      return format(parseISO(value), 'dd MMM yyyy, hh:mm a');
    } catch {
      return value || '-';
    }
  };

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

  // Supplier & Status Cards
  doc.setFillColor(244, 244, 245);
  doc.roundedRect(10, 40, 115, 28, 3, 3, 'F');
  doc.setFillColor(244, 244, 245);
  doc.roundedRect(130, 40, 70, 28, 3, 3, 'F');

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

  // Items Table
  const tableData = items.map((item, idx) => [
    idx + 1,
    item.material,
    item.quantity || '-',
    `${cur}${Number(item.amount || 0).toLocaleString('en-IN')}`,
  ]);

  autoTable(doc, {
    startY: 74,
    head: [['#', 'Material / Item Description', 'Quantity', 'Amount']],
    body: tableData,
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
      halign: 'left',
    },
    columnStyles: {
      0: { cellWidth: 10, halign: 'center' },
      1: { cellWidth: 100 },
      2: { cellWidth: 40, halign: 'center' },
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
}

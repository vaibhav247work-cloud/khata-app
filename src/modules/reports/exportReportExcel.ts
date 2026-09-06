import * as XLSX from 'xlsx';
import { format, parseISO } from 'date-fns';
import { saveOrShareReport } from '../../utils/fileExport';
import { downloadBlobFallback } from '../../utils/pdf';
import type { Transaction } from '../../types';

export const exportReportExcel = async (
  transactions: Transaction[],
  showToast?: (msg: string, type: 'success' | 'error' | 'info') => void
): Promise<void> => {
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
      excelBuffer,
      showToast as any
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
  }
};

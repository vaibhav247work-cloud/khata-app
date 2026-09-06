import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format } from 'date-fns';
import { blobToBase64, loadAppFont, downloadBlobFallback } from '../../utils/pdf';
import { saveOrShareReport } from '../../utils/fileExport';
import type { Order } from '../../types';
import { renderSingleReceipt } from './orderReceiptSingle';
import { renderBatchReceipts } from './orderReceiptBatch';

export const generateAndShareOrderReceipts = async (
  ordersList: Order[], 
  showToast?: (msg: string, type: 'success' | 'error' | 'info') => void
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

    const { fontName: activeFont, cur } = await loadAppFont(doc);
    const isSingle = ordersList.length === 1;
    const nowStr = format(new Date(), 'dd MMM yyyy, hh:mm a');

    if (isSingle) {
      renderSingleReceipt(doc, ordersList[0], activeFont, cur, nowStr);
    } else {
      renderBatchReceipts(doc, ordersList, activeFont, cur, nowStr);
    }

    const orderIdShort = ordersList[0].order_id.slice(0, 8).toUpperCase();
    const pdfBlob = doc.output('blob');
    const fileName = isSingle
      ? `Receipt_ORD-${orderIdShort}_${Date.now()}.pdf`
      : `Orders_Batch_Receipts_${ordersList.length}_${Date.now()}.pdf`;

    const base64Data = await blobToBase64(pdfBlob);
    const pdfArrayBuffer = await pdfBlob.arrayBuffer();
    const isHandled = await saveOrShareReport(
      base64Data,
      fileName,
      'application/pdf',
      pdfArrayBuffer,
      showToast as any
    );

    if (!isHandled) {
      downloadBlobFallback(pdfBlob, fileName);
    }

    if (showToast) {
      showToast('Receipt saved & opened for print/share!', 'success');
    }
  } catch (error) {
    console.error('Failed to generate order receipt PDF', error);
    if (showToast) showToast('Failed to generate order receipt', 'error');
  }
};

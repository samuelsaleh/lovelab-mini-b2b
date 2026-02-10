'use client';

import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

/**
 * Generate a PDF from an HTML element
 * @param {HTMLElement} element - The element to capture
 * @param {string} filename - The filename (without .pdf extension)
 * @param {Object} options - Options for PDF generation
 * @returns {Promise<Blob>} - The PDF as a Blob
 */
export async function generatePDF(element, filename, options = {}) {
  const {
    orientation = 'landscape',
    format = 'a4',
    scale = 2.5,
    quality = 0.95,
  } = options;

  if (!element) {
    throw new Error('No element provided for PDF generation');
  }

  // Capture the element as a canvas at high resolution
  const canvas = await html2canvas(element, {
    scale,
    useCORS: true,
    allowTaint: true,
    backgroundColor: '#ffffff',
    logging: false,
    scrollX: 0,
    scrollY: -window.scrollY,
    windowWidth: element.scrollWidth,
    windowHeight: element.scrollHeight,
  });

  // Calculate dimensions
  const imgWidth = orientation === 'landscape' ? 297 : 210; // A4 dimensions in mm
  const imgHeight = orientation === 'landscape' ? 210 : 297;
  
  const canvasWidth = canvas.width;
  const canvasHeight = canvas.height;
  const ratio = canvasWidth / canvasHeight;
  
  let pdfWidth = imgWidth - 20; // 10mm margin on each side
  let pdfHeight = pdfWidth / ratio;
  
  // If content is taller than page, we need multiple pages
  const pageHeight = imgHeight - 20; // 10mm margin top and bottom
  
  // Create PDF
  const pdf = new jsPDF({
    orientation,
    unit: 'mm',
    format,
  });

  // Use high-quality JPEG (the wider form + higher scale + PrintableInput divs 
  // ensure text is readable; JPEG keeps file size manageable for upload)
  const imgData = canvas.toDataURL('image/jpeg', quality);
  
  if (pdfHeight <= pageHeight) {
    // Single page
    pdf.addImage(imgData, 'JPEG', 10, 10, pdfWidth, pdfHeight);
  } else {
    // Multiple pages - split the canvas
    let remainingHeight = canvasHeight;
    let position = 0;
    let pageNum = 0;
    
    const pageCanvasHeight = (pageHeight / pdfWidth) * canvasWidth;
    
    while (remainingHeight > 0) {
      if (pageNum > 0) {
        pdf.addPage();
      }
      
      // Create a temporary canvas for this page section
      const pageCanvas = document.createElement('canvas');
      pageCanvas.width = canvasWidth;
      pageCanvas.height = Math.min(pageCanvasHeight, remainingHeight);
      
      const ctx = pageCanvas.getContext('2d');
      ctx.drawImage(
        canvas,
        0, position,
        canvasWidth, pageCanvas.height,
        0, 0,
        canvasWidth, pageCanvas.height
      );
      
      const pageImgData = pageCanvas.toDataURL('image/jpeg', quality);
      const thisPageHeight = (pageCanvas.height / canvasWidth) * pdfWidth;
      
      pdf.addImage(pageImgData, 'JPEG', 10, 10, pdfWidth, thisPageHeight);
      
      position += pageCanvasHeight;
      remainingHeight -= pageCanvasHeight;
      pageNum++;
    }
  }

  // Return as blob
  return pdf.output('blob');
}

/**
 * Generate PDF and trigger download
 */
export async function downloadPDF(element, filename, options = {}) {
  const blob = await generatePDF(element, filename, options);
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${filename}.pdf`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Format filename for documents
 */
export function formatDocumentFilename(clientCompany, documentType, date) {
  const cleanCompany = (clientCompany || 'Unknown')
    .replace(/[^a-zA-Z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '_');
  const type = documentType === 'quote' ? 'Quote' : 'Order';
  const dateStr = date || new Date().toISOString().split('T')[0];
  return `${cleanCompany}_${type}_${dateStr}`;
}

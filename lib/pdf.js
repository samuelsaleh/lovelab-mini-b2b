'use client';

import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

const IS_MOBILE = () => typeof window !== 'undefined' && window.innerWidth < 768;

/**
 * Check if a canvas is blank (all white or all transparent)
 */
function isCanvasBlank(canvas) {
  if (!canvas || canvas.width === 0 || canvas.height === 0) return true;
  const ctx = canvas.getContext('2d');
  // Sample a few spots instead of checking every pixel (performance)
  const spots = [
    [canvas.width / 4, canvas.height / 4],
    [canvas.width / 2, canvas.height / 2],
    [canvas.width * 3 / 4, canvas.height * 3 / 4],
    [canvas.width / 2, canvas.height / 4],
    [canvas.width / 4, canvas.height / 2],
  ];
  for (const [x, y] of spots) {
    const pixel = ctx.getImageData(Math.floor(x), Math.floor(y), 1, 1).data;
    // If any sampled pixel is not white/transparent, canvas has content
    if (pixel[3] > 0 && (pixel[0] < 250 || pixel[1] < 250 || pixel[2] < 250)) {
      return false;
    }
  }
  return true;
}

/**
 * Capture a single DOM element to canvas with retry at lower scale
 */
async function captureElement(element, scale, quality) {
  const mobile = IS_MOBILE();
  let captureScale = mobile ? Math.min(scale, 1.5) : scale;

  // Try capturing at the desired scale
  let canvas = await html2canvas(element, {
    scale: captureScale,
    useCORS: true,
    allowTaint: true,
    backgroundColor: '#ffffff',
    logging: false,
    scrollX: 0,
    scrollY: 0,
    windowWidth: element.scrollWidth,
    windowHeight: element.scrollHeight,
  });

  // If blank on mobile, retry at scale 1.0
  if (mobile && isCanvasBlank(canvas) && captureScale > 1.0) {
    console.warn('PDF: blank canvas detected, retrying at scale 1.0');
    canvas = await html2canvas(element, {
      scale: 1.0,
      useCORS: true,
      allowTaint: true,
      backgroundColor: '#ffffff',
      logging: false,
      scrollX: 0,
      scrollY: 0,
      windowWidth: element.scrollWidth,
      windowHeight: element.scrollHeight,
    });
  }

  return canvas;
}

/**
 * Generate a PDF from an HTML element.
 * On mobile, captures each .order-form-page individually to avoid
 * exceeding iOS Safari's ~16MP canvas memory limit.
 * 
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

  // Scroll any parent container to top before capture
  const scrollParent = element.closest('#order-form-scroll-area') || element.parentElement;
  if (scrollParent) {
    scrollParent.scrollTop = 0;
  }

  // A4 dimensions in mm
  const imgWidth = orientation === 'landscape' ? 297 : 210;
  const imgHeight = orientation === 'landscape' ? 210 : 297;
  const pdfWidth = imgWidth - 20;  // 10mm margin on each side
  const pageHeight = imgHeight - 20; // 10mm margin top and bottom

  const pdf = new jsPDF({ orientation, unit: 'mm', format });

  // On mobile, capture each page element individually to stay within canvas limits.
  // On desktop, capture the whole container as before for better quality.
  const mobile = IS_MOBILE();
  const pageElements = element.querySelectorAll('.order-form-page');

  if (mobile && pageElements.length > 0) {
    // ─── Per-page capture (mobile) ───
    for (let i = 0; i < pageElements.length; i++) {
      if (i > 0) pdf.addPage();

      const pageEl = pageElements[i];
      const canvas = await captureElement(pageEl, scale, quality);

      if (isCanvasBlank(canvas)) {
        console.warn(`PDF: page ${i + 1} canvas is blank even after retry`);
      }

      const ratio = canvas.width / canvas.height;
      const pdfH = pdfWidth / ratio;
      const imgData = canvas.toDataURL('image/jpeg', quality);
      pdf.addImage(imgData, 'JPEG', 10, 10, pdfWidth, Math.min(pdfH, pageHeight));
    }
  } else {
    // ─── Full-container capture (desktop) ───
    const canvas = await captureElement(element, scale, quality);

    const canvasWidth = canvas.width;
    const canvasHeight = canvas.height;
    const ratio = canvasWidth / canvasHeight;
    let pdfHeight = pdfWidth / ratio;

    const imgData = canvas.toDataURL('image/jpeg', quality);

    if (pdfHeight <= pageHeight) {
      pdf.addImage(imgData, 'JPEG', 10, 10, pdfWidth, pdfHeight);
    } else {
      // Split into multiple PDF pages
      let remainingHeight = canvasHeight;
      let position = 0;
      let pageNum = 0;
      const pageCanvasHeight = (pageHeight / pdfWidth) * canvasWidth;

      while (remainingHeight > 0) {
        if (pageNum > 0) pdf.addPage();

        const sliceCanvas = document.createElement('canvas');
        sliceCanvas.width = canvasWidth;
        sliceCanvas.height = Math.min(pageCanvasHeight, remainingHeight);

        const ctx = sliceCanvas.getContext('2d');
        ctx.drawImage(
          canvas,
          0, position, canvasWidth, sliceCanvas.height,
          0, 0, canvasWidth, sliceCanvas.height
        );

        const sliceImg = sliceCanvas.toDataURL('image/jpeg', quality);
        const sliceH = (sliceCanvas.height / canvasWidth) * pdfWidth;
        pdf.addImage(sliceImg, 'JPEG', 10, 10, pdfWidth, sliceH);

        position += pageCanvasHeight;
        remainingHeight -= pageCanvasHeight;
        pageNum++;
      }
    }
  }

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

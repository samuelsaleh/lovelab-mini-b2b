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
 * Capture a single DOM element to canvas with retry at lower scale.
 * @param {HTMLElement} element - Element to capture
 * @param {number} scale - Render scale
 * @param {number} quality - JPEG quality (unused here but passed through)
 * @param {number} [forceWidth] - Force a specific windowWidth for html2canvas (used to render mobile at desktop width)
 */
async function captureElement(element, scale, quality, forceWidth) {
  const mobile = IS_MOBILE();
  let captureScale = mobile ? Math.min(scale, 2.0) : scale;
  const renderWidth = forceWidth || element.scrollWidth;

  // Try capturing at the desired scale
  let canvas = await html2canvas(element, {
    scale: captureScale,
    useCORS: true,
    allowTaint: true,
    backgroundColor: '#ffffff',
    logging: false,
    scrollX: 0,
    scrollY: 0,
    windowWidth: renderWidth,
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
      windowWidth: renderWidth,
      windowHeight: element.scrollHeight,
    });
  }

  return canvas;
}

/**
 * Capture each .order-form-page element individually for clean page breaks.
 * Used on both mobile and desktop when page elements are available.
 */
async function capturePerPage(pdf, pageElements, scale, quality, pdfWidth, pageHeight) {
  const mobile = IS_MOBILE();
  // On mobile, force desktop width so the PDF looks correct
  const DESKTOP_WIDTH = 1020;
  const forceWidth = mobile ? DESKTOP_WIDTH : null;

  for (let i = 0; i < pageElements.length; i++) {
    if (i > 0) pdf.addPage();

    const pageEl = pageElements[i];

    // Save original styles
    const origWidth = pageEl.style.width;
    const origMaxWidth = pageEl.style.maxWidth;
    const origOverflowX = pageEl.style.overflowX;
    const origBoxSizing = pageEl.style.boxSizing;

    // Force layout for capture (mobile needs desktop width, desktop keeps its own)
    if (mobile) {
      pageEl.style.width = DESKTOP_WIDTH + 'px';
      pageEl.style.maxWidth = 'none';
    }
    pageEl.style.overflowX = 'visible';
    pageEl.style.boxSizing = 'border-box';

    // Fix inner scrollable wrappers
    const tableWrappers = pageEl.querySelectorAll('div');
    const savedOverflows = [];
    tableWrappers.forEach((div) => {
      const cs = window.getComputedStyle(div);
      if (cs.overflowX === 'auto' || cs.overflowX === 'scroll') {
        savedOverflows.push({ el: div, val: div.style.overflow });
        div.style.overflow = 'visible';
      }
    });

    // Force inner tables to fit
    const tables = pageEl.querySelectorAll('table');
    const savedTableStyles = [];
    tables.forEach((t) => {
      savedTableStyles.push({ el: t, minWidth: t.style.minWidth, width: t.style.width });
      t.style.minWidth = '0';
      t.style.width = '100%';
    });

    // Wait for layout to fully settle (300ms is much safer than 2 rAF)
    await new Promise(r => setTimeout(r, 300));

    const canvas = await captureElement(pageEl, scale, quality, forceWidth || pageEl.scrollWidth);

    // Restore original styles
    pageEl.style.width = origWidth;
    pageEl.style.maxWidth = origMaxWidth;
    pageEl.style.overflowX = origOverflowX;
    pageEl.style.boxSizing = origBoxSizing;
    savedOverflows.forEach(({ el, val }) => { el.style.overflow = val; });
    savedTableStyles.forEach(({ el, minWidth, width }) => {
      el.style.minWidth = minWidth;
      el.style.width = width;
    });

    if (isCanvasBlank(canvas)) {
      console.warn(`PDF: page ${i + 1} canvas is blank even after retry`);
    }

    const ratio = canvas.width / canvas.height;
    const pdfH = pdfWidth / ratio;
    const imgData = canvas.toDataURL('image/jpeg', quality);
    pdf.addImage(imgData, 'JPEG', 10, 10, pdfWidth, Math.min(pdfH, pageHeight));
  }
}

/**
 * Generate a PDF from an HTML element.
 * Captures each .order-form-page individually for clean page breaks and
 * highest quality. Falls back to full-container capture + slicing only
 * when no .order-form-page elements exist.
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
    quality = 0.98,
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

  const pageElements = element.querySelectorAll('.order-form-page');

  if (pageElements.length > 0) {
    // ─── Per-page capture (both mobile and desktop) ───
    // Produces clean page breaks aligned with actual page elements
    await capturePerPage(pdf, pageElements, scale, quality, pdfWidth, pageHeight);
  } else {
    // ─── Fallback: full-container capture with slicing (no page elements found) ───
    // Wait for layout to settle
    await new Promise(r => setTimeout(r, 300));

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
    .normalize('NFD')                      // Decompose accented chars (e.g. é -> e + combining accent)
    .replace(/[\u0300-\u036f]/g, '')       // Remove combining diacritical marks
    .replace(/[^a-zA-Z0-9\s-]/g, '')      // Remove remaining special chars
    .trim()
    .replace(/\s+/g, '_');
  const type = documentType === 'quote' ? 'Quote' : 'Order';
  const dateStr = date || new Date().toISOString().split('T')[0];
  return `${cleanCompany}_${type}_${dateStr}`;
}

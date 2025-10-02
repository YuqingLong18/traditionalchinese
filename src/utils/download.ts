import { saveAs } from 'file-saver';
import JSZip from 'jszip';
import { jsPDF } from 'jspdf';
import type { ImageAsset } from '../types';

const wrapHtmlDocument = (body: string): string =>
  `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8" /><title>Export</title></head><body>${body}</body></html>`;

export const downloadHtml = (filename: string, htmlContent: string): void => {
  const blob = new Blob([wrapHtmlDocument(htmlContent)], {
    type: 'text/html;charset=utf-8',
  });
  saveAs(blob, filename.endsWith('.html') ? filename : `${filename}.html`);
};

export const downloadPdfFromElement = async (
  element: HTMLElement | null,
  filename: string,
): Promise<void> => {
  if (!element) {
    throw new Error('PDF export requires a rendered element.');
  }

  const pdf = new jsPDF({ unit: 'pt', format: 'a4' });

  await pdf.html(element, {
    autoPaging: 'text',
    margin: [32, 32, 32, 32],
    x: 32,
    y: 32,
    html2canvas: {
      scale: 0.6,
    },
    callback(doc) {
      doc.save(filename.endsWith('.pdf') ? filename : `${filename}.pdf`);
    },
  });
};

const base64ToBlob = (base64: string, mimeType: string): Blob => {
  const cleanBase64 = base64.replace(/^data:.+;base64,/, '');
  const byteCharacters = atob(cleanBase64);
  const byteArrays = [];

  for (let offset = 0; offset < byteCharacters.length; offset += 512) {
    const slice = byteCharacters.slice(offset, offset + 512);
    const byteNumbers = new Array(slice.length);
    for (let i = 0; i < slice.length; i += 1) {
      byteNumbers[i] = slice.charCodeAt(i);
    }
    byteArrays.push(new Uint8Array(byteNumbers));
  }

  return new Blob(byteArrays, { type: mimeType });
};

export const downloadSingleImage = (image: ImageAsset, filename?: string): void => {
  const blob = base64ToBlob(image.base64Data, image.mimeType);
  const extension = image.mimeType.split('/')[1] || 'png';
  const safeTitle = image.title.replace(/[\\/:*?"<>|]+/g, '-');
  const fileName = filename ?? `${safeTitle || image.id}.${extension}`;
  saveAs(blob, fileName);
};

export const downloadImagesAsZip = async (
  images: ImageAsset[],
  filename: string,
): Promise<void> => {
  const zip = new JSZip();

  images.forEach((image, index) => {
    const blob = base64ToBlob(image.base64Data, image.mimeType);
    const extension = image.mimeType.split('/')[1] || 'png';
    const safeTitle = image.title.replace(/[\\/:*?"<>|]+/g, '-');
    const fileName = safeTitle ? `${index + 1}-${safeTitle}.${extension}` : `image-${index + 1}.${extension}`;
    zip.file(fileName, blob);
  });

  const content = await zip.generateAsync({ type: 'blob' });
  saveAs(content, filename.endsWith('.zip') ? filename : `${filename}.zip`);
};

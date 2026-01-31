import * as pdfjsLib from 'pdfjs-dist';

// Set the worker source to the same version as the library
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://esm.sh/pdfjs-dist@4.0.379/build/pdf.worker.min.mjs';

/**
 * Converts a PDF file into an array of Image Files (one per page).
 */
export const convertPdfToImages = async (pdfFile: File): Promise<File[]> => {
  const arrayBuffer = await pdfFile.arrayBuffer();
  
  // Load the PDF document
  const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
  const pdf = await loadingTask.promise;
  
  const imageFiles: File[] = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    
    // Set scale for quality (2.0 is usually good for OCR)
    const viewport = page.getViewport({ scale: 2.0 });
    
    // Prepare canvas
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    canvas.height = viewport.height;
    canvas.width = viewport.width;

    if (!context) throw new Error("Could not create canvas context");

    // Render page to canvas
    await page.render({
      canvasContext: context,
      viewport: viewport,
    }).promise;

    // Convert canvas to Blob -> File
    const blob = await new Promise<Blob | null>((resolve) => 
      canvas.toBlob(resolve, 'image/jpeg', 0.85)
    );

    if (blob) {
      const fileName = `${pdfFile.name.replace('.pdf', '')}_page_${i}.jpg`;
      const file = new File([blob], fileName, { type: 'image/jpeg' });
      imageFiles.push(file);
    }
  }

  return imageFiles;
};
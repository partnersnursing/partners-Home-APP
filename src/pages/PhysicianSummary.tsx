import React from 'react';
import { PDFFormViewer } from '../components/PDFFormViewer';
 
export const PhysicianSummary: React.FC = () => (
  <PDFFormViewer
    title="Physician Summary (PSF-1)"
    description="Physician verification and validation of medical information."
    pdfPath="/pdfs/physicalsummary.pdf"
    accentColor="bg-amber-100 text-amber-600"
    formName="Physician Summary (PSF-1)"
    showBottomSubmit
  />
);

import React from 'react';
import { Upload, FileText, Plane, CheckCircle, AlertCircle, Package } from './Icons';
import { DocumentFormat } from '../types';

interface UploadStepProps {
  onFileSelect: (file: File) => void;
  selectedFormat: DocumentFormat;
  onFormatChange: (format: DocumentFormat) => void;
}

const UploadStep: React.FC<UploadStepProps> = ({ onFileSelect, selectedFormat, onFormatChange }) => {
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      onFileSelect(e.target.files[0]);
    }
  };

  const formats = [
    { code: 'FORMAT_A_STD', label: 'Standard Invoice', group: 'STD' },
    { code: 'FORMAT_B_COMPLEX', label: 'Complex Invoice', group: 'CMPLX' },
    { code: 'FORMAT_C_COMBINED', label: 'Invoice + PL', group: 'CMB' },
    { code: 'FORMAT_D_CUSTOMS', label: 'Customs Doc', group: 'CUST' },
  ];

  return (
    <div className="w-full max-w-5xl mx-auto space-y-8">
      
      <div className="text-center mb-8">
        <h2 className="text-3xl font-bold text-slate-800">Seleccione Tipo de Documento</h2>
        <p className="text-slate-500 mt-2">Elija el formato para comenzar la extracción inteligente</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        
        {/* CARD 1: PDF PROCESSING (Active) */}
        <div className="bg-white rounded-2xl shadow-xl border-2 border-indigo-600 overflow-hidden flex flex-col relative">
          <div className="absolute top-0 right-0 bg-indigo-600 text-white text-xs font-bold px-3 py-1 rounded-bl-lg">
            ACTIVO CON IA
          </div>
          
          <div className="p-6 border-b border-slate-100 bg-indigo-50/50">
            <div className="flex items-center gap-4 mb-4">
              <div className="p-3 bg-indigo-100 text-indigo-600 rounded-lg">
                <FileText className="w-8 h-8" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-slate-800">Documentos (PDF)</h3>
                <p className="text-sm text-slate-500">Procesamiento visual con Gemini 2.5</p>
              </div>
            </div>

            {/* Inline Selector */}
            <div className="mt-4">
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 block">
                Formatos Soportados:
              </label>
              <div className="flex flex-wrap gap-2">
                {formats.map((fmt) => (
                  <button
                    key={fmt.code}
                    onClick={() => onFormatChange(fmt.code as DocumentFormat)}
                    className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all border ${
                      selectedFormat === fmt.code
                        ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                        : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300 hover:text-indigo-600'
                    }`}
                  >
                    {fmt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Upload Zone */}
          <div className="flex-1 p-6 bg-white flex flex-col justify-center">
             <label className="flex flex-col items-center justify-center w-full h-40 border-2 border-indigo-200 border-dashed rounded-xl cursor-pointer hover:bg-indigo-50 hover:border-indigo-400 transition-all group">
                <div className="flex flex-col items-center justify-center pt-5 pb-6">
                    <Upload className="w-8 h-8 text-indigo-300 group-hover:text-indigo-500 mb-2 transition-colors" />
                    <p className="mb-1 text-sm text-slate-600 font-medium">Subir PDF</p>
                    <p className="text-xs text-slate-400">Clic o arrastrar archivo aquí</p>
                </div>
                <input 
                    type="file" 
                    className="hidden" 
                    accept=".pdf, application/pdf"
                    onChange={handleFileChange}
                />
            </label>
          </div>
        </div>

        {/* CARD 2: EXCEL PROCESSING (Disabled) */}
        <div className="bg-slate-50 rounded-2xl border-2 border-slate-200 flex flex-col opacity-75 relative overflow-hidden">
           {/* Coming Soon Overlay */}
           <div className="absolute inset-0 bg-slate-100/50 z-10 flex items-center justify-center backdrop-blur-[1px]">
              <div className="bg-white/90 px-6 py-2 rounded-full shadow-sm border border-slate-200 flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-orange-400 animate-pulse"></div>
                <span className="text-sm font-semibold text-slate-600">Próximamente: Algoritmo Nativo</span>
              </div>
           </div>

           <div className="p-6 border-b border-slate-200">
            <div className="flex items-center gap-4 mb-4">
              <div className="p-3 bg-slate-200 text-slate-400 rounded-lg">
                <Package className="w-8 h-8" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-slate-400">Excel / CSV Parser</h3>
                <p className="text-sm text-slate-400">Procesamiento algorítmico sin IA</p>
              </div>
            </div>
            
            <div className="mt-4">
               <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2 block">
                Formatos Compatibles:
              </label>
              <div className="flex gap-2">
                 <span className="px-3 py-1.5 rounded-md text-sm font-medium bg-slate-100 text-slate-300 border border-slate-200">XLSX</span>
                 <span className="px-3 py-1.5 rounded-md text-sm font-medium bg-slate-100 text-slate-300 border border-slate-200">CSV</span>
              </div>
            </div>
           </div>

           <div className="flex-1 p-6 flex flex-col justify-center">
             <div className="w-full h-40 border-2 border-slate-200 border-dashed rounded-xl flex items-center justify-center">
                <span className="text-slate-300 text-sm">Carga deshabilitada</span>
             </div>
           </div>
        </div>

      </div>

    </div>
  );
};

export default UploadStep;
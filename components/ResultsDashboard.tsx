
import React, { useState } from 'react';
import { BatchItem } from '../types';
import { CheckCircle, AlertCircle, FileText, Download, ArrowRight, Grid, Eye, Trash2, BrainCircuit } from './Icons';
import ValidationForm from './ValidationForm';
import { getConfidenceColor, getConfidenceLabel, downloadAsJSON } from '../utils/helpers';

interface ResultsDashboardProps {
  results: BatchItem[];
  onBack: () => void;
  onClearHistory?: () => void;
  onUpdateItem?: (item: BatchItem) => void; // Call back to update parent
}

const ResultsDashboard: React.FC<ResultsDashboardProps> = ({ results, onBack, onClearHistory, onUpdateItem }) => {
  const [viewingItem, setViewingItem] = useState<BatchItem | null>(null);
  const successCount = results.filter(r => r.status === 'SUCCESS').length;
  const errorCount = results.filter(r => r.status === 'ERROR').length;

  const handleDownloadAll = () => {
    const cleanData = results
      .filter(r => r.status === 'SUCCESS' && r.result)
      .map(r => ({
        filename: r.fileName,
        processedAt: r.processedAt,
        ...r.result
      }));
    downloadAsJSON(cleanData, `TCBV_SESSION_EXPORT_${new Date().getTime()}.json`);
  };

  if (viewingItem && viewingItem.result) {
      return (
          // Reduced padding for modal mode to fit minimalist design
          <div className="p-4 h-full bg-slate-100 dark:bg-slate-900 overflow-hidden flex items-center justify-center">
             <ValidationForm 
                data={viewingItem.result} 
                onSave={(updatedData) => {
                    if (onUpdateItem) {
                        onUpdateItem({
                            ...viewingItem,
                            result: updatedData,
                        });
                    }
                    setViewingItem(null);
                }}
                onCancel={() => setViewingItem(null)}
             />
          </div>
      );
  }

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6 h-full flex flex-col">
      {/* Header Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 flex items-center gap-4">
          <div className="p-3 bg-indigo-100 dark:bg-indigo-900/50 text-indigo-600 rounded-lg">
             <FileText className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm text-slate-500 dark:text-slate-400">Archivos Acumulados</p>
            <p className="text-2xl font-bold text-slate-800 dark:text-white">{results.length}</p>
          </div>
        </div>
        
        <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 flex items-center gap-4">
          <div className="p-3 bg-green-100 dark:bg-green-900/50 text-green-600 rounded-lg">
             <CheckCircle className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm text-slate-500 dark:text-slate-400">Total Exitosos</p>
            <p className="text-2xl font-bold text-slate-800 dark:text-white">{successCount}</p>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 flex items-center gap-4">
          <div className="p-3 bg-red-100 dark:bg-red-900/50 text-red-600 rounded-lg">
             <AlertCircle className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm text-slate-500 dark:text-slate-400">Total Fallidos</p>
            <p className="text-2xl font-bold text-slate-800 dark:text-white">{errorCount}</p>
          </div>
        </div>
      </div>

      {/* Action Bar */}
      <div className="flex justify-between items-center bg-white dark:bg-slate-800 p-4 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700">
         <h2 className="text-lg font-bold text-slate-800 dark:text-white flex items-center gap-2">
            Historial de Sesión
            <span className="text-xs font-normal text-slate-400 px-2 py-1 bg-slate-100 dark:bg-slate-700 rounded-full">
               En memoria
            </span>
         </h2>
         <div className="flex gap-3">
            {results.length > 0 && onClearHistory && (
                <button 
                  onClick={onClearHistory}
                  className="px-3 py-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                  title="Limpiar historial"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
            )}
            <button 
              onClick={onBack}
              className="px-4 py-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors text-sm font-medium flex items-center gap-2"
            >
               Procesar más
               <ArrowRight className="w-4 h-4" />
            </button>
            <button 
              onClick={handleDownloadAll}
              disabled={successCount === 0}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors text-sm font-medium flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Download className="w-4 h-4" /> Exportar Todo JSON
            </button>
         </div>
      </div>

      {/* Results Table */}
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden flex-1 flex flex-col">
        <div className="overflow-auto flex-1">
          {results.length === 0 ? (
             <div className="h-full flex flex-col items-center justify-center text-slate-400 p-12">
                <FileText className="w-12 h-12 mb-4 opacity-20" />
                <p>No hay facturas procesadas en esta sesión.</p>
             </div>
          ) : (
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-900 uppercase border-b border-slate-200 dark:border-slate-700 sticky top-0 z-10">
              <tr>
                <th className="px-6 py-3">Estado</th>
                <th className="px-6 py-3">Archivo</th>
                <th className="px-6 py-3">Invoice #</th>
                <th className="px-6 py-3 text-right">Piezas</th>
                <th className="px-6 py-3 text-right">Valor Total</th>
                {/* CONFIDENCE COLUMN */}
                <th className="px-6 py-3 text-center">Fiabilidad</th> 
                <th className="px-6 py-3 text-center">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
              {results.map((item) => {
                const confidence = item.result?.confidenceScore || 0;
                const isLowConfidence = item.status === 'SUCCESS' && confidence < 75;
                
                return (
                <tr key={item.id} className={`hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors ${isLowConfidence ? 'bg-red-50/50 dark:bg-red-900/10' : ''}`}>
                  <td className="px-6 py-4">
                    {item.status === 'SUCCESS' ? (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300">
                        OK
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300">
                        Error
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 font-medium text-slate-900 dark:text-white">
                    {item.fileName}
                    {item.error && <div className="text-xs text-red-500 mt-1">{item.error}</div>}
                  </td>
                  <td className="px-6 py-4 text-slate-500 dark:text-slate-400 font-mono">
                    {item.result?.invoiceNumber || '-'}
                  </td>
                  <td className="px-6 py-4 text-right font-mono text-slate-600 dark:text-slate-300">
                    {item.result?.totalPieces || '-'}
                  </td>
                  <td className="px-6 py-4 text-right font-mono text-emerald-600 dark:text-emerald-400 font-medium">
                    {item.result?.totalValue ? `$${item.result.totalValue}` : '-'}
                  </td>
                  
                  {/* CONFIDENCE COLUMN WITH PULSE */}
                  <td className="px-6 py-4 text-center">
                    {item.status === 'SUCCESS' && item.result?.confidenceScore !== undefined ? (
                       <div className="flex flex-col items-center gap-1">
                          <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold border ${getConfidenceColor(item.result.confidenceScore)} ${isLowConfidence ? 'animate-pulse shadow-md shadow-red-200 dark:shadow-red-900/50' : ''}`}>
                             <BrainCircuit className="w-3 h-3" />
                             {item.result.confidenceScore}% {getConfidenceLabel(item.result.confidenceScore)}
                          </span>
                       </div>
                    ) : (
                       <span className="text-slate-300">-</span>
                    )}
                  </td>

                  <td className="px-6 py-4 text-center">
                     {item.status === 'SUCCESS' && (
                        <button 
                           onClick={() => setViewingItem(item)}
                           className={`p-2 rounded-lg transition-colors ${isLowConfidence ? 'text-red-600 bg-red-100 hover:bg-red-200' : 'text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50'}`}
                           title="Ver detalle"
                        >
                           <Eye className="w-5 h-5" />
                        </button>
                     )}
                  </td>
                </tr>
              )})}
            </tbody>
          </table>
          )}
        </div>
      </div>
    </div>
  );
};

export default ResultsDashboard;

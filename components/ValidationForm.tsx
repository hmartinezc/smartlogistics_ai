
import React, { useEffect, useState } from 'react';
import { InvoiceData, InvoiceItem } from '../types';
import { Save, Package, FileText, BrainCircuit, AlertCircle, FileWarning, AlertTriangle, ChevronDown, CheckCircle, X } from './Icons';

interface ValidationFormProps {
  data: InvoiceData;
  onSave: (data: InvoiceData) => void;
  onCancel: () => void;
}

const ValidationForm: React.FC<ValidationFormProps> = ({ data: initialData, onSave, onCancel }) => {
  const [formData, setFormData] = React.useState<InvoiceData>(initialData);
  const [calculatedPieces, setCalculatedPieces] = useState(0);
  const [calculatedEq, setCalculatedEq] = useState(0);
  const [calculatedValue, setCalculatedValue] = useState(0); // For footer display
  const [realTimeScore, setRealTimeScore] = useState(initialData.confidenceScore);
  const [showHeaderDetails, setShowHeaderDetails] = useState(true); // Toggle to collapse header

  // Auto-recalculate totals when lines change
  useEffect(() => {
    const newTotalPieces = formData.lineItems.reduce((sum, item) => sum + (item.totalPieces || 0), 0);
    const newTotalEq = formData.lineItems.reduce((sum, item) => sum + (item.eqFull || 0), 0);
    const newTotalValue = formData.lineItems.reduce((sum, item) => sum + (item.totalValue || 0), 0);
    const newTotalStems = formData.lineItems.reduce((sum, item) => sum + (item.totalStems || 0), 0);

    setCalculatedPieces(newTotalPieces);
    setCalculatedEq(newTotalEq);
    setCalculatedValue(newTotalValue);

    setFormData(prev => ({
        ...prev,
        // We do NOT overwrite header totals automatically to allow discrepancy detection
        totalValue: parseFloat(newTotalValue.toFixed(2)),
        totalStems: newTotalStems
    }));
  }, [formData.lineItems]);

  // DISCREPANCY LOGIC
  const isPiecesMismatch = formData.totalPieces > 0 && calculatedPieces !== formData.totalPieces;
  const isEqMismatch = formData.totalEq > 0 && Math.abs(calculatedEq - formData.totalEq) > 0.05;
  const hasCriticalErrors = isPiecesMismatch || isEqMismatch;

  // DYNAMIC SCORE ADJUSTMENT
  useEffect(() => {
      let adjustedScore = initialData.confidenceScore;
      if (isPiecesMismatch) adjustedScore = Math.min(adjustedScore, 55); 
      if (isEqMismatch) adjustedScore = Math.min(adjustedScore, 50);
      setRealTimeScore(adjustedScore);
  }, [isPiecesMismatch, isEqMismatch, initialData.confidenceScore]);

  const handleHeaderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    if (name === 'totalPieces' || name === 'totalEq') {
        setFormData(prev => ({ ...prev, [name]: parseFloat(value) || 0 }));
    } else {
        setFormData(prev => ({ ...prev, [name]: value }));
    }
  };

  const handleItemChange = (index: number, field: keyof InvoiceItem, value: string) => {
    const newLineItems = [...formData.lineItems];
    const numFields = ['totalPieces', 'eqFull', 'totalStems', 'unitPrice', 'totalValue'];
    
    // @ts-ignore
    newLineItems[index] = { 
        ...newLineItems[index], 
        [field]: numFields.includes(field) ? parseFloat(value) || 0 : value 
    };
    
    setFormData(prev => ({ ...prev, lineItems: newLineItems }));
  };

  const getScoreColor = (score: number) => {
    if (score >= 90) return 'text-emerald-600 bg-emerald-50 border-emerald-200';
    if (score >= 70) return 'text-amber-600 bg-amber-50 border-amber-200';
    return 'text-rose-600 bg-rose-50 border-rose-200 animate-pulse';
  };

  // Estilos minimalistas
  const inputBase = "w-full bg-transparent border-b border-transparent hover:border-slate-300 focus:border-indigo-500 text-slate-700 text-xs font-medium py-1 outline-none transition-colors";
  const labelBase = "text-[10px] font-bold text-slate-400 uppercase tracking-wider";

  return (
    <div className={`w-full max-w-6xl mx-auto bg-white rounded-lg shadow-xl overflow-hidden flex flex-col h-[85vh] border ${hasCriticalErrors ? 'border-rose-400' : 'border-slate-200'}`}>
      
      {/* 1. COMPACT TOOLBAR */}
      <div className="h-14 px-4 border-b border-slate-100 flex justify-between items-center bg-white shrink-0 z-20">
        <div className="flex items-center gap-4">
            <div className={`flex items-center gap-2 px-3 py-1 rounded-full border ${getScoreColor(realTimeScore)}`}>
               <BrainCircuit className="w-4 h-4" />
               <span className="text-xs font-bold">{realTimeScore}% Fiabilidad</span>
            </div>
            <h2 className="text-slate-800 font-bold text-sm flex items-center gap-2">
                <FileText className="w-4 h-4 text-slate-400" />
                Revisión de Extracción
                <span className="text-slate-400 font-normal">| {formData.invoiceNumber}</span>
            </h2>
        </div>

        <div className="flex gap-2">
          <button onClick={onCancel} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-lg transition-colors">
            <X className="w-5 h-5" />
          </button>
          
          <button 
            onClick={() => onSave(formData)} 
            className={`px-4 py-1.5 rounded-lg font-bold text-xs flex items-center gap-2 transition-colors ${
                hasCriticalErrors 
                ? 'bg-rose-100 text-rose-700 hover:bg-rose-200 border border-rose-200' 
                : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm'
            }`}
          >
            {hasCriticalErrors ? <AlertTriangle className="w-3 h-3" /> : <Save className="w-3 h-3" />}
            {hasCriticalErrors ? 'Aprobar con Riesgo' : 'Aprobar'}
          </button>
        </div>
      </div>

      {/* 2. SLIM ALERTS (Only if errors) */}
      {hasCriticalErrors && (
          <div className="bg-rose-50 border-b border-rose-100 px-4 py-2 flex items-center justify-between animate-in slide-in-from-top">
             <div className="flex items-center gap-4 text-xs">
                 {isPiecesMismatch && (
                     <span className="flex items-center gap-1 text-rose-700 font-bold">
                         <AlertCircle className="w-3 h-3" /> Error Piezas (Suma: {calculatedPieces} vs Doc: {formData.totalPieces})
                     </span>
                 )}
                 {isEqMismatch && (
                     <span className="flex items-center gap-1 text-amber-700 font-bold">
                         <AlertCircle className="w-3 h-3" /> Error EQ (Calc: {calculatedEq.toFixed(2)} vs Doc: {formData.totalEq})
                     </span>
                 )}
             </div>
             <span className="text-[10px] text-rose-500 uppercase font-bold tracking-wide">Revise los campos resaltados</span>
          </div>
      )}

      {/* 3. SCROLLABLE CONTENT AREA */}
      <div className="flex-1 overflow-y-auto bg-slate-50/50 p-4 scrollbar-thin scrollbar-thumb-slate-300">
        
        {/* A. COMPACT HEADER INFO GRID */}
        <div className="bg-white rounded-lg border border-slate-200 p-4 mb-4 shadow-sm">
            <div 
                className="flex justify-between items-center cursor-pointer mb-2"
                onClick={() => setShowHeaderDetails(!showHeaderDetails)}
            >
                <h3 className="text-xs font-bold text-slate-500 uppercase flex items-center gap-2">
                    <Package className="w-3 h-3" /> Datos Maestros & Logística
                </h3>
                <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${showHeaderDetails ? 'rotate-180' : ''}`} />
            </div>

            {showHeaderDetails && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-4 animate-in fade-in slide-in-from-top-1 duration-200">
                    <div>
                        <label className={labelBase}>Shipper</label>
                        <input name="shipperName" value={formData.shipperName} onChange={handleHeaderChange} className={inputBase} />
                    </div>
                    <div>
                        <label className={labelBase}>Consignee</label>
                        <input name="consigneeName" value={formData.consigneeName} onChange={handleHeaderChange} className={inputBase} />
                    </div>
                    <div>
                        <label className={labelBase}>MAWB</label>
                        <input name="mawb" value={formData.mawb} onChange={handleHeaderChange} className={`${inputBase} font-mono`} />
                    </div>
                    <div>
                        <label className={labelBase}>HAWB</label>
                        <input name="hawb" value={formData.hawb} onChange={handleHeaderChange} className={`${inputBase} font-mono`} />
                    </div>
                    
                    {/* Row 2 */}
                    <div>
                        <label className={labelBase}>Invoice No.</label>
                        <input name="invoiceNumber" value={formData.invoiceNumber} onChange={handleHeaderChange} className={inputBase} />
                    </div>
                    <div>
                        <label className={labelBase}>Date</label>
                        <input name="date" value={formData.date} onChange={handleHeaderChange} className={inputBase} />
                    </div>
                    <div>
                        <label className={labelBase}>DAE</label>
                        <input name="dae" value={formData.dae} onChange={handleHeaderChange} className={inputBase} />
                    </div>
                    <div>
                         <label className={labelBase}>Airline</label>
                         <input name="airline" value={formData.airline} onChange={handleHeaderChange} className={inputBase} />
                    </div>
                </div>
            )}
        </div>

        {/* B. ITEMS TABLE (The Focus) */}
        <div className={`bg-white rounded-lg border shadow-sm overflow-hidden ${hasCriticalErrors ? 'ring-2 ring-rose-100 border-rose-200' : 'border-slate-200'}`}>
             
             {/* Table Control Bar - HEADER SUMMARY */}
             <div className="bg-slate-50 px-4 py-2 border-b border-slate-200 flex justify-between items-center text-xs">
                 <span className="font-bold text-slate-600">Detalle de Ítems ({formData.lineItems.length})</span>
                 
                 <div className="flex gap-4 font-mono items-center">
                    <span className="text-[10px] text-slate-400 uppercase font-bold mr-2">Totales (Pie de Página):</span>
                    
                    <div className={`flex items-center gap-2 ${isPiecesMismatch ? 'text-rose-600' : 'text-slate-500'}`}>
                        <span>Pcs:</span>
                        <input 
                            type="number" 
                            name="totalPieces"
                            value={formData.totalPieces} 
                            onChange={handleHeaderChange}
                            className={`w-10 bg-transparent text-center font-bold border-b focus:border-indigo-500 outline-none ${isPiecesMismatch ? 'border-rose-400' : 'border-slate-300'}`}
                        />
                    </div>

                    <div className={`flex items-center gap-2 ${isEqMismatch ? 'text-amber-600' : 'text-slate-500'}`}>
                        <span>EQ:</span>
                        <input 
                            type="number" 
                            name="totalEq"
                            step="0.01"
                            value={formData.totalEq} 
                            onChange={handleHeaderChange}
                            className={`w-12 bg-transparent text-center font-bold border-b focus:border-indigo-500 outline-none ${isEqMismatch ? 'border-amber-400' : 'border-slate-300'}`}
                        />
                    </div>
                    
                    <div className="text-emerald-600 font-bold border-l border-slate-200 pl-4 ml-2">
                        Total: ${formData.totalValue}
                    </div>
                 </div>
             </div>

             <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                    <thead className="bg-white text-slate-400 uppercase font-bold border-b border-slate-100">
                        <tr>
                            <th className="px-3 py-2 w-16">Box</th>
                            <th className="px-3 py-2 w-16 text-center">Pcs</th>
                            <th className="px-3 py-2 w-16 text-center">EQ</th>
                            <th className="px-3 py-2">Description</th>
                            <th className="px-3 py-2 w-24">HTS</th>
                            <th className="px-3 py-2 w-20 text-right">Stems</th>
                            <th className="px-3 py-2 w-24 text-right">Unit Price</th>
                            <th className="px-3 py-2 w-24 text-right bg-slate-50/50">Total</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                        {formData.lineItems.map((item, index) => (
                            <tr key={index} className="hover:bg-indigo-50/30 transition-colors group">
                                <td className="p-1 px-3 align-top">
                                    <input value={item.boxType} onChange={(e) => handleItemChange(index, 'boxType', e.target.value)} className="w-full font-bold text-indigo-600 bg-transparent outline-none" />
                                </td>
                                <td className="p-1 px-3 align-top">
                                    <input type="number" value={item.totalPieces} onChange={(e) => handleItemChange(index, 'totalPieces', e.target.value)} className={`w-full text-center outline-none bg-transparent ${isPiecesMismatch ? 'text-rose-600 font-bold bg-rose-50/50 rounded' : 'text-slate-700'}`} />
                                </td>
                                <td className="p-1 px-3 align-top">
                                    <input type="number" step="0.01" value={item.eqFull} onChange={(e) => handleItemChange(index, 'eqFull', e.target.value)} className={`w-full text-center outline-none bg-transparent ${isEqMismatch ? 'text-amber-600 font-bold bg-amber-50/50 rounded' : 'text-slate-700'}`} />
                                </td>
                                <td className="p-1 px-3 align-top">
                                    <div className="flex flex-col">
                                        <input value={item.productDescription} onChange={(e) => handleItemChange(index, 'productDescription', e.target.value)} className="w-full text-slate-600 bg-transparent outline-none" />
                                        {/* SHOW VARIETIES IF PRESENT */}
                                        {item.varieties && item.varieties.length > 0 && (
                                            <div className="flex flex-wrap gap-1 mt-1">
                                                {item.varieties.map((v, i) => (
                                                    <span key={i} className="text-[10px] px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded border border-slate-200">
                                                        {v}
                                                    </span>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </td>
                                <td className="p-1 px-3 align-top">
                                    <input value={item.hts} onChange={(e) => handleItemChange(index, 'hts', e.target.value)} className="w-full font-mono text-slate-400 bg-transparent outline-none" />
                                </td>
                                <td className="p-1 px-3 align-top">
                                    <input type="number" value={item.totalStems} onChange={(e) => handleItemChange(index, 'totalStems', e.target.value)} className="w-full text-right text-slate-600 bg-transparent outline-none" />
                                </td>
                                <td className="p-1 px-3 align-top">
                                    <input type="number" step="0.0001" value={item.unitPrice} onChange={(e) => handleItemChange(index, 'unitPrice', e.target.value)} className="w-full text-right text-slate-600 bg-transparent outline-none" />
                                </td>
                                <td className="p-1 px-3 bg-slate-50/30 align-top">
                                    <input type="number" step="0.01" value={item.totalValue} onChange={(e) => handleItemChange(index, 'totalValue', e.target.value)} className="w-full text-right font-bold text-emerald-600 bg-transparent outline-none" />
                                </td>
                            </tr>
                        ))}
                    </tbody>
                    
                    {/* TABLE FOOTER SUMMARY */}
                    <tfoot className="bg-slate-100 border-t border-slate-200 font-bold text-slate-700">
                        <tr>
                            <td className="px-3 py-2 text-right text-[10px] uppercase text-slate-500">Suma Líneas:</td>
                            
                            {/* Sum Total Pieces */}
                            <td className={`px-3 py-2 text-center border-t-2 ${isPiecesMismatch ? 'border-rose-400 bg-rose-50 text-rose-700' : 'border-indigo-300 text-indigo-700'}`}>
                                {calculatedPieces}
                            </td>
                            
                            {/* Sum Total EQ */}
                            <td className={`px-3 py-2 text-center border-t-2 ${isEqMismatch ? 'border-amber-400 bg-amber-50 text-amber-700' : 'border-indigo-300 text-indigo-700'}`}>
                                {calculatedEq.toFixed(2)}
                            </td>
                            
                            <td colSpan={4} className="px-3 py-2 text-right text-[10px] uppercase text-slate-500">
                                Suma Valor:
                            </td>
                            
                            {/* Sum Total Value */}
                            <td className="px-3 py-2 text-right bg-slate-200/50 text-emerald-700 border-t-2 border-emerald-300">
                                ${calculatedValue.toFixed(2)}
                            </td>
                        </tr>
                    </tfoot>

                </table>
             </div>
        </div>

      </div>
    </div>
  );
};

export default ValidationForm;

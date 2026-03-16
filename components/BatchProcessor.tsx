
import React, { useEffect, useState, useRef } from 'react';
import { AgentType, BatchItem } from '../types';
import { api } from '../services/apiClient';
import { generateId } from '../utils/helpers';
import { Loader2, CheckCircle, AlertCircle, Zap } from './Icons';

interface BatchProcessorProps {
  files: File[];
  format: AgentType;
  onComplete: (results: BatchItem[]) => void;
}

const BatchProcessor: React.FC<BatchProcessorProps> = ({ files, format, onComplete }) => {
  const [items, setItems] = useState<BatchItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isProcessing, setIsProcessing] = useState(true);
  const hasStartedRef = useRef(false);

  // 1. Inicializar Items
  useEffect(() => {
    const initialItems = files.map(file => ({
      id: generateId(),
      file,
      fileName: file.name,
      status: 'PENDING' as const,
      processedAt: new Date().toISOString()
    }));
    setItems(initialItems);
  }, [files]);

  // 2. Lógica de Procesamiento Secuencial (Uno por uno)
  useEffect(() => {
    if (items.length === 0 || hasStartedRef.current) return;
    
    const processQueue = async () => {
      hasStartedRef.current = true;
      const results: BatchItem[] = [];

      // Iteramos sobre una COPIA de los items para tener control total
      // y no depender del estado asíncrono de React dentro del loop.
      const queue = [...items];

      for (let i = 0; i < queue.length; i++) {
        setCurrentIndex(i);
        const currentItem = queue[i];

        // A. Marcar como procesando
        setItems(prev => prev.map(item => 
          item.id === currentItem.id ? { ...item, status: 'PROCESSING' } : item
        ));

        try {
          // B. Llamada a la API
          const data = await api.extractLogisticsData(currentItem.file!, format);
          
          // C. Marcar éxito
          const successItem = { ...currentItem, status: 'SUCCESS' as const, result: data };
          results.push(successItem);
          
          setItems(prev => prev.map(item => 
            item.id === currentItem.id ? successItem : item
          ));

        } catch (error: any) {
          console.error(`Error procesando ${currentItem.fileName}`, error);
          
          // D. Marcar error
          const errorItem = { 
            ...currentItem, 
            status: 'ERROR' as const, 
            error: error.message || 'Error desconocido' 
          };
          results.push(errorItem);

          setItems(prev => prev.map(item => 
            item.id === currentItem.id ? errorItem : item
          ));
        }

        // Pequeña pausa para asegurar UI updates y no saturar
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      setIsProcessing(false);
      
      // Esperar un momento para que el usuario vea el 100% antes de cambiar de pantalla
      setTimeout(() => {
        onComplete(results);
      }, 1000);
    };

    processQueue();

  }, [items.length]); // Solo arranca cuando los items están listos

  const progressPercentage = Math.round(((currentIndex + (isProcessing ? 0 : 1)) / files.length) * 100);

  return (
    <div className="w-full max-w-4xl mx-auto p-6 space-y-8 animate-in fade-in duration-500">
      
      <div className="text-center space-y-4">
        <div className="inline-flex items-center justify-center p-4 bg-indigo-50 dark:bg-indigo-900/20 rounded-full mb-2">
            {isProcessing ? (
                <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
            ) : (
                <CheckCircle className="w-8 h-8 text-green-500" />
            )}
        </div>
        <h2 className="text-2xl font-bold text-slate-800 dark:text-white">
            {isProcessing ? 'Analizando Documentos...' : 'Procesamiento Finalizado'}
        </h2>
        <p className="text-slate-500">
           Procesando archivo {Math.min(currentIndex + 1, files.length)} de {files.length}
        </p>
      </div>

      {/* Progress Bar */}
      <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700">
         <div className="flex justify-between items-end mb-2">
            <span className="text-sm font-bold text-indigo-600 dark:text-indigo-400 uppercase flex items-center gap-2">
                <Zap className="w-4 h-4" /> Progreso
            </span>
            <span className="text-2xl font-bold text-slate-700 dark:text-white">{Math.min(progressPercentage, 100)}%</span>
         </div>
         <div className="w-full h-3 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
            <div 
                className="h-full bg-indigo-600 transition-all duration-300 ease-out"
                style={{ width: `${Math.min(progressPercentage, 100)}%` }}
            ></div>
         </div>
      </div>

      {/* List Preview */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 max-h-[400px] overflow-y-auto">
        {items.map((item) => (
            <div key={item.id} className="p-4 border-b border-slate-100 dark:border-slate-700 last:border-0 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    {item.status === 'PENDING' && <div className="w-2 h-2 rounded-full bg-slate-300" />}
                    {item.status === 'PROCESSING' && <Loader2 className="w-5 h-5 text-indigo-600 animate-spin" />}
                    {item.status === 'SUCCESS' && <CheckCircle className="w-5 h-5 text-green-500" />}
                    {item.status === 'ERROR' && <AlertCircle className="w-5 h-5 text-red-500" />}
                    
                    <span className={`text-sm ${item.status === 'PROCESSING' ? 'font-bold text-indigo-600' : 'text-slate-600'}`}>
                        {item.fileName}
                    </span>
                </div>
                {item.status === 'ERROR' && (
                    <span className="text-xs text-red-500 truncate max-w-[200px]">{item.error}</span>
                )}
            </div>
        ))}
      </div>

    </div>
  );
};

export default BatchProcessor;

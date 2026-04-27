
import React, { useEffect, useState, useRef } from 'react';
import { AgentType, BatchItem } from '../types';
import { AI_CONFIG } from '../config';
import { api } from '../services/apiClient';
import { Loader2, CheckCircle, AlertCircle, Zap } from './Icons';

interface BatchProcessorProps {
  files: File[];
  format: AgentType;
  batchId: string;
  onComplete: (results: BatchItem[]) => void;
}

const BatchProcessor: React.FC<BatchProcessorProps> = ({ files, format, batchId, onComplete }) => {
  const [items, setItems] = useState<BatchItem[]>([]);
  const [completedCount, setCompletedCount] = useState(0);
  const [activeCount, setActiveCount] = useState(0);
  const [isProcessing, setIsProcessing] = useState(true);
  const onCompleteRef = useRef(onComplete);

  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  useEffect(() => {
    let isCancelled = false;
    let hasCompleted = false;
    const initialItems = files.map((file, index) => ({
      id: `${batchId}_${index}`,
      file,
      fileName: file.name,
      status: 'PENDING' as const
    }));

    setItems(initialItems);
    setCompletedCount(0);
    setActiveCount(0);
    setIsProcessing(initialItems.length > 0 && Boolean(batchId));

    if (!batchId || initialItems.length === 0) {
      return () => {
        isCancelled = true;
      };
    }
    
    const processQueue = async () => {
      const results: BatchItem[] = new Array(initialItems.length);
      const queue = [...initialItems];
      const parallelLimit = Math.min(queue.length, AI_CONFIG.MAX_PARALLEL_BATCH_REQUESTS);
      let nextIndex = 0;

      const processItem = async () => {
        while (nextIndex < queue.length) {
          if (isCancelled) {
            return;
          }

          const currentIndex = nextIndex;
          nextIndex += 1;
          const currentItem = queue[currentIndex];

          if (!isCancelled) {
            setActiveCount(prev => prev + 1);
            setItems(prev => prev.map(item =>
              item.id === currentItem.id ? { ...item, status: 'PROCESSING' } : item
            ));
          }

          try {
            const data = await api.extractLogisticsData(currentItem.file!, format);
            if (isCancelled) {
              return;
            }

            const successItem = { ...currentItem, status: 'SUCCESS' as const, result: data, processedAt: new Date().toISOString() };
            results[currentIndex] = successItem;

            setItems(prev => prev.map(item => 
              item.id === currentItem.id ? successItem : item
            ));
          } catch (processingError: any) {
            if (isCancelled) {
              return;
            }

            console.error(`Error procesando ${currentItem.fileName}`, processingError);
            const errorItem = { 
              ...currentItem, 
              status: 'ERROR' as const, 
              error: processingError.message || 'Error desconocido',
              processedAt: new Date().toISOString()
            };
            results[currentIndex] = errorItem;

            setItems(prev => prev.map(item => 
              item.id === currentItem.id ? errorItem : item
            ));
          } finally {
            if (!isCancelled) {
              setActiveCount(prev => prev - 1);
              setCompletedCount(prev => prev + 1);
            }
          }
        }
      };

      await Promise.all(Array.from({ length: parallelLimit }, () => processItem()));

      if (isCancelled || hasCompleted) {
        return;
      }

      hasCompleted = true;
      setIsProcessing(false);
      onCompleteRef.current(results);
    };

    const startTimer = window.setTimeout(() => {
      processQueue();
    }, 0);

    return () => {
      isCancelled = true;
      window.clearTimeout(startTimer);
    };
  }, [batchId, files, format]);

  const progressPercentage = files.length === 0 ? 0 : Math.round((completedCount / files.length) * 100);

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
           {isProcessing
             ? `Procesados ${completedCount} de ${files.length} · ${activeCount} en paralelo`
             : `Procesados ${files.length} de ${files.length}`}
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

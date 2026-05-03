import React from 'react';
import { Loader2 } from './Icons';

const ProcessingStep: React.FC = () => {
  return (
    <div className="bg-white rounded-xl shadow-lg p-12 text-center max-w-md w-full mx-auto">
      <div className="relative mb-6">
        <div className="absolute inset-0 bg-indigo-100 rounded-full animate-ping opacity-25"></div>
        <div className="relative bg-white p-4 rounded-full inline-block">
          <Loader2 className="w-12 h-12 text-indigo-600 animate-spin" />
        </div>
      </div>
      <h3 className="text-xl font-bold text-slate-800 mb-2">Analyzing Document</h3>
      <p className="text-slate-500">
        Our AI is extracting Master Data, House Guides, and Dimensions from your file. This usually
        takes about 5-10 seconds.
      </p>

      <div className="mt-8 space-y-2">
        <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
          <div className="h-full bg-indigo-600 w-2/3 animate-[pulse_2s_infinite]"></div>
        </div>
        <div className="flex justify-between text-xs text-slate-400 px-1">
          <span>Reading text...</span>
          <span>Parsing tables...</span>
          <span>Validating...</span>
        </div>
      </div>
    </div>
  );
};

export default ProcessingStep;

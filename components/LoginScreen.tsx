
import React, { useState } from 'react';
import { Lock, ArrowRight, BrainCircuit, AlertCircle } from './Icons';

interface LoginScreenProps {
  onLogin: (email: string, password: string) => Promise<string | null>;
}

const LoginScreen: React.FC<LoginScreenProps> = ({ onLogin }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    const authError = await onLogin(email, password);
    if (authError) {
      setError(authError);
    }

    setIsLoading(false);
  };

  return (
    <div className="flex h-screen w-full bg-white dark:bg-slate-900 overflow-hidden">
      
      {/* Left Side - Form */}
      <div className="w-full lg:w-1/2 flex flex-col justify-center items-center p-8 lg:p-12 relative z-10">
        <div className="w-full max-w-md space-y-8 animate-in slide-in-from-left duration-700">
          
          <div className="mb-10">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 text-xs font-semibold uppercase tracking-wide mb-4 border border-indigo-100 dark:border-indigo-800">
              <BrainCircuit className="w-3 h-3" />
              Powered by Kynreh Lab AI
            </div>
            <h1 className="text-4xl font-extrabold text-slate-900 dark:text-white tracking-tight mb-2">
              Smart Invoice AI
            </h1>
            <p className="text-slate-500 dark:text-slate-400 text-lg">
              Plataforma de procesamiento documental inteligente.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            {error && (
               <div className="p-3 bg-red-50 border border-red-100 text-red-600 rounded-xl text-sm flex items-center gap-2 animate-pulse">
                  <AlertCircle className="w-4 h-4 shrink-0" /> {error}
               </div>
            )}

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Email Corporativo</label>
              <input 
                type="email" 
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-3.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all placeholder:text-slate-400"
                placeholder="admin@smart.com"
                required
              />
            </div>
            
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Contraseña</label>
              <div className="relative">
                <input 
                  type="password" 
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-4 py-3.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all placeholder:text-slate-400"
                  placeholder="••••••••"
                  required
                />
                <Lock className="absolute right-4 top-4 w-5 h-5 text-slate-400" />
              </div>
            </div>

            <button 
              type="submit" 
              disabled={isLoading}
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-4 rounded-xl shadow-lg shadow-indigo-500/30 hover:shadow-indigo-500/50 transition-all transform hover:-translate-y-0.5 flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <span className="flex items-center gap-2">
                  <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Verificando...
                </span>
              ) : (
                <>
                  Acceder a Plataforma <ArrowRight className="w-5 h-5" />
                </>
              )}
            </button>
          </form>

            <div className="mt-8 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">
              Inicia sesión con tus credenciales para acceder al sistema.
            </div>
        </div>
      </div>

      {/* Right Side - Visuals */}
      <div className="hidden lg:flex w-1/2 bg-slate-900 relative items-center justify-center overflow-hidden">
        {/* Abstract Background */}
        <div className="absolute inset-0 bg-gradient-to-br from-indigo-900 via-slate-900 to-black z-0"></div>
        <div className="absolute inset-0 opacity-20 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] z-0"></div>
        
        {/* Glowing Orbs */}
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-indigo-500/30 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-blue-500/20 rounded-full blur-3xl animate-pulse delay-700"></div>

        <div className="relative z-10 p-12 text-white max-w-xl">
           <div className="bg-white/10 backdrop-blur-lg border border-white/10 p-8 rounded-3xl shadow-2xl animate-in fade-in zoom-in duration-1000">
              <div className="mb-6">
                 <div className="w-16 h-16 bg-gradient-to-tr from-indigo-500 to-purple-500 rounded-2xl flex items-center justify-center shadow-lg mb-4">
                    <BrainCircuit className="w-8 h-8 text-white" />
                 </div>
                 <h2 className="text-3xl font-bold mb-2">IA Financiera</h2>
                 <p className="text-indigo-200 leading-relaxed">
                   Automatiza la ingesta de facturas comerciales complejas, packing lists y documentos de aduana con visión artificial cognitiva.
                 </p>
              </div>
              <div className="space-y-4">
                 <div className="flex items-center gap-4 p-4 bg-slate-800/50 rounded-xl border border-white/5">
                    <div className="h-2 w-2 rounded-full bg-green-400 shadow-[0_0_10px_rgba(74,222,128,0.5)]"></div>
                    <div className="text-sm font-mono text-indigo-300">
                       Validando estructura de facturas...
                    </div>
                 </div>
              </div>
           </div>
        </div>
      </div>
    </div>
  );
};

export default LoginScreen;

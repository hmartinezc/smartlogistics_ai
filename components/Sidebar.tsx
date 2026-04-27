
import React, { useEffect, useRef, useState } from 'react';
import { 
   Package, LayoutDashboard, BrainCircuit, History, LogOut, Moon, Sun, Shield, Users, Building, ChevronDown, ChevronLeft, ChevronRight, Trash2, Search, Globe
} from './Icons';
import { AppState, UserRole, Agency } from '../types';
import { canRoleAccessAppState } from '../services/authService';

const SIDEBAR_PREF_KEY = 'sidebar-expanded-v1';

type SidebarTooltip = {
   title: string;
   description?: string;
   top: number;
} | null;

interface SidebarProps {
  currentTab: AppState;
  onNavigate: (tab: AppState) => void;
  onLogout: () => void;
  isDarkMode: boolean;
  onToggleTheme: () => void;
  userRole: UserRole;
  userName: string;
  
  // Context Switcher Props
  availableAgencies: Agency[];
  currentAgencyId: string;
  onSwitchAgency: (id: string) => void;
}

const Sidebar: React.FC<SidebarProps> = ({ 
  currentTab, onNavigate, onLogout, isDarkMode, onToggleTheme, userRole, userName,
  availableAgencies, currentAgencyId, onSwitchAgency
}) => {
   const isAdmin = canRoleAccessAppState(userRole, AppState.DASHBOARD_ADMIN);

   // Collapsed by default; persists user preference.
   const [isExpanded, setIsExpanded] = useState<boolean>(() => {
      if (typeof window === 'undefined') return false;
      const stored = window.localStorage.getItem(SIDEBAR_PREF_KEY);
      return stored === 'true';
   });
   const [tooltip, setTooltip] = useState<SidebarTooltip>(null);
   const [isAgencyMenuOpen, setIsAgencyMenuOpen] = useState(false);
   const [agencySearch, setAgencySearch] = useState('');
   const agencyMenuRef = useRef<HTMLDivElement | null>(null);
   const agencySearchInputRef = useRef<HTMLInputElement | null>(null);

   useEffect(() => {
      try {
         window.localStorage.setItem(SIDEBAR_PREF_KEY, String(isExpanded));
      } catch { /* ignore */ }
   }, [isExpanded]);

   const showLabels = isExpanded;
   const currentAgency = availableAgencies.find((agency) => agency.id === currentAgencyId);
   const selectedAgencyLabel = currentAgencyId === 'GLOBAL' ? 'Vista Global' : currentAgency?.name ?? 'Agencia';
   const selectedAgencyDescription = currentAgencyId === 'GLOBAL'
      ? 'Todas las agencias'
      : currentAgency?.isActive === false ? 'Agencia suspendida' : 'Agencia activa';
   const agencyOptionCount = availableAgencies.length + (isAdmin ? 1 : 0);
   const normalizedAgencySearch = agencySearch.trim().toLowerCase();
   const compactAgencySearch = normalizedAgencySearch.replace(/[^a-z0-9]/g, '');
   const isSearchingAgency = normalizedAgencySearch.length > 0;
   const filteredAgencies = isSearchingAgency
      ? availableAgencies.filter((agency) => {
         const normalizedName = agency.name.toLowerCase();
         const compactName = normalizedName.replace(/[^a-z0-9]/g, '');
         const normalizedId = agency.id.toLowerCase();
         return normalizedName.includes(normalizedAgencySearch)
            || normalizedId.includes(normalizedAgencySearch)
            || Boolean(compactAgencySearch && compactName.includes(compactAgencySearch));
      })
      : availableAgencies;

   const openTooltip = (event: React.MouseEvent<HTMLElement>, title: string, description?: string) => {
      if (showLabels) return;
      const rect = event.currentTarget.getBoundingClientRect();
      setTooltip({ title, description, top: rect.top + rect.height / 2 });
   };

   const closeTooltip = () => setTooltip(null);

   useEffect(() => {
      if (!isAgencyMenuOpen) {
         setAgencySearch('');
         return;
      }

      window.setTimeout(() => agencySearchInputRef.current?.focus(), 0);

      const handleClickOutside = (event: MouseEvent) => {
         if (!agencyMenuRef.current) {
            return;
         }

         const target = event.target;
         if (target instanceof Node && !agencyMenuRef.current.contains(target)) {
            setIsAgencyMenuOpen(false);
         }
      };

      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
   }, [isAgencyMenuOpen]);

   useEffect(() => {
      if (!showLabels) {
         setIsAgencyMenuOpen(false);
      }
   }, [showLabels]);

   const handleAgencySelect = (agencyId: string) => {
      onSwitchAgency(agencyId);
      setAgencySearch('');
      setIsAgencyMenuOpen(false);
   };
  
  // Base Menu (For everyone)
  const menuItems = [
    { 
         id: AppState.DASHBOARD_PANEL,
         label: 'Panel', 
      icon: LayoutDashboard,
         desc: 'Facturado por AWB'
    },
    { 
      id: AppState.PROCESS_SELECTION, 
      label: 'Agentes IA', 
      icon: BrainCircuit,
      desc: 'Procesar Facturas'
    },
    { 
      id: AppState.HISTORY_RESULTS, 
      label: 'Historial', 
      icon: History,
      desc: 'Resultados Auditados'
      },
      {
         id: AppState.PRODUCT_MATCHES,
         label: 'Match Productos',
         icon: Search,
         desc: 'Catálogo por agencia'
    },
      {
         id: AppState.DATA_CLEANUP,
         label: 'Datos Extraídos',
         icon: Trash2,
         desc: 'Buscar y limpiar'
    }
  ];

  // Admin Specific Items
      if (isAdmin) {
   menuItems.unshift({
      id: AppState.DASHBOARD_OPS,
      label: 'Panel Operativo',
      icon: LayoutDashboard,
      desc: 'Conciliación y Log'
   });

    menuItems.unshift({
        id: AppState.DASHBOARD_ADMIN,
        label: 'Admin Metrics',
        icon: Shield,
        desc: 'Consumo IA y Costos'
    });

   menuItems.push({
        id: AppState.AGENCY_CONFIG,
        label: 'Config. Agencias',
        icon: Building,
        desc: 'Planes y Entidades'
    });

   menuItems.push({
        id: AppState.USER_MANAGEMENT,
        label: 'Gestión Usuarios',
        icon: Users,
        desc: 'Accesos y Roles'
    });
  }

  return (
    <>
      {/* Spacer reserves the same width as the fixed sidebar */}
      <div
         aria-hidden="true"
         className={`shrink-0 transition-[width] duration-300 ease-in-out ${isExpanded ? 'w-72' : 'w-20'}`}
      />

      <aside
         className={`fixed top-0 left-0 z-40 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 h-screen flex flex-col transition-[width,box-shadow] duration-300 ease-in-out ${
            showLabels ? 'w-72' : 'w-20'
         }`}
      >
      
      {/* Brand Header */}
      <div className={`border-b border-slate-100 dark:border-slate-800 ${showLabels ? 'p-6' : 'p-4'}`}>
        <div className={`flex items-center ${showLabels ? 'gap-3' : 'justify-center'}`}>
           <div
              className="bg-indigo-600 text-white p-2.5 rounded-xl shadow-lg shadow-indigo-500/30 shrink-0"
              onMouseEnter={(event) => openTooltip(event, 'Smart Invoice', 'AI Platform v2.0')}
              onMouseLeave={closeTooltip}
           >
              <Package className="w-6 h-6" />
           </div>
           {showLabels && (
              <div className="overflow-hidden">
                 <h1 className="text-lg font-bold text-slate-900 dark:text-white leading-tight tracking-tight whitespace-nowrap">Smart Invoice</h1>
                 <p className="text-[10px] text-indigo-500 font-bold uppercase tracking-wider whitespace-nowrap">AI Platform v2.0</p>
              </div>
           )}
        </div>
      </div>

      {/* Agency Context Switcher */}
      <div className={showLabels ? 'px-4 pt-4' : 'px-3 pt-4'}>
         {showLabels ? (
            <>
               <p className="px-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                   Contexto Agencia
               </p>
               <div className="relative" ref={agencyMenuRef}>
                  <button
                     type="button"
                     onClick={() => setIsAgencyMenuOpen((current) => !current)}
                     className="group flex h-[42px] w-full items-center gap-2.5 rounded-lg border border-slate-200 bg-gradient-to-br from-white via-slate-50 to-slate-100 px-3 text-left shadow-sm transition-all hover:border-indigo-200 hover:shadow-md dark:border-slate-700 dark:from-slate-900 dark:via-slate-900 dark:to-slate-800 dark:hover:border-indigo-500/50"
                     aria-haspopup="listbox"
                     aria-expanded={isAgencyMenuOpen}
                  >
                     <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-indigo-100 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-300">
                        {currentAgencyId === 'GLOBAL' ? <Globe className="h-4 w-4" /> : <Building className="h-4 w-4" />}
                     </div>
                     <div className="min-w-0 flex-1">
                        <p className="text-[9px] font-bold uppercase leading-none tracking-[0.16em] text-slate-400 dark:text-slate-500">
                           Agencia
                        </p>
                        <p className="truncate text-sm font-semibold leading-tight text-slate-800 dark:text-white">
                           {selectedAgencyLabel}
                        </p>
                     </div>
                     <div className="rounded-full bg-slate-200/70 px-2 py-0.5 text-xs font-bold text-slate-600 dark:bg-slate-700 dark:text-slate-200">
                        {agencyOptionCount}
                     </div>
                     <ChevronDown className={`h-4 w-4 shrink-0 text-slate-400 transition-transform duration-200 ${isAgencyMenuOpen ? 'rotate-180 text-indigo-500' : 'group-hover:text-slate-600 dark:group-hover:text-slate-200'}`} />
                  </button>

                  {isAgencyMenuOpen && (
                     <div className="absolute left-0 right-0 z-50 mt-2 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl shadow-slate-200/80 dark:border-slate-700 dark:bg-slate-900 dark:shadow-black/40">
                        <div className="border-b border-slate-100 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-950/70">
                           <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-slate-400">Contexto</p>
                           <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">{selectedAgencyDescription}</p>
                           <div className="relative mt-3">
                              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                              <input
                                 ref={agencySearchInputRef}
                                 value={agencySearch}
                                 onChange={(event) => setAgencySearch(event.target.value)}
                                 onKeyDown={(event) => {
                                    if (event.key === 'Enter' && filteredAgencies.length === 1) {
                                       handleAgencySelect(filteredAgencies[0].id);
                                    }
                                 }}
                                 placeholder="Buscar agencia..."
                                 className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm font-medium text-slate-700 outline-none transition-shadow placeholder:text-slate-400 focus:ring-2 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                              />
                           </div>
                        </div>

                        <div className="max-h-64 space-y-1 overflow-auto p-2" role="listbox">
                           {isAdmin && !isSearchingAgency && (
                              <button
                                 type="button"
                                 onClick={() => handleAgencySelect('GLOBAL')}
                                 className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors ${currentAgencyId === 'GLOBAL' ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-200' : 'text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800'}`}
                                 role="option"
                                 aria-selected={currentAgencyId === 'GLOBAL'}
                              >
                                 <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${currentAgencyId === 'GLOBAL' ? 'bg-white text-indigo-600 shadow-sm dark:bg-slate-900 dark:text-indigo-300' : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'}`}>
                                    <Globe className="h-4 w-4" />
                                 </div>
                                 <div className="min-w-0 flex-1">
                                    <p className="text-sm font-semibold">Vista Global</p>
                                    <p className="text-xs text-slate-400 dark:text-slate-500">Todas las agencias</p>
                                 </div>
                              </button>
                           )}

                           {filteredAgencies.map((agency) => {
                              const isSelected = currentAgencyId === agency.id;

                              return (
                                 <button
                                    key={agency.id}
                                    type="button"
                                    onClick={() => handleAgencySelect(agency.id)}
                                    className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors ${isSelected ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-200' : 'text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800'}`}
                                    role="option"
                                    aria-selected={isSelected}
                                 >
                                    <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${isSelected ? 'bg-white text-indigo-600 shadow-sm dark:bg-slate-900 dark:text-indigo-300' : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'}`}>
                                       <Building className="h-4 w-4" />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                       <p className="truncate text-sm font-semibold">{agency.name}</p>
                                       <p className={`text-xs ${agency.isActive ? 'text-slate-400 dark:text-slate-500' : 'text-rose-500 dark:text-rose-300'}`}>
                                          {agency.isActive ? 'Agencia activa' : 'Agencia suspendida'}
                                       </p>
                                    </div>
                                 </button>
                              );
                           })}

                           {filteredAgencies.length === 0 && (
                              <div className="px-3 py-6 text-center text-sm text-slate-400 dark:text-slate-500">
                                 No hay agencias que coincidan.
                              </div>
                           )}
                        </div>
                     </div>
                  )}
               </div>
            </>
         ) : (
            (() => {
               const current = currentAgencyId === 'GLOBAL'
                  ? 'Vista Global (Todas)'
                  : availableAgencies.find(a => a.id === currentAgencyId)?.name ?? 'Agencia';
               return (
                  <button
                     type="button"
                     onClick={() => setIsExpanded(true)}
                     onMouseEnter={(event) => openTooltip(event, 'Contexto Agencia', current)}
                     onMouseLeave={closeTooltip}
                     className="mx-auto flex h-10 w-11 items-center justify-center rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-300 hover:text-indigo-600 hover:border-indigo-200 transition-colors"
                  >
                     <Building className="w-5 h-5" />
                  </button>
               );
            })()
         )}
      </div>

      {/* Navigation Menu */}
      <div className={`sidebar-menu-scroll flex-1 min-h-0 py-4 space-y-1.5 overflow-y-auto ${showLabels ? 'pl-4 pr-3' : 'sidebar-menu-scroll--collapsed px-0 flex flex-col items-center'}`}>
         {showLabels && (
            <p className="px-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 mt-2">Navegación</p>
         )}
         
         {menuItems.map((item) => {
            const isActive = currentTab === item.id || 
                             (item.id === AppState.PROCESS_SELECTION && currentTab === AppState.BATCH_RUNNING);
            
            return (
              <button
                key={item.id}
                onClick={() => onNavigate(item.id)}
                        onMouseEnter={(event) => openTooltip(event, item.label, item.desc)}
                        onMouseLeave={closeTooltip}
                className={`flex items-center rounded-lg transition-all duration-200 group text-left ${
                   showLabels ? 'w-full gap-3 px-3 py-2.5' : 'h-10 w-11 justify-center'
                } ${
                  isActive 
                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-500/20' 
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-indigo-600 dark:hover:text-indigo-400'
                }`}
              >
                 <item.icon className={`w-5 h-5 shrink-0 ${isActive ? 'text-white' : 'text-slate-400 group-hover:text-indigo-600 dark:group-hover:text-indigo-400'}`} />
                 {showLabels && (
                    <div className="flex-1 min-w-0">
                       <div className="font-semibold text-sm truncate">{item.label}</div>
                       <div className={`text-[10px] truncate ${isActive ? 'text-indigo-200' : 'text-slate-400'}`}>{item.desc}</div>
                    </div>
                 )}
              </button>
            );
         })}
      </div>

      {/* User & Settings Footer */}
      <div className={`border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 ${showLabels ? 'p-4' : 'p-3'}`}>
         {showLabels ? (
            <>
               <div className="flex items-center justify-between mb-4 bg-white dark:bg-slate-800 p-3 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
                  <div className="flex items-center gap-2 overflow-hidden">
                     <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold text-xs shrink-0 ${userRole === 'ADMIN' ? 'bg-purple-600' : 'bg-indigo-500'}`}>
                        {userName.substring(0,2).toUpperCase()}
                     </div>
                     <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-slate-800 dark:text-white truncate">{userName}</p>
                        <p className="text-[10px] text-slate-400 truncate">{userRole}</p>
                     </div>
                  </div>
                  <button 
                     onClick={onToggleTheme}
                     aria-label={isDarkMode ? 'Modo claro' : 'Modo oscuro'}
                     className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 transition-colors shrink-0"
                  >
                     {isDarkMode ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4" />}
                  </button>
               </div>

               <button 
                  onClick={onLogout}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-slate-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 dark:hover:text-red-400 rounded-lg transition-colors border border-transparent hover:border-red-100"
               >
                  <LogOut className="w-4 h-4" />
                  Cerrar Sesión
               </button>
            </>
         ) : (
            <div className="flex flex-col items-center gap-2">
               <div
                  onMouseEnter={(event) => openTooltip(event, userName, userRole)}
                  onMouseLeave={closeTooltip}
                  className={`w-9 h-9 rounded-lg flex items-center justify-center text-white font-bold text-xs ${userRole === 'ADMIN' ? 'bg-purple-600' : 'bg-indigo-500'}`}
               >
                  {userName.substring(0,2).toUpperCase()}
               </div>
               <button
                  onClick={onToggleTheme}
                  onMouseEnter={(event) => openTooltip(event, isDarkMode ? 'Modo claro' : 'Modo oscuro', 'Cambiar apariencia')}
                  onMouseLeave={closeTooltip}
                  className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 transition-colors"
               >
                  {isDarkMode ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4" />}
               </button>
               <button
                  onClick={onLogout}
                  onMouseEnter={(event) => openTooltip(event, 'Cerrar Sesión', 'Salir de la plataforma')}
                  onMouseLeave={closeTooltip}
                  className="p-2 rounded-lg text-slate-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 dark:hover:text-red-400 transition-colors"
               >
                  <LogOut className="w-4 h-4" />
               </button>
            </div>
         )}
      </div>

      {/* Collapse / Expand toggle (floating handle on the right edge) */}
      <button
         type="button"
         onClick={() => {
            closeTooltip();
            setIsExpanded(prev => !prev);
         }}
         onMouseEnter={(event) => openTooltip(event, isExpanded ? 'Colapsar menú' : 'Expandir menú', isExpanded ? 'Reducir a iconos' : 'Ver nombres y descripciones')}
         onMouseLeave={closeTooltip}
         aria-label={isExpanded ? 'Colapsar menú' : 'Expandir menú'}
         aria-expanded={isExpanded}
         className="absolute top-7 -right-3 z-50 w-6 h-6 rounded-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-md text-slate-500 hover:text-indigo-600 hover:border-indigo-300 dark:hover:text-indigo-400 flex items-center justify-center transition-colors"
      >
         {isExpanded ? <ChevronLeft className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
      </button>

      {tooltip && !showLabels && (
         <div
            role="tooltip"
            style={{ top: tooltip.top, left: 88 }}
            className="fixed z-[60] -translate-y-1/2 pointer-events-none"
         >
            <div className="relative min-w-44 max-w-64 rounded-lg border border-slate-700/70 bg-slate-950 px-3 py-2 shadow-xl shadow-slate-950/20 dark:border-slate-600 dark:bg-slate-800">
               <span className="absolute left-0 top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rotate-45 border-b border-l border-slate-700/70 bg-slate-950 dark:border-slate-600 dark:bg-slate-800" />
               <p className="text-xs font-semibold leading-tight text-white">{tooltip.title}</p>
               {tooltip.description && (
                  <p className="mt-1 text-[11px] leading-snug text-slate-300">{tooltip.description}</p>
               )}
            </div>
         </div>
      )}
    </aside>
    </>
  );
};

export default Sidebar;

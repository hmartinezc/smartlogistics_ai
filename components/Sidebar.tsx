
import React from 'react';
import { 
   Package, LayoutDashboard, BrainCircuit, History, LogOut, Moon, Sun, Shield, Users, Building, ChevronDown, Trash2, Search
} from './Icons';
import { AppState, UserRole, Agency } from '../types';
import { canRoleAccessAppState } from '../services/authService';

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
    <aside className="w-72 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 h-screen flex flex-col shrink-0 transition-colors duration-300">
      
      {/* Brand Header */}
      <div className="p-6 border-b border-slate-100 dark:border-slate-800">
        <div className="flex items-center gap-3">
           <div className="bg-indigo-600 text-white p-2.5 rounded-xl shadow-lg shadow-indigo-500/30">
              <Package className="w-6 h-6" />
           </div>
           <div>
              <h1 className="text-lg font-bold text-slate-900 dark:text-white leading-tight tracking-tight">Smart Invoice</h1>
              <p className="text-[10px] text-indigo-500 font-bold uppercase tracking-wider">AI Platform v2.0</p>
           </div>
        </div>
      </div>

      {/* Agency Context Switcher */}
      <div className="px-4 pt-4">
        <p className="px-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">
            Contexto Agencia
        </p>
        <div className="relative">
            <select 
                value={currentAgencyId}
                onChange={(e) => onSwitchAgency(e.target.value)}
                className="w-full appearance-none bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold py-2.5 pl-3 pr-8 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500 transition-shadow cursor-pointer truncate"
            >
                {/* Admin Option: View All */}
                  {isAdmin && (
                    <option value="GLOBAL">🌐 Vista Global (Todas)</option>
                )}
                
                {availableAgencies.map(agency => (
                    <option key={agency.id} value={agency.id}>
                       {agency.isActive ? '' : '🔴 '}{agency.name}
                    </option>
                ))}
            </select>
            <ChevronDown className="absolute right-3 top-3 w-4 h-4 text-slate-400 pointer-events-none" />
        </div>
      </div>

      {/* Navigation Menu */}
      <div className="sidebar-menu-scroll flex-1 min-h-0 py-4 pl-4 pr-3 space-y-1.5 overflow-y-auto">
         <p className="px-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 mt-2">Navegación</p>
         
         {menuItems.map((item) => {
            const isActive = currentTab === item.id || 
                             (item.id === AppState.PROCESS_SELECTION && currentTab === AppState.BATCH_RUNNING);
            
            return (
              <button
                key={item.id}
                onClick={() => onNavigate(item.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 group text-left ${
                  isActive 
                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-500/20' 
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-indigo-600 dark:hover:text-indigo-400'
                }`}
              >
                 <item.icon className={`w-5 h-5 ${isActive ? 'text-white' : 'text-slate-400 group-hover:text-indigo-600 dark:group-hover:text-indigo-400'}`} />
                 <div className="flex-1 min-w-0">
                    <div className="font-semibold text-sm truncate">{item.label}</div>
                    <div className={`text-[10px] truncate ${isActive ? 'text-indigo-200' : 'text-slate-400'}`}>{item.desc}</div>
                 </div>
              </button>
            );
         })}
      </div>

      {/* User & Settings Footer */}
      <div className="p-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50">
         
         <div className="flex items-center justify-between mb-4 bg-white dark:bg-slate-800 p-3 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
            <div className="flex items-center gap-2 overflow-hidden">
               <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold text-xs shrink-0 ${userRole === 'ADMIN' ? 'bg-purple-600' : 'bg-indigo-500'}`}>
                  {userName.substring(0,2).toUpperCase()}
               </div>
               <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-slate-800 dark:text-white truncate" title={userName}>{userName}</p>
                  <p className="text-[10px] text-slate-400 truncate">{userRole}</p>
               </div>
            </div>
            <button 
               onClick={onToggleTheme}
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
      </div>
    </aside>
  );
};

export default Sidebar;

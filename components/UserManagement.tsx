import React, { useCallback, useMemo, useState } from 'react';
import { User, UserRole, Agency } from '../types';
import { generateId } from '../utils/helpers';
import {
  Trash2,
  CheckCircle,
  AlertCircle,
  User as UserIcon,
  Shield,
  Package,
  ChevronDown,
  Pencil,
  X,
  Save,
  RefreshCw,
  Plus,
  Eye,
  EyeOff,
  Building,
  Users,
} from './Icons';

interface UserManagementProps {
  users: User[];
  agencies: Agency[];
  onAddUser: (user: User) => Promise<string | null> | string | null;
  onUpdateUser: (user: User) => Promise<string | null> | string | null;
  onDeleteUser: (id: string) => Promise<string | null>;
}

type AgencyUserGroup = {
  id: string;
  name: string;
  users: User[];
  agency?: Agency;
  isUnassigned?: boolean;
  isUnknown?: boolean;
};

const UserManagement: React.FC<UserManagementProps> = ({
  users,
  agencies,
  onAddUser,
  onUpdateUser,
  onDeleteUser,
}) => {
  // Edit Mode State
  const [editingId, setEditingId] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<UserRole>('OPERADOR');
  const [showPassword, setShowPassword] = useState(false); // State to toggle visibility

  // Multi-Agency State
  const [selectedAgencyIds, setSelectedAgencyIds] = useState<string[]>([]);
  const [selectedAgencyToAdd, setSelectedAgencyToAdd] = useState<string>('');

  const [error, setError] = useState('');
  const [expandedAgencyGroupId, setExpandedAgencyGroupId] = useState<string | null>(null);

  // Helper to generate secure password
  const generatePassword = () => {
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
    let newPass = '';
    for (let i = 0; i < 12; i++) {
      newPass += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setPassword(newPass);
    setShowPassword(true); // Show it immediately so they can see it
  };

  const resetForm = () => {
    setName('');
    setEmail('');
    setPassword('');
    setRole('OPERADOR');
    setSelectedAgencyIds([]);
    setShowPassword(false);
    // Default to first available agency for dropdown
    if (agencies.length > 0) setSelectedAgencyToAdd(agencies[0].id);

    setEditingId(null);
    setError('');
  };

  const handleEdit = (user: User) => {
    setEditingId(user.id);
    setName(user.name);
    setEmail(user.email);
    // CRITICAL CHANGE: Load existing password for Admin to see/edit
    setPassword(user.password || '');
    setRole(user.role);
    setSelectedAgencyIds([...user.agencyIds]); // Copy array
    if (agencies.length > 0) setSelectedAgencyToAdd(agencies[0].id);
    setError('');
    setShowPassword(false); // Default to hidden for security
  };

  const handleAddAgency = () => {
    if (!selectedAgencyToAdd) return;
    if (selectedAgencyIds.includes(selectedAgencyToAdd)) return;

    setSelectedAgencyIds([...selectedAgencyIds, selectedAgencyToAdd]);
  };

  const handleRemoveAgency = (idToRemove: string) => {
    setSelectedAgencyIds(selectedAgencyIds.filter((id) => id !== idToRemove));
  };

  const validateEmail = (emailToCheck: string) => {
    return String(emailToCheck)
      .toLowerCase()
      .match(
        /^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|.(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/,
      );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!validateEmail(email)) {
      setError('El formato del email no es válido.');
      return;
    }

    if (password.length < 4) {
      setError('La contraseña debe tener al menos 4 caracteres.');
      return;
    }

    // Unique Email Check
    const emailExists = users.some((u) => u.email === email && u.id !== editingId);
    if (emailExists) {
      setError('Este email ya está registrado por otro usuario.');
      return;
    }

    if (selectedAgencyIds.length === 0) {
      setError('Debe asignar al menos una agencia al usuario.');
      return;
    }

    if (editingId) {
      // UPDATE
      const existingUser = users.find((u) => u.id === editingId);
      if (existingUser) {
        const submitError = await onUpdateUser({
          ...existingUser,
          name,
          email,
          role,
          agencyIds: selectedAgencyIds,
          password: password, // Save current value of input
        });

        if (submitError) {
          setError(submitError);
          return;
        }
      }
    } else {
      // CREATE
      const newUser: User = {
        id: generateId(),
        name,
        email,
        password,
        role,
        agencyIds: selectedAgencyIds,
        isActive: true,
      };
      const submitError = await onAddUser(newUser);
      if (submitError) {
        setError(submitError);
        return;
      }
    }

    resetForm();
  };

  const agencyLookup = useMemo(
    () => new Map(agencies.map((agency) => [agency.id, agency])),
    [agencies],
  );

  const getAgencyName = useCallback(
    (id: string) => agencyLookup.get(id)?.name || 'Agencia no registrada',
    [agencyLookup],
  );

  const agencyUserGroups = useMemo<AgencyUserGroup[]>(() => {
    const groupsById = new Map<string, AgencyUserGroup>();

    agencies.forEach((agency) => {
      groupsById.set(agency.id, {
        id: agency.id,
        name: agency.name,
        agency,
        users: [],
      });
    });

    const unassignedGroup: AgencyUserGroup = {
      id: '__unassigned__',
      name: 'Sin agencia asignada',
      users: [],
      isUnassigned: true,
    };

    users.forEach((user) => {
      const uniqueAgencyIds = Array.from(new Set(user.agencyIds));

      if (uniqueAgencyIds.length === 0) {
        unassignedGroup.users.push(user);
        return;
      }

      uniqueAgencyIds.forEach((agencyId) => {
        let group = groupsById.get(agencyId);

        if (!group) {
          group = {
            id: agencyId,
            name: getAgencyName(agencyId),
            users: [],
            isUnknown: true,
          };
          groupsById.set(agencyId, group);
        }

        group.users.push(user);
      });
    });

    const activeGroups = Array.from(groupsById.values())
      .filter((group) => group.users.length > 0)
      .sort((left, right) => left.name.localeCompare(right.name, 'es', { sensitivity: 'base' }));

    return unassignedGroup.users.length > 0 ? [...activeGroups, unassignedGroup] : activeGroups;
  }, [agencies, getAgencyName, users]);

  const assignedMembershipCount = useMemo(
    () => users.reduce((total, user) => total + new Set(user.agencyIds).size, 0),
    [users],
  );
  const usersWithoutAgencyCount = useMemo(
    () => users.filter((user) => user.agencyIds.length === 0).length,
    [users],
  );
  const multiAgencyUsersCount = useMemo(
    () => users.filter((user) => new Set(user.agencyIds).size > 1).length,
    [users],
  );
  const agenciesWithUsersCount = useMemo(() => {
    const agencyIdsWithUsers = new Set<string>();

    users.forEach((user) => {
      user.agencyIds.forEach((agencyId) => {
        if (agencyLookup.has(agencyId)) {
          agencyIdsWithUsers.add(agencyId);
        }
      });
    });

    return agencyIdsWithUsers.size;
  }, [agencyLookup, users]);
  const agenciesWithoutUsersCount = Math.max(agencies.length - agenciesWithUsersCount, 0);
  const averageUsersPerAgency = agencies.length > 0 ? assignedMembershipCount / agencies.length : 0;

  const toggleAgencyGroup = useCallback((groupId: string) => {
    setExpandedAgencyGroupId((currentGroupId) => (currentGroupId === groupId ? null : groupId));
  }, []);

  const renderRoleBadge = (user: User) => (
    <span
      className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${
        user.role === 'ADMIN'
          ? 'bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-500/10 dark:text-purple-200 dark:border-purple-500/20'
          : user.role === 'SUPERVISOR'
            ? 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-500/10 dark:text-blue-200 dark:border-blue-500/20'
            : 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-700 dark:text-slate-200 dark:border-slate-600'
      }`}
    >
      {user.role}
    </span>
  );

  return (
    <div className="p-8 max-w-6xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="mb-8">
        <h2 className="text-3xl font-bold text-slate-800 dark:text-white mb-2 flex items-center gap-3">
          <Shield className="w-8 h-8 text-indigo-600" />
          Gestión de Usuarios y Accesos
        </h2>
        <p className="text-slate-500 dark:text-slate-400 text-lg">
          Administre quién tiene acceso a la plataforma. Los IDs únicos permiten identificar cuentas
          multi-agencia.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Formulario de Creación / Edición */}
        <div className="lg:col-span-1">
          <div
            className={`rounded-2xl shadow-lg border p-6 sticky top-6 transition-colors duration-300 ${editingId ? 'bg-amber-50 border-amber-200 dark:bg-amber-900/10 dark:border-amber-800' : 'bg-white border-slate-200 dark:bg-slate-800 dark:border-slate-700'}`}
          >
            <div className="flex justify-between items-center mb-6">
              <h3
                className={`text-xl font-bold ${editingId ? 'text-amber-700 dark:text-amber-400' : 'text-slate-800 dark:text-white'}`}
              >
                {editingId ? 'Editando Usuario' : 'Nuevo Usuario'}
              </h3>
              {editingId && (
                <button
                  onClick={resetForm}
                  className="text-xs flex items-center gap-1 text-slate-500 hover:text-slate-700"
                >
                  <X className="w-3 h-3" /> Cancelar
                </button>
              )}
            </div>

            {error && (
              <div className="mb-4 p-3 bg-red-100 text-red-700 rounded-lg text-sm flex items-center gap-2">
                <AlertCircle className="w-4 h-4" />
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Nombre Completo
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-4 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                  placeholder="Ej. Juan Pérez"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Email Corporativo
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-4 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                  placeholder="usuario@empresa.com"
                  required
                />
              </div>

              {/* Password Field with Visibility Toggle */}
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Contraseña
                </label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full px-4 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 focus:ring-2 focus:ring-indigo-500 outline-none transition-all pr-10"
                      placeholder={editingId ? 'Actualizar...' : 'Generar ->'}
                      required
                    />
                    {/* Toggle Visibility Button */}
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-2.5 text-slate-400 hover:text-indigo-600 transition-colors"
                      title={showPassword ? 'Ocultar' : 'Mostrar'}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={generatePassword}
                    className="p-2 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 rounded-xl transition-colors text-slate-600 dark:text-slate-300"
                    title="Generar contraseña segura"
                  >
                    <RefreshCw className="w-5 h-5" />
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Rol
                </label>
                <div className="relative">
                  <select
                    value={role}
                    onChange={(e) => setRole(e.target.value as UserRole)}
                    className="w-full appearance-none px-4 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 focus:ring-2 focus:ring-indigo-500 outline-none pr-8 cursor-pointer transition-all"
                  >
                    <option value="OPERADOR">OPERADOR</option>
                    <option value="SUPERVISOR">SUPERVISOR</option>
                    <option value="ADMIN">ADMIN</option>
                  </select>
                  <ChevronDown className="absolute right-3 top-3 w-4 h-4 text-slate-400 pointer-events-none" />
                </div>
              </div>

              {/* Multi-Agency Selection */}
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Asignar Agencias
                </label>
                <div className="flex gap-2 mb-2">
                  <div className="relative flex-1">
                    <select
                      value={selectedAgencyToAdd}
                      onChange={(e) => setSelectedAgencyToAdd(e.target.value)}
                      className="w-full appearance-none px-4 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 focus:ring-2 focus:ring-indigo-500 outline-none pr-8 cursor-pointer transition-all"
                    >
                      <option value="" disabled>
                        Seleccionar Agencia...
                      </option>
                      {agencies.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-3 top-3 w-4 h-4 text-slate-400 pointer-events-none" />
                  </div>
                  <button
                    type="button"
                    onClick={handleAddAgency}
                    className="p-2 bg-indigo-100 text-indigo-600 rounded-xl hover:bg-indigo-200 transition-colors"
                  >
                    <Plus className="w-5 h-5" />
                  </button>
                </div>

                <div className="flex flex-wrap gap-2 mt-2 p-2 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-100 min-h-[50px]">
                  {selectedAgencyIds.map((id) => {
                    const agencyName = getAgencyName(id);
                    return (
                      <span
                        key={id}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-white dark:bg-slate-800 shadow-sm border border-slate-200 text-xs font-medium text-slate-700 dark:text-slate-300"
                      >
                        <Package className="w-3 h-3 text-indigo-500" />
                        {agencyName}
                        <button
                          type="button"
                          onClick={() => handleRemoveAgency(id)}
                          className="text-slate-400 hover:text-red-500 ml-1"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    );
                  })}
                  {selectedAgencyIds.length === 0 && (
                    <span className="text-xs text-slate-400 italic self-center">
                      Sin agencias asignadas
                    </span>
                  )}
                </div>
              </div>

              <button
                type="submit"
                className={`w-full py-3 font-bold rounded-xl transition-colors shadow-md mt-4 flex items-center justify-center gap-2 ${
                  editingId
                    ? 'bg-amber-500 hover:bg-amber-600 text-white'
                    : 'bg-indigo-600 hover:bg-indigo-700 text-white'
                }`}
              >
                <Save className="w-4 h-4" />
                {editingId ? 'Guardar Cambios' : 'Crear Usuario'}
              </button>
            </form>
          </div>
        </div>

        {/* Lista de Usuarios */}
        <div className="lg:col-span-2">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
            <div className="p-6 border-b border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 space-y-5">
              <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
                <div>
                  <h3 className="text-lg font-bold text-slate-800 dark:text-white">
                    Usuarios por agencia
                  </h3>
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                    Vista agrupada para administrar accesos y cobertura de usuarios por cada agencia
                    configurada.
                  </p>
                </div>
                <div className="inline-flex items-center gap-2 self-start rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 xl:self-auto">
                  <Building className="w-4 h-4 text-indigo-500" />
                  {agencyUserGroups.length} grupos visibles
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800/80">
                  <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">
                    Usuarios
                  </div>
                  <div className="mt-2 flex items-end justify-between gap-3">
                    <span className="text-2xl font-bold text-slate-900 dark:text-white">
                      {users.length}
                    </span>
                    <Users className="w-5 h-5 text-indigo-500" />
                  </div>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    Cuentas registradas en la plataforma.
                  </p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800/80">
                  <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">
                    Agencias cubiertas
                  </div>
                  <div className="mt-2 flex items-end justify-between gap-3">
                    <span className="text-2xl font-bold text-slate-900 dark:text-white">
                      {agenciesWithUsersCount}/{agencies.length}
                    </span>
                    <Building className="w-5 h-5 text-emerald-500" />
                  </div>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    Con al menos un usuario asignado.
                  </p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800/80">
                  <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">
                    Usuarios/agencia
                  </div>
                  <div className="mt-2 flex items-end justify-between gap-3">
                    <span className="text-2xl font-bold text-slate-900 dark:text-white">
                      {averageUsersPerAgency.toFixed(1)}
                    </span>
                    <Package className="w-5 h-5 text-sky-500" />
                  </div>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    Promedio de asignaciones por agencia.
                  </p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800/80">
                  <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">
                    Multi-agencia
                  </div>
                  <div className="mt-2 flex items-end justify-between gap-3">
                    <span className="text-2xl font-bold text-slate-900 dark:text-white">
                      {multiAgencyUsersCount}
                    </span>
                    <Shield className="w-5 h-5 text-amber-500" />
                  </div>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    Usuarios con acceso a más de una agencia.
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap gap-2 text-xs">
                <span className="rounded-full border border-slate-200 bg-white px-3 py-1 font-medium text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                  {assignedMembershipCount} asignaciones totales
                </span>
                <span className="rounded-full border border-slate-200 bg-white px-3 py-1 font-medium text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                  {agenciesWithoutUsersCount} agencias sin usuarios
                </span>
                {usersWithoutAgencyCount > 0 && (
                  <span className="rounded-full border border-rose-200 bg-rose-50 px-3 py-1 font-medium text-rose-600 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-200">
                    {usersWithoutAgencyCount} usuarios sin agencia
                  </span>
                )}
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-slate-500 uppercase bg-white dark:bg-slate-800 border-b border-slate-100">
                  <tr>
                    <th className="px-6 py-3">Usuario (ID)</th>
                    <th className="px-6 py-3">Rol / Accesos</th>
                    <th className="px-6 py-3">Estado</th>
                    <th className="px-6 py-3 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                  {agencyUserGroups.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-6 py-14 text-center">
                        <div className="mx-auto max-w-md text-slate-500 dark:text-slate-400">
                          <Users className="mx-auto h-10 w-10 opacity-40" />
                          <p className="mt-4 text-base font-semibold text-slate-700 dark:text-slate-200">
                            No hay usuarios para mostrar
                          </p>
                          <p className="mt-2 text-sm leading-6">
                            Crea el primer usuario desde el formulario y asígnalo a una o más
                            agencias.
                          </p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    agencyUserGroups.map((group) => {
                      const isGroupExpanded = expandedAgencyGroupId === group.id;

                      return (
                        <React.Fragment key={group.id}>
                          <tr className="bg-slate-50/90 dark:bg-slate-900/70">
                            <td colSpan={4} className="p-0">
                              <button
                                type="button"
                                onClick={() => toggleAgencyGroup(group.id)}
                                aria-expanded={isGroupExpanded}
                                className="flex w-full flex-col gap-2 px-6 py-3 text-left transition-colors hover:bg-indigo-50/70 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-indigo-500/30 dark:hover:bg-indigo-500/10 sm:flex-row sm:items-center sm:justify-between"
                              >
                                <span className="flex items-center gap-3">
                                  <span
                                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${group.isUnassigned ? 'bg-rose-100 text-rose-600 dark:bg-rose-500/10 dark:text-rose-200' : 'bg-indigo-100 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-200'}`}
                                  >
                                    {group.isUnassigned ? (
                                      <AlertCircle className="w-4 h-4" />
                                    ) : (
                                      <Building className="w-4 h-4" />
                                    )}
                                  </span>
                                  <span>
                                    <span className="flex flex-wrap items-center gap-2">
                                      <span className="font-bold text-slate-800 dark:text-white">
                                        {group.name}
                                      </span>
                                      {group.agency && !group.agency.isActive && (
                                        <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-200">
                                          Suspendida
                                        </span>
                                      )}
                                      {group.isUnknown && (
                                        <span className="rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] text-rose-600 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-200">
                                          No configurada
                                        </span>
                                      )}
                                    </span>
                                    {!group.isUnassigned && (
                                      <span className="mt-0.5 block text-[10px] font-mono text-slate-400">
                                        ID: {group.id}
                                      </span>
                                    )}
                                  </span>
                                </span>
                                <span className="flex items-center gap-2 self-start sm:self-auto">
                                  <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-bold text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
                                    {group.users.length}{' '}
                                    {group.users.length === 1 ? 'usuario' : 'usuarios'}
                                  </span>
                                  <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                                    <ChevronDown
                                      className={`h-4 w-4 transition-transform ${isGroupExpanded ? 'rotate-180' : ''}`}
                                    />
                                  </span>
                                </span>
                              </button>
                            </td>
                          </tr>
                          {isGroupExpanded &&
                            group.users.map((user) => {
                              const otherAgencyNames = Array.from(new Set(user.agencyIds))
                                .filter((agencyId) => agencyId !== group.id)
                                .map((agencyId) => getAgencyName(agencyId));

                              return (
                                <tr
                                  key={`${group.id}-${user.id}`}
                                  className="hover:bg-slate-50 dark:hover:bg-slate-700/50"
                                >
                                  <td className="px-6 py-4">
                                    <div className="flex items-center gap-3">
                                      <div className="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-700 flex items-center justify-center text-slate-500 shrink-0">
                                        <UserIcon className="w-5 h-5" />
                                      </div>
                                      <div>
                                        <div className="font-bold text-slate-800 dark:text-white">
                                          {user.name}
                                        </div>
                                        <div className="text-xs text-slate-500 dark:text-slate-400">
                                          {user.email}
                                        </div>
                                        <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                                          ID: {user.id}
                                        </div>
                                      </div>
                                    </div>
                                  </td>
                                  <td className="px-6 py-4">
                                    <div className="flex flex-col gap-1 items-start">
                                      {renderRoleBadge(user)}
                                      <div className="flex flex-wrap gap-1 mt-1">
                                        {group.isUnassigned ? (
                                          <span className="text-[10px] text-red-500 dark:text-red-300">
                                            Sin asignación
                                          </span>
                                        ) : otherAgencyNames.length > 0 ? (
                                          otherAgencyNames.map((agencyName) => (
                                            <span
                                              key={agencyName}
                                              className="flex items-center gap-1 text-[10px] text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-700 px-1.5 py-0.5 rounded"
                                            >
                                              <Package className="w-3 h-3" />
                                              También en {agencyName}
                                            </span>
                                          ))
                                        ) : (
                                          <span className="flex items-center gap-1 text-[10px] text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-700 px-1.5 py-0.5 rounded">
                                            <Package className="w-3 h-3" />
                                            Solo esta agencia
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                  </td>
                                  <td className="px-6 py-4">
                                    <span
                                      className={`inline-flex items-center gap-1 font-medium text-xs px-2 py-0.5 rounded-full border ${user.isActive ? 'text-green-600 bg-green-50 border-green-100 dark:text-green-300 dark:bg-green-500/10 dark:border-green-500/20' : 'text-amber-600 bg-amber-50 border-amber-100 dark:text-amber-200 dark:bg-amber-500/10 dark:border-amber-500/20'}`}
                                    >
                                      {user.isActive ? (
                                        <CheckCircle className="w-3 h-3" />
                                      ) : (
                                        <AlertCircle className="w-3 h-3" />
                                      )}
                                      {user.isActive ? 'Activo' : 'Inactivo'}
                                    </span>
                                  </td>
                                  <td className="px-6 py-4 text-right">
                                    <div className="flex justify-end gap-2">
                                      <button
                                        onClick={() => handleEdit(user)}
                                        className="text-indigo-500 hover:text-indigo-700 p-2 hover:bg-indigo-50 rounded-lg transition-colors dark:hover:bg-indigo-500/10"
                                        title="Editar usuario"
                                      >
                                        <Pencil className="w-4 h-4" />
                                      </button>

                                      {user.role !== 'ADMIN' && (
                                        <button
                                          onClick={async () => {
                                            const deleteError = await onDeleteUser(user.id);
                                            if (deleteError) {
                                              setError(deleteError);
                                            }
                                          }}
                                          className="text-red-500 hover:text-red-700 p-2 hover:bg-red-50 rounded-lg transition-colors dark:hover:bg-red-500/10"
                                          title="Eliminar usuario"
                                        >
                                          <Trash2 className="w-4 h-4" />
                                        </button>
                                      )}
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                        </React.Fragment>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default UserManagement;

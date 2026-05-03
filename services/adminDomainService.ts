import { Agency, SubscriptionPlan, User } from '../types';

const buildAgencyMap = (agencies: Agency[]) =>
  new Map(agencies.map((agency) => [agency.id, agency]));

export const validateUserIntegrity = (
  candidate: User,
  users: User[],
  agencies: Agency[],
  editingId?: string,
): string | null => {
  const emailExists = users.some(
    (user) => user.email.toLowerCase() === candidate.email.toLowerCase() && user.id !== editingId,
  );

  if (emailExists) {
    return 'Este email ya está registrado por otro usuario.';
  }

  if (candidate.password && candidate.password.length < 4) {
    return 'La contraseña debe tener al menos 4 caracteres.';
  }

  if (candidate.role !== 'ADMIN' && candidate.agencyIds.length === 0) {
    return 'Debe asignar al menos una agencia al usuario.';
  }

  const agenciesMap = buildAgencyMap(agencies);
  const assignedAgencies = candidate.agencyIds
    .map((agencyId) => agenciesMap.get(agencyId))
    .filter(Boolean) as Agency[];

  if (candidate.role !== 'ADMIN' && assignedAgencies.every((agency) => !agency.isActive)) {
    return 'El usuario debe tener al menos una agencia activa asignada.';
  }

  return null;
};

export const validateAgencyIntegrity = (
  candidate: Agency,
  agencies: Agency[],
  users: User[],
  plans: SubscriptionPlan[],
): string | null => {
  if (!candidate.planId || !plans.some((plan) => plan.id === candidate.planId)) {
    return 'Debe seleccionar un plan válido para la agencia.';
  }

  if (!candidate.emails.length) {
    return 'Debe agregar al menos un email de facturación.';
  }

  const existingAgency = agencies.find((agency) => agency.id === candidate.id);
  if (existingAgency && existingAgency.isActive && !candidate.isActive) {
    const impactedUsers = users.filter((user) => {
      if (user.role === 'ADMIN' || !user.isActive) {
        return false;
      }

      const remainingActiveAgencies = agencies.filter(
        (agency) =>
          user.agencyIds.includes(agency.id) && agency.id !== candidate.id && agency.isActive,
      );

      return user.agencyIds.includes(candidate.id) && remainingActiveAgencies.length === 0;
    });

    if (impactedUsers.length > 0) {
      return `No se puede suspender esta agencia porque dejaría sin acceso a: ${impactedUsers.map((user) => user.name).join(', ')}.`;
    }
  }

  return null;
};

export const validateAgencyDeletion = (agencyId: string, users: User[]): string | null => {
  const assignedUsers = users.filter((user) => user.agencyIds.includes(agencyId));
  if (assignedUsers.length > 0) {
    return `No se puede eliminar la agencia mientras siga asignada a: ${assignedUsers.map((user) => user.name).join(', ')}.`;
  }

  return null;
};

export const bumpAgencyUsage = (
  agencies: Agency[],
  agencyId: string,
  pageIncrement: number,
): Agency[] => {
  return agencies.map((agency) => {
    if (agency.id !== agencyId) {
      return agency;
    }

    return {
      ...agency,
      currentUsage: agency.currentUsage + pageIncrement,
      updatedAt: new Date().toISOString(),
    };
  });
};

export const withTimestamps = <T extends { createdAt?: string; updatedAt?: string }>(
  item: T,
  existing?: T,
): T => {
  const now = new Date().toISOString();
  return {
    ...item,
    createdAt: existing?.createdAt || item.createdAt || now,
    updatedAt: now,
  };
};

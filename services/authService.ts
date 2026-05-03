import { Agency, AppState, User, UserRole } from '../types';
import { ERROR_MESSAGES } from '../config';

const SESSION_DURATION_MS = 1000 * 60 * 60 * 8;

export interface AuthSession {
  userId: string;
  expiresAt: string;
}

export interface AuthResult {
  user: User | null;
  error: string | null;
}

export const buildAuthSession = (user: User): AuthSession => ({
  userId: user.id,
  expiresAt: new Date(Date.now() + SESSION_DURATION_MS).toISOString(),
});

export const isSessionExpired = (session: AuthSession | null): boolean => {
  if (!session) {
    return true;
  }

  return new Date(session.expiresAt).getTime() <= Date.now();
};

export const hasActiveAgencyAccess = (user: User, agencies: Agency[]): boolean => {
  if (user.role === 'ADMIN') {
    return true;
  }

  return agencies.some((agency) => user.agencyIds.includes(agency.id) && agency.isActive);
};

export const getAccessibleAgencies = (user: User | null, agencies: Agency[]): Agency[] => {
  if (!user) {
    return [];
  }

  if (user.role === 'ADMIN') {
    return agencies;
  }

  return agencies.filter((agency) => user.agencyIds.includes(agency.id) && agency.isActive);
};

export const resolveDefaultAgencyContext = (user: User, agencies: Agency[]): string => {
  if (user.role === 'ADMIN') {
    return 'GLOBAL';
  }

  return getAccessibleAgencies(user, agencies)[0]?.id || user.agencyIds[0] || '';
};

export const resolveLandingState = (user: User): AppState => {
  return user.role === 'ADMIN' ? AppState.DASHBOARD_ADMIN : AppState.DASHBOARD_PANEL;
};

export const canRoleAccessAppState = (role: UserRole, target: AppState): boolean => {
  if (target === AppState.LOGIN) {
    return true;
  }

  if (role === 'ADMIN') {
    return true;
  }

  return ![
    AppState.DASHBOARD_OPS,
    AppState.DASHBOARD_ADMIN,
    AppState.AGENCY_CONFIG,
    AppState.USER_MANAGEMENT,
  ].includes(target);
};

export const canAccessAppState = (user: User | null, target: AppState): boolean => {
  if (target === AppState.LOGIN) {
    return true;
  }

  if (!user) {
    return false;
  }

  return canRoleAccessAppState(user.role, target);
};

export const canAccessAgency = (
  user: User | null,
  agencyId: string,
  agencies: Agency[],
): boolean => {
  if (!user || !agencyId) {
    return false;
  }

  if (agencyId === 'GLOBAL') {
    return user.role === 'ADMIN';
  }

  if (user.role === 'ADMIN') {
    return agencies.some((agency) => agency.id === agencyId);
  }

  return agencies.some(
    (agency) => agency.id === agencyId && agency.isActive && user.agencyIds.includes(agency.id),
  );
};

export const authenticateUser = (
  users: User[],
  agencies: Agency[],
  email: string,
  password: string,
): AuthResult => {
  const user = users.find(
    (candidate) =>
      candidate.email.toLowerCase() === email.toLowerCase().trim() &&
      candidate.password === password,
  );

  if (!user) {
    return { user: null, error: ERROR_MESSAGES.INVALID_CREDENTIALS };
  }

  if (!user.isActive) {
    return { user: null, error: ERROR_MESSAGES.USER_INACTIVE };
  }

  if (!hasActiveAgencyAccess(user, agencies)) {
    return { user: null, error: ERROR_MESSAGES.AGENCY_SUSPENDED };
  }

  return { user, error: null };
};

export interface Me { id: string; username: string; fullName: string; roles: string[]; mustChangePassword: boolean }
export interface Paged<T> { items: T[]; page: number; pageSize: number; total: number }

export interface UserDto {
  id: string; username: string; fullName: string; email: string | null; unitName: string | null; status: string;
  roles: string[]; lastLoginAt: string | null; lockedUntil: string | null; createdAt: string;
}
export interface CreatedUser { user: UserDto; temporaryPassword: string }
export interface GroupDto { id: string; name: string; description: string | null; memberCount: number }
export interface Target { id: string; name: string }
export interface Permissions { users: Target[]; groups: Target[] }

export interface ApplicationDto {
  id: string; code: string; name: string; description: string | null; ownerUnit: string | null; managerId: string | null;
  managerName: string | null; status: string; formCount: number; isDemo: boolean; createdAt: string; updatedAt: string;
}
export interface FormType { id: number; code: string; name: string }
export interface VersionBrief { id: string; versionNo: number; status: string; effectiveDate: string | null; expiryDate: string | null; createdAt: string }
export interface FormDto {
  id: string; code: string; name: string; description: string | null; applicationId: string; applicationCode: string;
  applicationName: string; formTypeId: number | null; formTypeName: string | null; current: VersionBrief | null;
  latest: VersionBrief | null; updatedAt: string; isDemo: boolean;
}
export interface VersionDto {
  id: string; formId: string; formCode: string; formName: string; versionNo: number; originalFileName: string;
  contentType: string; sizeBytes: number; sha256: string; effectiveDate: string | null; expiryDate: string | null;
  changeNote: string | null; status: string; createdByName: string; createdAt: string; submittedAt: string | null;
  approvedByName: string | null; approvedAt: string | null; revokedAt: string | null; isCurrent: boolean;
}
export interface HistoryDto { id: number; action: string; actorName: string | null; reason: string | null; actedAt: string }
export interface AuditLogDto {
  id: number; occurredAt: string; userId: string | null; username: string | null; action: string; objectType: string | null;
  objectId: string | null; result: string; ipAddress: string | null; requestId: string | null; detail: string | null;
}

export interface AdminDashboard {
  totals: { applications: number; forms: number; activeVersions: number; pendingVersions: number; expiringSoon: number; activeUsers: number; downloads: number };
  formsByApplication: { code: string; name: string; count: number }[];
  downloadsByDay: { day: string; count: number }[];
  recentVersions: { id: string; formId: string; formCode: string; formName: string; versionNo: number; status: string; createdAt: string; by: string }[];
  expiringVersions: { id: string; formId: string; formCode: string; formName: string; versionNo: number; expiryDate: string }[];
  recentAdminActions: { occurredAt: string; usernameSnapshot: string | null; action: string; objectType: string | null; objectId: string | null }[];
}
export interface HomeData {
  applications: { id: string; code: string; name: string; description: string | null; formCount: number }[];
  recentForms: { id: string; code: string; name: string; applicationName: string; versionNo: number; updatedAt: string | null }[];
  expiringForms: { id: string; code: string; name: string; expiryDate: string }[];
  recentDownloads: { downloadedAt: string; formId: string; formCode: string; formName: string; versionNo: number }[];
}
export interface DownloadReportRow { formId: string; code: string; name: string; downloads: number; users: number }

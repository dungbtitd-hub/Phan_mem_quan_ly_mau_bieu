using System.ComponentModel.DataAnnotations.Schema;
using System.Net;

namespace FormPortal.Api.Domain;

public static class RoleCodes
{
    public const string Admin = "admin";
    public const string Approver = "approver";
    public const string User = "user";
    public const string AdminOrApprover = "admin,approver";
    public static readonly string[] All = [Admin, Approver, User];
}
public static class UserStatus { public const string Active = "active", Locked = "locked", Disabled = "disabled"; }
public static class AppStatus { public const string Active = "active", Locked = "locked"; }
public static class VersionStatus
{
    public const string Draft = "draft", Pending = "pending", Active = "active", Expired = "expired", Revoked = "revoked";
}
public static class ApprovalAction
{
    public const string Submit = "submit", Approve = "approve", Reject = "reject", Revoke = "revoke", Expire = "expire";
}

[Table("users")]
public class User
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string Username { get; set; } = "";
    public string FullName { get; set; } = "";
    public string? Email { get; set; }
    public string? UnitName { get; set; }
    public string PasswordHash { get; set; } = "";
    public string Status { get; set; } = UserStatus.Active;
    public int FailedLoginCount { get; set; }
    public DateTime? LockedUntil { get; set; }
    public bool MustChangePassword { get; set; } = true;
    public DateTime? PasswordChangedAt { get; set; }
    public DateTime? LastLoginAt { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
    public List<UserRole> UserRoles { get; set; } = [];
}

[Table("roles")]
public class Role
{
    public short Id { get; set; }
    public string Code { get; set; } = "";
    public string Name { get; set; } = "";
}

[Table("user_roles")]
public class UserRole
{
    public Guid UserId { get; set; }
    public short RoleId { get; set; }
    public User User { get; set; } = null!;
    public Role Role { get; set; } = null!;
}

[Table("user_groups")]
public class UserGroup
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string Name { get; set; } = "";
    public string? Description { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

[Table("user_group_members")]
public class UserGroupMember
{
    public Guid GroupId { get; set; }
    public Guid UserId { get; set; }
}

[Table("applications")]
public class Application
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string Code { get; set; } = "";
    public string Name { get; set; } = "";
    public string? Description { get; set; }
    public string? OwnerUnit { get; set; }
    public Guid? ManagerId { get; set; }
    public string Status { get; set; } = AppStatus.Active;
    public bool IsDemo { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}

[Table("application_permissions")]
public class ApplicationPermission
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid ApplicationId { get; set; }
    public Guid? UserId { get; set; }
    public Guid? GroupId { get; set; }
    public Guid? GrantedBy { get; set; }
    public DateTime GrantedAt { get; set; } = DateTime.UtcNow;
}

[Table("form_types")]
public class FormType
{
    public short Id { get; set; }
    public string Code { get; set; } = "";
    public string Name { get; set; } = "";
}

[Table("forms")]
public class Form
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string Code { get; set; } = "";
    public string Name { get; set; } = "";
    public string? Description { get; set; }
    public Guid ApplicationId { get; set; }
    public short? FormTypeId { get; set; }
    public Guid? CurrentVersionId { get; set; }
    public bool IsDemo { get; set; }
    public Guid CreatedBy { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
    public Application Application { get; set; } = null!;
    public FormType? FormType { get; set; }
    public FormVersion? CurrentVersion { get; set; }
    public List<FormVersion> Versions { get; set; } = [];
}

[Table("form_versions")]
public class FormVersion
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid FormId { get; set; }
    public int VersionNo { get; set; }
    public string OriginalFileName { get; set; } = "";
    public string StoredName { get; set; } = "";
    public string ContentType { get; set; } = "";
    public long SizeBytes { get; set; }
    public string Sha256 { get; set; } = "";
    public DateOnly? EffectiveDate { get; set; }
    public DateOnly? ExpiryDate { get; set; }
    public string? ChangeNote { get; set; }
    public string Status { get; set; } = VersionStatus.Draft;
    public Guid CreatedBy { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? SubmittedAt { get; set; }
    public Guid? ApprovedBy { get; set; }
    public DateTime? ApprovedAt { get; set; }
    public DateTime? RevokedAt { get; set; }
    public Form Form { get; set; } = null!;
    public User Creator { get; set; } = null!;
    public User? Approver { get; set; }
}

[Table("approval_history")]
public class ApprovalHistory
{
    public long Id { get; set; }
    public Guid VersionId { get; set; }
    public Guid? ActorId { get; set; }
    public string Action { get; set; } = "";
    public string? Reason { get; set; }
    public DateTime ActedAt { get; set; } = DateTime.UtcNow;
    public User? Actor { get; set; }
}

[Table("audit_logs")]
public class AuditLog
{
    public long Id { get; set; }
    public DateTime OccurredAt { get; set; } = DateTime.UtcNow;
    public Guid? UserId { get; set; }
    public string? UsernameSnapshot { get; set; }
    public string Action { get; set; } = "";
    public string? ObjectType { get; set; }
    public string? ObjectId { get; set; }
    public string Result { get; set; } = "success";
    public IPAddress? IpAddress { get; set; }
    public string? RequestId { get; set; }
    public string? Detail { get; set; }
}

[Table("download_logs")]
public class DownloadLog
{
    public long Id { get; set; }
    public Guid VersionId { get; set; }
    public Guid UserId { get; set; }
    public DateTime DownloadedAt { get; set; } = DateTime.UtcNow;
    public IPAddress? IpAddress { get; set; }
    public FormVersion Version { get; set; } = null!;
}

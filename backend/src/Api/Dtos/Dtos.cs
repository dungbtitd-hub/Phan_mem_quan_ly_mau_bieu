namespace FormPortal.Api.Dtos;

// ===== Xác thực =====
public class LoginRequest
{
    [Required, StringLength(100)] public string Username { get; set; } = "";
    [Required, StringLength(200)] public string Password { get; set; } = "";
}
public class ChangePasswordRequest
{
    [Required, StringLength(200)] public string CurrentPassword { get; set; } = "";
    [Required, StringLength(128)] public string NewPassword { get; set; } = "";
}
public record MeDto(Guid Id, string Username, string FullName, List<string> Roles, bool MustChangePassword);

// ===== Người dùng, nhóm =====
public class UserCreateRequest
{
    [Required, RegularExpression(@"^[A-Za-z0-9._@-]{3,100}$", ErrorMessage = "Tên đăng nhập gồm 3-100 ký tự chữ, số, . _ @ -")]
    public string Username { get; set; } = "";
    [Required, StringLength(200)] public string FullName { get; set; } = "";
    [EmailAddress, StringLength(200)] public string? Email { get; set; }
    [StringLength(200)] public string? UnitName { get; set; }
    [Required, MinLength(1)] public List<string> Roles { get; set; } = [];
}
public class UserUpdateRequest
{
    [Required, StringLength(200)] public string FullName { get; set; } = "";
    [EmailAddress, StringLength(200)] public string? Email { get; set; }
    [StringLength(200)] public string? UnitName { get; set; }
}
public class RolesRequest { [Required, MinLength(1)] public List<string> Roles { get; set; } = []; }
public record UserDto(Guid Id, string Username, string FullName, string? Email, string? UnitName, string Status,
    List<string> Roles, DateTime? LastLoginAt, DateTime? LockedUntil, DateTime CreatedAt);
public record CreatedUserDto(UserDto User, string TemporaryPassword);
public record TempPasswordDto(string TemporaryPassword);

public class GroupUpsertRequest
{
    [Required, StringLength(150)] public string Name { get; set; } = "";
    [StringLength(500)] public string? Description { get; set; }
}
public class IdListRequest { [Required] public List<Guid> Ids { get; set; } = []; }
public record GroupDto(Guid Id, string Name, string? Description, int MemberCount);

// ===== Hệ thống ứng dụng =====
public class ApplicationUpsertRequest
{
    [Required, RegularExpression(@"^[A-Za-z0-9._-]{1,50}$", ErrorMessage = "Mã gồm 1-50 ký tự chữ, số, . _ -")]
    public string Code { get; set; } = "";
    [Required, StringLength(200)] public string Name { get; set; } = "";
    [StringLength(1000)] public string? Description { get; set; }
    [StringLength(200)] public string? OwnerUnit { get; set; }
    public Guid? ManagerId { get; set; }
}
public record ApplicationDto(Guid Id, string Code, string Name, string? Description, string? OwnerUnit, Guid? ManagerId,
    string? ManagerName, string Status, int FormCount, bool IsDemo, DateTime CreatedAt, DateTime UpdatedAt);
public class PermissionsRequest
{
    public List<Guid> UserIds { get; set; } = [];
    public List<Guid> GroupIds { get; set; } = [];
}
public record PermissionTarget(Guid Id, string Name);
public record PermissionsDto(List<PermissionTarget> Users, List<PermissionTarget> Groups);

// ===== Mẫu biểu, phiên bản =====
public class FormCreateRequest
{
    [Required, RegularExpression(@"^[A-Za-z0-9._-]{1,50}$", ErrorMessage = "Mã gồm 1-50 ký tự chữ, số, . _ -")]
    public string Code { get; set; } = "";
    [Required, StringLength(300)] public string Name { get; set; } = "";
    [StringLength(2000)] public string? Description { get; set; }
    [Required] public Guid ApplicationId { get; set; }
    public short? FormTypeId { get; set; }
    public DateOnly? EffectiveDate { get; set; }
    public DateOnly? ExpiryDate { get; set; }
    [StringLength(2000)] public string? ChangeNote { get; set; }
    [Required] public IFormFile? File { get; set; }
}
public class FormUpdateRequest
{
    [Required, RegularExpression(@"^[A-Za-z0-9._-]{1,50}$", ErrorMessage = "Mã gồm 1-50 ký tự chữ, số, . _ -")]
    public string Code { get; set; } = "";
    [Required, StringLength(300)] public string Name { get; set; } = "";
    [StringLength(2000)] public string? Description { get; set; }
    public short? FormTypeId { get; set; }
}
public class VersionCreateRequest
{
    public DateOnly? EffectiveDate { get; set; }
    public DateOnly? ExpiryDate { get; set; }
    [StringLength(2000)] public string? ChangeNote { get; set; }
    [Required] public IFormFile? File { get; set; }
}
public class VersionUpdateRequest
{
    public DateOnly? EffectiveDate { get; set; }
    public DateOnly? ExpiryDate { get; set; }
    [StringLength(2000)] public string? ChangeNote { get; set; }
}
public class VersionFileRequest { [Required] public IFormFile? File { get; set; } }
public class ReasonRequest { [Required, StringLength(1000, MinimumLength = 3)] public string Reason { get; set; } = ""; }

public record VersionBriefDto(Guid Id, int VersionNo, string Status, DateOnly? EffectiveDate, DateOnly? ExpiryDate, DateTime CreatedAt);
public record FormDto(Guid Id, string Code, string Name, string? Description, Guid ApplicationId, string ApplicationCode,
    string ApplicationName, short? FormTypeId, string? FormTypeName, VersionBriefDto? Current, VersionBriefDto? Latest,
    DateTime UpdatedAt, bool IsDemo);
public record VersionDto(Guid Id, Guid FormId, string FormCode, string FormName, int VersionNo, string OriginalFileName,
    string ContentType, long SizeBytes, string Sha256, DateOnly? EffectiveDate, DateOnly? ExpiryDate, string? ChangeNote,
    string Status, string CreatedByName, DateTime CreatedAt, DateTime? SubmittedAt, string? ApprovedByName,
    DateTime? ApprovedAt, DateTime? RevokedAt, bool IsCurrent);
public record HistoryDto(long Id, string Action, string? ActorName, string? Reason, DateTime ActedAt);

public record AuditLogDto(long Id, DateTime OccurredAt, Guid? UserId, string? Username, string Action, string? ObjectType,
    string? ObjectId, string Result, string? IpAddress, string? RequestId, string? Detail);

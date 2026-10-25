using System.Text;

namespace FormPortal.Api.Data;

public class AppDbContext(DbContextOptions<AppDbContext> options) : DbContext(options)
{
    public DbSet<User> Users => Set<User>();
    public DbSet<Role> Roles => Set<Role>();
    public DbSet<UserRole> UserRoles => Set<UserRole>();
    public DbSet<UserGroup> UserGroups => Set<UserGroup>();
    public DbSet<UserGroupMember> UserGroupMembers => Set<UserGroupMember>();
    public DbSet<Application> Applications => Set<Application>();
    public DbSet<ApplicationPermission> ApplicationPermissions => Set<ApplicationPermission>();
    public DbSet<FormType> FormTypes => Set<FormType>();
    public DbSet<Form> Forms => Set<Form>();
    public DbSet<FormVersion> FormVersions => Set<FormVersion>();
    public DbSet<ApprovalHistory> ApprovalHistory => Set<ApprovalHistory>();
    public DbSet<AuditLog> AuditLogs => Set<AuditLog>();
    public DbSet<DownloadLog> DownloadLogs => Set<DownloadLog>();

    /// <summary>Ánh xạ tới hàm immutable_unaccent() của migration 001 để tìm kiếm tiếng Việt không dấu.</summary>
    [DbFunction("immutable_unaccent")]
    public static string ImmutableUnaccent(string value) => throw new NotSupportedException();

    protected override void OnModelCreating(ModelBuilder mb)
    {
        mb.Entity<Role>().Property(r => r.Id).ValueGeneratedNever();
        mb.Entity<FormType>().Property(r => r.Id).ValueGeneratedOnAdd();
        mb.Entity<ApprovalHistory>().Property(r => r.Id).ValueGeneratedOnAdd();
        mb.Entity<AuditLog>().Property(r => r.Id).ValueGeneratedOnAdd();
        mb.Entity<DownloadLog>().Property(r => r.Id).ValueGeneratedOnAdd();

        mb.Entity<UserRole>().HasKey(x => new { x.UserId, x.RoleId });
        mb.Entity<UserRole>().HasOne(x => x.User).WithMany(u => u.UserRoles).HasForeignKey(x => x.UserId);
        mb.Entity<UserRole>().HasOne(x => x.Role).WithMany().HasForeignKey(x => x.RoleId);
        mb.Entity<UserGroupMember>().HasKey(x => new { x.GroupId, x.UserId });

        mb.Entity<Form>().HasOne(f => f.Application).WithMany().HasForeignKey(f => f.ApplicationId);
        mb.Entity<Form>().HasOne(f => f.FormType).WithMany().HasForeignKey(f => f.FormTypeId);
        mb.Entity<Form>().HasMany(f => f.Versions).WithOne(v => v.Form).HasForeignKey(v => v.FormId);
        mb.Entity<Form>().HasOne(f => f.CurrentVersion).WithMany().HasForeignKey(f => f.CurrentVersionId)
            .OnDelete(DeleteBehavior.Restrict);

        mb.Entity<FormVersion>().HasOne(v => v.Creator).WithMany().HasForeignKey(v => v.CreatedBy);
        mb.Entity<FormVersion>().HasOne(v => v.Approver).WithMany().HasForeignKey(v => v.ApprovedBy);
        mb.Entity<FormVersion>().Property(v => v.Sha256).HasColumnType("char(64)");
        mb.Entity<ApprovalHistory>().HasOne(h => h.Actor).WithMany().HasForeignKey(h => h.ActorId);
        mb.Entity<DownloadLog>().HasOne(d => d.Version).WithMany().HasForeignKey(d => d.VersionId);
        mb.Entity<AuditLog>().Property(a => a.Detail).HasColumnType("jsonb");
        mb.Entity<AuditLog>().Property(a => a.IpAddress).HasColumnType("inet");
        mb.Entity<DownloadLog>().Property(a => a.IpAddress).HasColumnType("inet");

        // Cột trong database dùng snake_case
        foreach (var entity in mb.Model.GetEntityTypes())
            foreach (var p in entity.GetProperties())
                p.SetColumnName(ToSnake(p.Name));
    }

    private static string ToSnake(string s)
    {
        var sb = new StringBuilder();
        for (var i = 0; i < s.Length; i++)
        {
            var c = s[i];
            if (char.IsUpper(c))
            {
                if (i > 0 && (char.IsLower(s[i - 1]) || char.IsDigit(s[i - 1]))) sb.Append('_');
                sb.Append(char.ToLowerInvariant(c));
            }
            else sb.Append(c);
        }
        return sb.ToString();
    }
}

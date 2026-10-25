using System.Text.Json;

namespace FormPortal.Api.Services;

public interface IAuditService
{
    /// <summary>Ghi nhật ký bằng DbContext riêng để vẫn được lưu khi giao dịch nghiệp vụ bị hủy. Không đưa dữ liệu bí mật vào detail.</summary>
    Task WriteAsync(string action, string? objectType, string? objectId, bool success, object? detail = null,
        Guid? userId = null, string? username = null);
}

public class AuditService(IDbContextFactory<AppDbContext> factory, ICurrentUser me, ILogger<AuditService> log) : IAuditService
{
    public async Task WriteAsync(string action, string? objectType, string? objectId, bool success, object? detail = null,
        Guid? userId = null, string? username = null)
    {
        try
        {
            Guid? uid = userId;
            if (uid is null && me.IsAuthenticated) uid = me.Id;
            var name = username;
            if (name is null && me.IsAuthenticated) name = me.Username;

            await using var db = await factory.CreateDbContextAsync();
            db.AuditLogs.Add(new AuditLog
            {
                OccurredAt = DateTime.UtcNow,
                UserId = uid,
                UsernameSnapshot = name is { Length: > 100 } ? name[..100] : name,
                Action = action,
                ObjectType = objectType,
                ObjectId = objectId,
                Result = success ? "success" : "failure",
                IpAddress = me.Ip,
                RequestId = me.RequestId,
                Detail = detail is null ? null : JsonSerializer.Serialize(detail)
            });
            await db.SaveChangesAsync();
        }
        catch (Exception ex)
        {
            log.LogError(ex, "Không ghi được nhật ký audit cho hành động {Action}", action);
        }
    }
}

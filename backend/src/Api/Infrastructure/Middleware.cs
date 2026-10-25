using System.Text.RegularExpressions;
using Npgsql;

namespace FormPortal.Api.Infrastructure;

public class RequestIdMiddleware(RequestDelegate next, ILogger<RequestIdMiddleware> log)
{
    private static readonly Regex Valid = new("^[A-Za-z0-9._-]{8,64}$", RegexOptions.Compiled);

    public async Task Invoke(HttpContext ctx)
    {
        var incoming = ctx.Request.Headers["X-Request-Id"].ToString();
        var id = Valid.IsMatch(incoming) ? incoming : Guid.NewGuid().ToString("N");
        ctx.TraceIdentifier = id;
        ctx.Response.Headers["X-Request-Id"] = id;
        using (log.BeginScope(new Dictionary<string, object> { ["RequestId"] = id }))
            await next(ctx);
    }
}

public class ExceptionMiddleware(RequestDelegate next, ILogger<ExceptionMiddleware> log)
{
    public async Task Invoke(HttpContext ctx)
    {
        try { await next(ctx); }
        catch (OperationCanceledException) when (ctx.RequestAborted.IsCancellationRequested)
        {
            ctx.Response.StatusCode = 499;
        }
        catch (Exception ex) { await Handle(ctx, ex); }
    }

    private async Task Handle(HttpContext ctx, Exception ex)
    {
        int status;
        string code, message;
        object? details = null;

        switch (ex)
        {
            case AppException app:
                (status, code, message, details) = (app.Status, app.Code, app.Message, app.Details);
                break;
            case BadHttpRequestException bad when bad.StatusCode == StatusCodes.Status413PayloadTooLarge:
                (status, code, message) = (413, "PAYLOAD_TOO_LARGE", "Tệp vượt quá dung lượng cho phép");
                break;
            case InvalidDataException:
                (status, code, message) = (400, "BAD_REQUEST", "Dữ liệu gửi lên không hợp lệ");
                break;
            case DbUpdateException { InnerException: PostgresException pg }:
                (status, code, message) = pg.SqlState switch
                {
                    PostgresErrorCodes.UniqueViolation => (409, "CONFLICT", "Dữ liệu bị trùng hoặc xung đột với dữ liệu hiện có"),
                    PostgresErrorCodes.ForeignKeyViolation => (409, "CONFLICT", "Dữ liệu đang được tham chiếu hoặc tham chiếu không tồn tại"),
                    PostgresErrorCodes.CheckViolation => (400, "VALIDATION_ERROR", "Dữ liệu vi phạm ràng buộc"),
                    _ => (500, "INTERNAL_ERROR", "Đã xảy ra lỗi hệ thống")
                };
                if (status == 500) log.LogError(ex, "Lỗi database {State} tại {Path}", pg.SqlState, ctx.Request.Path);
                else log.LogWarning("Vi phạm ràng buộc database {State} ({Constraint}) tại {Path}", pg.SqlState, pg.ConstraintName, ctx.Request.Path);
                break;
            default:
                log.LogError(ex, "Lỗi không xử lý tại {Method} {Path}", ctx.Request.Method, ctx.Request.Path);
                (status, code, message) = (500, "INTERNAL_ERROR", "Đã xảy ra lỗi hệ thống. Vui lòng liên hệ quản trị viên kèm mã yêu cầu.");
                break;
        }

        if (ctx.Response.HasStarted)
        {
            log.LogWarning("Không thể ghi phản hồi lỗi vì response đã bắt đầu");
            ctx.Abort();
            return;
        }
        ctx.Response.Clear();
        ctx.Response.StatusCode = status;
        await ctx.Response.WriteAsJsonAsync(ApiResponse.Fail(code, message, details, ctx.TraceIdentifier));
    }
}

/// <summary>Khi tài khoản bắt buộc đổi mật khẩu, chỉ cho phép các endpoint /api/auth và /health.</summary>
public class PasswordChangeGuardMiddleware(RequestDelegate next)
{
    private static readonly string[] Allowed = ["/api/auth/", "/health"];

    public async Task Invoke(HttpContext ctx)
    {
        if (ctx.User.Identity?.IsAuthenticated == true && ctx.User.FindFirstValue("mcp") == "1")
        {
            var path = ctx.Request.Path.Value ?? "";
            if (!Allowed.Any(a => path.StartsWith(a, StringComparison.OrdinalIgnoreCase)))
            {
                ctx.Response.StatusCode = StatusCodes.Status403Forbidden;
                await ctx.Response.WriteAsJsonAsync(ApiResponse.Fail("PASSWORD_CHANGE_REQUIRED",
                    "Bạn cần đổi mật khẩu trước khi sử dụng hệ thống", null, ctx.TraceIdentifier));
                return;
            }
        }
        await next(ctx);
    }
}

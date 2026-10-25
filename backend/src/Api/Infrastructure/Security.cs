using System.Net;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;

namespace FormPortal.Api.Infrastructure;

public interface ICurrentUser
{
    bool IsAuthenticated { get; }
    Guid Id { get; }
    string Username { get; }
    bool IsAdmin { get; }
    bool IsApprover { get; }
    bool Privileged { get; }
    IPAddress? Ip { get; }
    string? RequestId { get; }
}

public class CurrentUser(IHttpContextAccessor accessor) : ICurrentUser
{
    private ClaimsPrincipal? P => accessor.HttpContext?.User;
    public bool IsAuthenticated => P?.Identity?.IsAuthenticated == true;
    public Guid Id => Guid.TryParse(P?.FindFirstValue(ClaimTypes.NameIdentifier), out var g) ? g : Guid.Empty;
    public string Username => P?.FindFirstValue(ClaimTypes.Name) ?? "";
    public bool IsAdmin => P?.IsInRole(RoleCodes.Admin) == true;
    public bool IsApprover => P?.IsInRole(RoleCodes.Approver) == true;
    public bool Privileged => IsAdmin || IsApprover;
    public IPAddress? Ip => accessor.HttpContext?.Connection.RemoteIpAddress;
    public string? RequestId => accessor.HttpContext?.TraceIdentifier;
}

public static class PrincipalFactory
{
    public static ClaimsPrincipal Create(Guid id, string username, string fullName, IEnumerable<string> roles,
        bool mustChangePassword, long issuedAtUnix)
    {
        var claims = new List<Claim>
        {
            new(ClaimTypes.NameIdentifier, id.ToString()),
            new(ClaimTypes.Name, username),
            new("fullName", fullName),
            new("mcp", mustChangePassword ? "1" : "0"),
            new("iat", issuedAtUnix.ToString())
        };
        claims.AddRange(roles.Select(r => new Claim(ClaimTypes.Role, r)));
        return new ClaimsPrincipal(new ClaimsIdentity(claims, CookieAuthenticationDefaults.AuthenticationScheme));
    }
}

public static class CookieValidator
{
    public static readonly TimeSpan AbsoluteLifetime = TimeSpan.FromHours(8);

    /// <summary>Mỗi request kiểm tra lại tài khoản còn hoạt động, đồng bộ vai trò và thời hạn tuyệt đối của phiên.</summary>
    public static async Task ValidateAsync(CookieValidatePrincipalContext ctx)
    {
        var principal = ctx.Principal;
        var okId = Guid.TryParse(principal?.FindFirstValue(ClaimTypes.NameIdentifier), out var id);
        var okIat = long.TryParse(principal?.FindFirstValue("iat"), out var iat);
        if (!okId || !okIat || DateTimeOffset.UtcNow > DateTimeOffset.FromUnixTimeSeconds(iat).Add(AbsoluteLifetime))
        {
            await Reject(ctx);
            return;
        }

        var db = ctx.HttpContext.RequestServices.GetRequiredService<AppDbContext>();
        var user = await db.Users.AsNoTracking()
            .Where(u => u.Id == id)
            .Select(u => new
            {
                u.Username, u.FullName, u.Status, u.MustChangePassword,
                Roles = u.UserRoles.Select(r => r.Role.Code).ToList()
            })
            .FirstOrDefaultAsync(ctx.HttpContext.RequestAborted);

        if (user is null || user.Status != UserStatus.Active)
        {
            await Reject(ctx);
            return;
        }

        var currentRoles = principal!.FindAll(ClaimTypes.Role).Select(c => c.Value).OrderBy(x => x).ToList();
        var freshRoles = user.Roles.OrderBy(x => x).ToList();
        var mcp = principal.FindFirstValue("mcp") == "1";
        if (!currentRoles.SequenceEqual(freshRoles) || mcp != user.MustChangePassword)
        {
            ctx.ReplacePrincipal(PrincipalFactory.Create(id, user.Username, user.FullName, freshRoles,
                user.MustChangePassword, iat));
            ctx.ShouldRenew = true;
        }
    }

    private static async Task Reject(CookieValidatePrincipalContext ctx)
    {
        ctx.RejectPrincipal();
        await ctx.HttpContext.SignOutAsync(CookieAuthenticationDefaults.AuthenticationScheme);
    }
}

/// <summary>
/// Kiểm tra antiforgery token cho mọi request ghi (POST/PUT/PATCH/DELETE) của controller.
/// Thay cho AutoValidateAntiforgeryTokenAttribute (cần dịch vụ MVC Views, không có khi chỉ dùng AddControllers).
/// Lỗi trả về theo định dạng ApiResponse chuẩn.
/// </summary>
public class ValidateAntiforgeryFilter(Microsoft.AspNetCore.Antiforgery.IAntiforgery antiforgery)
    : Microsoft.AspNetCore.Mvc.Filters.IAsyncAuthorizationFilter
{
    public async Task OnAuthorizationAsync(Microsoft.AspNetCore.Mvc.Filters.AuthorizationFilterContext context)
    {
        var method = context.HttpContext.Request.Method;
        if (HttpMethods.IsGet(method) || HttpMethods.IsHead(method) || HttpMethods.IsOptions(method) || HttpMethods.IsTrace(method)) return;
        if (context.ActionDescriptor.EndpointMetadata.OfType<IgnoreAntiforgeryTokenAttribute>().Any()) return;
        try
        {
            await antiforgery.ValidateRequestAsync(context.HttpContext);
        }
        catch (Microsoft.AspNetCore.Antiforgery.AntiforgeryValidationException)
        {
            context.Result = new BadRequestObjectResult(ApiResponse.Fail("CSRF_INVALID",
                "Phiên làm việc không hợp lệ hoặc đã hết hạn. Vui lòng tải lại trang.", null, context.HttpContext.TraceIdentifier));
        }
    }
}

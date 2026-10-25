using Microsoft.AspNetCore.Antiforgery;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.RateLimiting;

namespace FormPortal.Api.Controllers;

[ApiController, Route("api/auth")]
public class AuthController(AppDbContext db, AuthService auth, IPasswordHasher hasher, IAuditService audit,
    IAntiforgery antiforgery, ICurrentUser me) : ControllerBase
{
    /// <summary>Lấy CSRF token. Gọi lại sau khi đăng nhập hoặc đổi mật khẩu vì token gắn với danh tính phiên.</summary>
    [HttpGet("csrf"), AllowAnonymous]
    public IActionResult Csrf()
    {
        var tokens = antiforgery.GetAndStoreTokens(HttpContext);
        Response.Headers.CacheControl = "no-store";
        return Ok(ApiResponse<object>.Ok(new { token = tokens.RequestToken, headerName = "X-CSRF-TOKEN" }));
    }

    [HttpPost("login"), AllowAnonymous, EnableRateLimiting("login")]
    public async Task<IActionResult> Login(LoginRequest req, CancellationToken ct)
    {
        var (user, roles) = await auth.LoginAsync(req.Username, req.Password, ct);
        var principal = PrincipalFactory.Create(user.Id, user.Username, user.FullName, roles, user.MustChangePassword,
            DateTimeOffset.UtcNow.ToUnixTimeSeconds());
        await HttpContext.SignInAsync(CookieAuthenticationDefaults.AuthenticationScheme, principal,
            new AuthenticationProperties { IsPersistent = false });
        return Ok(ApiResponse<MeDto>.Ok(new MeDto(user.Id, user.Username, user.FullName, roles, user.MustChangePassword), "Đăng nhập thành công"));
    }

    [HttpPost("logout")]
    public async Task<IActionResult> Logout()
    {
        await audit.WriteAsync("auth.logout", "user", me.Id.ToString(), true);
        await HttpContext.SignOutAsync(CookieAuthenticationDefaults.AuthenticationScheme);
        return Ok(ApiResponse<object?>.Ok(null, "Đã đăng xuất"));
    }

    [HttpGet("me")]
    public IActionResult Me() => Ok(ApiResponse<MeDto>.Ok(new MeDto(me.Id, me.Username,
        User.FindFirstValue("fullName") ?? me.Username,
        User.FindAll(ClaimTypes.Role).Select(c => c.Value).ToList(),
        User.FindFirstValue("mcp") == "1")));

    [HttpPost("change-password"), EnableRateLimiting("login")]
    public async Task<IActionResult> ChangePassword(ChangePasswordRequest req, CancellationToken ct)
    {
        var user = await db.Users.Include(u => u.UserRoles).ThenInclude(r => r.Role)
            .FirstAsync(u => u.Id == me.Id, ct);
        if (!hasher.Verify(req.CurrentPassword, user.PasswordHash))
        {
            await audit.WriteAsync("auth.change_password", "user", user.Id.ToString(), false, new { reason = "bad_current_password" });
            throw new AppException("AUTH_FAILED", "Mật khẩu hiện tại không đúng", 400);
        }
        var policy = PasswordPolicy.Validate(req.NewPassword, user.Username);
        if (policy is not null) throw AppException.Validation(policy);
        if (req.NewPassword == req.CurrentPassword)
            throw AppException.Validation("Mật khẩu mới phải khác mật khẩu hiện tại");

        user.PasswordHash = hasher.Hash(req.NewPassword);
        user.MustChangePassword = false;
        user.PasswordChangedAt = DateTime.UtcNow;
        await db.SaveChangesAsync(ct);
        await audit.WriteAsync("auth.change_password", "user", user.Id.ToString(), true);

        var roles = user.UserRoles.Select(r => r.Role.Code).ToList();
        await HttpContext.SignInAsync(CookieAuthenticationDefaults.AuthenticationScheme,
            PrincipalFactory.Create(user.Id, user.Username, user.FullName, roles, false, DateTimeOffset.UtcNow.ToUnixTimeSeconds()),
            new AuthenticationProperties { IsPersistent = false });
        return Ok(ApiResponse<object?>.Ok(null, "Đã đổi mật khẩu"));
    }
}

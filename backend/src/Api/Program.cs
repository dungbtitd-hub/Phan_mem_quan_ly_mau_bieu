using System.Threading.RateLimiting;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.Http.Features;
using Microsoft.AspNetCore.RateLimiting;
using Npgsql;

var builder = WebApplication.CreateBuilder(args);
var cfg = builder.Configuration;
var isDev = builder.Environment.IsDevelopment();

builder.Logging.AddJsonConsole(o => { o.IncludeScopes = true; o.UseUtcTimestamp = true; });

// ===== Cấu hình (kiểm tra khi khởi động, thiếu hoặc sai thì dừng) =====
builder.Services.AddOptions<UploadOptions>().Bind(cfg.GetSection("Upload"))
    .Validate(o => o.MaxBytes is > 0 and <= 31457280, "Upload:MaxBytes phải trong khoảng 1 đến 31457280 (30 MB)")
    .Validate(o => !string.IsNullOrWhiteSpace(o.StoragePath), "Thiếu Upload:StoragePath")
    .Validate(o => o.AllowedExtensions.Length > 0, "Upload:AllowedExtensions không được rỗng")
    .ValidateOnStart();
builder.Services.AddOptions<ClamAvOptions>().Bind(cfg.GetSection("ClamAv"));
builder.Services.AddOptions<SecurityOptions>().Bind(cfg.GetSection("Security"));
builder.Services.AddOptions<AdminSeedOptions>().Bind(cfg.GetSection("AdminSeed"));

var connectionString = cfg.GetConnectionString("Default");
if (string.IsNullOrWhiteSpace(connectionString))
    throw new InvalidOperationException("Thiếu ConnectionStrings:Default (biến môi trường ConnectionStrings__Default)");
var upload = cfg.GetSection("Upload").Get<UploadOptions>() ?? new UploadOptions();
var allowedOrigins = cfg.GetSection("Security:AllowedOrigins").Get<string[]>() ?? [];

// ===== Database =====
builder.Services.AddDbContextFactory<AppDbContext>(o => o.UseNpgsql(connectionString));
builder.Services.AddScoped(sp => sp.GetRequiredService<IDbContextFactory<AppDbContext>>().CreateDbContext());

// ===== Dịch vụ =====
builder.Services.AddHttpContextAccessor();
builder.Services.AddScoped<ICurrentUser, CurrentUser>();
builder.Services.AddSingleton<IPasswordHasher, PasswordHasher>();
builder.Services.AddScoped<IAuditService, AuditService>();
builder.Services.AddScoped<AuthService>();
builder.Services.AddScoped<AccessService>();
builder.Services.AddScoped<FormService>();
builder.Services.AddScoped<IFileStorage, FileStorage>();
if (cfg.GetValue<bool>("ClamAv:Enabled")) builder.Services.AddSingleton<IVirusScanner, ClamAvScanner>();
else builder.Services.AddSingleton<IVirusScanner, NoOpScanner>();
builder.Services.AddHostedService<StartupInitializer>();
builder.Services.AddHostedService<ExpiryService>();

// ===== Giới hạn kích thước request (khớp Nginx client_max_body_size) =====
var requestLimit = upload.MaxBytes + 2 * 1024 * 1024;
builder.WebHost.ConfigureKestrel(k => k.Limits.MaxRequestBodySize = requestLimit);
builder.Services.Configure<FormOptions>(o => o.MultipartBodyLengthLimit = requestLimit);

// ===== Khóa bảo vệ dữ liệu (mã hóa cookie phiên, CSRF): lưu bền để phiên không mất khi khởi động lại container =====
var keysPath = cfg["DataProtection:KeysPath"];
var dp = builder.Services.AddDataProtection().SetApplicationName("FormPortal");
if (!string.IsNullOrWhiteSpace(keysPath)) dp.PersistKeysToFileSystem(new DirectoryInfo(keysPath));

// ===== Xác thực bằng cookie session + chống CSRF =====
var securePolicy = isDev ? CookieSecurePolicy.SameAsRequest : CookieSecurePolicy.Always;
builder.Services.AddAuthentication(CookieAuthenticationDefaults.AuthenticationScheme).AddCookie(o =>
{
    o.Cookie.Name = "fp.sid";
    o.Cookie.HttpOnly = true;
    o.Cookie.SameSite = SameSiteMode.Strict;
    o.Cookie.SecurePolicy = securePolicy;
    o.ExpireTimeSpan = TimeSpan.FromMinutes(30);
    o.SlidingExpiration = true;
    o.Events.OnRedirectToLogin = c => { c.Response.StatusCode = StatusCodes.Status401Unauthorized; return Task.CompletedTask; };
    o.Events.OnRedirectToAccessDenied = c => { c.Response.StatusCode = StatusCodes.Status403Forbidden; return Task.CompletedTask; };
    o.Events.OnValidatePrincipal = CookieValidator.ValidateAsync;
});
builder.Services.AddAuthorizationBuilder()
    .SetFallbackPolicy(new Microsoft.AspNetCore.Authorization.AuthorizationPolicyBuilder().RequireAuthenticatedUser().Build());
builder.Services.AddAntiforgery(o =>
{
    o.HeaderName = "X-CSRF-TOKEN";
    o.Cookie.Name = "fp.csrf";
    o.Cookie.HttpOnly = true;
    o.Cookie.SameSite = SameSiteMode.Strict;
    o.Cookie.SecurePolicy = securePolicy;
});

// ===== Giới hạn tốc độ =====
builder.Services.AddRateLimiter(o =>
{
    o.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    o.AddPolicy("login", ctx => RateLimitPartition.GetFixedWindowLimiter(
        ctx.Connection.RemoteIpAddress?.ToString() ?? "unknown",
        _ => new FixedWindowRateLimiterOptions { PermitLimit = 10, Window = TimeSpan.FromMinutes(1), QueueLimit = 0 }));
    o.AddPolicy("download", ctx => RateLimitPartition.GetFixedWindowLimiter(
        ctx.User.FindFirstValue(ClaimTypes.NameIdentifier) ?? ctx.Connection.RemoteIpAddress?.ToString() ?? "unknown",
        _ => new FixedWindowRateLimiterOptions { PermitLimit = 120, Window = TimeSpan.FromMinutes(1), QueueLimit = 0 }));
});

// ===== CORS: mặc định tắt (giao diện cùng origin qua Nginx); chỉ bật khi khai báo origin =====
if (allowedOrigins.Length > 0)
    builder.Services.AddCors(o => o.AddPolicy("app", p => p.WithOrigins(allowedOrigins)
        .AllowCredentials().WithHeaders("Content-Type", "X-CSRF-TOKEN", "X-Request-Id")
        .WithMethods("GET", "POST", "PUT", "DELETE")));

// ===== MVC =====
builder.Services.AddControllers(o => o.Filters.Add<ValidateAntiforgeryFilter>())
    .ConfigureApiBehaviorOptions(o => o.InvalidModelStateResponseFactory = ctx =>
    {
        var errors = ctx.ModelState.Where(e => e.Value?.Errors.Count > 0)
            .ToDictionary(e => e.Key, e => e.Value!.Errors.Select(x => string.IsNullOrEmpty(x.ErrorMessage) ? "Giá trị không hợp lệ" : x.ErrorMessage).ToArray());
        return new BadRequestObjectResult(ApiResponse.Fail("VALIDATION_ERROR", "Dữ liệu gửi lên không hợp lệ", errors, ctx.HttpContext.TraceIdentifier));
    });
builder.Services.AddOpenApi();

var app = builder.Build();

// Thứ tự middleware: request id → bắt lỗi → header bảo mật → CORS → giới hạn tốc độ → xác thực → kiểm tra đổi mật khẩu → phân quyền
app.UseMiddleware<RequestIdMiddleware>();
app.UseMiddleware<ExceptionMiddleware>();
app.Use(async (ctx, next) =>
{
    var h = ctx.Response.Headers;
    h["X-Content-Type-Options"] = "nosniff";
    h["X-Frame-Options"] = "DENY";
    h["Referrer-Policy"] = "no-referrer";
    h["Content-Security-Policy"] = "default-src 'none'; frame-ancestors 'none'";
    await next();
});
if (!isDev) app.UseHsts();
if (allowedOrigins.Length > 0) app.UseCors("app");
app.UseRateLimiter();
app.UseAuthentication();
app.UseMiddleware<PasswordChangeGuardMiddleware>();
app.UseAuthorization();

app.MapControllers();
app.MapGet("/health/live", () => Results.Ok(new { status = "ok" })).AllowAnonymous();
app.MapGet("/health/ready", async (AppDbContext db, CancellationToken ct) =>
{
    try
    {
        var ok = await db.Database.CanConnectAsync(ct);
        return ok ? Results.Ok(new { status = "ok", database = "ok" })
                  : Results.Json(new { status = "unavailable", database = "down" }, statusCode: 503);
    }
    catch
    {
        return Results.Json(new { status = "unavailable", database = "down" }, statusCode: 503);
    }
}).AllowAnonymous();
if (isDev) app.MapOpenApi().AllowAnonymous();

app.Run();

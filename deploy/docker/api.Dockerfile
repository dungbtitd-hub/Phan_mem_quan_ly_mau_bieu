# Backend ASP.NET Core: build nhiều tầng, chạy bằng người dùng không phải root.
# Build context: thư mục gốc của repo.
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src
COPY backend/src/Api/FormPortal.Api.csproj backend/src/Api/packages.lock.json backend/src/Api/
RUN dotnet restore backend/src/Api/FormPortal.Api.csproj --locked-mode
COPY backend/src/Api/ backend/src/Api/
RUN dotnet publish backend/src/Api/FormPortal.Api.csproj -c Release --no-restore -o /out /p:UseAppHost=false

FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS runtime
# curl chỉ dùng cho health check của Docker
RUN apt-get update \
 && apt-get install -y --no-install-recommends curl \
 && rm -rf /var/lib/apt/lists/* \
 && mkdir -p /data/files /data/keys \
 && chown -R $APP_UID:$APP_UID /data
WORKDIR /app
COPY --from=build /out ./
ENV ASPNETCORE_HTTP_PORTS=8080 \
    ASPNETCORE_ENVIRONMENT=Production \
    DOTNET_CLI_TELEMETRY_OPTOUT=1 \
    Upload__StoragePath=/data/files \
    DataProtection__KeysPath=/data/keys
USER $APP_UID
EXPOSE 8080
VOLUME ["/data/files", "/data/keys"]
HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=5 \
  CMD curl -fsS http://localhost:8080/health/ready || exit 1
ENTRYPOINT ["dotnet", "FormPortal.Api.dll"]

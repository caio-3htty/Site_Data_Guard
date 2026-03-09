import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link, Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";

type ClientConfig = {
  brandName?: string;
  apiBaseUrl: string;
  environment: string;
  supportedLocales: string[];
  selfHostedEnabled: boolean;
  siteBaseUrl?: string;
  publicMode?: string;
  media?: {
    installerLoopUrl?: string;
  };
};

type ResolvedClientConfig = ClientConfig & {
  serverOverride?: string | null;
};

type ReleaseChannel = {
  version: string;
  url: string;
  sha256: string;
  sizeBytes: number;
};

type ReleasesManifest = {
  windows: ReleaseChannel;
  android: ReleaseChannel;
  minimumSupportedVersions: {
    windows: string;
    android: string;
  };
};

const normalizeBaseUrl = (rawValue: string) => {
  const trimmed = rawValue.trim().replace(/\/+$/, "");
  if (!trimmed) {
    throw new Error("Endereco do servidor vazio.");
  }

  const withProtocol =
    trimmed.startsWith("http://") || trimmed.startsWith("https://") ? trimmed : `https://${trimmed}`;
  const parsed = new URL(withProtocol);
  if (!parsed.hostname) {
    throw new Error("Endereco do servidor invalido.");
  }

  parsed.pathname = "";
  parsed.search = "";
  parsed.hash = "";
  return parsed.toString().replace(/\/$/, "");
};

const resolveServerOverride = (search: string) => {
  const query = new URLSearchParams(search);
  const candidate = query.get("server") || query.get("api") || "";
  if (!candidate.trim()) {
    return null;
  }

  try {
    return normalizeBaseUrl(candidate);
  } catch {
    return null;
  }
};

const buildAndroidConnectUrl = (serverBaseUrl: string) =>
  `secureguard://connect?server=${encodeURIComponent(serverBaseUrl)}`;

const isTemporaryPublicMode = (config?: ResolvedClientConfig | null) => {
  const currentHost = window.location.hostname.toLowerCase();
  if (currentHost.endsWith(".vercel.app")) {
    return true;
  }

  if (!config) {
    return false;
  }

  if (config.publicMode === "temporary-vercel" || config.environment === "temporary-vercel") {
    return true;
  }

  try {
    if (config.siteBaseUrl) {
      return new URL(config.siteBaseUrl).hostname.toLowerCase().endsWith(".vercel.app");
    }
  } catch {
    return false;
  }

  return false;
};

const buildSearchWithServer = (search: string, serverBaseUrl: string) => {
  const params = new URLSearchParams(search);
  params.set("server", serverBaseUrl);
  const nextSearch = params.toString();
  return nextSearch ? `?${nextSearch}` : "";
};

const loadClientConfig = async (search = window.location.search): Promise<ResolvedClientConfig> => {
  const response = await fetch("/client-config.json", { cache: "no-store" });
  if (!response.ok) {
    throw new Error("Nao foi possivel carregar a configuracao publica.");
  }

  const payload = (await response.json()) as ClientConfig;
  const serverOverride = resolveServerOverride(search);

  if (!serverOverride) {
    return {
      ...payload,
      serverOverride: null,
    };
  }

  return {
    ...payload,
    apiBaseUrl: serverOverride,
    environment: "self-hosted",
    selfHostedEnabled: true,
    serverOverride,
  };
};

const loadReleases = async (): Promise<ReleasesManifest> => {
  const response = await fetch("/releases/latest.json", { cache: "no-store" });
  if (!response.ok) {
    throw new Error("Nao foi possivel carregar a versao publica dos apps.");
  }

  return response.json();
};

const formatBytes = (value: number) => {
  if (!value) {
    return "Disponivel apos publicar o release";
  }

  const units = ["B", "KB", "MB", "GB"];
  let current = value;
  let unit = 0;
  while (current >= 1024 && unit < units.length - 1) {
    current /= 1024;
    unit += 1;
  }
  return `${current.toFixed(current >= 10 || unit === 0 ? 0 : 1)} ${units[unit]}`;
};

const formatInteger = (value: number) => new Intl.NumberFormat("pt-BR").format(value);

const ReleaseDetails = ({ release }: { release: ReleaseChannel }) => (
  <div className="release-details">
    <div className="release-detail-row">
      <span className="release-label">Versao</span>
      <span className="release-value">{release.version}</span>
    </div>
    <div className="release-detail-row">
      <span className="release-label">Tamanho final</span>
      <span className="release-value">
        {formatBytes(release.sizeBytes)} ({formatInteger(release.sizeBytes)} bytes)
      </span>
    </div>
    <div className="release-detail-row release-hash">
      <span className="release-label">SHA-256</span>
      <code className="release-hash-value">{release.sha256}</code>
    </div>
  </div>
);

const buildWindowsInstallerScript = (manifestUrl: string, clientConfigUrl: string, serverOverride?: string | null) =>
  [
    "param([switch]$SkipLaunch)",
    "$ErrorActionPreference = 'Stop'",
    "$ProgressPreference = 'Continue'",
    `$manifestUrl = '${manifestUrl}'`,
    `$clientConfigUrl = '${clientConfigUrl}'`,
    `$serverOverride = '${serverOverride ?? ""}'`,
    "$installRoot = Join-Path $env:LOCALAPPDATA 'SecureGuard'",
    "$desktopShortcut = Join-Path ([Environment]::GetFolderPath('Desktop')) 'SecureGuard Desktop.lnk'",
    "$startMenuDir = Join-Path $env:APPDATA 'Microsoft\\Windows\\Start Menu\\Programs\\SecureGuard'",
    "$bootstrapConfigFile = Join-Path $installRoot 'bootstrap-config.json'",
    "$musicSource = ''",
    "$musicTempFile = Join-Path $env:TEMP 'SecureGuard-Installer-Music.mpeg'",
    "function Resolve-ServerBaseUrl {",
    "  param(",
    "    [string]$RawValue,",
    "    [bool]$AllowHttp = $false",
    "  )",
    "  $trimmed = ([string]$RawValue).Trim().TrimEnd('/')",
    "  if ([string]::IsNullOrWhiteSpace($trimmed)) { return '' }",
    "  if ($trimmed -notmatch '^https?://') {",
    "    $trimmed = ($(if ($AllowHttp) { 'http://' } else { 'https://' })) + $trimmed",
    "  }",
    "  $uri = [System.Uri]$trimmed",
    "  if (-not $uri.Host) { throw 'Endereco do servidor invalido.' }",
    "  if (-not $AllowHttp -and $uri.Scheme -ne 'https') { throw 'Use um endereco HTTPS para o servidor principal.' }",
    "  $defaultPort = if ($uri.Scheme -eq 'https') { 443 } else { 80 }",
    "  $portSegment = if ($uri.Port -gt 0 -and $uri.Port -ne $defaultPort) { ':' + $uri.Port } else { '' }",
    "  return ($uri.Scheme + '://' + $uri.Host + $portSegment)",
    "}",
    "function Start-InstallerMusic {",
    "  param([string]$Source)",
    "  if ([string]::IsNullOrWhiteSpace($Source)) { return $null }",
    "  try {",
    "    Invoke-WebRequest -Uri $Source -OutFile $musicTempFile",
    "    $player = New-Object -ComObject WMPlayer.OCX",
    "    $playlist = $player.playlistCollection.newPlaylist('SecureGuard Installer')",
    "    $media = $player.newMedia($musicTempFile)",
    "    $playlist.appendItem($media) | Out-Null",
    "    $player.currentPlaylist = $playlist",
    "    $player.settings.volume = 35",
    "    $player.settings.setMode('loop', $true)",
    "    $player.controls.play() | Out-Null",
    "    return $player",
    "  } catch {",
    "    Write-Host ('Musica ignorada: ' + $_.Exception.Message)",
    "    return $null",
    "  }",
    "}",
    "$player = Start-InstallerMusic -Source $musicSource",
    "try {",
    "  Write-Host 'Carregando manifesto publico...'",
    "  $clientConfig = Invoke-RestMethod -Uri $clientConfigUrl -Method Get",
    "  $effectiveServerUrl = ''",
    "  if ($clientConfig.media -and $clientConfig.media.installerLoopUrl) {",
    "    $musicSource = [string]$clientConfig.media.installerLoopUrl",
    "    $player = Start-InstallerMusic -Source $musicSource",
    "  }",
    "  if (-not [string]::IsNullOrWhiteSpace($serverOverride)) {",
    "    $effectiveServerUrl = Resolve-ServerBaseUrl -RawValue $serverOverride",
    "  } elseif ($clientConfig.apiBaseUrl -and [string]$clientConfig.apiBaseUrl -notmatch 'api\\.secureguard\\.app') {",
    "    $effectiveServerUrl = Resolve-ServerBaseUrl -RawValue ([string]$clientConfig.apiBaseUrl)",
    "  } elseif ([string]$clientConfig.environment -eq 'temporary-vercel' -or $clientConfigUrl -match '\\.vercel\\.app') {",
    "    Write-Host 'Modo temporario detectado. Informe a URL HTTPS do seu servidor principal para configurar o app.'",
    "    $manualServer = Read-Host 'URL HTTPS do servidor principal'",
    "    $effectiveServerUrl = Resolve-ServerBaseUrl -RawValue $manualServer",
    "    if ([string]::IsNullOrWhiteSpace($effectiveServerUrl)) {",
    "      throw 'A URL do servidor principal e obrigatoria neste modo temporario.'",
    "    }",
    "  }",
    "  if (-not [string]::IsNullOrWhiteSpace($effectiveServerUrl)) {",
    "    $bootstrapConfig = @{",
    "      apiBaseUrl = $effectiveServerUrl",
    "      environment = 'self-hosted'",
    "      supportedLocales = @('pt-BR', 'en', 'es')",
    "      selfHostedEnabled = $true",
    "    } | ConvertTo-Json -Depth 4",
    "    Set-Content -Path $bootstrapConfigFile -Value $bootstrapConfig -Encoding UTF8",
    "  }",
    "  $manifest = Invoke-RestMethod -Uri $manifestUrl -Method Get",
    "  if (-not $manifest.windows -or -not $manifest.windows.url) { throw 'Manifesto sem release Windows.' }",
    "  $release = $manifest.windows",
    "  if ($release.url -match 'secureguard\\.example\\.com') {",
    "    throw 'O URL publico do executavel Windows ainda nao foi configurado em releases/latest.json.'",
    "  }",
    "  New-Item -ItemType Directory -Path $installRoot -Force | Out-Null",
    "  New-Item -ItemType Directory -Path $startMenuDir -Force | Out-Null",
    "  $tempFile = Join-Path $env:TEMP ('SecureGuard-Desktop-' + $release.version + '.exe')",
    "  $targetFile = Join-Path $installRoot ('SecureGuard-Desktop-' + $release.version + '.exe')",
    "  Write-Host ('Baixando SecureGuard Desktop ' + $release.version + '...')",
    "  Invoke-WebRequest -Uri $release.url -OutFile $tempFile",
    "  $actualHash = (Get-FileHash -Algorithm SHA256 $tempFile).Hash.ToUpperInvariant()",
    "  $expectedHash = ([string]$release.sha256).ToUpperInvariant()",
    "  if ($actualHash -ne $expectedHash) { throw 'Checksum invalido para o executavel baixado.' }",
    "  Copy-Item $tempFile $targetFile -Force",
    "  Set-Content -Path (Join-Path $installRoot 'current-version.txt') -Value $release.version -Encoding UTF8",
    "  $shell = New-Object -ComObject WScript.Shell",
    "  foreach ($shortcutPath in @($desktopShortcut, (Join-Path $startMenuDir 'SecureGuard Desktop.lnk'))) {",
    "    $shortcut = $shell.CreateShortcut($shortcutPath)",
    "    $shortcut.TargetPath = $targetFile",
    "    $shortcut.WorkingDirectory = $installRoot",
    "    $shortcut.IconLocation = $targetFile",
    "    $shortcut.Save()",
    "  }",
    "  Get-ChildItem -Path $installRoot -Filter 'SecureGuard-Desktop-*.exe' -ErrorAction SilentlyContinue |",
    "    Where-Object { $_.FullName -ne $targetFile } |",
    "    ForEach-Object { try { Remove-Item $_.FullName -Force } catch {} }",
    "  Write-Host 'Instalacao concluida com sucesso.'",
    "  if (-not $SkipLaunch) { Start-Process $targetFile }",
    "} finally {",
    "  if ($player) {",
    "    try { $player.controls.stop() | Out-Null } catch {}",
    "    try { [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($player) } catch {}",
    "  }",
    "  if (Test-Path $musicTempFile) {",
    "    try { Remove-Item $musicTempFile -Force } catch {}",
    "  }",
    "}",
  ].join("\n");

const downloadTextFile = (filename: string, content: string) => {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
};

const useSearchAwarePath = () => {
  const location = useLocation();

  return (pathname: string) => ({
    pathname,
    search: location.search,
  });
};

const SelfHostedNotice = ({ serverBaseUrl }: { serverBaseUrl: string }) => (
  <div className="self-hosted-banner">
    <p className="self-hosted-eyebrow">Servidor principal conectado</p>
    <h2>Este acesso esta vinculado ao seu servidor SecureGuard local.</h2>
    <p>
      O site, o cadastro e os links de configuracao dos apps vao usar automaticamente este endereco externo:
    </p>
    <code className="self-hosted-code">{serverBaseUrl}</code>
  </div>
);

const TemporaryVercelNotice = ({ includeInputHint = false }: { includeInputHint?: boolean }) => (
  <div className="status-card warning">
    <strong>Modo temporario em dominio do Vercel.</strong>
    <p>
      Enquanto o dominio final nao for comprado, use o link ou o QR gerado pelo SecureGuard Server para abrir este
      site ja com o parametro <code>?server=</code>. Assim o cadastro e os apps ficam apontados para a maquina
      principal automaticamente.
    </p>
    {includeInputHint ? (
      <p>
        Se voce abriu o site direto pelo <code>.vercel.app</code>, cole a URL HTTPS publica do servidor principal no
        campo abaixo antes de criar a conta.
      </p>
    ) : null}
  </div>
);

const SiteShell = ({ children }: { children: React.ReactNode }) => (
  <SiteShellInner>{children}</SiteShellInner>
);

const SiteShellInner = ({ children }: { children: React.ReactNode }) => {
  const buildPath = useSearchAwarePath();

  return (
    <div className="site-shell">
      <header className="site-header">
        <Link className="brand" to={buildPath("/")}>
        SecureGuard
        </Link>
        <nav className="site-nav">
          <Link to={buildPath("/")}>Produto</Link>
          <Link to={buildPath("/downloads")}>Downloads</Link>
          <Link to={buildPath("/criar-conta")}>Criar conta</Link>
          <Link to={buildPath("/privacidade")}>Privacidade</Link>
          <Link to={buildPath("/termos")}>Termos</Link>
        </nav>
      </header>
      <main>{children}</main>
    </div>
  );
};

const HomePage = () => {
  const location = useLocation();
  const buildPath = useSearchAwarePath();
  const serverOverride = useMemo(() => resolveServerOverride(location.search), [location.search]);

  return (
    <SiteShell>
      {serverOverride ? <SelfHostedNotice serverBaseUrl={serverOverride} /> : null}
      {!serverOverride && isTemporaryPublicMode() ? <TemporaryVercelNotice /> : null}

      <section className="hero">
        <div>
          <p className="eyebrow">Protecao digital para familias</p>
          <h1>SecureGuard centraliza cadastro, alerta e distribuicao dos apps em uma unica superficie publica.</h1>
          <p className="hero-copy">
            O site apresenta o produto, cria a conta real na plataforma e entrega os aplicativos de Windows e Android
            sem depender de rede local.
          </p>
          <div className="cta-row">
            <Link className="primary-button" to={buildPath("/criar-conta")}>
              Criar conta
            </Link>
            <Link className="secondary-button" to={buildPath("/downloads")}>
              Baixar apps
            </Link>
          </div>
        </div>
        <div className="hero-panel">
          <h2>Como funciona</h2>
          <ol>
            <li>Crie sua conta no site publico.</li>
            <li>Baixe o app para Android ou Windows.</li>
            <li>Entre com a mesma conta no app.</li>
            <li>Adicione familiares, dispositivos e acompanhe alertas.</li>
          </ol>
        </div>
      </section>

      <section className="feature-grid">
        <article className="feature-card">
          <h3>Cadastro centralizado</h3>
          <p>O usuario cria a conta pelo site e ja recebe o caminho correto para os apps oficiais.</p>
        </article>
        <article className="feature-card">
          <h3>Downloads versionados</h3>
          <p>Windows e Android ficam publicados com checksum, versao minima e manifestos publicos.</p>
        </article>
        <article className="feature-card">
          <h3>Mesma API publica</h3>
          <p>Os apps deixam de depender da LAN e passam a consumir um endpoint HTTPS unico em cloud.</p>
        </article>
      </section>
    </SiteShell>
  );
};

const DownloadsPage = () => {
  const [manifest, setManifest] = useState<ReleasesManifest | null>(null);
  const [clientConfig, setClientConfig] = useState<ResolvedClientConfig | null>(null);
  const [error, setError] = useState<string | null>(null);
  const location = useLocation();
  const buildPath = useSearchAwarePath();

  const handleDownloadWindowsInstaller = () => {
    const manifestUrl = `${window.location.origin}/releases/latest.json`;
    const clientConfigUrl = `${window.location.origin}/client-config.json`;
    const script = buildWindowsInstallerScript(manifestUrl, clientConfigUrl, clientConfig?.serverOverride);
    downloadTextFile("Install-SecureGuard.ps1", script);
  };

  useEffect(() => {
    Promise.all([loadReleases(), loadClientConfig(location.search)])
      .then(([nextManifest, nextConfig]) => {
        setManifest(nextManifest);
        setClientConfig(nextConfig);
      })
      .catch((loadError) => setError(loadError instanceof Error ? loadError.message : "Falha ao carregar releases."));
  }, [location.search]);

  const serverOverride = clientConfig?.serverOverride;
  const temporaryPublicMode = isTemporaryPublicMode(clientConfig);

  return (
    <SiteShell>
      <section className="content-section">
        <h1>Downloads oficiais</h1>
        <p>Baixe a versao atual dos apps e valide o checksum antes de distribuir para outras pessoas.</p>

        {serverOverride ? <SelfHostedNotice serverBaseUrl={serverOverride} /> : null}
        {!serverOverride && temporaryPublicMode ? <TemporaryVercelNotice /> : null}

        {error ? <div className="status-card error">{error}</div> : null}

        {!manifest ? (
          <div className="status-card">Carregando versoes publicas...</div>
        ) : (
          <div className="download-grid">
            <article className="download-card">
              <h2>Windows</h2>
              <ReleaseDetails release={manifest.windows} />
              <div className="download-actions">
                <button className="primary-button" type="button" onClick={handleDownloadWindowsInstaller}>
                  Baixar instalador inteligente
                </button>
                <a className="secondary-button" href={manifest.windows.url} target="_blank" rel="noreferrer">
                  Baixar executavel direto
                </a>
              </div>
              <p className="download-note">
                O instalador consulta sempre o release mais recente, valida o checksum e atualiza a instalacao local.
              </p>
              <p className="download-note">
                Durante a instalacao, o script toca em loop o audio configurado no site enquanto baixa e prepara o app.
              </p>
              {serverOverride ? (
                <p className="download-note">
                  Esta copia do instalador vai deixar o app Windows apontado automaticamente para o servidor principal
                  informado acima.
                </p>
              ) : temporaryPublicMode ? (
                <p className="download-note">
                  Neste modo temporario, abra esta pagina pelo link do SecureGuard Server ou informe a URL do servidor
                  principal quando o instalador solicitar.
                </p>
              ) : null}
            </article>

            <article className="download-card">
              <h2>Android</h2>
              <ReleaseDetails release={manifest.android} />
              <a className="primary-button" href={manifest.android.url} target="_blank" rel="noreferrer">
                Baixar para Android
              </a>
              {serverOverride ? (
                <div className="download-actions">
                  <a className="secondary-button" href={buildAndroidConnectUrl(serverOverride)}>
                    Abrir app Android ja configurado
                  </a>
                  <Link className="secondary-button" to={buildPath("/criar-conta/sucesso")}>
                    Ver passo a passo do Android
                  </Link>
                </div>
              ) : null}
            </article>
          </div>
        )}
      </section>
    </SiteShell>
  );
};

const CreateAccountPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [clientConfig, setClientConfig] = useState<ResolvedClientConfig | null>(null);
  const [isLoadingConfig, setIsLoadingConfig] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [manualServerBaseUrl, setManualServerBaseUrl] = useState("");

  useEffect(() => {
    loadClientConfig(location.search)
      .then((config) => {
        setClientConfig(config);
        setManualServerBaseUrl(config.serverOverride || "");
        setIsLoadingConfig(false);
      })
      .catch((loadError) => {
        setError(loadError instanceof Error ? loadError.message : "Falha ao carregar configuracao publica.");
        setIsLoadingConfig(false);
      });
  }, [location.search]);

  const temporaryPublicMode = isTemporaryPublicMode(clientConfig);
  const normalizedManualServer = useMemo(() => {
    if (!manualServerBaseUrl.trim()) {
      return "";
    }

    try {
      return normalizeBaseUrl(manualServerBaseUrl);
    } catch {
      return "";
    }
  }, [manualServerBaseUrl]);

  const baseUrl = useMemo(() => {
    if (clientConfig?.serverOverride) {
      return clientConfig.serverOverride.replace(/\/$/, "");
    }

    if (normalizedManualServer) {
      return normalizedManualServer;
    }

    return clientConfig?.apiBaseUrl?.replace(/\/$/, "") ?? "";
  }, [clientConfig, normalizedManualServer]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!baseUrl) {
      setError("A API publica ainda nao esta configurada.");
      return;
    }

    if (temporaryPublicMode && !clientConfig?.serverOverride && !normalizedManualServer) {
      setError(
        "Cole a URL HTTPS publica do seu servidor principal ou abra este site pelo link/QR gerado no SecureGuard Server."
      );
      return;
    }

    setIsSubmitting(true);
    setError(null);

    const formData = new FormData(event.currentTarget);
    const payload = {
      name: String(formData.get("name") || "").trim(),
      email: String(formData.get("email") || "").trim(),
      phone: String(formData.get("phone") || "").trim(),
      password: String(formData.get("password") || "").trim()
    };

    try {
      const response = await fetch(`${baseUrl}/api/auth/register`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json"
        },
        body: JSON.stringify(payload)
      });

      const responseBody = await response.json().catch(() => ({}));
      if (!response.ok || responseBody?.success === false) {
        throw new Error(responseBody?.details || responseBody?.error || responseBody?.message || "Falha ao criar conta.");
      }

      const successSearch =
        clientConfig?.serverOverride || !normalizedManualServer
          ? location.search
          : buildSearchWithServer(location.search, normalizedManualServer);

      navigate({
        pathname: "/criar-conta/sucesso",
        search: successSearch,
      });
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Falha ao criar conta.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <SiteShell>
      <section className="content-section">
        <h1>Criar conta</h1>
        <p>O cadastro abaixo cria a conta real na plataforma publica do SecureGuard.</p>
        {clientConfig?.serverOverride ? <SelfHostedNotice serverBaseUrl={clientConfig.serverOverride} /> : null}
        {!clientConfig?.serverOverride && temporaryPublicMode ? <TemporaryVercelNotice includeInputHint /> : null}

        {isLoadingConfig ? <div className="status-card">Carregando configuracao da API...</div> : null}
        {error ? <div className="status-card error">{error}</div> : null}

        <form className="account-form" onSubmit={handleSubmit}>
          {temporaryPublicMode && !clientConfig?.serverOverride ? (
            <label>
              URL HTTPS do servidor principal
              <input
                name="serverBaseUrl"
                type="url"
                inputMode="url"
                placeholder="https://seu-servidor.trycloudflare.com"
                value={manualServerBaseUrl}
                onChange={(event) => setManualServerBaseUrl(event.currentTarget.value)}
              />
            </label>
          ) : null}
          <label>
            Nome
            <input name="name" type="text" required />
          </label>
          <label>
            Email
            <input name="email" type="email" required />
          </label>
          <label>
            Telefone
            <input name="phone" type="tel" />
          </label>
          <label>
            Senha
            <input name="password" type="password" minLength={8} required />
          </label>
          <button className="primary-button" type="submit" disabled={isSubmitting || isLoadingConfig}>
            {isSubmitting ? "Criando conta..." : "Criar conta"}
          </button>
        </form>
      </section>
    </SiteShell>
  );
};

const AccountCreatedPage = () => (
  <PostSignupPage />
);

const PostSignupPage = () => {
  const [manifest, setManifest] = useState<ReleasesManifest | null>(null);
  const [clientConfig, setClientConfig] = useState<ResolvedClientConfig | null>(null);
  const location = useLocation();
  const buildPath = useSearchAwarePath();

  const handleDownloadWindowsInstaller = () => {
    const manifestUrl = `${window.location.origin}/releases/latest.json`;
    const clientConfigUrl = `${window.location.origin}/client-config.json`;
    const script = buildWindowsInstallerScript(manifestUrl, clientConfigUrl, clientConfig?.serverOverride);
    downloadTextFile("Install-SecureGuard.ps1", script);
  };

  useEffect(() => {
    Promise.all([loadReleases(), loadClientConfig(location.search)])
      .then(([nextManifest, nextConfig]) => {
        setManifest(nextManifest);
        setClientConfig(nextConfig);
      })
      .catch(() => undefined);
  }, [location.search]);

  const temporaryPublicMode = isTemporaryPublicMode(clientConfig);

  return (
    <SiteShell>
      <section className="content-section">
        <h1>Conta criada com sucesso</h1>
        <p>Agora baixe o app oficial e entre usando a mesma conta que voce acabou de criar.</p>
        {clientConfig?.serverOverride ? <SelfHostedNotice serverBaseUrl={clientConfig.serverOverride} /> : null}
        {!clientConfig?.serverOverride && temporaryPublicMode ? <TemporaryVercelNotice /> : null}

        <div className="download-grid">
          <article className="download-card">
            <h2>Windows</h2>
            {manifest ? <ReleaseDetails release={manifest.windows} /> : <p>Release em preparacao</p>}
            <div className="download-actions">
              <button className="primary-button" type="button" onClick={handleDownloadWindowsInstaller}>
                Baixar instalador inteligente
              </button>
              <a
                className="secondary-button"
                href={manifest?.windows.url || "/downloads"}
                target={manifest ? "_blank" : undefined}
                rel={manifest ? "noreferrer" : undefined}
              >
                Baixar executavel direto
              </a>
            </div>
          </article>

          <article className="download-card">
            <h2>Android</h2>
            {manifest ? <ReleaseDetails release={manifest.android} /> : <p>Release em preparacao</p>}
            <a
              className="primary-button"
              href={manifest?.android.url || "/downloads"}
              target={manifest ? "_blank" : undefined}
              rel={manifest ? "noreferrer" : undefined}
            >
              Baixar para Android
            </a>
            {clientConfig?.serverOverride ? (
              <div className="download-actions">
                <a className="secondary-button" href={buildAndroidConnectUrl(clientConfig.serverOverride)}>
                  Abrir app Android ja configurado
                </a>
                <p className="download-note">
                  Depois de instalar o app Android, volte aqui no celular e toque neste botao para abrir o SecureGuard
                  ja apontado para o servidor principal.
                </p>
              </div>
            ) : null}
          </article>
        </div>

        <div className="cta-row">
          <Link className="secondary-button" to={buildPath("/downloads")}>
            Ver checksums e detalhes
          </Link>
          <Link className="secondary-button" to={buildPath("/")}>
            Voltar ao inicio
          </Link>
        </div>
      </section>
    </SiteShell>
  );
};

const PrivacyPage = () => (
  <SiteShell>
    <section className="content-section">
      <h1>Privacidade</h1>
      <p>
        O SecureGuard foi desenhado para reduzir a exposicao de conteudo sensivel. O backend recebe apenas os dados
        necessarios para autenticacao, grupos familiares, dispositivos e eventos agregados autorizados.
      </p>
      <p>
        O fluxo futuro de IA local e leitura de mensagens permanece fora do servidor por padrao. Quando houver
        contribuicao anonima para melhoria de modelos, ela dependera de aceite explicito por caso.
      </p>
    </section>
  </SiteShell>
);

const TermsPage = () => (
  <SiteShell>
    <section className="content-section">
      <h1>Termos</h1>
      <p>
        O uso do SecureGuard depende de uma conta valida, aceite das politicas vigentes e uso dos aplicativos oficiais
        publicados nesta pagina de downloads.
      </p>
      <p>
        Ambientes self-hosted continuam possiveis para operacao avancada, mas a experiencia publica padrao usa a API
        protegida em cloud e os apps oficiais.
      </p>
    </section>
  </SiteShell>
);

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/downloads" element={<DownloadsPage />} />
      <Route path="/criar-conta" element={<CreateAccountPage />} />
      <Route path="/criar-conta/sucesso" element={<AccountCreatedPage />} />
      <Route path="/privacidade" element={<PrivacyPage />} />
      <Route path="/termos" element={<TermsPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

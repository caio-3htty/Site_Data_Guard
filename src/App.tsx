import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link, Navigate, Route, Routes, useNavigate } from "react-router-dom";

type ClientConfig = {
  apiBaseUrl: string;
  environment: string;
  supportedLocales: string[];
  selfHostedEnabled: boolean;
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

const loadClientConfig = async (): Promise<ClientConfig> => {
  const response = await fetch("/client-config.json", { cache: "no-store" });
  if (!response.ok) {
    throw new Error("Nao foi possivel carregar a configuracao publica.");
  }

  return response.json();
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

const SiteShell = ({ children }: { children: React.ReactNode }) => (
  <div className="site-shell">
    <header className="site-header">
      <Link className="brand" to="/">
        SecureGuard
      </Link>
      <nav className="site-nav">
        <Link to="/">Produto</Link>
        <Link to="/downloads">Downloads</Link>
        <Link to="/criar-conta">Criar conta</Link>
        <Link to="/privacidade">Privacidade</Link>
        <Link to="/termos">Termos</Link>
      </nav>
    </header>
    <main>{children}</main>
  </div>
);

const HomePage = () => (
  <SiteShell>
    <section className="hero">
      <div>
        <p className="eyebrow">Protecao digital para familias</p>
        <h1>SecureGuard centraliza cadastro, alerta e distribuicao dos apps em uma unica superficie publica.</h1>
        <p className="hero-copy">
          O site apresenta o produto, cria a conta real na plataforma e entrega os aplicativos de Windows e Android
          sem depender de rede local.
        </p>
        <div className="cta-row">
          <Link className="primary-button" to="/criar-conta">
            Criar conta
          </Link>
          <Link className="secondary-button" to="/downloads">
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

const DownloadsPage = () => {
  const [manifest, setManifest] = useState<ReleasesManifest | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadReleases()
      .then(setManifest)
      .catch((loadError) => setError(loadError instanceof Error ? loadError.message : "Falha ao carregar releases."));
  }, []);

  return (
    <SiteShell>
      <section className="content-section">
        <h1>Downloads oficiais</h1>
        <p>Baixe a versao atual dos apps e valide o checksum antes de distribuir para outras pessoas.</p>

        {error ? <div className="status-card error">{error}</div> : null}

        {!manifest ? (
          <div className="status-card">Carregando versoes publicas...</div>
        ) : (
          <div className="download-grid">
            <article className="download-card">
              <h2>Windows</h2>
              <p>Versao {manifest.windows.version}</p>
              <p>Tamanho: {formatBytes(manifest.windows.sizeBytes)}</p>
              <p>SHA-256: {manifest.windows.sha256}</p>
              <a className="primary-button" href={manifest.windows.url} target="_blank" rel="noreferrer">
                Baixar para Windows
              </a>
            </article>

            <article className="download-card">
              <h2>Android</h2>
              <p>Versao {manifest.android.version}</p>
              <p>Tamanho: {formatBytes(manifest.android.sizeBytes)}</p>
              <p>SHA-256: {manifest.android.sha256}</p>
              <a className="primary-button" href={manifest.android.url} target="_blank" rel="noreferrer">
                Baixar para Android
              </a>
            </article>
          </div>
        )}
      </section>
    </SiteShell>
  );
};

const CreateAccountPage = () => {
  const navigate = useNavigate();
  const [clientConfig, setClientConfig] = useState<ClientConfig | null>(null);
  const [isLoadingConfig, setIsLoadingConfig] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadClientConfig()
      .then((config) => {
        setClientConfig(config);
        setIsLoadingConfig(false);
      })
      .catch((loadError) => {
        setError(loadError instanceof Error ? loadError.message : "Falha ao carregar configuracao publica.");
        setIsLoadingConfig(false);
      });
  }, []);

  const baseUrl = useMemo(() => clientConfig?.apiBaseUrl?.replace(/\/$/, "") ?? "", [clientConfig]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!baseUrl) {
      setError("A API publica ainda nao esta configurada.");
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

      navigate("/criar-conta/sucesso");
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

        {isLoadingConfig ? <div className="status-card">Carregando configuracao da API...</div> : null}
        {error ? <div className="status-card error">{error}</div> : null}

        <form className="account-form" onSubmit={handleSubmit}>
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

  useEffect(() => {
    loadReleases().then(setManifest).catch(() => undefined);
  }, []);

  return (
    <SiteShell>
      <section className="content-section">
        <h1>Conta criada com sucesso</h1>
        <p>Agora baixe o app oficial e entre usando a mesma conta que voce acabou de criar.</p>

        <div className="download-grid">
          <article className="download-card">
            <h2>Windows</h2>
            <p>{manifest ? `Versao ${manifest.windows.version}` : "Release em preparacao"}</p>
            <a
              className="primary-button"
              href={manifest?.windows.url || "/downloads"}
              target={manifest ? "_blank" : undefined}
              rel={manifest ? "noreferrer" : undefined}
            >
              Baixar para Windows
            </a>
          </article>

          <article className="download-card">
            <h2>Android</h2>
            <p>{manifest ? `Versao ${manifest.android.version}` : "Release em preparacao"}</p>
            <a
              className="primary-button"
              href={manifest?.android.url || "/downloads"}
              target={manifest ? "_blank" : undefined}
              rel={manifest ? "noreferrer" : undefined}
            >
              Baixar para Android
            </a>
          </article>
        </div>

        <div className="cta-row">
          <Link className="secondary-button" to="/downloads">
            Ver checksums e detalhes
          </Link>
          <Link className="secondary-button" to="/">
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

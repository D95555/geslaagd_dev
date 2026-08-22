import { useEffect, useState, type ComponentType } from "react";

import { modules as discoveredModules } from "./.generated/mockup-components";

type ModuleMap = Record<string, () => Promise<Record<string, unknown>>>;

function _resolveComponent(
  mod: Record<string, unknown>,
  name: string,
): ComponentType | undefined {
  const fns = Object.values(mod).filter(
    (v) => typeof v === "function",
  ) as ComponentType[];
  return (
    (mod.default as ComponentType) ||
    (mod.Preview as ComponentType) ||
    (mod[name] as ComponentType) ||
    fns[fns.length - 1]
  );
}

function PreviewRenderer({
  componentPath,
  modules,
}: {
  componentPath: string;
  modules: ModuleMap;
}) {
  const [Component, setComponent] = useState<ComponentType | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    setComponent(null);
    setError(null);

    async function loadComponent(): Promise<void> {
      const key = `./components/mockups/${componentPath}.tsx`;
      const loader = modules[key];
      if (!loader) {
        setError(`No component found at ${componentPath}.tsx`);
        return;
      }

      try {
        const mod = await loader();
        if (cancelled) {
          return;
        }
        const name = componentPath.split("/").pop()!;
        const comp = _resolveComponent(mod, name);
        if (!comp) {
          setError(
            `No exported React component found in ${componentPath}.tsx\n\nMake sure the file has at least one exported function component.`,
          );
          return;
        }
        setComponent(() => comp);
      } catch (e) {
        if (cancelled) {
          return;
        }

        const message = e instanceof Error ? e.message : String(e);
        setError(`Failed to load preview.\n${message}`);
      }
    }

    void loadComponent();

    return () => {
      cancelled = true;
    };
  }, [componentPath, modules]);

  if (error) {
    return (
      <pre style={{ color: "red", padding: "2rem", fontFamily: "system-ui" }}>
        {error}
      </pre>
    );
  }

  if (!Component) return null;

  return <Component />;
}

function getBasePath(): string {
  return import.meta.env.BASE_URL.replace(/\/$/, "");
}

function getPreviewExamplePath(): string {
  const basePath = getBasePath();
  return `${basePath}/preview/ComponentName`;
}

function Gallery() {
  const basePath = getBasePath();
  const groups = [
    {
      title: "Marketing",
      frames: ["Homepage", "HomepageMobile"],
    },
    {
      title: "Toegang",
      frames: [
        "AuthLogin",
        "AuthSignup",
        "AuthVerification",
        "AuthForgot",
        "RecoveryReset",
        "RecoveryExpired",
        "RecoverySuccess",
        "AuthLoading",
      ],
    },
    {
      title: "Leerreis",
      frames: [
        "Onboarding",
        "Dashboard",
        "DashboardMobile",
        "CoachProposal",
        "CatalogExpanded",
        "StudyDetail",
        "StudyDetailLoading",
        "StudyDetailEmpty",
        "StudyDetailError",
      ],
    },
    {
      title: "Beheer en systeem",
      frames: [
        "AdminOperations",
        "AdminLoading",
        "AdminEmpty",
        "AdminError",
        "BroadcastNotice",
        "Forbidden",
        "NotFound",
      ],
    },
  ];
  return (
    <main className="mockup-page paper">
      <div className="shell py-12">
        <p className="meta text-primary">geslaagd momentum · canvas suite</p>
        <h1 className="display mt-3 text-4xl md:text-6xl">Van vraag naar grip.</h1>
        <p className="mt-4 max-w-2xl text-muted-foreground">
          Review de complete redesign vóór productie: marketing, toegang, leerreis en beheer in één gedeeld systeem.
        </p>
        <div className="mt-10 grid gap-7 md:grid-cols-2">
          {groups.map((group) => (
            <section key={group.title} className="rounded-xl border border-border bg-card p-6 shadow-[var(--momentum-shadow-soft)]">
              <h2 className="font-serif text-xl">{group.title}</h2>
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                {group.frames.map((frame) => (
                  <a
                    className="flex items-center justify-between rounded-lg border border-border px-4 py-3 text-sm transition-colors hover:border-primary hover:bg-primary/10"
                    href={`${basePath}/preview/${frame}`}
                    key={frame}
                  >
                    <span>{frame.replace(/([A-Z])/g, " $1").trim()}</span>
                    <span className="text-primary">→</span>
                  </a>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </main>
  );
}

function getPreviewPath(): string | null {
  const basePath = getBasePath();
  const { pathname } = window.location;
  const local =
    basePath && pathname.startsWith(basePath)
      ? pathname.slice(basePath.length) || "/"
      : pathname;
  const match = local.match(/^\/preview\/(.+)$/);
  return match ? match[1] : null;
}

function App() {
  const previewPath = getPreviewPath();

  if (previewPath) {
    return (
      <PreviewRenderer
        componentPath={previewPath}
        modules={discoveredModules}
      />
    );
  }

  return <Gallery />;
}

export default App;

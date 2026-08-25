import {
  createRootRoute,
  HeadContent,
  Outlet,
  Scripts,
  useRouterState,
} from "@tanstack/react-router";
import { useLayoutEffect } from "react";
import { Toaster } from "sonner";
import { AuthProvider } from "@/lib/auth/provider";
import { PreviewHostBridge } from "@/components/preview-host-bridge";
import { PlaceProvider } from "@/components/place-provider";
import { PlaceGate } from "@/components/place-gate";
import { Footer, Header } from "@/components/shell";
import { TideMark } from "@/components/logo";
import { WatchSyncBridge } from "@/components/watch-sync-bridge";
import { usePlaceStore } from "@/lib/tideline/place-store";
import { LOOK_BOOT } from "@/lib/tideline/look";
import appCss from "../styles.css?url";

const APP_NAME = "Tideline";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: APP_NAME },
      {
        name: "description",
        content:
          "Tideline is the global club for open water swimmers. Spots, gatherings, groups, and a shared log of the world's waters.",
      },
      { name: "theme-color", content: "#06151c" },
    ],
    links: [
      { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
      { rel: "stylesheet", href: appCss },
      { rel: "manifest", href: "/__grok/manifest.webmanifest" },
      { rel: "apple-touch-icon", href: "/__grok/icon-180.png" },
    ],
  }),
  component: RootDocument,
});

function RootDocument() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const locale = usePlaceStore((s) => s.locale);
  const look = usePlaceStore((s) => s.look);
  const dir = locale === "he" ? "rtl" : "ltr";
  const login = pathname === "/login";
  const office = pathname.startsWith("/office");

  return (
    <html lang={locale} dir={dir} className="antialiased" suppressHydrationWarning>
      <head>
        <HeadContent />
        <script dangerouslySetInnerHTML={{ __html: LOOK_BOOT }} />
      </head>
      <body className="min-h-dvh bg-bg text-fg">
        <ScrollToTop />
        <PreviewHostBridge />
        <AuthProvider>
          <PlaceProvider>
            <Header />
            <div className="pt-16">
              {login ? (
                <Outlet />
              ) : office ? (
                <div className="min-h-[calc(100dvh-4rem)]">
                  <Outlet />
                </div>
              ) : (
                <AppFrame />
              )}
            </div>
            <Toaster
              theme={look === "day" ? "light" : "dark"}
              position="bottom-center"
              toastOptions={{
                classNames: {
                  toast: "bg-surface text-fg border-line font-sans",
                },
              }}
            />
          </PlaceProvider>
        </AuthProvider>
        <Scripts />
      </body>
    </html>
  );
}

function ScrollToTop() {
  const href = useRouterState({ select: (s) => s.location.href });
  useLayoutEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  }, [href]);
  return null;
}

function AppFrame() {
  const hydrated = usePlaceStore((s) => s.hydrated);
  const place = usePlaceStore((s) => s.place);
  const editing = usePlaceStore((s) => s.editing);

  if (!hydrated) {
    return (
      <main className="relative min-h-[calc(100dvh-4rem)] overflow-hidden">
        <img
          src="/sea/hero.jpg"
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div className="sea-scrim absolute inset-0" />
        <div className="relative mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-16">
          <div className="flex items-center gap-2.5">
            <span className="grid size-10 place-items-center rounded-xl bg-raised shadow-[var(--shadow-border)]">
              <TideMark className="size-8" />
            </span>
            <p className="font-display text-2xl font-semibold text-fg">Tideline</p>
          </div>
        </div>
      </main>
    );
  }
  if (!place || editing) {
    return <PlaceGate />;
  }

  return (
    <div className="flex min-h-[calc(100dvh-4rem)] flex-col">
      <WatchSyncBridge />
      <div className="flex-1">
        <Outlet />
      </div>
      <Footer />
    </div>
  );
}

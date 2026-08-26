import {
  createRootRoute,
  HeadContent,
  Outlet,
  Scripts,
  useRouter,
  useRouterState,
} from "@tanstack/react-router";
import { useLayoutEffect } from "react";
import { Toaster } from "sonner";
import { AuthProvider } from "@/lib/auth/provider";
import { PreviewHostBridge } from "@/components/preview-host-bridge";
import { PlaceProvider } from "@/components/place-provider";
import { PlaceGate } from "@/components/place-gate";
import { Footer, Header } from "@/components/shell";
import { BootSplash } from "@/components/boot-splash";
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
          "Tideline is the global club for open water swimmers. Beaches, gatherings, groups, and friends sharing the water.",
      },
      { name: "theme-color", content: "#06151c" },
    ],
    links: [
      { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
      { rel: "stylesheet", href: appCss },
      { rel: "manifest", href: "/__grok/manifest.webmanifest" },
      { rel: "apple-touch-icon", href: "/tideline-icon.svg" },
    ],
  }),
  component: RootDocument,
});

function RootDocument() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const locale = usePlaceStore((s) => s.locale);
  const look = usePlaceStore((s) => s.look);
  const place = usePlaceStore((s) => s.place);
  const editing = usePlaceStore((s) => s.editing);
  const dir = locale === "he" ? "rtl" : "ltr";
  const login = pathname === "/login";
  const office = pathname.startsWith("/office");
  const gated = !login && !office && (!place || editing);

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
            <BootSplash />
            {gated ? null : <Header />}
            <div className={gated ? "" : "pt-16"}>
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

function pinPageTop() {
  if (typeof window === "undefined") return;
  if ("scrollRestoration" in history) history.scrollRestoration = "manual";
  window.scrollTo(0, 0);
  document.documentElement.scrollTop = 0;
  document.body.scrollTop = 0;
}

function ScrollToTop() {
  const router = useRouter();
  const href = useRouterState({ select: (s) => s.location.href });
  const editing = usePlaceStore((s) => s.editing);
  const hasPlace = Boolean(usePlaceStore((s) => s.place));

  useLayoutEffect(() => {
    pinPageTop();
    const unsub = router.subscribe("onRendered", () => {
      pinPageTop();
      requestAnimationFrame(pinPageTop);
    });
    const frame = requestAnimationFrame(() => {
      pinPageTop();
      requestAnimationFrame(pinPageTop);
    });
    const later = window.setTimeout(pinPageTop, 120);
    return () => {
      unsub();
      cancelAnimationFrame(frame);
      window.clearTimeout(later);
    };
  }, [router, href, editing, hasPlace]);

  return null;
}

function AppFrame() {
  const hydrated = usePlaceStore((s) => s.hydrated);
  const place = usePlaceStore((s) => s.place);
  const editing = usePlaceStore((s) => s.editing);

  if (hydrated && (!place || editing)) {
    return <PlaceGate />;
  }

  return (
    <div className="flex min-h-[calc(100dvh-4rem)] flex-col">
      <div className="flex-1">
        <Outlet />
      </div>
      <Footer />
    </div>
  );
}
